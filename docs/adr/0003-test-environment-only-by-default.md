# ADR 0003: Test environment only by default

**Status:** Accepted

## Context

A document accepted by SIFEN production is a real tax document. Mistakes made there
cannot be undone by deleting a row: they need cancellation events, which this toolkit
does not implement. A library that silently points at production, or one where a
mistyped URL sends data to the wrong host, is a liability.

## Decision

- `SifenClient` targets the **SIFEN test environment** (`sifen-test.set.gov.py`). The
  production URLs are not in the code.
- Custom endpoints are accepted only over HTTPS **on the test host**, unless the caller
  explicitly sets `allowNonTestEndpoints: true`. This flag exists for mocks, proxies and
  local TLS tests.
- QR generation defaults to the test consultation URL. Production must be requested
  explicitly (`environment: "production"`).
- The integration test against SIFEN test is skipped unless test credentials are
  provided through environment variables.

## Consequences

- Production use takes a conscious change: set the endpoints, set the flag and review the
  features in "Not included". That is the intended amount of friction for a portfolio
  and reference implementation.
- Teams that need production-grade integrations (all document types, events, batches,
  retries and contingency mode) should treat this code as a starting point, not a
  finished product.
