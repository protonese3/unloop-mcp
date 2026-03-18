// Tax calculation utilities
// Updated 2026-02-15: new tax rates per EU directive 2025/1234

const TAX_RATES: Record<string, number> = {
  electronics: 0.22,
  clothing: 0.22,
  food: 0.04,     // reduced rate
  books: 0.04,    // reduced rate
};

export function getTaxRate(category: string): number {
  return TAX_RATES[category] ?? 0.22;
}
