import { generateKeyPairSync } from "node:crypto";

import forge from "node-forge";

export interface TestCertificate {
  privateKeyPem: string;
  certificatePem: string;
  p12: Buffer;
  password: string;
}

/**
 * Self-signed RSA certificate generated at test time. Nothing is ever committed:
 * the subject is fictitious and the key lives only in memory for the test run.
 */
export function createTestCertificate(
  commonName = "Empresa Ficticia S.A.",
  dnsNames: string[] = [],
): TestCertificate {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 3600_000);
  const attrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: "PY" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  if (dnsNames.length > 0) {
    cert.setExtensions([
      { name: "subjectAltName", altNames: dnsNames.map((value) => ({ type: 2, value })) },
    ]);
  }
  const forgeKey = forge.pki.privateKeyFromPem(privateKeyPem);
  cert.sign(forgeKey, forge.md.sha256.create());
  const certificatePem = forge.pki.certificateToPem(cert);

  const password = "test-only-password";
  const asn1 = forge.pkcs12.toPkcs12Asn1(forgeKey, [cert], password, { algorithm: "3des" });
  const p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  return { privateKeyPem, certificatePem, p12, password };
}
