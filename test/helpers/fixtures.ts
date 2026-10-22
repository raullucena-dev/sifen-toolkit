import type { InvoiceInput } from "../../src/index.js";

/**
 * Fictitious data only. RUCs are made-up numbers with valid check digits:
 * 80000001-3 (emitter), 80000002-1 (receiver). CSC is a dummy value.
 */
export const EMISOR_RUC = "80000001-3";
export const RECEPTOR_RUC = "80000002-1";
export const TEST_CSC = { id: "0001", value: "ABCD0000000000000000000000000000" };

export function sampleInvoice(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    timbrado: {
      numero: "12345678",
      fechaInicio: "2026-01-01",
      establecimiento: "001",
      puntoExpedicion: "001",
      numeroDocumento: "0000015",
    },
    fechaEmision: "2026-10-22T10:00:00",
    codigoSeguridad: "123456789",
    emisor: {
      ruc: EMISOR_RUC,
      tipoContribuyente: 2,
      razonSocial: "Empresa Ficticia S.A.",
      direccion: "Calle Ficticia",
      numeroCasa: "123",
      departamento: { codigo: 1, descripcion: "CAPITAL" },
      ciudad: { codigo: 1, descripcion: "ASUNCION (DISTRITO)" },
      telefono: "021000000",
      email: "ventas@example.com",
      actividadEconomica: { codigo: "46510", descripcion: "Comercio al por mayor (ficticio)" },
    },
    receptor: {
      tipo: "contribuyente",
      ruc: RECEPTOR_RUC,
      tipoContribuyente: 2,
      razonSocial: "Cliente Ficticio S.R.L.",
    },
    items: [
      {
        codigo: "A-1",
        descripcion: "Producto gravado 10%",
        cantidad: 1,
        precioUnitario: 100000,
        iva: 10,
      },
      {
        codigo: "B-1",
        descripcion: "Producto gravado 5%",
        cantidad: 2,
        precioUnitario: 52500,
        iva: 5,
      },
      { codigo: "C-1", descripcion: "Producto exento", cantidad: 3, precioUnitario: 1000, iva: 0 },
    ],
    ...overrides,
  };
}

export const FECHA_FIRMA = "2026-10-22T10:00:05";
