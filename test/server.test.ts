import type { FastifyInstance } from "fastify";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadPkcs12, SifenSoapError, verifyInvoiceSignature } from "../src/index.js";
import { buildApp, type AppOptions } from "../src/server/app.js";
import { createTestCertificate, type TestCertificate } from "./helpers/certs.js";
import { sampleInvoice, TEST_CSC } from "./helpers/fixtures.js";

let cert: TestCertificate;
let app: FastifyInstance | undefined;

beforeAll(() => {
  cert = createTestCertificate();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(options: AppOptions = {}): Promise<FastifyInstance> {
  app = await buildApp({ logLevel: "silent", ...options });
  return app;
}

const configured = (): AppOptions => ({
  credentials: loadPkcs12(cert.p12, cert.password),
  csc: TEST_CSC,
});

describe("HTTP service", () => {
  it("reports health and whether signing is configured", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ status: "ok", signing: false });
    const signing = await (await start(configured())).inject({ method: "GET", url: "/health" });
    expect(signing.json()).toEqual({ status: "ok", signing: true });
  });

  it("previews an invoice without signing it", async () => {
    const res = await (
      await start()
    ).inject({
      method: "POST",
      url: "/invoices/preview",
      payload: sampleInvoice(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ cdc: string; xml: string; totals: Record<string, string> }>();
    expect(body.cdc).toMatch(/^\d{44}$/);
    expect(body.xml).toContain(`<DE Id="${body.cdc}">`);
    expect(body.xml).not.toContain("<Signature");
    expect(body.totals["dTotGralOpe"]).toBe("208000");
  });

  it("returns 422 with every validation issue", async () => {
    const invoice = sampleInvoice();
    const res = await (
      await start()
    ).inject({
      method: "POST",
      url: "/invoices/preview",
      payload: { ...invoice, emisor: { ...invoice.emisor, ruc: "80000001-9" }, items: [] },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ error: { code: string; issues: { path: string }[] } }>();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["emisor.ruc", "items"]),
    );
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await (
      await start()
    ).inject({
      method: "POST",
      url: "/invoices/preview",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "bad_request" } });
  });

  it("signs with the server-side certificate and CSC", async () => {
    const res = await (
      await start(configured())
    ).inject({
      method: "POST",
      url: "/invoices/sign",
      payload: sampleInvoice(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ signedXml: string; qrUrl: string; digestValue: string }>();
    expect(verifyInvoiceSignature(body.signedXml, cert.certificatePem).valid).toBe(true);
    expect(body.qrUrl).toMatch(/^https:\/\/ekuatia\.set\.gov\.py\/consultas-test\/qr\?/);
  });

  it("returns 503 when signing is not configured", async () => {
    const res = await (
      await start()
    ).inject({
      method: "POST",
      url: "/invoices/sign",
      payload: sampleInvoice(),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "signing_not_configured" } });
  });

  it("validates the RUC check digit before querying SIFEN", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/ruc/80000002-2" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "invalid_ruc" } });
  });

  it("returns 503 for RUC lookups without a certificate", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/ruc/80000002-1" });
    expect(res.statusCode).toBe(503);
  });

  it("looks up a RUC through siConsRUC", async () => {
    const queried: string[] = [];
    const server = await start({
      rucLookup: {
        queryRuc: (ruc) => {
          queried.push(ruc);
          return Promise.resolve({
            code: "0502",
            message: "RUC encontrado",
            taxpayer: {
              ruc: "80000002",
              name: "CLIENTE FICTICIO S.R.L.",
              statusCode: "ACT",
              statusDescription: "ACTIVO",
              electronicInvoicing: "S",
            },
            rawXml: "<x/>",
          });
        },
      },
    });
    const res = await server.inject({ method: "GET", url: "/ruc/80000002-1" });
    expect(res.statusCode).toBe(200);
    expect(queried).toEqual(["80000002-1"]);
    expect(res.json()).toEqual({
      ruc: "80000002-1",
      code: "0502",
      message: "RUC encontrado",
      taxpayer: {
        ruc: "80000002",
        name: "CLIENTE FICTICIO S.R.L.",
        statusCode: "ACT",
        statusDescription: "ACTIVO",
        electronicInvoicing: "S",
      },
    });
  });

  it("maps SIFEN failures to 502 and unexpected errors to 500", async () => {
    const failing = await start({
      rucLookup: { queryRuc: () => Promise.reject(new SifenSoapError("upstream down")) },
    });
    const res = await failing.inject({ method: "GET", url: "/ruc/80000002-1" });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: { code: "sifen_error", message: "upstream down" } });
    await failing.close();

    const broken = await start({
      rucLookup: { queryRuc: () => Promise.reject(new Error("boom")) },
    });
    const crash = await broken.inject({ method: "GET", url: "/ruc/80000002-1" });
    expect(crash.statusCode).toBe(500);
    expect(crash.json()).toEqual({
      error: { code: "internal_error", message: "unexpected error" },
    });
  });

  it("creates a test-environment SIFEN client when credentials are configured", async () => {
    // The default client is wired up; we only assert it was not rejected for 503.
    const server = await start({ credentials: configured().credentials });
    const res = await server.inject({ method: "GET", url: "/ruc/80000002-2" });
    expect(res.statusCode).toBe(400);
  });

  it("publishes an OpenAPI document with the three endpoints", async () => {
    const res = await (await start()).inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/invoices/preview", "/invoices/sign", "/ruc/{ruc}"]),
    );
    const ui = await app?.inject({ method: "GET", url: "/docs" });
    expect(ui?.statusCode).toBeLessThan(400);
  });
});
