import dns from 'node:dns';

const attempts = [];

export function install() {
  dns.lookup = function patched(host, ...rest) {
    const isBind = ['0.0.0.0', 'localhost', '::1'].includes(host) || /^127\./.test(String(host));
    if (!isBind) attempts.push({ host, at: Date.now(), mode: 'mock' });
    return origLookup.call(dns, host, ...rest);
  };
}

const origLookup = dns.lookup.__orig || dns.lookup;
dns.lookup.__orig = origLookup;

export function report() { return attempts.slice(); }
export function assertMockZeroOutbound() {
  return { attempts: attempts.length, ok: attempts.length === 0 };
}
