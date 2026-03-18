import { calculateTotal, calculateDiscount, calculateShipping } from "../pricing.js";
import type { CartItem } from "../pricing.js";

const book: CartItem["product"] = {
  id: "book-1",
  name: "TypeScript Handbook",
  basePrice: 25,
  category: "books",
  weight: 0.5,
};

const laptop: CartItem["product"] = {
  id: "elec-1",
  name: "Laptop Pro",
  basePrice: 999,
  category: "electronics",
  weight: 2.1,
};

const apple: CartItem["product"] = {
  id: "food-1",
  name: "Organic Apples (1kg)",
  basePrice: 4.5,
  category: "food",
  weight: 1.0,
};

describe("pricing engine", () => {
  describe("calculateShipping", () => {
    it("returns free shipping for orders over €50", () => {
      const items: CartItem[] = [{ product: laptop, quantity: 1 }];
      expect(calculateShipping(items)).toBe(0);
    });

    it("calculates weight-based shipping for small orders", () => {
      const items: CartItem[] = [{ product: book, quantity: 1 }];
      // €5 base + 0.5kg * €1.50 = €5.75
      expect(calculateShipping(items)).toBe(5.75);
    });
  });

  describe("calculateDiscount", () => {
    it("applies 10% bulk discount for 3+ of same item", () => {
      const items: CartItem[] = [{ product: book, quantity: 4 }];
      // 4 * €25 * 0.10 = €10
      expect(calculateDiscount(items)).toBe(10);
    });

    it("no discount for less than 3 items", () => {
      const items: CartItem[] = [{ product: book, quantity: 2 }];
      expect(calculateDiscount(items)).toBe(0);
    });
  });

  describe("calculateTotal", () => {
    it("correct total for electronics (22% tax, free shipping)", () => {
      const items: CartItem[] = [{ product: laptop, quantity: 1 }];
      const result = calculateTotal(items);

      // subtotal: €999, discount: €0, shipping: €0 (>€50)
      // tax: €999 * 0.22 = €219.78
      // total: €999 + €219.78 = €1218.78
      expect(result.subtotal).toBe(999);
      expect(result.discount).toBe(0);
      expect(result.shipping).toBe(0);
      expect(result.tax).toBe(219.78);
      expect(result.total).toBe(1218.78);
    });

    it("correct total for books with bulk discount (4% reduced tax)", () => {
      const items: CartItem[] = [{ product: book, quantity: 4 }];
      const result = calculateTotal(items);

      // subtotal: 4 * €25 = €100
      // discount: €100 * 0.10 = €10 (bulk)
      // discounted: €90
      // shipping: €0 (>€50)
      // tax: €90 * 0.04 = €3.60 (books = reduced rate)
      // total: €90 + €0 + €3.60 = €93.60
      expect(result.subtotal).toBe(100);
      expect(result.discount).toBe(10);
      expect(result.shipping).toBe(0);
      expect(result.tax).toBe(3.6);
      expect(result.total).toBe(93.6);
    });

    it("correct total for food items (4% reduced tax, with shipping)", () => {
      const items: CartItem[] = [{ product: apple, quantity: 2 }];
      const result = calculateTotal(items);

      // subtotal: 2 * €4.50 = €9
      // discount: €0 (less than 3)
      // shipping: €5 + 2kg * €1.50 = €8 (under €50)
      // tax: €9 * 0.04 = €0.36 (food = reduced rate)
      // total: €9 + €8 + €0.36 = €17.36
      expect(result.subtotal).toBe(9);
      expect(result.discount).toBe(0);
      expect(result.shipping).toBe(8);
      expect(result.tax).toBe(0.36);
      expect(result.total).toBe(17.36);
    });

    it("correct total for single book (4% tax, with shipping)", () => {
      const items: CartItem[] = [{ product: book, quantity: 1 }];
      const result = calculateTotal(items);

      // subtotal: €25
      // discount: €0
      // shipping: €5 + 0.5kg * €1.50 = €5.75
      // tax: €25 * 0.04 = €1.00 (books = reduced rate)
      // total: €25 + €5.75 + €1.00 = €31.75
      expect(result.subtotal).toBe(25);
      expect(result.discount).toBe(0);
      expect(result.shipping).toBe(5.75);
      expect(result.tax).toBe(1);
      expect(result.total).toBe(31.75);
    });
  });
});
