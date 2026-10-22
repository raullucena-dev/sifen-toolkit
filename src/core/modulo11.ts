/**
 * Módulo 11 check digit as specified by the SET for both the RUC and the CDC.
 *
 * Digits are weighted from right to left with factors 2, 3, …, `baseMax`, wrapping back
 * to 2. With `r = sum % 11`, the check digit is `11 - r` when `r > 1`, otherwise `0`.
 */
export function modulo11(digits: string, baseMax = 11): number {
  if (!/^\d+$/.test(digits)) {
    throw new TypeError("modulo11 expects a non-empty string of decimal digits");
  }
  let total = 0;
  let factor = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    total += Number(digits[i]) * factor;
    factor = factor === baseMax ? 2 : factor + 1;
  }
  const remainder = total % 11;
  return remainder > 1 ? 11 - remainder : 0;
}
