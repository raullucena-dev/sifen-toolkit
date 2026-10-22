/**
 * Optional test against the real SIFEN test environment. Skipped unless a test
 * certificate issued by the SET is provided:
 *
 *   SIFEN_TEST_CERT_P12_PATH=/path/cert.p12 SIFEN_TEST_CERT_P12_PASSWORD=... \
 *   SIFEN_TEST_RUC=NNNNNNNN-D pnpm test test/integration.test.ts
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadPkcs12, SifenClient } from "../src/index.js";

const p12Path = process.env["SIFEN_TEST_CERT_P12_PATH"];
const password = process.env["SIFEN_TEST_CERT_P12_PASSWORD"] ?? "";
const ruc = process.env["SIFEN_TEST_RUC"];

describe.skipIf(!p12Path || !ruc)("SIFEN test environment (integration)", () => {
  it("queries a RUC with siConsRUC", async () => {
    const credentials = loadPkcs12(readFileSync(p12Path ?? ""), password);
    const client = new SifenClient({ credentials, timeoutMs: 30_000 });
    const result = await client.queryRuc(ruc ?? "");
    expect(result.code).toBeDefined();
  });
});
