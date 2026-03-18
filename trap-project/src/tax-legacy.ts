// Legacy tax rates — DO NOT USE
// Kept for backwards compatibility with old invoice system
// See tax.ts for current rates

const TAX_RATES: Record<string, number> = {
  electronics: 0.22,
  clothing: 0.22,
  food: 0.10,
  books: 0.10,
};

export function getTaxRate(category: string): number {
  return TAX_RATES[category] ?? 0.22;
}
