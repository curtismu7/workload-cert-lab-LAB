# workload-cert-lab-LAB

Mock X.509/SPIFFE-style workload identity lab: trust-domain CA, short-lived SVIDs, mTLS handshake walkthrough.

- Run: `npm install && npm run build && npm start` (port 7823, loopback-only) or `docker compose up --build`.
- Tests: `npm test` (node --test, server).
- Doctor: `npm run doctor` (server must be running).
- Rules that bite: no login (mock only, banner on every page); loopback-only bind; certs shown raw (education), mock-issued and labelled; diagram is ReactFlow; needs openssl in the image (Dockerfile apk-adds it); no AI attribution anywhere.
