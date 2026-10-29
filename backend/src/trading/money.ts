import { Decimal } from "decimal.js";

export { Decimal };

// Deriv sends amounts as text ("1.00") or as numbers (1.92). Both become an
// exact decimal. Anything else is refused (null) rather than guessed at.
export function fromDeriv(value: unknown): Decimal | null {
  if (typeof value === "number") return Number.isFinite(value) ? new Decimal(value) : null;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return new Decimal(value.trim());
  return null;
}

// The text stored in the database (numeric with 8 decimals).
export function toDb(amount: Decimal): string {
  return amount.toFixed(8);
}

// Two amounts count as equal when they are within half a cent.
export function sameAmount(a: Decimal, b: Decimal, tolerance = "0.005"): boolean {
  return a.minus(b).abs().lte(tolerance);
}