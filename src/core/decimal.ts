/**
 * Minimal fixed-point decimal backed by bigint, with 8 fractional digits (the maximum
 * precision SIFEN accepts for amounts). Avoids binary floating point in money maths.
 * Rounding is half-up (away from zero on ties).
 */
const SCALE = 8;
const FACTOR = 10n ** BigInt(SCALE);

export class Decimal {
  private constructor(private readonly units: bigint) {}

  static readonly ZERO = new Decimal(0n);

  static from(value: Decimal | number | string | bigint): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === "bigint") return new Decimal(value * FACTOR);
    const text = typeof value === "number" ? numberToPlain(value) : value.trim();
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match?.[2]) throw new TypeError(`not a decimal number: ${JSON.stringify(value)}`);
    const fraction = match[3] ?? "";
    if (fraction.length > SCALE) {
      throw new RangeError(`at most ${SCALE} decimal places are supported: ${text}`);
    }
    const units = BigInt(match[2]) * FACTOR + BigInt(fraction.padEnd(SCALE, "0") || "0");
    return new Decimal(match[1] ? -units : units);
  }

  add(other: Decimal): Decimal {
    return new Decimal(this.units + other.units);
  }

  sub(other: Decimal): Decimal {
    return new Decimal(this.units - other.units);
  }

  /** Product rounded half-up to 8 decimals. */
  mul(other: Decimal): Decimal {
    return new Decimal(divRound(this.units * other.units, FACTOR));
  }

  /** Quotient rounded half-up to 8 decimals. */
  div(other: Decimal): Decimal {
    if (other.units === 0n) throw new RangeError("division by zero");
    return new Decimal(divRound(this.units * FACTOR, other.units));
  }

  /** Rounds half-up to `places` decimals (0..8). */
  round(places = 0): Decimal {
    const step = 10n ** BigInt(SCALE - places);
    return new Decimal(divRound(this.units, step) * step);
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  equals(other: Decimal): boolean {
    return this.units === other.units;
  }

  /** Plain notation without trailing zeros, e.g. `90909.09090909`, `100`. */
  toString(): string {
    const negative = this.units < 0n;
    const abs = negative ? -this.units : this.units;
    const integer = abs / FACTOR;
    const fraction = (abs % FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n + d / 2n) / d;
  return negative ? -quotient : quotient;
}

function numberToPlain(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError(`not a finite number: ${value}`);
  // Up to 8 decimals; toFixed avoids exponent notation for small/large values.
  return value.toFixed(SCALE).replace(/\.?0+$/, "") || "0";
}

export function sum(values: Iterable<Decimal>): Decimal {
  let total = Decimal.ZERO;
  for (const value of values) total = total.add(value);
  return total;
}
