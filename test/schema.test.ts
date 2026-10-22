import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseInvoice, type InvoiceInput } from "../src/index.js";
import { sampleInvoice } from "./helpers/fixtures.js";

function issues(input: unknown): string[] {
  try {
    parseInvoice(input);
  } catch (error) {
    if (error instanceof ZodError) return error.issues.map((i) => i.path.join("."));
    throw error;
  }
  return [];
}

const base = sampleInvoice();
const withEmisor = (patch: Record<string, unknown>) =>
  sampleInvoice({ emisor: { ...base.emisor, ...patch } });
const withItem = (patch: Record<string, unknown>) =>
  sampleInvoice({ items: [{ ...base.items[0], ...patch } as InvoiceInput["items"][number]] });

describe("invoice schema", () => {
  it("accepts the sample and applies defaults and padding", () => {
    const invoice = parseInvoice(
      sampleInvoice({
        timbrado: {
          ...base.timbrado,
          establecimiento: 1,
          puntoExpedicion: "2",
          numeroDocumento: 7,
        },
      }),
    );
    expect(invoice.timbrado).toMatchObject({
      establecimiento: "001",
      puntoExpedicion: "002",
      numeroDocumento: "0000007",
    });
    expect(invoice).toMatchObject({ tipoEmision: 1, tipoTransaccion: 1, indicadorPresencia: 1 });
    expect(invoice.receptor).toMatchObject({ tipoOperacion: 1 });
  });

  it.each([
    ["emisor RUC with a wrong check digit", withEmisor({ ruc: "80000001-4" }), "emisor.ruc"],
    ["emisor RUC without a check digit", withEmisor({ ruc: "80000001" }), "emisor.ruc"],
    ["invalid email", withEmisor({ email: "not-an-email" }), "emisor.email"],
    ["short phone", withEmisor({ telefono: "123" }), "emisor.telefono"],
    ["control characters", withEmisor({ razonSocial: "Bad\u0007Name" }), "emisor.razonSocial"],
    [
      "fechaEmision with timezone",
      sampleInvoice({ fechaEmision: "2026-10-22T10:00:00Z" }),
      "fechaEmision",
    ],
    [
      "fechaEmision before the timbrado",
      sampleInvoice({ fechaEmision: "2025-12-31T23:59:59" }),
      "fechaEmision",
    ],
    [
      "timbrado with 7 digits",
      sampleInvoice({ timbrado: { ...base.timbrado, numero: "1234567" } }),
      "timbrado.numero",
    ],
    [
      "document number zero",
      sampleInvoice({ timbrado: { ...base.timbrado, numeroDocumento: 0 } }),
      "timbrado.numeroDocumento",
    ],
    ["no items", sampleInvoice({ items: [] }), "items"],
    ["IVA 15%", withItem({ iva: 15 }), "items.0.iva"],
    ["negative price", withItem({ precioUnitario: -1 }), "items.0.precioUnitario"],
    ["decimal price", withItem({ precioUnitario: 10.5 }), "items.0.precioUnitario"],
    ["zero quantity", withItem({ cantidad: 0 }), "items.0.cantidad"],
    ["5 decimals in quantity", withItem({ cantidad: "1.12345" }), "items.0.cantidad"],
    [
      "line total with fractions of a guaraní",
      withItem({ cantidad: "1.5", precioUnitario: 333 }),
      "items.0.cantidad",
    ],
    ["tipoTransaccion 9", sampleInvoice({ tipoTransaccion: 9 }), "tipoTransaccion"],
    [
      "innominado with a document number",
      sampleInvoice({
        receptor: {
          tipo: "no_contribuyente",
          tipoDocumento: 5,
          numeroDocumento: "123",
          nombre: "Sin Nombre",
        },
      }),
      "receptor.numeroDocumento",
    ],
    [
      "unknown receptor type",
      sampleInvoice({ receptor: { tipo: "extranjero" } as unknown as InvoiceInput["receptor"] }),
      "receptor.tipo",
    ],
  ])("rejects %s", (_name, input, path) => {
    expect(issues(input)).toContain(path);
  });

  it("reports every problem at once", () => {
    const paths = issues({ ...base, emisor: { ...base.emisor, ruc: "1-1" }, items: [] });
    expect(paths).toEqual(expect.arrayContaining(["emisor.ruc", "items"]));
  });

  it("accepts innominado receptors with document number 0", () => {
    const invoice = parseInvoice(
      sampleInvoice({
        receptor: {
          tipo: "no_contribuyente",
          tipoDocumento: 5,
          numeroDocumento: "0",
          nombre: "Sin Nombre",
        },
      }),
    );
    expect(invoice.receptor.tipo).toBe("no_contribuyente");
  });
});
