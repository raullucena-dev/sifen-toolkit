import { describe, expect, it } from "vitest";

import {
  computeInvoiceAmounts,
  parseInvoice,
  type Decimal,
  type InvoiceInput,
} from "../src/index.js";
import { sampleInvoice } from "./helpers/fixtures.js";

type Item = InvoiceInput["items"][number];

function amounts(items: Item[]) {
  const { items: lines, totals } = computeInvoiceAmounts(parseInvoice(sampleInvoice({ items })));
  const entries = Object.entries(totals) as [string, Decimal][];
  const str = Object.fromEntries(entries.map(([k, v]) => [k, v.toString()]));
  return { lines, totals: str };
}

const item = (precioUnitario: number, iva: 0 | 5 | 10, cantidad: string | number = 1): Item => ({
  codigo: "X",
  descripcion: "Item",
  cantidad,
  precioUnitario,
  iva,
});

describe("IVA and totals", () => {
  it("applies the manual's formulas at item level with 8 decimals", () => {
    const { lines } = amounts([item(100000, 10), item(105000, 5)]);
    expect(lines[0]?.baseGravada.toString()).toBe("90909.09090909");
    expect(lines[0]?.liquidacionIva.toString()).toBe("9090.90909091");
    expect(lines[1]?.baseGravada.toString()).toBe("100000");
    expect(lines[1]?.liquidacionIva.toString()).toBe("5000");
  });

  it("rounds PYG totals half-up to whole guaraníes", () => {
    const { totals } = amounts([item(100000, 10)]);
    expect(totals).toMatchObject({
      dSub10: "100000",
      dTotOpe: "100000",
      dTotGralOpe: "100000",
      dIVA10: "9091",
      dBaseGrav10: "90909",
      dTotIVA: "9091",
      dTBasGraIVA: "90909",
    });
    expect(totals).not.toHaveProperty("dRedon");
  });

  it("handles tiny amounts", () => {
    // 1 Gs at 10%: base 0.90909091, IVA 0.09090909 → totals 1 and 0
    const { lines, totals } = amounts([item(1, 10)]);
    expect(lines[0]?.baseGravada.toString()).toBe("0.90909091");
    expect(lines[0]?.liquidacionIva.toString()).toBe("0.09090909");
    expect(totals).toMatchObject({ dIVA10: "0", dBaseGrav10: "1", dTotGralOpe: "1" });
  });

  it("rounds the sum, not each line", () => {
    // 11 × 1 Gs lines at 10%: per-line IVA 0.09090909 each → sum 0.99999999 → 1
    const { totals } = amounts(Array.from({ length: 11 }, () => item(1, 10)));
    expect(totals["dIVA10"]).toBe("1");
    expect(totals["dTotGralOpe"]).toBe("11");
  });

  it("rounds IVA on either side of half a guaraní", () => {
    // Exact .5 ties cannot occur with whole-guaraní lines (IVA = total/11 or total/21);
    // tie-breaking itself is covered in decimal.test.ts.
    expect(amounts([item(6, 10)]).totals["dIVA10"]).toBe("1"); // 0.54545455
    expect(amounts([item(5, 10)]).totals["dIVA10"]).toBe("0"); // 0.45454545
    expect(amounts([item(11, 5)]).totals["dIVA5"]).toBe("1"); // 0.52380952
    expect(amounts([item(10, 5)]).totals["dIVA5"]).toBe("0"); // 0.47619048
  });

  it("separates exento, 5% and 10% subtotals", () => {
    const { totals, lines } = amounts([item(1000, 0, 3), item(52500, 5, 2), item(100000, 10)]);
    expect(lines[0]).toMatchObject({ afectacion: 3, proporcion: 0, tasa: 0 });
    expect(totals).toMatchObject({
      dSubExe: "3000",
      dSub5: "105000",
      dSub10: "100000",
      dTotOpe: "208000",
      dTotGralOpe: "208000",
      dIVA5: "5000",
      dIVA10: "9091",
      dTotIVA: "14091",
      dBaseGrav5: "100000",
      dBaseGrav10: "90909",
      dTBasGraIVA: "190909",
    });
  });

  it("accepts fractional quantities when the line total is whole", () => {
    const { lines } = amounts([item(2000, 10, "1.5")]);
    expect(lines[0]?.totalBruto.toString()).toBe("3000");
  });
});
