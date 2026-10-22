/**
 * Code → description tables from the Manual Técnico v150, restricted to the values this
 * toolkit supports. SIFEN validates that each `dDes*` description matches its code, so
 * descriptions are fixed here rather than supplied by callers.
 */

export const TIPO_DOCUMENTO = { 1: "Factura electrónica" } as const;

export const TIPO_EMISION = { 1: "Normal", 2: "Contingencia" } as const;

export const TIPO_TRANSACCION = {
  1: "Venta de mercadería",
  2: "Prestación de servicios",
  3: "Mixto (Venta de mercadería y servicios)",
} as const;

export const TIPO_IMPUESTO = { 1: "IVA" } as const;

export const MONEDA = { PYG: "Guarani" } as const;

export const NATURALEZA_RECEPTOR = { CONTRIBUYENTE: 1, NO_CONTRIBUYENTE: 2 } as const;

export const TIPO_OPERACION = { 1: "B2B", 2: "B2C" } as const;

export const TIPO_DOCUMENTO_IDENTIDAD = {
  1: "Cédula paraguaya",
  2: "Pasaporte",
  3: "Cédula extranjera",
  4: "Carnet de residencia",
  5: "Innominado",
} as const;

export const INDICADOR_PRESENCIA = {
  1: "Operación presencial",
  2: "Operación electrónica",
  3: "Operación telemarketing",
  4: "Venta a domicilio",
} as const;

export const CONDICION_OPERACION = { 1: "Contado" } as const;

export const TIPO_PAGO = { 1: "Efectivo" } as const;

export const UNIDAD_MEDIDA = { 77: "UNI" } as const;

export const AFECTACION_IVA = { 1: "Gravado IVA", 3: "Exento" } as const;

export const PAIS = { PRY: "Paraguay" } as const;
