import { modulo11 } from "./modulo11.js";

export interface Ruc {
  /** RUC without check digit, no leading zeros (as printed). */
  readonly base: string;
  readonly dv: number;
}

const RUC_PATTERN = /^(\d{1,8})(?:-?(\d))?$/;

/** Calculates the check digit (dígito verificador) of a RUC base number. */
export function rucCheckDigit(base: string): number {
  const normalized = base.trim();
  if (!/^\d{1,8}$/.test(normalized)) {
    throw new TypeError("RUC base must be 1 to 8 digits");
  }
  return modulo11(normalized);
}

/**
 * Parses `"80012345-6"`, `"800123456"` or `"80012345"` (no DV). Throws when the input is
 * malformed or the given check digit does not match.
 */
export function parseRuc(value: string): Ruc {
  const match = RUC_PATTERN.exec(value.trim());
  if (!match?.[1]) {
    throw new TypeError(`invalid RUC format: ${JSON.stringify(value)}`);
  }
  const base = match[1].replace(/^0+(?=\d)/, "");
  const dv = rucCheckDigit(base);
  if (match[2] !== undefined && Number(match[2]) !== dv) {
    throw new RangeError(`invalid RUC check digit for ${base}: expected ${dv}`);
  }
  return { base, dv };
}

/** True when `value` is a well-formed RUC whose check digit is correct. */
export function isValidRuc(value: string): boolean {
  const match = RUC_PATTERN.exec(value.trim());
  if (match?.[2] === undefined) return false;
  try {
    parseRuc(value);
    return true;
  } catch {
    return false;
  }
}

export function formatRuc(ruc: Ruc): string {
  return `${ruc.base}-${ruc.dv}`;
}
