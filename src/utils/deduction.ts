/**
 * Applies a revenue main category's deduction_rate (fraction, 0-1) to a gross
 * amount — e.g. the Localiza receivables-anticipation fee. Always computed
 * at read time; never persisted as a separate "net" value anywhere, so
 * there is exactly one source of truth (gross amount + category rate).
 */
export function netAmount(grossAmount: number, deductionRate: number | null | undefined): number {
  const rate = Number(deductionRate) || 0;
  return grossAmount * (1 - rate);
}
