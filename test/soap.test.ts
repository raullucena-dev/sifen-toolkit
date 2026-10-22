import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";

import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  consultaDEEnvelope,
  createSignedInvoice,
  loadPem,
  loadPkcs12,
  nextRequestId,
  parseRecepcionResponse,
  recepcionDEEnvelope,
  SIFEN_TEST_ENDPOINTS,
  SifenClient,
  SifenSoapError,
  type SigningCredentials,
} from "../src/index.js";
import { createTestCertificate, type TestCertificate } from "./helpers/certs.js";
import { sampleInvoice, TEST_CSC } from "./helpers/fixtures.js";
import {
  consultaDE,
  consultaDENoEncontrado,
  consultaRUC,
  recepcionAprobada,
  recepcionRechazada,
  soap,
  soapFault,
} from "./helpers/soap.js";

const HOST = "https://sifen-test.set.gov.py";
let cert: TestCertificate;
let credentials: SigningCredentials;
let signedXml: string;
let cdc: string;

beforeAll(() => {
  cert = createTestCertificate();
  credentials = loadPkcs12(cert.p12, cert.password);
  const signed = createSignedInvoice(sampleInvoice(), credentials, TEST_CSC);
  signedXml = signed.signedXml;
  cdc = signed.cdc;
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

describe("SOAP envelopes", () => {
  it("embeds the signed rDE as XML inside xDE without its declaration", () => {
    const envelope = recepcionDEEnvelope("1", signedXml);
    expect(envelope).toMatch(
      /<soap:Envelope xmlns:soap="http:\/\/www.w3.org\/2003\/05\/soap-envelope">/,
    );
    expect(envelope).toContain(
      '<rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1</dId><xDE><rDE ',
    );
    expect(envelope.match(/<\?xml/g)).toHaveLength(1);
    expect(() => recepcionDEEnvelope("1", "<x/>")).toThrow(/rDE/);
  });

  it("builds query envelopes", () => {
    expect(consultaDEEnvelope("7", cdc)).toContain(`<dId>7</dId><dCDC>${cdc}</dCDC>`);
  });

  it("generates increasing request ids of at most 15 digits", () => {
    const ids = Array.from({ length: 5 }, () => nextRequestId());
    for (const id of ids) expect(id).toMatch(/^\d{1,15}$/);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("SifenClient (mocked SIFEN)", () => {
  const client = () => new SifenClient({ credentials });

  it("sends a DE with siRecepDE and parses an approval", async () => {
    let received = "";
    nock(HOST)
      .matchHeader("content-type", "application/soap+xml; charset=utf-8")
      .post("/de/ws/sync/recibe.wsdl", (body: string) => {
        received = body;
        return true;
      })
      .reply(200, recepcionAprobada(cdc));

    const result = await client().sendDocument(signedXml, "42");
    expect(received).toContain("<dId>42</dId><xDE><rDE");
    expect(received).toContain(`<DE Id="${cdc}">`);
    expect(result).toMatchObject({
      cdc,
      status: "Aprobado",
      approved: true,
      protocol: "1234567890",
      messages: [{ code: "0260", message: "Autorización del DE satisfactoria" }],
    });
  });

  it("parses a rejection with several messages", async () => {
    nock(HOST).post("/de/ws/sync/recibe.wsdl").reply(200, recepcionRechazada(cdc));
    const result = await client().sendDocument(signedXml);
    expect(result.approved).toBe(false);
    expect(result.status).toBe("Rechazado");
    expect(result.messages.map((m) => m.code)).toEqual(["1000", "1001"]);
  });

  it("queries a DE by CDC with siConsDE", async () => {
    nock(HOST)
      .post("/de/ws/consultas/consulta.wsdl", (body: string) =>
        body.includes(`<dCDC>${cdc}</dCDC>`),
      )
      .reply(200, consultaDE(cdc));
    const result = await client().queryDocument(cdc);
    expect(result.code).toBe("0422");
    expect(result.documentXml).toContain(`<DE Id="${cdc}"/>`);
  });

  it("returns no document when the CDC does not exist", async () => {
    nock(HOST).post("/de/ws/consultas/consulta.wsdl").reply(200, consultaDENoEncontrado);
    const result = await client().queryDocument(cdc);
    expect(result).toMatchObject({ code: "0420", documentXml: undefined });
  });

  it("validates the CDC before calling SIFEN", async () => {
    await expect(client().queryDocument("123")).rejects.toThrow(/invalid CDC/);
  });

  it("queries a RUC with siConsRUC, sending it without the DV", async () => {
    nock(HOST)
      .post("/de/ws/consultas/consulta-ruc.wsdl", (body: string) =>
        body.includes("<dRUCCons>80000002</dRUCCons>"),
      )
      .reply(200, consultaRUC);
    const result = await client().queryRuc("80000002-1");
    expect(result.taxpayer).toEqual({
      ruc: "80000002",
      name: "CLIENTE FICTICIO S.R.L.",
      statusCode: "ACT",
      statusDescription: "ACTIVO",
      electronicInvoicing: "S",
    });
  });

  it("rejects a RUC with a wrong check digit before calling SIFEN", async () => {
    await expect(client().queryRuc("80000002-2")).rejects.toThrow(/check digit/);
  });

  it("turns SOAP faults into SifenSoapError", async () => {
    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").reply(500, soapFault);
    const error = await client()
      .queryRuc("80000002-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SifenSoapError);
    expect(error).toMatchObject({
      message: "Error interno",
      details: { faultCode: "env:Receiver" },
    });
  });

  it("turns HTTP errors into SifenSoapError", async () => {
    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").reply(503, "Service Unavailable");
    await expect(client().queryRuc("80000002-1")).rejects.toMatchObject({
      name: "SifenSoapError",
      details: { status: 503 },
    });
  });

  it("rejects responses that are not SOAP 1.2", async () => {
    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").reply(200, "<html>proxy error</html>");
    await expect(client().queryRuc("80000002-1")).rejects.toThrow(/SOAP 1.2/);
    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").reply(200, "<<<");
    await expect(client().queryRuc("80000002-1")).rejects.toThrow(SifenSoapError);
  });

  it("propagates network errors and timeouts", async () => {
    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").replyWithError("socket hang up");
    await expect(client().queryRuc("80000002-1")).rejects.toThrow(/socket hang up/);

    nock(HOST).post("/de/ws/consultas/consulta-ruc.wsdl").delay(500).reply(200, consultaRUC);
    const slow = new SifenClient({ credentials, timeoutMs: 50 });
    await expect(slow.queryRuc("80000002-1")).rejects.toThrow(/timed out/);
  });

  it("refuses endpoints outside the SIFEN test environment by default", () => {
    expect(
      () =>
        new SifenClient({
          credentials,
          endpoints: { recepcionDE: "https://sifen.set.gov.py/de/ws/sync/recibe.wsdl" },
        }),
    ).toThrow(/not the SIFEN test environment/);
    expect(
      () =>
        new SifenClient({
          credentials,
          endpoints: {
            consultaRUC: "http://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl",
          },
        }),
    ).toThrow(/not the SIFEN test environment/);
  });

  it("accepts a custom transport", async () => {
    const calls: string[] = [];
    const custom = new SifenClient({
      credentials,
      transport: (url) => {
        calls.push(url);
        return Promise.resolve({ status: 200, body: consultaRUC });
      },
    });
    await custom.queryRuc("80000002-1");
    expect(calls).toEqual([SIFEN_TEST_ENDPOINTS.consultaRUC]);
  });

  it("parses responses without the protocol wrapper leniently", () => {
    const result = parseRecepcionResponse(
      soap("<rRetEnviDe><dEstRes>Rechazado</dEstRes></rRetEnviDe>"),
    );
    expect(result).toMatchObject({ status: "Rechazado", approved: false, messages: [] });
  });
});

describe("SifenClient mutual TLS", () => {
  let server: Server;
  let url: string;
  let serverCert: TestCertificate;
  const seenClientCerts: string[] = [];

  beforeAll(async () => {
    nock.enableNetConnect("localhost");
    serverCert = createTestCertificate("localhost", ["localhost"]);
    server = createServer(
      {
        key: serverCert.privateKeyPem,
        cert: serverCert.certificatePem,
        requestCert: true,
        rejectUnauthorized: true,
        ca: [cert.certificatePem],
      },
      (req, res) => {
        const peer = (req.socket as TLSSocket).getPeerCertificate();
        seenClientCerts.push(String(peer.subject.CN));
        req.resume();
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/soap+xml" });
          res.end(consultaRUC);
        });
      },
    );
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    url = `https://localhost:${(server.address() as AddressInfo).port}/consulta-ruc`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const endpoints = () => ({ recepcionDE: url, consultaDE: url, consultaRUC: url });

  it("presents the client certificate", async () => {
    const client = new SifenClient({
      credentials,
      endpoints: endpoints(),
      allowNonTestEndpoints: true,
      ca: serverCert.certificatePem,
    });
    const result = await client.queryRuc("80000002-1");
    expect(result.code).toBe("0502");
    expect(seenClientCerts).toContain("Empresa Ficticia S.A.");
  });

  it("fails the handshake with an untrusted client certificate", async () => {
    const stranger = createTestCertificate("Desconocido");
    const client = new SifenClient({
      credentials: loadPem(stranger.privateKeyPem, stranger.certificatePem),
      endpoints: endpoints(),
      allowNonTestEndpoints: true,
      ca: serverCert.certificatePem,
    });
    await expect(client.queryRuc("80000002-1")).rejects.toThrow();
  });

  it("does not trust an unknown server certificate", async () => {
    const client = new SifenClient({
      credentials,
      endpoints: endpoints(),
      allowNonTestEndpoints: true,
    });
    await expect(client.queryRuc("80000002-1")).rejects.toThrow(/self-signed|certificate/i);
  });
});
