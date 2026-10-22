import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { buildInvoiceXml, nowInAsuncion, SIFEN_NAMESPACE } from "../src/index.js";
import { FECHA_FIRMA, sampleInvoice } from "./helpers/fixtures.js";

const build = (input = sampleInvoice()) => buildInvoiceXml(input, { fechaFirma: FECHA_FIRMA });

function parse(xml: string) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function childNames(xml: string, parent: string): string[] {
  const element = parse(xml).getElementsByTagName(parent)[0];
  if (!element) throw new Error(`no ${parent}`);
  return Array.from(element.childNodes)
    .filter((n) => n.nodeType === 1)
    .map((n) => n.nodeName);
}

const value = (xml: string, tag: string) =>
  parse(xml).getElementsByTagName(tag)[0]?.textContent ?? undefined;

/** Pretty-prints for readable snapshots. */
function pretty(xml: string): string {
  return xml.replace(/></g, ">\n<");
}

describe("Factura Electrónica XML", () => {
  it("matches the snapshot for a contribuyente receptor", () => {
    expect(pretty(build().xml)).toMatchSnapshot();
  });

  it("matches the snapshot for a no contribuyente receptor", () => {
    const xml = build(
      sampleInvoice({
        receptor: {
          tipo: "no_contribuyente",
          tipoDocumento: 1,
          numeroDocumento: "1234567",
          nombre: "Persona Ficticia",
          email: "cliente@example.com",
        },
        items: [
          { codigo: "S-1", descripcion: "Servicio", cantidad: 1, precioUnitario: 55000, iva: 10 },
        ],
        tipoTransaccion: 2,
      }),
    ).xml;
    expect(pretty(xml)).toMatchSnapshot();
  });

  it("uses the SIFEN namespace, format version and CDC as DE Id", () => {
    const { xml, cdc } = build();
    const doc = parse(xml);
    const root = doc.documentElement;
    expect(root?.nodeName).toBe("rDE");
    expect(root?.namespaceURI).toBe(SIFEN_NAMESPACE);
    expect(value(xml, "dVerFor")).toBe("150");
    expect(doc.getElementsByTagName("DE")[0]?.getAttribute("Id")).toBe(cdc);
    expect(value(xml, "dDVId")).toBe(cdc.slice(-1));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("emits groups in the order of the manual", () => {
    const { xml } = build();
    expect(childNames(xml, "rDE")).toEqual(["dVerFor", "DE"]);
    expect(childNames(xml, "DE")).toEqual([
      "dDVId",
      "dFecFirma",
      "dSisFact",
      "gOpeDE",
      "gTimb",
      "gDatGralOpe",
      "gDtipDE",
      "gTotSub",
    ]);
    expect(childNames(xml, "gDatGralOpe")).toEqual(["dFeEmiDE", "gOpeCom", "gEmis", "gDatRec"]);
    expect(childNames(xml, "gDtipDE")).toEqual([
      "gCamFE",
      "gCamCond",
      "gCamItem",
      "gCamItem",
      "gCamItem",
    ]);
    expect(childNames(xml, "gCamIVA")).toEqual([
      "iAfecIVA",
      "dDesAfecIVA",
      "dPropIVA",
      "dTasaIVA",
      "dBasGravIVA",
      "dLiqIVAItem",
      "dBasExe",
    ]);
  });

  it("always emits dRedon = 0 right before dTotGralOpe", () => {
    const { xml } = build();
    expect(xml).toContain("<dAnticipo>0</dAnticipo><dRedon>0</dRedon><dTotGralOpe>");
    const totals = childNames(xml, "gTotSub");
    expect(totals.indexOf("dRedon")).toBe(totals.indexOf("dTotGralOpe") - 1);
  });

  it("writes emitter and receiver identification without the DV in the RUC field", () => {
    const { xml } = build();
    expect(value(xml, "dRucEm")).toBe("80000001");
    expect(value(xml, "dDVEmi")).toBe("3");
    expect(value(xml, "dRucRec")).toBe("80000002");
    expect(value(xml, "dDVRec")).toBe("1");
    expect(value(xml, "iNatRec")).toBe("1");
  });

  it("includes optional emitter fields only when provided", () => {
    const base = sampleInvoice();
    const { xml } = build(
      sampleInvoice({
        emisor: {
          ...base.emisor,
          nombreFantasia: "Tienda Ficticia",
          distrito: { codigo: 1, descripcion: "ASUNCION" },
        },
        informacionEmisor: "Gracias por su compra",
      }),
    );
    expect(value(xml, "dNomFanEmi")).toBe("Tienda Ficticia");
    expect(value(xml, "cDisEmi")).toBe("1");
    expect(value(xml, "dInfoEmi")).toBe("Gracias por su compra");
    expect(value(build().xml, "dNomFanEmi")).toBeUndefined();
  });

  it("escapes special characters", () => {
    const base = sampleInvoice();
    const { xml } = build(
      sampleInvoice({ emisor: { ...base.emisor, razonSocial: "Pérez & Hijos <S.A.>" } }),
    );
    expect(xml).toContain("<dNomEmi>Pérez &amp; Hijos &lt;S.A.&gt;</dNomEmi>");
  });

  it("generates a security code when none is given", () => {
    const rest = sampleInvoice();
    delete rest.codigoSeguridad;
    const first = build(rest);
    const second = build(rest);
    expect(value(first.xml, "dCodSeg")).toMatch(/^\d{9}$/);
    expect(first.cdc).not.toBe(second.cdc);
  });

  it("formats the signing time in Paraguay local time", () => {
    // Paraguay has been on permanent UTC-3 since October 2024, so 15:00Z is 12:00.
    // An older tz database would still apply winter time (UTC-4, 11:00).
    expect(nowInAsuncion(new Date("2026-07-01T15:00:00Z"))).toMatch(/^2026-07-01T1[12]:00:00$/);
    expect(value(buildInvoiceXml(sampleInvoice()).xml, "dFecFirma")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    );
  });
});
