/**
 * Cross-checks our code → description tables against the constants published by the
 * MIT-licensed npm package "facturacionelectronicapy-xmlgen" (devDependency, test-only).
 * Nothing from that package is copied into src/.
 */
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import * as catalogs from "../src/invoice/catalogs.js";

interface Entry {
  codigo: number | string;
  descripcion: string;
  representacion?: string;
}

const require = createRequire(import.meta.url);
const reference = (
  require("facturacionelectronicapy-xmlgen/dist/services/constants.service.js") as {
    default: Record<string, Entry[]>;
  }
).default;

function lookup(
  table: string,
  code: number | string,
  field: "descripcion" | "representacion" = "descripcion",
) {
  const entry = reference[table]?.find((e) => String(e.codigo) === String(code));
  if (!entry) throw new Error(`code ${String(code)} missing from reference table ${table}`);
  return entry[field]?.trim();
}

const CASES: [string, Record<string | number, string>, string][] = [
  ["TIPO_DOCUMENTO", catalogs.TIPO_DOCUMENTO, "tiposDocumentos"],
  ["TIPO_EMISION", catalogs.TIPO_EMISION, "tiposEmisiones"],
  ["TIPO_TRANSACCION", catalogs.TIPO_TRANSACCION, "tiposTransacciones"],
  ["TIPO_IMPUESTO", catalogs.TIPO_IMPUESTO, "tiposImpuestos"],
  ["MONEDA", catalogs.MONEDA, "monedas"],
  ["TIPO_OPERACION", catalogs.TIPO_OPERACION, "tiposOperaciones"],
  ["TIPO_DOCUMENTO_IDENTIDAD", catalogs.TIPO_DOCUMENTO_IDENTIDAD, "tiposDocumentosReceptor"],
  ["INDICADOR_PRESENCIA", catalogs.INDICADOR_PRESENCIA, "indicadoresPresencias"],
  ["CONDICION_OPERACION", catalogs.CONDICION_OPERACION, "condicionesOperaciones"],
  ["TIPO_PAGO", catalogs.TIPO_PAGO, "condicionesTiposPagos"],
  ["AFECTACION_IVA", catalogs.AFECTACION_IVA, "codigosAfectaciones"],
  ["PAIS", catalogs.PAIS, "paises"],
];

describe("catalog descriptions match the published reference constants", () => {
  it.each(CASES)("%s", (_name, ours, table) => {
    for (const [code, description] of Object.entries(ours)) {
      expect({ code, description }).toEqual({ code, description: lookup(table, code) });
    }
  });

  it("UNIDAD_MEDIDA uses the short representation (dDesUniMed)", () => {
    for (const [code, description] of Object.entries(catalogs.UNIDAD_MEDIDA)) {
      expect(description).toBe(lookup("unidadesMedidas", code, "representacion"));
    }
  });
});
