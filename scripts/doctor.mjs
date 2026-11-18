const PORT = process.env.PORT || 7823;
const base = `http://127.0.0.1:${PORT}`;
let fail = 0;
const checks = [
  ['health', async () => (await (await fetch(`${base}/api/health`)).json()).health === 'demo-health/1'],
  ['root', async () => {
    const b = await (await fetch(`${base}/api/root`)).json();
    return b.trustDomain === 'corp.example.com' && b.rootPem.includes('BEGIN CERTIFICATE');
  }],
  ['attack foreign-domain refused', async () => {
    const b = await (await fetch(`${base}/api/attack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'foreign-domain' }) })).json();
    return b.valid === false && b.failures.length > 0;
  }],
];
for (const [name, fn] of checks) {
  let ok = false;
  try { ok = await fn(); } catch { ok = false; }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) fail += 1;
}
process.exit(fail ? 1 : 0);
