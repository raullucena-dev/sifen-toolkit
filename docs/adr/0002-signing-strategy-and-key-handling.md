# ADR 0002: Signing strategy and key handling

**Status:** Accepted

## Context

SIFEN requires an enveloped XMLDSig signature over the `DE` element, made with the
taxpayer's qualified certificate, usually delivered as a PKCS#12 file protected by a
password. The same certificate authenticates the client in mutual TLS. Whoever holds the
key can issue tax documents in the company's name.

## Decision

- **Algorithms:** RSA-SHA256 signature, SHA-256 digest, transforms enveloped-signature +
  exclusive c14n, reference `URI="#<CDC>"`, and the certificate in
  `KeyInfo/X509Data`. `SignedInfo` also uses exclusive c14n. Using exclusive c14n for
  both is confirmed against a production SIFEN integration (`docs/assumptions.md`, A24
  and A25). It stays configurable for setups that differ.
- **Libraries:** `xml-crypto` for XMLDSig and `node-forge` only to open PKCS#12. Key
  operations and checks use `node:crypto`. The key and certificate are checked to match,
  and only RSA keys are accepted.
- **Key handling:**
  - Keys are provided **at runtime only**. The service reads them from file paths
    (`SIFEN_CERT_P12_PATH` or PEM paths), typically a mounted secret, and keeps them in
    memory. It never accepts them in request bodies, never writes them to disk and never
    logs them.
  - The CSC (QR secret) comes from environment variables and is never echoed back.
  - The repository contains no certificates. Tests generate a throwaway self-signed
    certificate at run time, and `.gitignore` and `.dockerignore` exclude
    `*.p12/*.pfx/*.pem/*.key`.
- **Order of operations:** build, then sign `DE`, then compute the QR from the
  signature's `DigestValue`, then append `gCamFuFD` as text after `Signature`. The
  signed bytes are never parsed and re-serialised, so whitespace or namespace changes
  cannot invalidate the signature.
- **Verification:** `verifyInvoiceSignature` requires exactly one `Signature` and one
  `DE`, and a single reference whose URI is that `DE`'s Id. This rejects
  signature-wrapping attacks. The tests also verify the `SignatureValue` with plain
  `node:crypto`, independently of `xml-crypto`.

## Consequences

- Rotating a certificate means replacing a mounted file and restarting the service. No
  code or image change is needed.
- An HSM or a cloud KMS would need a custom signer, because `xml-crypto` expects a PEM
  key. This is listed as future work, not built.
