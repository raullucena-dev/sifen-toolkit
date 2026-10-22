# ADR 0001: Fiscal integration as a separate service

**Status:** Accepted

## Context

An ERP or point-of-sale system that issues electronic invoices must build a strictly
specified XML document, sign it with the taxpayer's private key, talk to SIFEN over
mutual TLS, and handle its error codes and outages. That work has a different change
rhythm from the rest of the product: it follows the SET's manual versions rather than
business features. It also handles the most sensitive secret in the system, the
company's signing key.

## Decision

Keep SIFEN logic in its own unit, published in two forms:

1. **A library** (`sifen-toolkit`) with pure, well-tested functions for CDC, RUC, XML,
   signature, QR and SOAP. There are no framework dependencies in the core.
2. **A thin HTTP service** (`src/server`) that wraps the library: `POST /invoices/preview`,
   `POST /invoices/sign` and `GET /ruc/:ruc`, documented with OpenAPI.

Business systems call the service, or embed the library, but they never handle the
certificate.

## Consequences

- The private key lives in one deployable, with its own access controls, secrets
  mounts and audit trail, instead of in every application that issues invoices.
- Manual updates (v150 to the next version) touch one codebase. The HTTP contract and
  the typed input model shield callers from XML details.
- One extra network hop and one more service to operate. For a single monolith, the
  library alone is enough. The service exists for teams with several issuing systems.
- The library has no dependency on the web framework, so it can run in workers, CLIs or
  serverless functions.
