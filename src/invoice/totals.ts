import { Decimal, sum } from "../core/decimal.js";
import type { Invoice, InvoiceItem } from "./schema.js";

export interface ItemAmounts {
  item: InvoiceItem;
  /** dTotBruOpeItem = dPUniProSer × dCantProSer. */
  totalBruto: Decimal;
  /** dTotOpeItem (no discounts or advances are supported, so equal to totalBruto). */
  totalOperacion: Decimal;
  afectacion: 1 | 3;
  /** dPropIVA: 100 when gravado, 0 when exento. */
  proporcion: number;
  tasa: 0 | 5 | 10;
  /** dBasGravIVA. */
  baseGravada: Decimal;
  /** dLiqIVAItem. */
  liquidacionIva: Decimal;
  /** dBasExe (only non-zero for gravado parcial, which is not supported). */
  baseExenta: Decimal;
}

export interface InvoiceTotals {
  dSubExe: Decimal;
  dSubExo: Decimal;
  dSub5: Decimal;
  dSub10: Decimal;
  dTotOpe: Decimal;
  dTotDesc: Decimal;
  dTotDescGlotem: Decimal;
  dTotAntItem: Decimal;
  dTotAnt: Decimal;
  dPorcDescTotal: Decimal;
  dDescTotal: Decimal;
  dAnticipo: Decimal;
  dRedon: Decimal;
  dTotGralOpe: Decimal;
  dIVA5: Decimal;
  dIVA10: Decimal;
  dLiqTotIVA5: Decimal;
  dLiqTotIVA10: Decimal;
  dTotIVA: Decimal;
  dBaseGrav5: Decimal;
  dBaseGrav10: Decimal;
  dTBasGraIVA: Decimal;
}

const HUNDRED = Decimal.from(100);

/**
 * Item-level IVA with the manual's formulas (dPropIVA = 100):
 *
 *   dBasGravIVA = (100 × dTotOpeItem × dPropIVA) / (10000 + dTasaIVA × dPropIVA)
 *   dLiqIVAItem = dBasGravIVA × dTasaIVA / 100
 *
 * Both are kept at 8 decimals (half-up) so they match the formulas exactly.
 */
export function computeItem(item: InvoiceItem): ItemAmounts {
  const quantity = Decimal.from(item.cantidad);
  const totalBruto = Decimal.from(item.precioUnitario).mul(quantity);
  const totalOperacion = totalBruto;
  if (item.iva === 0) {
    return {
      item,
      totalBruto,
      totalOperacion,
      afectacion: 3,
      proporcion: 0,
      tasa: 0,
      baseGravada: Decimal.ZERO,
      liquidacionIva: Decimal.ZERO,
      baseExenta: Decimal.ZERO,
    };
  }
  const rate = Decimal.from(item.iva);
  const proportion = HUNDRED;
  const baseGravada = HUNDRED.mul(totalOperacion)
    .mul(proportion)
    .div(Decimal.from(10_000).add(rate.mul(proportion)));
  const liquidacionIva = baseGravada.mul(rate).div(HUNDRED);
  return {
    item,
    totalBruto,
    totalOperacion,
    afectacion: 1,
    proporcion: 100,
    tasa: item.iva,
    baseGravada,
    liquidacionIva,
    baseExenta: Decimal.ZERO,
  };
}

/**
 * Invoice totals (gTotSub). Amounts in PYG are rounded half-up to whole guaraníes.
 * dRedon is 0: the rounding is applied to each total rather than booked as an adjustment.
 */
export function computeTotals(items: readonly ItemAmounts[]): InvoiceTotals {
  const by = (pred: (i: ItemAmounts) => boolean, pick: (i: ItemAmounts) => Decimal) =>
    sum(items.filter(pred).map(pick)).round(0);
  const isRate = (rate: number) => (i: ItemAmounts) => i.afectacion === 1 && i.tasa === rate;

  const dSubExe = by(
    (i) => i.afectacion === 3,
    (i) => i.totalOperacion,
  );
  const dSub5 = by(isRate(5), (i) => i.totalOperacion);
  const dSub10 = by(isRate(10), (i) => i.totalOperacion);
  const dTotOpe = sum(items.map((i) => i.totalOperacion)).round(0);
  const dIVA5 = by(isRate(5), (i) => i.liquidacionIva);
  const dIVA10 = by(isRate(10), (i) => i.liquidacionIva);
  const dBaseGrav5 = by(isRate(5), (i) => i.baseGravada);
  const dBaseGrav10 = by(isRate(10), (i) => i.baseGravada);
  const zero = Decimal.ZERO;

  return {
    dSubExe,
    dSubExo: zero,
    dSub5,
    dSub10,
    dTotOpe,
    dTotDesc: zero,
    dTotDescGlotem: zero,
    dTotAntItem: zero,
    dTotAnt: zero,
    dPorcDescTotal: zero,
    dDescTotal: zero,
    dAnticipo: zero,
    dRedon: zero,
    dTotGralOpe: dTotOpe,
    dIVA5,
    dIVA10,
    dLiqTotIVA5: zero,
    dLiqTotIVA10: zero,
    dTotIVA: dIVA5.add(dIVA10),
    dBaseGrav5,
    dBaseGrav10,
    dTBasGraIVA: dBaseGrav5.add(dBaseGrav10),
  };
}

export function computeInvoiceAmounts(invoice: Invoice): {
  items: ItemAmounts[];
  totals: InvoiceTotals;
} {
  const items = invoice.items.map(computeItem);
  return { items, totals: computeTotals(items) };
}
