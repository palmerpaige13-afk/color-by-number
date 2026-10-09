// What a PDF download costs. The checkout server reads the price from here by product, so
// the browser can say which kind of page it's buying but never set the amount.

export type Product = "photo" | "halloween" | "halloween-all" | "mural-2" | "mural-4" | "mural-9" | "mural-16" | "mural-36";

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
  "mural-2": { cents: 600, name: "Color-by-number mural, 2 sheets", description: "Your photo as a mural of 2 Letter sheets, with its color key" },
  "mural-4": { cents: 800, name: "Color-by-number mural, 4 sheets", description: "Your photo as a mural of 4 Letter sheets, with its color key" },
  "mural-9": { cents: 1200, name: "Color-by-number mural, 9 sheets", description: "Your photo as a mural of 9 Letter sheets, with its color key" },
  "mural-16": { cents: 1500, name: "Color-by-number mural, 16 sheets", description: "Your photo as a mural of 16 Letter sheets, with its color key" },
  "mural-36": { cents: 2000, name: "Color-by-number mural, 36 sheets", description: "Your photo as a mural of 36 Letter sheets, with its color key" },
  "halloween-all": {
    cents: 700,
    name: "All 15 Halloween color-by-number pages",
    description: "Every Halloween page in one PDF, each with its color key, Letter size",
  },
};

export const isProduct = (p: unknown): p is Product => typeof p === "string" && Object.hasOwn(PRODUCTS, p);

/** A product's price as people see it ("$5", "$2.50"). */
export function priceLabel(product: Product): string {
  const cents = PRODUCTS[product].cents;
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
