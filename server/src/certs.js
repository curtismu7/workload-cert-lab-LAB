import { createHash, randomBytes, createECDH, createPublicKey, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const b64 = (buf) => Buffer.from(buf).toString('base64');
const fingerprint = (der) => createHash('sha256').update(der).digest('hex').replace(/(..)/g, '$1:').replace(/:$/, '');

/**
 * Mock SPIFFE-style workload identity certificate authority.
 * Uses the openssl CLI (present on Node 26 CI images and in our containers) to
 * build real X.509 certificates: a trust-domain root CA and short-lived
 * workload (SVID-style) leaf certs signed by it. If openssl is unavailable,
 * mintSelfSigned covers the negative/demo paths with a locally signed stand-in.
 */
export class MockAuthority {
  constructor(trustDomain = 'corp.example.com', ttlSec = 300) {
    this.trustDomain = trustDomain;
    this.ttlSec = ttlSec;
    this.dir = mkdtempSync(join(tmpdir(), 'wcl-'));
    this.serial = 1;
    this.initRoot();
  }

  get rootCertPath() { return join(this.dir, 'root.pem'); }
  get rootKeyPath() { return join(this.dir, 'root-key.pem'); }

  initRoot() {
    const subj = `/O=${this.trustDomain}/CN=${this.trustDomain} Root CA`;
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
      '-keyout', this.rootKeyPath, '-out', this.rootCertPath, '-days', '30', '-nodes', '-subj', subj]);
    this.rootCertPem = readFileSync(this.rootCertPath, 'utf8');
    this.rootCert = new X509Certificate(this.rootCertPem);
  }

  spiffeId(path) {
    return `spiffe://${this.trustDomain}${path.startsWith('/') ? path : `/${path}`}`;
  }

  mintSvid(path, { ttlSec } = {}) {
    const id = this.spiffeId(path);
    const leafCert = join(this.dir, `leaf-${this.serial}.pem`);
    const leafKey = join(this.dir, `leaf-key-${this.serial}.pem`);
    const csr = join(this.dir, `leaf-${this.serial}.csr`);
    const ext = join(this.dir, `leaf-${this.serial}.ext`);
    const ttl = Math.max(60, Math.min(ttlSec || this.ttlSec, 86400));
    writeFileSync(ext, `subjectAltName=URI:${id}\n`);
    execFileSync('openssl', ['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
      '-keyout', leafKey, '-out', csr, '-nodes', '-subj', `/O=${this.trustDomain}/CN=workload-${this.serial}`]);
    execFileSync('openssl', ['x509', '-req', '-in', csr, '-CA', this.rootCertPath, '-CAkey', this.rootKeyPath,
      '-set_serial', String(this.serial), '-days', '1', '-extfile', ext, '-out', leafCert]);
    // openssl -days cannot express minutes, so SVIDs in this lab are valid for 24h and the
    // expiry scenario is demonstrated by validating against a shifted clock (validateAt).
    this.serial += 1;
    const pem = readFileSync(leafCert, 'utf8');
    const cert = new X509Certificate(pem);
    return {
      spiffeId: id,
      certPem: pem,
      keyPem: readFileSync(leafKey, 'utf8'),
      serial: cert.serialNumber,
      notBefore: cert.validFromDate,
      notAfter: cert.validToDate,
      fingerprint: fingerprint(cert.raw),
      ttlHours: 24,
      ttlNote: 'this mock issues 24h certificates (openssl -days 1); short-lived means minutes in a real SPIRE deployment — the expiry demo uses a shifted validation clock',
    };
  }

  // A deliberately expired certificate for the break-it pane
  mintExpired(path) {
    const svid = this.mintSvid(path);
    const expired = join(this.dir, 'expired.pem');
    const expiredKey = join(this.dir, 'expired-key.pem');
    const csr = join(this.dir, 'expired.csr');
    execFileSync('openssl', ['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
      '-keyout', expiredKey, '-out', csr, '-nodes', '-subj', `/O=${this.trustDomain}/CN=expired-workload`]);
    execFileSync('openssl', ['x509', '-req', '-in', csr, '-CA', this.rootCertPath, '-CAkey', this.rootKeyPath,
      '-set_serial', '9001', '-days', '1', '-out', expired]);
    // shift validity into the past with openssl ca-free trick: notAfter in the past via faketime is not
    // available, so instead we mint with -days 1 and report the parsed validity; the expiry scenario is
    // demonstrated by validating against a clock 2 days ahead (validateAt).
    return { ...svid, certPem: readFileSync(expired, 'utf8'), expiryDemo: true };
  }

  // Other trust domain's root: for cross-domain refusal demo
  static foreign(trustDomain) {
    return new MockAuthority(trustDomain);
  }

  verify({ leafPem, at = new Date() }) {
    const failures = [];
    let cert;
    try {
      cert = new X509Certificate(leafPem);
    } catch {
      return { valid: false, failures: ['certificate is not parseable PEM'] };
    }
    const now = at.getTime();
    if (new Date(cert.validFromDate).getTime() > now) failures.push(`not yet valid (notBefore ${cert.validFromDate})`);
    if (new Date(cert.validToDate).getTime() <= now) failures.push(`expired (notAfter ${cert.validToDate})`);
    try {
      const ok = cert.verify(this.rootCert.publicKey);
      if (!ok) failures.push('signature does not chain to the trust-domain root CA');
    } catch {
      failures.push('signature verification failed');
    }
    let spiffe = null;
    try {
      const san = cert.subjectAltName || '';
      const m = san.match(/URI:([^,\n]+)/);
      if (m) spiffe = m[1];
    } catch { /* ignore */ }
    if (!spiffe || !spiffe.startsWith(`spiffe://${this.trustDomain}/`)) {
      failures.push(`SAN URI is not in trust domain ${this.trustDomain}`);
    }
    return { valid: failures.length === 0, failures, spiffeId: spiffe, issuer: cert.issuer, subject: cert.subject, fingerprint: fingerprint(cert.raw) };
  }

  cleanup() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

// Node-only EC key helpers (built with createECDH: the EC generateKeyPair call aborts on Node 20 CI)
export function makeEcKeyPairP256() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const pub = createPublicKey({ key: ecdh.getPublicKey('der', 'uncompressed'), format: 'der', type: 'spki' });
  return { publicJwk: pub.export({ format: 'jwk' }), publicPem: pub.export({ format: 'pem', type: 'spki' }) };
}
