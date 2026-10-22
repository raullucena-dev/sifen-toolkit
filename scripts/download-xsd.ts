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

  // Matches schemaLocation on xs:include/xs:import, with either quote style and spacing.
  const pattern =
    /(<(?:[\w-]+:)?(?:include|import)\b[^>]*?\bschemaLocation\s*=\s*)(["'])\s*([^"']+?)\s*\2/g;
  const locations = [...content.matchAll(pattern)].map((match) => match[3] ?? "");
  for (const location of new Set(locations)) {
    if (!location) continue;
    await fetchSchema(new URL(location, url).toString());
  }
  // Point includes/imports at the local copies so validation works offline (--nonet).
  content = content.replace(
    pattern,
    (_all, prefix: string, quote: string, location: string) =>
      `${prefix}${quote}${basename(new URL(location, url).pathname)}${quote}`,
  );
  const remaining = [...content.matchAll(/schemaLocation\s*=\s*["']([^"']*:\/\/[^"']*)["']/g)]
    .map((m) => m[1])
    .filter((value) => value?.endsWith(".xsd"));
  if (remaining.length > 0)
    console.warn(`${name}: unresolved remote schemas ${remaining.join(", ")}`);
  await writeFile(join(OUT_DIR, name), content);
  console.log(`saved ${name}`);
}

await mkdir(OUT_DIR, { recursive: true });
await fetchSchema(new URL(ROOT_SCHEMA, BASE_URL).toString());
console.log(`downloaded ${seen.size} schema(s) into ${OUT_DIR}`);
