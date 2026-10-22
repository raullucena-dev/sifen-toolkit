import { describe, expect, it } from "vitest";

import {
  buildCdc,
  formatRuc,
  generateSecurityCode,
  isValidCdc,
  isValidRuc,
  modulo11,
  parseCdc,
  parseRuc,
  rucCheckDigit,
  type CdcComponents,
} from "../src/index.js";

/** Independent reference implementation used to cross-check modulo11. */
function referenceDv(digits: string): number {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const total = digits
    .split("")
    .reverse()
    .reduce((acc, d, i) => acc + Number(d) * (weights[i % weights.length] ?? 0), 0);
  const r = total % 11;
  return r > 1 ? 11 - r : 0;
}

describe("modulo11", () => {
  it("matches a hand-computed vector", () => {
    // 8 0 0 0 0 0 0 1 weighted right-to-left by 2..9:
    // 1·2 + 0·3 + 0·4 + 0·5 + 0·6 + 0·7 + 0·8 + 8·9 = 74; 74 % 11 = 8; DV = 11 - 8 = 3
    expect(modulo11("80000001")).toBe(3);
  });

  it.each([
    ["1", 9], // 1·2 = 2 → 11 - 2 = 9
    ["5", 1], // 5·2 = 10 → 11 - 10 = 1
  ])("handles single digits (%s → %i)", (digits, dv) => {
    expect(modulo11(digits)).toBe(dv);
  });

  it("returns 0 when the remainder is 0 or 1", () => {
    expect(modulo11("0")).toBe(0); // total 0 → remainder 0
    expect(modulo11("6")).toBe(0); // 6·2 = 12 → remainder 1
  });

  it("wraps the weight back to 2 after 11", () => {
    const digits = "123456789012345678901234567890";
    expect(modulo11(digits)).toBe(referenceDv(digits));
  });

  it("agrees with the reference implementation on many inputs", () => {
    for (let n = 0; n < 2000; n++) {
      const digits = String((n * 7919 + 13) * 104729);
      expect(modulo11(digits)).toBe(referenceDv(digits));
    }
  });

  it("supports a custom base", () => {
    // weights 2,3,2,3: 1·2 + 1·3 + 1·2 + 1·3 = 10 → 11 - 10 = 1
    expect(modulo11("1111", 3)).toBe(1);
  });

  it("rejects non-digits", () => {
    expect(() => modulo11("12a")).toThrow(TypeError);
    expect(() => modulo11("")).toThrow(TypeError);
  });
});

describe("RUC", () => {
  it.each([
    ["80000001", 3],
    ["80000002", 1],
    ["80000005", 6],
    ["1234567", 9],
    ["4555666", 0],
  ])("check digit of fictitious RUC %s is %i", (base, dv) => {
    expect(rucCheckDigit(base)).toBe(dv);
    expect(isValidRuc(`${base}-${dv}`)).toBe(true);
    expect(isValidRuc(`${base}-${(dv + 1) % 10}`)).toBe(false);
  });

  it("parses with and without a hyphen and strips leading zeros", () => {
    expect(parseRuc("80000001-3")).toEqual({ base: "80000001", dv: 3 });
    expect(parseRuc("800000013")).toEqual({ base: "80000001", dv: 3 });
    expect(parseRuc(" 01234567-9 ")).toEqual({ base: "1234567", dv: 9 });
    expect(parseRuc("80000001")).toEqual({ base: "80000001", dv: 3 });
    expect(formatRuc(parseRuc("1234567-9"))).toBe("1234567-9");
  });

  it("rejects malformed values and wrong check digits", () => {
    expect(() => parseRuc("abc")).toThrow(TypeError);
    expect(() => parseRuc("123456789-0")).toThrow(TypeError);
    expect(() => parseRuc("80000001-4")).toThrow(RangeError);
    expect(() => rucCheckDigit("123456789")).toThrow(TypeError);
    // A bare base has no DV to validate.
    expect(isValidRuc("80000001")).toBe(false);
  });
});

describe("CDC", () => {
  const components: CdcComponents = {
    tipoDocumento: 1,
    rucEmisor: "80000001",
    dvEmisor: 3,
    establecimiento: "001",
    puntoExpedicion: "001",
    numeroDocumento: "0000015",
    tipoContribuyente: 2,
    fechaEmision: "2026-10-22",
    tipoEmision: 1,
    codigoSeguridad: "123456789",
  };
  const expected = "01800000013001001000001522026102211234567894";

  it("concatenates the components in the order of the manual", () => {
    const cdc = buildCdc(components);
    expect(cdc).toHaveLength(44);
    expect(cdc).toBe(expected);
    // 01 | 80000001 | 3 | 001 | 001 | 0000015 | 2 | 20261022 | 1 | 123456789 | 4
    expect(cdc.slice(0, 43)).toBe("0180000001300100100000152202610221123456789");
    expect(Number(cdc[43])).toBe(referenceDv(cdc.slice(0, 43)));
  });

  it("pads short components", () => {
    const cdc = buildCdc({
      ...components,
      rucEmisor: "1234567",
      dvEmisor: 9,
      establecimiento: "2",
      puntoExpedicion: "3",
      numeroDocumento: "45",
      fechaEmision: "20261022",
      tipoContribuyente: 1,
    });
    expect(cdc.slice(0, 25)).toBe("0101234567900200300000451");
  });

  it("round-trips through parseCdc", () => {
    expect(parseCdc(expected)).toEqual({
      cdc: expected,
      tipoDocumento: 1,
      rucEmisor: "80000001",
      dvEmisor: 3,
      establecimiento: "001",
      puntoExpedicion: "001",
      numeroDocumento: "0000015",
      tipoContribuyente: 2,
      fechaEmision: "2026-10-22",
      tipoEmision: 1,
      codigoSeguridad: "123456789",
      dv: 4,
    });
    expect(isValidCdc(expected)).toBe(true);
  });

  it("detects single-digit changes except where the weight is 11", () => {
    // SET's algorithm uses weights 2..11; 11 ≡ 0 (mod 11), so digits weighted 11
    // (every 10th position from the right) are not protected by the DV.
    for (let i = 0; i < 43; i++) {
      const weight = ((42 - i) % 10) + 2;
      const digit = Number(expected[i]);
      const body = expected.slice(0, i) + String((digit + 1) % 10) + expected.slice(i + 1, 43);
      expect(modulo11(body) === Number(expected[43])).toBe(weight === 11);
    }
  });

  it("rejects structurally invalid CDCs", () => {
    expect(() => parseCdc("123")).toThrow(TypeError);
    expect(() => parseCdc(expected.slice(0, 43) + "5")).toThrow(/check digit/);
    const withBody = (body: string) => body + String(referenceDv(body));
    // wrong emitter DV (3 → 4) with a correct CDC DV
    expect(() => parseCdc(withBody(expected.slice(0, 10) + "4" + expected.slice(11, 43)))).toThrow(
      /RUC/,
    );
    // tipoContribuyente 3
    expect(() => parseCdc(withBody(expected.slice(0, 24) + "3" + expected.slice(25, 43)))).toThrow(
      /tipoContribuyente/,
    );
    // 2026-02-30
    expect(() =>
      parseCdc(withBody(expected.slice(0, 25) + "20260230" + expected.slice(33, 43))),
    ).toThrow(/date/);
  });

  it("validates components", () => {
    expect(() => buildCdc({ ...components, dvEmisor: 4 })).toThrow(/dvEmisor/);
    expect(() => buildCdc({ ...components, establecimiento: "1234" })).toThrow(/establecimiento/);
    expect(() => buildCdc({ ...components, fechaEmision: "2026-13-01" })).toThrow(/fechaEmision/);
    expect(() => buildCdc({ ...components, codigoSeguridad: "12" + "x" })).toThrow(
      /codigoSeguridad/,
    );
    expect(() => buildCdc({ ...components, tipoContribuyente: 3 as 1 })).toThrow(
      /tipoContribuyente/,
    );
    expect(() => buildCdc({ ...components, tipoEmision: 0 as 1 })).toThrow(/tipoEmision/);
  });

  it("generates random 9-digit security codes", () => {
    const codes = new Set(Array.from({ length: 50 }, generateSecurityCode));
    for (const code of codes) expect(code).toMatch(/^\d{9}$/);
    expect(codes.size).toBeGreaterThan(45);
    expect(codes.has("000000000")).toBe(false);
  });
});
