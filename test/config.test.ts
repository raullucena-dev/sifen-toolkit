import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/server/config.js";
import { createTestCertificate, type TestCertificate } from "./helpers/certs.js";

let dir: string;
let cert: TestCertificate;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "sifen-toolkit-"));
  cert = createTestCertificate();
  writeFileSync(join(dir, "cert.p12"), cert.p12);
  writeFileSync(join(dir, "cert.pem"), cert.certificatePem);
  writeFileSync(join(dir, "key.pem"), cert.privateKeyPem);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("uses defaults without credentials", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      logLevel: "info",
      credentials: undefined,
      csc: undefined,
    });
  });

  it("loads a PKCS#12 file and the CSC", () => {
    const config = loadConfig({
      PORT: "8080",
      SIFEN_CERT_P12_PATH: join(dir, "cert.p12"),
      SIFEN_CERT_P12_PASSWORD: cert.password,
      SIFEN_CSC_ID: "0001",
      SIFEN_CSC: "ABCD0000000000000000000000000000",
    });
    expect(config.port).toBe(8080);
    expect(config.credentials?.certificatePem).toContain("BEGIN CERTIFICATE");
    expect(config.csc).toEqual({ id: "0001", value: "ABCD0000000000000000000000000000" });
  });

  it("loads PEM files", () => {
    const config = loadConfig({
      SIFEN_CERT_PEM_PATH: join(dir, "cert.pem"),
      SIFEN_KEY_PEM_PATH: join(dir, "key.pem"),
    });
    expect(config.credentials?.privateKeyPem).toContain("PRIVATE KEY");
  });

  it("fails fast on a wrong PKCS#12 password", () => {
    expect(() =>
      loadConfig({ SIFEN_CERT_P12_PATH: join(dir, "cert.p12"), SIFEN_CERT_P12_PASSWORD: "x" }),
    ).toThrow(/PKCS#12/);
  });
});
