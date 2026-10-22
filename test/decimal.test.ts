import { describe, expect, it } from "vitest";

import { Decimal } from "../src/index.js";

const d = (v: string | number) => Decimal.from(v);

describe("Decimal", () => {
  it("parses and prints without trailing zeros", () => {
    expect(d("100").toString()).toBe("100");
    expect(d("0.50").toString()).toBe("0.5");
    expect(d("-1.25").toString()).toBe("-1.25");
    expect(d(0.1).add(d(0.2)).toString()).toBe("0.3"); // no binary float drift
    expect(d(12n as unknown as number).toString()).toBe("12");
    expect(JSON.stringify({ v: d("1.5") })).toBe('{"v":"1.5"}');
  });

  it("rounds half-up", () => {
    expect(d("2.5").round().toString()).toBe("3");
    expect(d("2.49999999").round().toString()).toBe("2");
    expect(d("-2.5").round().toString()).toBe("-3");
    expect(d("1.005").round(2).toString()).toBe("1.01");
  });

  it("keeps 8 decimals in multiplication and division", () => {
    expect(d(100000).mul(d(100)).div(d(110)).toString()).toBe("90909.09090909");
    expect(d(1).div(d(3)).toString()).toBe("0.33333333");
    expect(d(2).div(d(3)).toString()).toBe("0.66666667");
    expect(d("-1").div(d(3)).toString()).toBe("-0.33333333");
  });

  it("rejects invalid input", () => {
    expect(() => d("1e5")).toThrow(TypeError);
    expect(() => d("abc")).toThrow(TypeError);
    expect(() => d("0.123456789")).toThrow(RangeError);
    expect(() => d(Number.NaN)).toThrow(TypeError);
    expect(() => d(1).div(Decimal.ZERO)).toThrow(RangeError);
  });

  it("compares", () => {
    expect(d("1.0").equals(d(1))).toBe(true);
    expect(Decimal.ZERO.isZero()).toBe(true);
    expect(d(-1).isNegative()).toBe(true);
    expect(d(1).sub(d(2)).toString()).toBe("-1");
  });
});
