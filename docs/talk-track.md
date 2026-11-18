# Workload Cert Lab — talk track

1. **The problem**: workloads need identity without secrets. X.509 is the oldest answer: a CA signs a certificate binding a key to a name.
2. **Trust domain** — the root CA for `corp.example.com` is the only trust anchor this verifier accepts.
3. **SVID** — SPIFFE-style workload certificate: short-lived, EC P-256, with a SPIFFE URI (`spiffe://corp.example.com/orders`) in the SAN. Same path under another domain = a different identity.
4. **mTLS** — both sides of a call present certificates and both verify against the same root; the server then authorizes on the client's SAN URI.
5. **Run the handshake** — watch the four steps: ClientHello, server cert verified, client cert verified, authorization decision.
6. **Break it** — a foreign-domain cert refused (SAN not in our trust domain), an expired SVID refused (rotation should have replaced it), a tampered cert refused (signature broken).
7. **Takeaway** — no shared secrets: the platform vouches for the workload, the certificate is short-lived, and the trust domain scopes everything.

Compare with wimse-lab (the JWT WIT/WPT variant) and workload-identity-lab (the Privilege gateway variant).
