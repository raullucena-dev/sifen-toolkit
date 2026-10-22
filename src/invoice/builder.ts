import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces.js";

import { buildCdc, generateSecurityCode } from "../core/cdc.js";
import type { Decimal } from "../core/decimal.js";
import { parseRuc } from "../core/ruc.js";
import {
  AFECTACION_IVA,
  CONDICION_OPERACION,
  INDICADOR_PRESENCIA,
  MONEDA,
  PAIS,
  TIPO_DOCUMENTO,
  TIPO_DOCUMENTO_IDENTIDAD,
  TIPO_EMISION,
  TIPO_IMPUESTO,
  TIPO_PAGO,
  TIPO_TRANSACCION,
  UNIDAD_MEDIDA,
} from "./catalogs.js";
import { parseInvoice, type Invoice } from "./schema.js";
import { computeInvoiceAmounts, type InvoiceTotals, type ItemAmounts } from "./totals.js";

export const SIFEN_NAMESPACE = "http://ekuatia.set.gov.py/sifen/xsd";
export const FORMAT_VERSION = "150";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export interface BuildOptions {
  /** dFecFirma; defaults to the current time in America/Asuncion. */
  fechaFirma?: string;
}

export interface BuiltInvoice {
  /** Unsigned rDE document (no Signature, no gCamFuFD). */
  xml: string;
  cdc: string;
  invoice: Invoice;
  items: ItemAmounts[];
  totals: InvoiceTotals;
}

/** Current wall-clock time in Paraguay, formatted as `YYYY-MM-DDThh:mm:ss`. */
export function nowInAsuncion(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

const amount = (value: Decimal) => value.toString();

function text(parent: XMLBuilder, name: string, value: string | number): void {
  parent.ele(name).txt(String(value));
}

function maybe(parent: XMLBuilder, name: string, value: string | number | undefined): void {
  if (value !== undefined) text(parent, name, value);
}

/**
 * Builds the unsigned rDE XML for a Factura Electrónica (iTiDE = 1).
 * Input is validated with zod first; invalid input throws a ZodError.
 */
export function buildInvoiceXml(input: unknown, options: BuildOptions = {}): BuiltInvoice {
  const invoice = parseInvoice(input);
  const { items, totals } = computeInvoiceAmounts(invoice);
  const emisorRuc = parseRuc(invoice.emisor.ruc);
  const codigoSeguridad = invoice.codigoSeguridad ?? generateSecurityCode();

  const cdc = buildCdc({
    tipoDocumento: 1,
    rucEmisor: emisorRuc.base,
    dvEmisor: emisorRuc.dv,
    establecimiento: invoice.timbrado.establecimiento,
    puntoExpedicion: invoice.timbrado.puntoExpedicion,
    numeroDocumento: invoice.timbrado.numeroDocumento,
    tipoContribuyente: invoice.emisor.tipoContribuyente,
    fechaEmision: invoice.fechaEmision.slice(0, 10),
    tipoEmision: invoice.tipoEmision,
    codigoSeguridad,
  });

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele(SIFEN_NAMESPACE, "rDE", {
    "xmlns:xsi": XSI_NAMESPACE,
    "xsi:schemaLocation": `${SIFEN_NAMESPACE} siRecepDE_v${FORMAT_VERSION}.xsd`,
  });
  text(root, "dVerFor", FORMAT_VERSION);

  const de = root.ele("DE", { Id: cdc });
  text(de, "dDVId", cdc.slice(-1));
  text(de, "dFecFirma", options.fechaFirma ?? nowInAsuncion());
  text(de, "dSisFact", 1);

  const gOpeDE = de.ele("gOpeDE");
  text(gOpeDE, "iTipEmi", invoice.tipoEmision);
  text(gOpeDE, "dDesTipEmi", TIPO_EMISION[invoice.tipoEmision]);
  text(gOpeDE, "dCodSeg", codigoSeguridad);
  maybe(gOpeDE, "dInfoEmi", invoice.informacionEmisor);

  const gTimb = de.ele("gTimb");
  text(gTimb, "iTiDE", 1);
  text(gTimb, "dDesTiDE", TIPO_DOCUMENTO[1]);
  text(gTimb, "dNumTim", invoice.timbrado.numero);
  text(gTimb, "dEst", invoice.timbrado.establecimiento);
  text(gTimb, "dPunExp", invoice.timbrado.puntoExpedicion);
  text(gTimb, "dNumDoc", invoice.timbrado.numeroDocumento);
  text(gTimb, "dFeIniT", invoice.timbrado.fechaInicio);

  buildDatosGenerales(de.ele("gDatGralOpe"), invoice);
  buildTipoDE(de.ele("gDtipDE"), invoice, items, totals);
  buildTotales(de.ele("gTotSub"), totals);

  return {
    xml: root.end({ headless: false, prettyPrint: false }),
    cdc,
    invoice,
    items,
    totals,
  };
}

function buildDatosGenerales(gDatGralOpe: XMLBuilder, invoice: Invoice): void {
  text(gDatGralOpe, "dFeEmiDE", invoice.fechaEmision);

  const gOpeCom = gDatGralOpe.ele("gOpeCom");
  text(gOpeCom, "iTipTra", invoice.tipoTransaccion);
  text(gOpeCom, "dDesTipTra", TIPO_TRANSACCION[invoice.tipoTransaccion as 1 | 2 | 3]);
  text(gOpeCom, "iTImp", 1);
  text(gOpeCom, "dDesTImp", TIPO_IMPUESTO[1]);
  text(gOpeCom, "cMoneOpe", "PYG");
  text(gOpeCom, "dDesMoneOpe", MONEDA.PYG);

  const { emisor } = invoice;
  const ruc = parseRuc(emisor.ruc);
  const gEmis = gDatGralOpe.ele("gEmis");
  text(gEmis, "dRucEm", ruc.base);
  text(gEmis, "dDVEmi", ruc.dv);
  text(gEmis, "iTipCont", emisor.tipoContribuyente);
  text(gEmis, "dNomEmi", emisor.razonSocial);
  maybe(gEmis, "dNomFanEmi", emisor.nombreFantasia);
  text(gEmis, "dDirEmi", emisor.direccion);
  text(gEmis, "dNumCas", emisor.numeroCasa);
  text(gEmis, "cDepEmi", emisor.departamento.codigo);
  text(gEmis, "dDesDepEmi", emisor.departamento.descripcion);
  if (emisor.distrito) {
    text(gEmis, "cDisEmi", emisor.distrito.codigo);
    text(gEmis, "dDesDisEmi", emisor.distrito.descripcion);
  }
  text(gEmis, "cCiuEmi", emisor.ciudad.codigo);
  text(gEmis, "dDesCiuEmi", emisor.ciudad.descripcion);
  text(gEmis, "dTelEmi", emisor.telefono);
  text(gEmis, "dEmailE", emisor.email);
  const gActEco = gEmis.ele("gActEco");
  text(gActEco, "cActEco", emisor.actividadEconomica.codigo);
  text(gActEco, "dDesActEco", emisor.actividadEconomica.descripcion);

  const { receptor } = invoice;
  const gDatRec = gDatGralOpe.ele("gDatRec");
  if (receptor.tipo === "contribuyente") {
    const rucRec = parseRuc(receptor.ruc);
    text(gDatRec, "iNatRec", 1);
    text(gDatRec, "iTiOpe", receptor.tipoOperacion);
    text(gDatRec, "cPaisRec", "PRY");
    text(gDatRec, "dDesPaisRe", PAIS.PRY);
    text(gDatRec, "iTiContRec", receptor.tipoContribuyente);
    text(gDatRec, "dRucRec", rucRec.base);
    text(gDatRec, "dDVRec", rucRec.dv);
    text(gDatRec, "dNomRec", receptor.razonSocial);
  } else {
    text(gDatRec, "iNatRec", 2);
    text(gDatRec, "iTiOpe", 2);
    text(gDatRec, "cPaisRec", "PRY");
    text(gDatRec, "dDesPaisRe", PAIS.PRY);
    text(gDatRec, "iTipIDRec", receptor.tipoDocumento);
    text(
      gDatRec,
      "dDTipIDRec",
      TIPO_DOCUMENTO_IDENTIDAD[receptor.tipoDocumento as keyof typeof TIPO_DOCUMENTO_IDENTIDAD],
    );
    text(gDatRec, "dNumIDRec", receptor.numeroDocumento);
    text(gDatRec, "dNomRec", receptor.nombre);
  }
  maybe(gDatRec, "dEmailRec", receptor.email);
}

function buildTipoDE(
  gDtipDE: XMLBuilder,
  invoice: Invoice,
  items: readonly ItemAmounts[],
  totals: InvoiceTotals,
): void {
  const gCamFE = gDtipDE.ele("gCamFE");
  text(gCamFE, "iIndPres", invoice.indicadorPresencia);
  text(
    gCamFE,
    "dDesIndPres",
    INDICADOR_PRESENCIA[invoice.indicadorPresencia as keyof typeof INDICADOR_PRESENCIA],
  );

  const gCamCond = gDtipDE.ele("gCamCond");
  text(gCamCond, "iCondOpe", 1);
  text(gCamCond, "dDCondOpe", CONDICION_OPERACION[1]);
  const gPaConEIni = gCamCond.ele("gPaConEIni");
  text(gPaConEIni, "iTiPago", 1);
  text(gPaConEIni, "dDesTiPag", TIPO_PAGO[1]);
  text(gPaConEIni, "dMonTiPag", amount(totals.dTotGralOpe));
  text(gPaConEIni, "cMoneTiPag", "PYG");
  text(gPaConEIni, "dDMoneTiPag", MONEDA.PYG);

  for (const line of items) {
    const gCamItem = gDtipDE.ele("gCamItem");
    text(gCamItem, "dCodInt", line.item.codigo);
    text(gCamItem, "dDesProSer", line.item.descripcion);
    text(gCamItem, "cUniMed", 77);
    text(gCamItem, "dDesUniMed", UNIDAD_MEDIDA[77]);
    text(gCamItem, "dCantProSer", line.item.cantidad);

    const gValorItem = gCamItem.ele("gValorItem");
    text(gValorItem, "dPUniProSer", line.item.precioUnitario);
    text(gValorItem, "dTotBruOpeItem", amount(line.totalBruto));
    const gValorRestaItem = gValorItem.ele("gValorRestaItem");
    text(gValorRestaItem, "dDescItem", 0);
    text(gValorRestaItem, "dDescGloItem", 0);
    text(gValorRestaItem, "dAntPreUniIt", 0);
    text(gValorRestaItem, "dAntGloPreUniIt", 0);
    text(gValorRestaItem, "dTotOpeItem", amount(line.totalOperacion));

    const gCamIVA = gCamItem.ele("gCamIVA");
    text(gCamIVA, "iAfecIVA", line.afectacion);
    text(gCamIVA, "dDesAfecIVA", AFECTACION_IVA[line.afectacion]);
    text(gCamIVA, "dPropIVA", line.proporcion);
    text(gCamIVA, "dTasaIVA", line.tasa);
    text(gCamIVA, "dBasGravIVA", amount(line.baseGravada));
    text(gCamIVA, "dLiqIVAItem", amount(line.liquidacionIva));
    text(gCamIVA, "dBasExe", amount(line.baseExenta));
  }
}

const TOTAL_FIELDS = [
  "dSubExe",
  "dSubExo",
  "dSub5",
  "dSub10",
  "dTotOpe",
  "dTotDesc",
  "dTotDescGlotem",
  "dTotAntItem",
  "dTotAnt",
  "dPorcDescTotal",
  "dDescTotal",
  "dAnticipo",
  "dTotGralOpe",
  "dIVA5",
  "dIVA10",
  "dLiqTotIVA5",
  "dLiqTotIVA10",
  "dTotIVA",
  "dBaseGrav5",
  "dBaseGrav10",
  "dTBasGraIVA",
] as const satisfies readonly (keyof InvoiceTotals)[];

function buildTotales(gTotSub: XMLBuilder, totals: InvoiceTotals): void {
  for (const field of TOTAL_FIELDS) text(gTotSub, field, amount(totals[field]));
}
