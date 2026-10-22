import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildQrUrl, QR_BASE_URLS, type QrInput } from "../src/index.js";
import { TEST_CSC } from "./helpers/fixtures.js";

const input: QrInput = {
  cdc: "01800000013001001000001522026102211234567894",
  fechaEmision: "2026-10-22T10:00:00",
  receptor: { ruc: "80000002" },
  totalGeneral: "208000",
  totalIva: "14091",
  cantidadItems: 3,
  digestValue: "vprHQxLqz8H3F7qaYg85cRlO/AW+tPDrQviKAQ2Ie5s=",
  cscId: TEST_CSC.id,
  csc: TEST_CSC.value,
};

const EXPECTED_PARAMS =
  "nVersion=150" +
  "&Id=01800000013001001000001522026102211234567894" +
  "&dFeEmiDE=323032362d31302d32325431303a30303a3030" + // hex("2026-10-22T10:00:00")
  "&dRucRec=80000002" +
  "&dTotGralOpe=208000" +
  "&dTotIVA=14091" +
  "&cItems=3" +
  "&DigestValue=" +
  Buffer.from(input.digestValue).toString("hex") +
  "&IdCSC=0001";

describe("dCarQR", () => {
  it("builds the parameter string and appends the CSC hash", () => {
    const url = buildQrUrl(input);
    expect(url).toBe(
      `${QR_BASE_URLS.test}${EXPECTED_PARAMS}` +
        "&cHashQR=0313570bf30554e95b670a2454367bda61ec17ce6cf57686aa1b4f250e1a8280",
    );
  });

  it("hashes the parameters concatenated with the CSC (SHA-256, hex)", () => {
    const hash = createHash("sha256")
      .update(EXPECTED_PARAMS + TEST_CSC.value)
      .digest("hex");
    expect(buildQrUrl(input).endsWith(`&cHashQR=${hash}`)).toBe(true);
    // A different CSC gives a different hash.
    expect(buildQrUrl({ ...input, csc: "Z".repeat(32) })).not.toContain(hash);
  });

  it("encodes dFeEmiDE and DigestValue as hex of their text", () => {
    const url = buildQrUrl(input);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(Buffer.from(params.get("dFeEmiDE") ?? "", "hex").toString()).toBe(input.fechaEmision);
    expect(Buffer.from(params.get("DigestValue") ?? "", "hex").toString()).toBe(input.digestValue);
  });

  it("uses dNumIDRec for receivers without RUC and supports the production URL", () => {
    const url = buildQrUrl({
      ...input,
      receptor: { numeroDocumento: "1234567" },
      environment: "production",
    });
    expect(url.startsWith(QR_BASE_URLS.production)).toBe(true);
    expect(url).toContain("&dNumIDRec=1234567&");
  });

  it.each([
    ["cdc", { cdc: "123" }],
    ["cscId", { cscId: "1" }],
    ["csc", { csc: "short" }],
    ["cantidadItems", { cantidadItems: 0 }],
  ])("validates %s", (_field, patch) => {
    expect(() => buildQrUrl({ ...input, ...patch })).toThrow(TypeError);
  });
});
