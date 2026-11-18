import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('workload-cert-lab API', () => {
  it('health returns demo-health/1', async () => {
    const r = await request(createApp()).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.health, 'demo-health/1');
    assert.equal(r.body.catalogId, 'D138');
  });

  it('root returns the trust-domain CA', async () => {
    const r = await request(createApp()).get('/api/root');
    assert.equal(r.body.trustDomain, 'corp.example.com');
    assert.match(r.body.rootPem, /BEGIN CERTIFICATE/);
  });

  it('mints an SVID and verifies it', async () => {
    const app = createApp();
    const svid = (await request(app).post('/api/svid').send({ path: '/orders' })).body;
    assert.equal(svid.spiffeId, 'spiffe://corp.example.com/orders');
    const v = (await request(app).post('/api/verify').send({ leafPem: svid.certPem })).body;
    assert.equal(v.valid, true, v.failures?.join('; '));
  });

  it('refuses a bad path', async () => {
    const r = await request(createApp()).post('/api/svid').send({ path: '../etc' });
    assert.equal(r.status, 400);
  });

  it('handshake walks both directions of mutual TLS', async () => {
    const r = await request(createApp()).post('/api/handshake').send({ clientPath: '/orders', serverPath: '/billing' });
    assert.equal(r.body.complete, true);
    assert.equal(r.body.steps.length, 4);
    assert.equal(r.body.steps[3].verdict, 'allowed');
  });

  it('attack foreign-domain is refused', async () => {
    const r = await request(createApp()).post('/api/attack').send({ kind: 'foreign-domain' });
    assert.equal(r.body.valid, false);
    assert.ok(r.body.failures.includes('SAN URI is not in trust domain corp.example.com'), JSON.stringify(r.body.failures));
  });

  it('attack tampered is refused', async () => {
    const r = await request(createApp()).post('/api/attack').send({ kind: 'tampered' });
    assert.equal(r.body.valid, false);
  });

  it('attack expired is refused with a named failure', async () => {
    const r = await request(createApp()).post('/api/attack').send({ kind: 'expired' });
    assert.equal(r.body.valid, false);
    assert.ok(r.body.failures.some((f) => f.includes('expired')));
  });

  it('unknown attack is 400', async () => {
    const r = await request(createApp()).post('/api/attack').send({ kind: 'nope' });
    assert.equal(r.status, 400);
    assert.ok(r.body.message);
  });
});
