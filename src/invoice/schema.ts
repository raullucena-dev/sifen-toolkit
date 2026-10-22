import { z } from "zod";

import { Decimal } from "../core/decimal.js";
import { isValidRuc } from "../core/ruc.js";
import { INDICADOR_PRESENCIA, TIPO_DOCUMENTO_IDENTIDAD, TIPO_TRANSACCION } from "./catalogs.js";

const codeOf = (table: Record<number, string>) =>
  z.union(
    Object.keys(table).map((key) => z.literal(Number(key))) as unknown as [
      z.ZodLiteral<number>,
      z.ZodLiteral<number>,
      ...z.ZodLiteral<number>[],
    ],
  );

/** Text fields: trimmed, no control characters, bounded length. */
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
      (value) => !/[\u0000-\u001f]/.test(value),
      "control characters are not allowed",
    );

const digits = (min: number, max: number) =>
  z.union([z.string(), z.number().int().nonnegative()]).transform((value, ctx) => {
    const textValue = String(value);
    if (!/^\d+$/.test(textValue) || textValue.length < min || textValue.length > max) {
      ctx.addIssue({ code: "custom", message: `expected ${min}-${max} digits` });
      return z.NEVER;
    }
    return textValue;
  });

const isoDate = z.iso.date();
/** Local Paraguay time without offset, as SIFEN expects: `YYYY-MM-DDThh:mm:ss`. */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "expected YYYY-MM-DDThh:mm:ss (local time)")
  .refine((value) => !Number.isNaN(Date.parse(`${value}Z`)), "invalid date-time");

const ruc = z
  .string()
  .trim()
  .refine(isValidRuc, "invalid RUC (expected NNNNNNNN-D with a valid check digit)");

const geo = z.object({ codigo: z.number().int().positive(), descripcion: text(1, 64) });

const decimalString = (maxDecimals: number) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const textValue = typeof value === "number" ? String(value) : value.trim();
    const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
    if (!pattern.test(textValue)) {
      ctx.addIssue({
        code: "custom",
        message: `expected a non-negative number with at most ${maxDecimals} decimals`,
      });
      return z.NEVER;
    }
    return textValue;
  });

export const emisorSchema = z.object({
  ruc,
  tipoContribuyente: z.union([z.literal(1), z.literal(2)]),
  razonSocial: text(4, 255),
  nombreFantasia: text(4, 255).optional(),
  direccion: text(1, 255),
  numeroCasa: digits(1, 6).default("0"),
  departamento: geo,
  distrito: geo.optional(),
  ciudad: geo,
  telefono: text(6, 15),
  email: z.email().max(80),
  actividadEconomica: z.object({ codigo: digits(1, 8), descripcion: text(1, 300) }),
});

const receptorContribuyente = z.object({
  tipo: z.literal("contribuyente"),
  ruc,
  tipoContribuyente: z.union([z.literal(1), z.literal(2)]),
  razonSocial: text(4, 255),
  /** 1 = B2B (default), 2 = B2C. */
  tipoOperacion: z.union([z.literal(1), z.literal(2)]).default(1),
  email: z.email().max(80).optional(),
});

const receptorNoContribuyente = z
  .object({
    tipo: z.literal("no_contribuyente"),
    tipoDocumento: codeOf(TIPO_DOCUMENTO_IDENTIDAD),
    numeroDocumento: text(1, 20),
    nombre: text(4, 255),
    email: z.email().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tipoDocumento === 5 && value.numeroDocumento !== "0") {
      ctx.addIssue({
        code: "custom",
        path: ["numeroDocumento"],
        message: 'innominado (tipoDocumento 5) requires numeroDocumento "0"',
      });
    }
  });

export const receptorSchema = z.discriminatedUnion("tipo", [
  receptorContribuyente,
  receptorNoContribuyente,
]);

export const itemSchema = z
  .object({
    codigo: text(1, 20),
    descripcion: text(1, 2000),
    /** Up to 4 decimals. */
    cantidad: decimalString(4),
    /** Unit price in guaraníes (PYG has no fractional unit). */
    precioUnitario: z.number().int().nonnegative().max(1e15),
    /** 10 or 5 (gravado IVA), 0 = exento. */
    iva: z.union([z.literal(10), z.literal(5), z.literal(0)]),
  })
  .superRefine((item, ctx) => {
    const quantity = Decimal.from(item.cantidad);
    if (quantity.isZero()) {
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "cantidad must be > 0" });
      return;
    }
    const lineTotal = Decimal.from(item.precioUnitario).mul(quantity);
    if (!lineTotal.equals(lineTotal.round(0))) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidad"],
        message: "precioUnitario × cantidad must be a whole number of guaraníes (PYG)",
      });
    }
  });

export const invoiceSchema = z
  .object({
    timbrado: z.object({
      numero: digits(8, 8),
      /** dFeIniT: start of the timbrado validity. */
      fechaInicio: isoDate,
      establecimiento: digits(1, 3).transform((v) => v.padStart(3, "0")),
      puntoExpedicion: digits(1, 3).transform((v) => v.padStart(3, "0")),
      numeroDocumento: digits(1, 7).transform((v) => v.padStart(7, "0")),
    }),
    fechaEmision: localDateTime,
    tipoEmision: z.union([z.literal(1), z.literal(2)]).default(1),
    /** dCodSeg; generated randomly when omitted. */
    codigoSeguridad: digits(9, 9).optional(),
    tipoTransaccion: codeOf(TIPO_TRANSACCION).default(1),
    indicadorPresencia: codeOf(INDICADOR_PRESENCIA).default(1),
    informacionEmisor: text(1, 3000).optional(),
    emisor: emisorSchema,
    receptor: receptorSchema,
    items: z.array(itemSchema).min(1).max(999),
  })
  .superRefine((invoice, ctx) => {
    if (invoice.timbrado.numeroDocumento === "0000000") {
      ctx.addIssue({
        code: "custom",
        path: ["timbrado", "numeroDocumento"],
        message: "numeroDocumento must be greater than zero",
      });
    }
    if (invoice.fechaEmision.slice(0, 10) < invoice.timbrado.fechaInicio) {
      ctx.addIssue({
        code: "custom",
        path: ["fechaEmision"],
        message: "fechaEmision cannot be earlier than the timbrado start date",
      });
    }
  });

export type InvoiceInput = z.input<typeof invoiceSchema>;
export type Invoice = z.output<typeof invoiceSchema>;
export type InvoiceItem = Invoice["items"][number];
export type Receptor = Invoice["receptor"];

/** Validates untrusted input; throws a ZodError with every problem found. */
export function parseInvoice(input: unknown): Invoice {
  return invoiceSchema.parse(input);
}
