import { createVerify, generateKeyPairSync } from "node:crypto";

import { DOMParser } from "@xmldom/xmldom";
import { beforeAll, describe, expect, it } from "vitest";

import {
  ALGORITHMS,
  buildInvoiceXml,
  createSignedInvoice,
  extractDigestValue,
  loadPem,
  loadPkcs12,
  signInvoiceXml,
  verifyInvoiceSignature,
  type SigningCredentials,
} from "../src/index.js";
import { createTestCertificate, type TestCertificate } from "./helpers/certs.js";
import { FECHA_FIRMA, sampleInvoice, TEST_CSC } from "./helpers/fixtures.js";

let cert: TestCertificate;
let credentials: SigningCredentials;

beforeAll(() => {
  cert = createTestCertificate();
  credentials = loadPkcs12(cert.p12, cert.password);
});

const unsigned = () => buildInvoiceXml(sampleInvoice(), { fechaFirma: FECHA_FIRMA }).xml;

describe("credentials", () => {
  it("loads a PKCS#12 archive", () => {
    expect(credentials.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(credentials.certificatePem).toContain("BEGIN CERTIFICATE");
  });

  it("rejects a wrong PKCS#12 password", () => {
    expect(() => loadPkcs12(cert.p12, "wrong")).toThrow(/PKCS#12/);
  });

  it("loads PEM files and checks the key matches the certificate", () => {
    expect(loadPem(cert.privateKeyPem, cert.certificatePem).certificatePem).toContain(
      "CERTIFICATE",
    );
    const other = createTestCertificate("Otra Empresa Ficticia");
    expect(() => loadPem(other.privateKeyPem, cert.certificatePem)).toThrow(/does not match/);
  });

  it("rejects non-RSA keys", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => loadPem(pem, cert.certificatePem)).toThrow(/RSA/);
  });
});

describe("XMLDSig", () => {
  it("places an enveloped RSA-SHA256 signature right after DE", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const children = Array.from(doc.documentElement?.childNodes ?? []).filter(
      (n) => n.nodeType === 1,
    );
    expect(children.map((n) => n.nodeName)).toEqual(["dVerFor", "DE", "Signature"]);

    const de = doc.getElementsByTagName("DE")[0];
    expect(xml).toContain(`<Reference URI="#${de?.getAttribute("Id") ?? ""}">`);
    expect(xml).toContain(`<SignatureMethod Algorithm="${ALGORITHMS.rsaSha256}"/>`);
    expect(xml).toContain(`<DigestMethod Algorithm="${ALGORITHMS.sha256}"/>`);
    expect(xml).toContain(`<Transform Algorithm="${ALGORITHMS.envelopedSignature}"/>`);
    expect(xml).toContain(`<Transform Algorithm="${ALGORITHMS.excC14n}"/>`);
    expect(xml).toContain(`<CanonicalizationMethod Algorithm="${ALGORITHMS.excC14n}"/>`);
    expect(xml).toContain("<X509Certificate>");
  });

  it("uses exclusive c14n for both SignedInfo and the Reference by default", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const transforms = [...xml.matchAll(/<Transform Algorithm="([^"]+)"\/>/g)].map((m) => m[1]);
    expect(transforms).toEqual([ALGORITHMS.envelopedSignature, ALGORITHMS.excC14n]);
    expect(xml).toContain(`<CanonicalizationMethod Algorithm="${ALGORITHMS.excC14n}"/>`);
    expect(xml).not.toContain(ALGORITHMS.c14n);
  });

  it("verifies with the public key", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    expect(verifyInvoiceSignature(xml, cert.certificatePem)).toEqual({ valid: true, errors: [] });
    // Also with the certificate embedded in KeyInfo.
    expect(verifyInvoiceSignature(xml).valid).toBe(true);
  });

  it("produces a SignatureValue that verifies with plain node:crypto", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const signedInfo = /<SignedInfo>.*<\/SignedInfo>/s.exec(xml)?.[0];
    const signatureValue = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)?.[1];
    expect(signedInfo).toBeDefined();
    // Exclusive c14n of SignedInfo in this document is the element with the xmldsig
    // namespace declared on it.
    const canonical = (signedInfo ?? "")
      .replace("<SignedInfo>", '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">')
      .replace(/<(\w+) ([^>]*)\/>/g, "<$1 $2></$1>");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(canonical);
    expect(verifier.verify(cert.certificatePem, signatureValue ?? "", "base64")).toBe(true);
  });

  it("fails when the signed content is modified", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const tampered = xml.replace("<dTotGralOpe>208000", "<dTotGralOpe>1");
    expect(verifyInvoiceSignature(tampered, cert.certificatePem).valid).toBe(false);
  });

  it("fails with a different certificate", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const other = createTestCertificate("Otra Empresa Ficticia");
    expect(verifyInvoiceSignature(xml, other.certificatePem).valid).toBe(false);
  });

  it("rejects documents with zero or several signatures", () => {
    expect(verifyInvoiceSignature(unsigned()).errors[0]).toMatch(/exactly one Signature/);
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const signature = /<Signature .*<\/Signature>/s.exec(xml)?.[0] ?? "";
    const doubled = xml.replace("</rDE>", `${signature}</rDE>`);
    expect(verifyInvoiceSignature(doubled).valid).toBe(false);
  });

  it("rejects a signature that does not cover the DE element (wrapping)", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const cdc = /Id="(\d{44})"/.exec(xml)?.[1] ?? "";
    // Move the signed Id to a decoy element and leave an unsigned DE.
    const wrapped = xml
      .replace(`<DE Id="${cdc}">`, '<DE Id="x">')
      .replace("<dVerFor>", `<dVerFor Id="${cdc}">`);
    expect(verifyInvoiceSignature(wrapped).valid).toBe(false);
  });

  it("reports a missing certificate", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials);
    const stripped = xml.replace(/<KeyInfo>.*<\/KeyInfo>/s, "");
    expect(verifyInvoiceSignature(stripped).errors).toEqual(["no certificate to verify with"]);
  });

  it("supports inclusive c14n for SignedInfo when configured", () => {
    const { xml } = signInvoiceXml(unsigned(), credentials, {
      signedInfoCanonicalization: ALGORITHMS.c14n,
    });
    expect(xml).toContain(`<CanonicalizationMethod Algorithm="${ALGORITHMS.c14n}"/>`);
    expect(verifyInvoiceSignature(xml, cert.certificatePem).valid).toBe(true);
  });

  it("extracts the DigestValue", () => {
    const signed = signInvoiceXml(unsigned(), credentials);
    expect(signed.digestValue).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(extractDigestValue(signed.xml)).toBe(signed.digestValue);
    expect(() => extractDigestValue("<x/>")).toThrow(/DigestValue/);
  });
});

describe("createSignedInvoice", () => {
  it("signs, adds gCamFuFD after the signature and still verifies", () => {
    const signed = createSignedInvoice(sampleInvoice(), credentials, TEST_CSC, {
      fechaFirma: FECHA_FIRMA,
    });
    const doc = new DOMParser().parseFromString(signed.signedXml, "text/xml");
    const children = Array.from(doc.documentElement?.childNodes ?? []).filter(
      (n) => n.nodeType === 1,
    );
    expect(children.map((n) => n.nodeName)).toEqual(["dVerFor", "DE", "Signature", "gCamFuFD"]);
    expect(doc.getElementsByTagName("dCarQR")[0]?.textContent).toBe(signed.qrUrl);
    expect(signed.signedXml).toContain("&amp;cHashQR=");
    expect(signed.qrUrl).toContain(`Id=${signed.cdc}`);
    expect(signed.qrUrl).toContain("dRucRec=80000002&");
    expect(verifyInvoiceSignature(signed.signedXml, cert.certificatePem).valid).toBe(true);
  });

  it("uses dNumIDRec for receivers without RUC", () => {
    const signed = createSignedInvoice(
      sampleInvoice({
        receptor: {
          tipo: "no_contribuyente",
          tipoDocumento: 1,
          numeroDocumento: "1234567",
          nombre: "Persona Ficticia",
        },
      }),
      credentials,
      TEST_CSC,
    );
    expect(signed.qrUrl).toContain("dNumIDRec=1234567&");
    expect(signed.qrUrl).not.toContain("dRucRec");
  });
});
