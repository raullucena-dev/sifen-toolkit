import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

import type { SigningCredentials } from "./credentials.js";

export const ALGORITHMS = {
  rsaSha256: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  sha256: "http://www.w3.org/2001/04/xmlenc#sha256",
  envelopedSignature: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  excC14n: "http://www.w3.org/2001/10/xml-exc-c14n#",
  c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
} as const;

const DE_XPATH = "//*[local-name(.)='DE']";

export interface SignOptions {
  /**
   * Canonicalization for SignedInfo. Defaults to exclusive c14n, which is confirmed against
   * a production SIFEN integration; configurable for setups that differ.
   */
  signedInfoCanonicalization?: typeof ALGORITHMS.excC14n | typeof ALGORITHMS.c14n;
}

export interface SignedDocument {
  xml: string;
  /** Base64 SHA-256 digest of the canonicalised DE, used by the QR code. */
  digestValue: string;
}

/**
 * Adds an enveloped XMLDSig signature (RSA-SHA256, SHA-256 digest, exclusive c14n) over
 * the `DE` element, placed as its next sibling inside `rDE` as SIFEN requires.
 */
export function signInvoiceXml(
  xml: string,
  credentials: SigningCredentials,
  options: SignOptions = {},
): SignedDocument {
  const signer = new SignedXml({
    privateKey: credentials.privateKeyPem,
    publicCert: credentials.certificatePem,
    signatureAlgorithm: ALGORITHMS.rsaSha256,
    canonicalizationAlgorithm: options.signedInfoCanonicalization ?? ALGORITHMS.excC14n,
  });
  signer.addReference({
    xpath: DE_XPATH,
    transforms: [ALGORITHMS.envelopedSignature, ALGORITHMS.excC14n],
    digestAlgorithm: ALGORITHMS.sha256,
  });
  signer.computeSignature(xml, { location: { reference: DE_XPATH, action: "after" } });
  const signed = signer.getSignedXml();
  return { xml: signed, digestValue: extractDigestValue(signed) };
}

export function extractDigestValue(signedXml: string): string {
  const match = /<DigestValue>([^<]+)<\/DigestValue>/.exec(signedXml);
  if (!match?.[1]) throw new Error("signed document has no DigestValue");
  return match[1];
}

export interface VerificationResult {
  valid: boolean;
  /** Present when invalid. */
  errors: string[];
}

/**
 * Verifies the signature against `certificatePem` (or the certificate embedded in
 * KeyInfo when omitted) and checks that exactly one reference covers the DE element,
 * which guards against signature-wrapping attacks.
 */
export function verifyInvoiceSignature(xml: string, certificatePem?: string): VerificationResult {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const signatures = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
  const signatureNode = signatures[0];
  if (signatures.length !== 1 || !signatureNode) {
    return { valid: false, errors: [`expected exactly one Signature, found ${signatures.length}`] };
  }
  const des = doc.getElementsByTagName("DE");
  const de = des[0];
  if (des.length !== 1 || !de) {
    return { valid: false, errors: ["expected exactly one DE element"] };
  }

  const cert = certificatePem ?? embeddedCertificate(xml);
  if (!cert) return { valid: false, errors: ["no certificate to verify with"] };

  const verifier = new SignedXml({ publicCert: cert });
  verifier.loadSignature(new XMLSerializer().serializeToString(signatureNode));
  try {
    if (!verifier.checkSignature(xml)) {
      return { valid: false, errors: ["signature check failed"] };
    }
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const references = verifier.getReferences();
  const uri = references[0]?.uri;
  if (references.length !== 1 || uri !== `#${de.getAttribute("Id") ?? ""}`) {
    return { valid: false, errors: ["signature does not reference the DE element"] };
  }
  return { valid: true, errors: [] };
}

function embeddedCertificate(xml: string): string | undefined {
  const match = /<X509Certificate>([^<]+)<\/X509Certificate>/.exec(xml);
  if (!match?.[1]) return undefined;
  const body = match[1].replace(/\s+/g, "").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}
