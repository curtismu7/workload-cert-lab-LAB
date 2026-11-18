import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MockAuthority } from '../src/certs.js';

describe('mock X.509 authority', () => {
  let ca;
  before(() => { ca = new MockAuthority('corp.example.com'); });
  after(() => ca.cleanup());

  it('mints a leaf with a spiffe SAN and validates it', () => {
    const svid = ca.mintSvid('/orders');
    assert.equal(svid.spiffeId, 'spiffe://corp.example.com/orders');
    const r = ca.verify({ leafPem: svid.certPem });
    assert.equal(r.valid, true, r.failures?.join('; '));
    assert.equal(r.spiffeId, 'spiffe://corp.example.com/orders');
  });

  it('refuses a leaf from a foreign trust domain', () => {
    const foreign = new MockAuthority('rogue.example.com');
    try {
      const svid = foreign.mintSvid('/orders');
      const r = ca.verify({ leafPem: svid.certPem });
      assert.equal(r.valid, false);
      assert.ok(
        r.failures.some((f) => f === 'SAN URI is not in trust domain corp.example.com'),
        `expected the exact SAN trust-domain failure, got: ${JSON.stringify(r.failures)}`,
      );
    } finally {
      foreign.cleanup();
    }
  });

  it('refuses a well-formed cert with a trusted SAN but signed by the wrong CA (signature only)', () => {
    const foreign = new MockAuthority('corp.example.com');
    try {
      // Same trust domain name in the SAN, but a different root signed it.
      const svid = foreign.mintSvid('/orders');
      assert.equal(svid.spiffeId, 'spiffe://corp.example.com/orders');
      const r = ca.verify({ leafPem: svid.certPem });
      assert.equal(r.valid, false);
      assert.ok(
        r.failures.some((f) => f === 'signature does not chain to the trust-domain root CA'),
        `expected the exact signature-chain failure, got: ${JSON.stringify(r.failures)}`,
      );
      // and nothing else: the SAN is in our domain, so the only failure must be the signature
      assert.deepEqual(r.failures, ['signature does not chain to the trust-domain root CA']);
    } finally {
      foreign.cleanup();
    }
  });

  it('refuses when validating with a clock past expiry', () => {
    const svid = ca.mintSvid('/billing');
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const r = ca.verify({ leafPem: svid.certPem, at: future });
    assert.equal(r.valid, false);
    assert.ok(r.failures.some((f) => f.includes('expired')));
  });

  it('refuses garbage PEM', () => {
    const r = ca.verify({ leafPem: 'not a cert' });
    assert.equal(r.valid, false);
  });

  it('the same spiffe path under a different domain is a different identity', () => {
    const foreign = new MockAuthority('other.example.com');
    try {
      const a = ca.mintSvid('/orders').spiffeId;
      const b = foreign.mintSvid('/orders').spiffeId;
      assert.notEqual(a, b);
      assert.equal(a.replace('corp', 'other'), b);
    } finally {
      foreign.cleanup();
    }
  });
});
