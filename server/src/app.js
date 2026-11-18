import express from 'express';
import { MockAuthority } from './certs.js';
import { getMode, setMode, realAvailable, REAL_HINT } from './mode.js';
import { install as installNetguard, assertMockZeroOutbound } from './netguard.js';
import { diagram as studioDiagram } from '../../scripts/diagram-data.mjs';

const TRUST_DOMAIN = 'corp.example.com';
const WORKSPACE_ID = 'default';

const CAST = {
  trustDomain: TRUST_DOMAIN,
  svid: `spiffe://${TRUST_DOMAIN}/orders`,
};

const STORY = {
  id: 'workload-cert-mtls',
  title: 'The mTLS handshake',
  steps: [
    'The root CA for {{cast.trustDomain}} is provisioned as the only trust anchor.',
    'A workload requests an SVID: {{cast.svid}} (SAN URI), short-lived, EC P-256.',
    'The client calls the server over TLS: the server presents its certificate and the client verifies it against the root.',
    'Mutually: the client presents its certificate and the server verifies it the same way.',
    'The server authorizes on the client SAN URI — the identity, not a shared secret.',
  ],
};

export function createApp() {
  installNetguard();
  const app = express();
  app.use(express.json());
  const ca = new MockAuthority(TRUST_DOMAIN);

  app.get('/api/health', (_req, res) => {
    const outbound = assertMockZeroOutbound();
    res.json({ name: 'workload-cert-lab', status: 'ok', demoId: 'workload-cert-lab', health: 'demo-health/1', catalogId: 'D138', workspaceId: WORKSPACE_ID, mockZeroOutbound: outbound.ok });
  });

  app.get('/api/info', (_req, res) => {
    res.json({ name: 'Workload Cert Lab', demoId: 'workload-cert-lab', source: getMode(), realAvailable: realAvailable(), realHint: REAL_HINT, simulated: true, workspaceId: WORKSPACE_ID, customerConfig: { brandName: 'Workload Cert Lab' } });
  });

  app.post('/api/mode', (req, res) => {
    const { source: next } = req.body || {};
    if (next === 'real' && !realAvailable()) {
      return res.status(409).json({ error: 'real_unavailable', message: REAL_HINT });
    }
    if (next !== 'mock' && next !== 'real') {
      return res.status(400).json({ error: 'invalid_source', message: 'source must be mock or real' });
    }
    setMode(next);
    res.json({ source: getMode() });
  });

  app.get('/api/story', (_req, res) => {
    const render = (s) => s.replace(/\{\{cast\.(\w+)\}\}/g, (_m, k) => CAST[k] ?? '');
    res.json({
      ...STORY,
      steps: STORY.steps.map(render),
      cast: CAST,
      presenter: true,
      diagram: studioDiagram,
    });
  });

  app.get('/api/diagram', (_req, res) => {
    res.json(studioDiagram);
  });

  app.post('/api/reset', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/root', (_req, res) => {
    res.json({
      trustDomain: ca.trustDomain,
      rootPem: ca.rootCertPem,
      rootFingerprint: ca.rootCert.fingerprint256,
      rootSubject: ca.rootCert.subject,
    });
  });

  app.post('/api/svid', (req, res) => {
    const { path } = req.body || {};
    if (!path || typeof path !== 'string' || !/^[a-zA-Z0-9/_-]+$/.test(path)) {
      return res.status(400).json({ error: 'invalid_path', message: 'path must be a URI path like /orders' });
    }
    const svid = ca.mintSvid(path);
    res.json(svid);
  });

  // mTLS-style handshake walkthrough: both sides present, both verify
  app.post('/api/handshake', (req, res) => {
    const { clientPath, serverPath } = req.body || {};
    if (!clientPath || !serverPath) {
      return res.status(400).json({ error: 'missing_paths', message: 'clientPath and serverPath are required' });
    }
    const client = ca.mintSvid(clientPath);
    const server = ca.mintSvid(serverPath);
    const clientOk = ca.verify({ leafPem: client.certPem });
    const serverOk = ca.verify({ leafPem: server.certPem });
    res.json({
      complete: clientOk.valid && serverOk.valid,
      steps: [
        { step: 1, name: 'TCP + TLS ClientHello', detail: 'client offers TLS 1.3' },
        { step: 2, name: 'Server certificate', detail: `server presents cert for ${server.spiffeId}`, verdict: serverOk.valid ? 'verified against trust-domain root' : 'REJECTED', failures: serverOk.failures },
        { step: 3, name: 'Client certificate (mutual)', detail: `client presents cert for ${client.spiffeId}`, verdict: clientOk.valid ? 'verified against trust-domain root' : 'REJECTED', failures: clientOk.failures },
        { step: 4, name: 'Authorization decision', detail: `server checks SAN URI ${client.spiffeId} against policy`, verdict: clientOk.valid && serverOk.valid ? 'allowed' : 'denied' },
      ],
      client: { spiffeId: client.spiffeId, fingerprint: client.fingerprint, verify: clientOk },
      server: { spiffeId: server.spiffeId, fingerprint: server.fingerprint, verify: serverOk },
    });
  });

  app.post('/api/verify', (req, res) => {
    const { leafPem, at } = req.body || {};
    const r = ca.verify({ leafPem, at: at ? new Date(at) : new Date() });
    res.json(r);
  });

  // Rule 23: any unreachable upstream answers structured JSON, never an HTML page or a hang.
  app.use('/api', (err, _req, res, _next) => {
    const code = err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') ? 424 : 500;
    res.status(code).json({ error: err?.code || 'internal_error', message: err?.message || 'unexpected server error' });
  });

  app.post('/api/attack', (req, res) => {
    const { kind } = req.body || {};
    if (kind === 'foreign-domain') {
      const rogue = new MockAuthority('rogue.example.com');
      try {
        const svid = rogue.mintSvid('/orders');
        const r = ca.verify({ leafPem: svid.certPem });
        return res.json({ kind, valid: r.valid, failures: r.failures, spiffeId: svid.spiffeId, note: `the SAN names ${svid.spiffeId}; this verifier only trusts ${TRUST_DOMAIN}` });
      } finally { rogue.cleanup(); }
    }
    if (kind === 'expired') {
      const svid = ca.mintSvid('/billing');
      const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
      const r = ca.verify({ leafPem: svid.certPem, at: future });
      return res.json({ kind, valid: r.valid, failures: r.failures, note: 'validated with a clock 3 days ahead: the short-lived SVID has already expired (rotation should have replaced it)' });
    }
    if (kind === 'tampered') {
      const svid = ca.mintSvid('/orders');
      const pem = svid.certPem.split('\n');
      // flip a character in the signature block
      for (let i = pem.length - 1; i >= 0; i -= 1) {
        if (pem[i].startsWith('M') && pem[i].length > 20) { pem[i] = `X${pem[i].slice(1)}`; break; }
      }
      const r = ca.verify({ leafPem: pem.join('\n') });
      return res.json({ kind, valid: r.valid, failures: r.failures, note: 'one byte of the certificate body was flipped' });
    }
    return res.status(400).json({ error: 'unknown_attack', message: 'kind must be one of foreign-domain, expired, tampered' });
  });

  return app;
}
