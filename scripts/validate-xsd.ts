/**
 * Builds a sample Factura Electrónica (fictitious data, throwaway self-signed certificate),
 * signs it and validates it with xmllint against the XSDs downloaded by
 * `pnpm xsd:download`. Requires xmllint (libxml2-utils).
 *
 *   pnpm xsd:validate            # validates the generated sample
 *   pnpm xsd:validate file.xml   # validates your own rDE document
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSignedInvoice, loadPkcs12 } from "../src/index.js";
import { createTestCertificate } from "../test/helpers/certs.js";
import { sampleInvoice, TEST_CSC } from "../test/helpers/fixtures.js";

const schema = join(
  import.meta.dirname,
  "..",
  "xsd",
  process.env["SIFEN_XSD_ROOT"] ?? "siRecepDE_v150.xsd",
);
if (!existsSync(schema)) {
  console.error(`missing ${schema}; run "pnpm xsd:download" first`);
  process.exit(2);
}

const inputFile = process.argv[2];
let file: string;
if (inputFile) {
  file = inputFile;
} else {
  const cert = createTestCertificate();
  const signed = createSignedInvoice(
    sampleInvoice(),
    loadPkcs12(cert.p12, cert.password),
    TEST_CSC,
  );
  file = join(mkdtempSync(join(tmpdir(), "sifen-xsd-")), "sample.xml");
  writeFileSync(file, signed.signedXml);
  console.log(`generated ${file} (CDC ${signed.cdc})`);
}

try {
  execFileSync("xmllint", ["--noout", "--nonet", "--schema", schema, file], { stdio: "inherit" });
} catch {
  console.error("XSD validation failed");
  console.error(readFileSync(file, "utf8").slice(0, 200));
  process.exit(1);
}
