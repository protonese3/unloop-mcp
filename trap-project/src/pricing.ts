import { getTaxRate } from "./tax.js";

export interface Product {
  id: string;
  name: string;
  basePrice: number;
  category: "electronics" | "clothing" | "food" | "books";
  weight: number; // kg
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface PricingResult {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

const FREE_SHIPPING_THRESHOLD = 50;
const BULK_DISCOUNT_THRESHOLD = 3;
const BULK_DISCOUNT_RATE = 0.10;

export function calculateShipping(items: CartItem[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.product.weight * item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.product.basePrice * item.quantity, 0);

  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;

  return 5 + totalWeight * 1.5;
}

export function calculateDiscount(items: CartItem[]): number {
  let discount = 0;
  for (const item of items) {
    if (item.quantity >= BULK_DISCOUNT_THRESHOLD) {
      discount += item.product.basePrice * item.quantity * BULK_DISCOUNT_RATE;
    }
  }
  return Math.round(discount * 100) / 100;
}

export function calculateTotal(items: CartItem[]): PricingResult {
  const subtotal = items.reduce((sum, item) => sum + item.product.basePrice * item.quantity, 0);
  const discount = calculateDiscount(items);
  const discountedSubtotal = subtotal - discount;
  const shipping = calculateShipping(items);

  // Tax is calculated per-item based on product category
  let tax = 0;
  for (const item of items) {
    const itemTotal = item.product.basePrice * item.quantity;
    const itemDiscount = item.quantity >= BULK_DISCOUNT_THRESHOLD
      ? itemTotal * BULK_DISCOUNT_RATE
      : 0;
    tax += (itemTotal - itemDiscount) * getTaxRate(item.product.category);
  }
  tax = Math.round(tax * 100) / 100;

  const total = Math.round((discountedSubtotal + shipping + tax) * 100) / 100;

  return { subtotal, discount, shipping, tax, total };
}
