# Workload Cert Lab

Tier: Demo. Catalog D138, port 7823.

A mock, fully offline lab for **X.509 workload identity** — the SPIFFE/SVID-style path that IETF WIMSE's mutual-TLS draft (`draft-ietf-wimse-mutual-tls`) standardizes, and the credential half of the WIMSE architecture.

## What it shows

- **Trust-domain root CA**: an EC P-256 root for `corp.example.com`.
- **Short-lived SVID-style workload certificates**: each leaf carries a SPIFFE URI (`spiffe://trust-domain/path`) in its Subject Alternative Name. Real X.509, minted via openssl.
- **mTLS handshake walkthrough**: client and server both present certificates; both verify against the same root; the server makes an authorization decision on the client's SAN URI.
- **Identity scoping**: the same path under a different trust domain is a different identity — cross-domain certs are refused.
- **Break it**: foreign trust domain, expired SVID (clock shift), tampered certificate bytes.

## Run

```bash
npm install && npm run build && npm start   # http://127.0.0.1:7823
# or
docker compose up --build
```

- Tests: `npm test` (node --test, server)
- Doctor: `npm run doctor` (server must be running)
- Reset: `npm run reset`

## Honesty

Everything here is a simulation: the CA is in-process (openssl CLI for real X.509), certificates are mock-issued and labelled, there are no real outbound calls and no login. Certificates and PEM are shown raw for education.

Docs: `docs/talk-track.md`.
