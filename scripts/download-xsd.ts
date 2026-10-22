/**
 * Downloads the official SIFEN XSDs (and everything they include/import) into ./xsd,
 * which is gitignored. The schemas are SET material and are never committed.
 *
 *   pnpm xsd:download
 *   SIFEN_XSD_BASE_URL=https://... pnpm xsd:download
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const BASE_URL = process.env["SIFEN_XSD_BASE_URL"] ?? "https://ekuatia.set.gov.py/sifen/xsd/";
const ROOT_SCHEMA = process.env["SIFEN_XSD_ROOT"] ?? "siRecepDE_v150.xsd";
const OUT_DIR = join(import.meta.dirname, "..", "xsd");

const seen = new Map<string, string>();

async function fetchSchema(url: string): Promise<void> {
  if (seen.has(url)) return;
  const name = basename(new URL(url).pathname);
  seen.set(url, name);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status}`);
  let content = await response.text();

  const locations = [...content.matchAll(/schemaLocation="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined && value.endsWith(".xsd"));
  for (const location of locations) {
    const absolute = new URL(location, url).toString();
    await fetchSchema(absolute);
    // Point includes/imports at the local copy so validation works offline.
    content = content.replaceAll(
      `schemaLocation="${location}"`,
      `schemaLocation="${basename(location)}"`,
    );
  }
  await writeFile(join(OUT_DIR, name), content);
  console.log(`saved ${name}`);
}

await mkdir(OUT_DIR, { recursive: true });
await fetchSchema(new URL(ROOT_SCHEMA, BASE_URL).toString());
console.log(`downloaded ${seen.size} schema(s) into ${OUT_DIR}`);
