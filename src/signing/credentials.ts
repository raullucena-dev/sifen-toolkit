import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";

import forge from "node-forge";

/**
 * Key material used for XMLDSig and mutual TLS. Only ever held in memory: this toolkit
 * never writes it to disk, logs it or accepts it in request bodies (see ADR 0002).
 */
export interface SigningCredentials {
  privateKeyPem: string;
  certificatePem: string;
}

/** Loads the first key + certificate pair from a PKCS#12 (.p12/.pfx) archive. */
export function loadPkcs12(archive: Uint8Array, password: string): SigningCredentials {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(Buffer.from(archive).toString("binary"));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
  } catch (error) {
    throw new Error("could not open PKCS#12 archive (wrong password or corrupt file)", {
      cause: error,
    });
  }
  const firstBag = (oid: string | undefined) =>
    oid === undefined ? undefined : p12.getBags({ bagType: oid })[oid]?.[0];
  const { oids } = forge.pki;
  const keyBag = firstBag(oids["pkcs8ShroudedKeyBag"]) ?? firstBag(oids["keyBag"]);
  const certBag = firstBag(oids["certBag"]);
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("PKCS#12 archive must contain a private key and a certificate");
  }
  return loadPem(forge.pki.privateKeyToPem(keyBag.key), forge.pki.certificateToPem(certBag.cert));
}

/** Validates a PEM private key + certificate pair and checks that they match. */
export function loadPem(privateKeyPem: string, certificatePem: string): SigningCredentials {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("SIFEN signatures require an RSA key");
  }
  const certificate = new X509Certificate(certificatePem);
  const fromKey = createPublicKey(key).export({ format: "der", type: "spki" });
  const fromCert = certificate.publicKey.export({ format: "der", type: "spki" });
  if (!Buffer.from(fromKey).equals(Buffer.from(fromCert))) {
    throw new Error("private key does not match the certificate");
  }
  return {
    privateKeyPem: key.export({ format: "pem", type: "pkcs8" }).toString(),
    certificatePem: certificate.toString(),
  };
}
