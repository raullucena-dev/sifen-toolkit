import { randomInt } from "node:crypto";

import { modulo11 } from "./modulo11.js";
import { rucCheckDigit } from "./ruc.js";

/**
 * Components of the 44-digit Código de Control (CDC), in order:
 *
 * | Field              | Digits | Manual |
 * | ------------------ | ------ | ------ |
 * | tipoDocumento      | 2      | iTiDE  |
 * | rucEmisor          | 8      | dRucEm (left-padded with zeros) |
 * | dvEmisor           | 1      | dDVEmi |
 * | establecimiento    | 3      | dEst   |
 * | puntoExpedicion    | 3      | dPunExp |
 * | numeroDocumento    | 7      | dNumDoc |
 * | tipoContribuyente  | 1      | iTipCont |
 * | fechaEmision       | 8      | dFeEmiDE (YYYYMMDD) |
 * | tipoEmision        | 1      | iTipEmi |
 * | codigoSeguridad    | 9      | dCodSeg |
 * | dv                 | 1      | dDVId (módulo 11 of the previous 43 digits) |
 */
export interface CdcComponents {
  tipoDocumento: number;
  rucEmisor: string;
  dvEmisor: number;
  establecimiento: string;
  puntoExpedicion: string;
  numeroDocumento: string;
  tipoContribuyente: 1 | 2;
  /** `YYYY-MM-DD` or `YYYYMMDD`. */
  fechaEmision: string;
  tipoEmision: 1 | 2;
  codigoSeguridad: string;
}

export interface ParsedCdc extends Omit<CdcComponents, "fechaEmision"> {
  /** `YYYY-MM-DD`. */
  fechaEmision: string;
  dv: number;
  cdc: string;
}

function digits(value: string | number, width: number, field: string): string {
  const text = String(value);
  if (!/^\d+$/.test(text) || text.length > width) {
    throw new RangeError(`${field} must be at most ${width} digits, got ${JSON.stringify(value)}`);
  }
  return text.padStart(width, "0");
}

function compactDate(value: string): string {
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact) || !isRealDate(compact)) {
    throw new RangeError(`fechaEmision must be a valid YYYY-MM-DD date, got ${value}`);
  }
  return compact;
}

function isRealDate(yyyymmdd: string): boolean {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Generates a random 9-digit dCodSeg. */
export function generateSecurityCode(): string {
  // Avoid 000000000; the manual requires a random value and an all-zero one is suspicious.
  return String(randomInt(1, 1_000_000_000)).padStart(9, "0");
}

/** Builds the 44-digit CDC, appending its módulo 11 check digit. */
export function buildCdc(components: CdcComponents): string {
  if (![1, 2].includes(components.tipoContribuyente)) {
    throw new RangeError("tipoContribuyente must be 1 (persona física) or 2 (persona jurídica)");
  }
  if (![1, 2].includes(components.tipoEmision)) {
    throw new RangeError("tipoEmision must be 1 (normal) or 2 (contingencia)");
  }
  const rucDigits = digits(components.rucEmisor, 8, "rucEmisor");
  const expectedDv = rucCheckDigit(components.rucEmisor);
  if (expectedDv !== components.dvEmisor) {
    throw new RangeError(`dvEmisor does not match rucEmisor: expected ${expectedDv}`);
  }
  const body = [
    digits(components.tipoDocumento, 2, "tipoDocumento"),
    rucDigits,
    digits(components.dvEmisor, 1, "dvEmisor"),
    digits(components.establecimiento, 3, "establecimiento"),
    digits(components.puntoExpedicion, 3, "puntoExpedicion"),
    digits(components.numeroDocumento, 7, "numeroDocumento"),
    String(components.tipoContribuyente),
    compactDate(components.fechaEmision),
    String(components.tipoEmision),
    digits(components.codigoSeguridad, 9, "codigoSeguridad"),
  ].join("");
  return body + String(modulo11(body));
}

/** Parses and validates a CDC (length, digits, date, emitter RUC DV and CDC DV). */
export function parseCdc(cdc: string): ParsedCdc {
  if (!/^\d{44}$/.test(cdc)) {
    throw new TypeError("CDC must be exactly 44 digits");
  }
  const expected = modulo11(cdc.slice(0, 43));
  const dv = Number(cdc[43]);
  if (expected !== dv) {
    throw new RangeError(`invalid CDC check digit: expected ${expected}`);
  }
  const rucEmisor = cdc.slice(2, 10).replace(/^0+(?=\d)/, "");
  const dvEmisor = Number(cdc[10]);
  if (rucCheckDigit(rucEmisor) !== dvEmisor) {
    throw new RangeError("invalid emitter RUC check digit inside CDC");
  }
  const tipoContribuyente = Number(cdc[24]);
  const tipoEmision = Number(cdc[33]);
  if (
    (tipoContribuyente !== 1 && tipoContribuyente !== 2) ||
    (tipoEmision !== 1 && tipoEmision !== 2)
  ) {
    throw new RangeError("invalid tipoContribuyente or tipoEmision inside CDC");
  }
  const date = cdc.slice(25, 33);
  if (!isRealDate(date)) {
    throw new RangeError("invalid emission date inside CDC");
  }
  return {
    cdc,
    tipoDocumento: Number(cdc.slice(0, 2)),
    rucEmisor,
    dvEmisor,
    establecimiento: cdc.slice(11, 14),
    puntoExpedicion: cdc.slice(14, 17),
    numeroDocumento: cdc.slice(17, 24),
    tipoContribuyente,
    fechaEmision: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    tipoEmision,
    codigoSeguridad: cdc.slice(34, 43),
    dv,
  };
}

export function isValidCdc(cdc: string): boolean {
  try {
    parseCdc(cdc);
    return true;
  } catch {
    return false;
  }
}
