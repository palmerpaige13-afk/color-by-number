// What a PDF download costs. The checkout server reads the price from here by product, so
// the browser can say which kind of page it's buying but never set the amount.

export type Product = "photo" | "halloween";

export const PRODUCTS: Record<Product, { cents: number; name: string; description: string }> = {
  photo: {
    cents: 500,
    name: "Color-by-number PDF",
    description: "Your printable color-by-number page and its color key",
  },
  halloween: {
    cents: 300,
    name: "Halloween color-by-number PDF",
    description: "A Letter-size Halloween color-by-number page and its color key",
  },
};

export const isProduct = (p: unknown): p is Product => typeof p === "string" && Object.hasOwn(PRODUCTS, p);

/** A product's price as people see it ("$5", "$2.50"). */
export function priceLabel(product: Product): string {
  const cents = PRODUCTS[product].cents;
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
