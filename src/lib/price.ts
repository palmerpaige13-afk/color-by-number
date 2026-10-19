// What a PDF download costs. The checkout server reads the price from here by product, so
// the browser can say which kind of page it's buying but never set the amount.

export type Product =
  | "photo"
  | "halloween"
  | "halloween-all"
  | "thanksgiving"
  | "thanksgiving-all"
  | "christmas"
  | "christmas-all"
  | "halloween-older"
  | "halloween-older-all"
  | "thanksgiving-older"
  | "thanksgiving-older-all"
  | "christmas-older"
  | "christmas-older-all"
  | "mural-2"
  | "mural-4"
  | "mural-9"
  | "mural-16"
  | "mural-36";

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
  "mural-2": { cents: 200, name: "Color-by-number mural, 2 sheets", description: "Your photo as a mural of 2 Letter sheets, with its color key" },
  "mural-4": { cents: 400, name: "Color-by-number mural, 4 sheets", description: "Your photo as a mural of 4 Letter sheets, with its color key" },
  "mural-9": { cents: 900, name: "Color-by-number mural, 9 sheets", description: "Your photo as a mural of 9 Letter sheets, with its color key" },
  "mural-16": { cents: 1600, name: "Color-by-number mural, 16 sheets", description: "Your photo as a mural of 16 Letter sheets, with its color key" },
  "mural-36": { cents: 3600, name: "Color-by-number mural, 36 sheets", description: "Your photo as a mural of 36 Letter sheets, with its color key" },
  "halloween-all": {
    cents: 700,
    name: "All 15 Halloween color-by-number pages",
    description: "Every Halloween page in one PDF, each with its color key, Letter size",
  },
  thanksgiving: {
    cents: 300,
    name: "Thanksgiving color-by-number PDF",
    description: "A Letter-size Thanksgiving color-by-number page and its color key",
  },
  "thanksgiving-all": {
    cents: 700,
    name: "All 15 Thanksgiving color-by-number pages",
    description: "Every Thanksgiving page in one PDF, each with its color key, Letter size",
  },
  christmas: {
    cents: 300,
    name: "Christmas color-by-number PDF",
    description: "A Letter-size Christmas color-by-number page and its color key",
  },
  "christmas-all": {
    cents: 700,
    name: "All 15 Christmas color-by-number pages",
    description: "Every Christmas page in one PDF, each with its color key, Letter size",
  },
  "halloween-older": {
    cents: 300,
    name: "Halloween color-by-number PDF (ages 7–9)",
    description: "A harder Letter-size Halloween color-by-number page, with multiplication, and its color key",
  },
  "halloween-older-all": {
    cents: 700,
    name: "All 10 harder Halloween color-by-number pages (ages 7–9)",
    description: "Every harder Halloween page in one PDF, each with its color key, Letter size",
  },
  "thanksgiving-older": {
    cents: 300,
    name: "Thanksgiving color-by-number PDF (ages 7–9)",
    description: "A harder Letter-size Thanksgiving color-by-number page, with multiplication, and its color key",
  },
  "thanksgiving-older-all": {
    cents: 700,
    name: "All 10 harder Thanksgiving color-by-number pages (ages 7–9)",
    description: "Every harder Thanksgiving page in one PDF, each with its color key, Letter size",
  },
  "christmas-older": {
    cents: 300,
    name: "Christmas color-by-number PDF (ages 7–9)",
    description: "A harder Letter-size Christmas color-by-number page, with multiplication, and its color key",
  },
  "christmas-older-all": {
    cents: 700,
    name: "All 10 harder Christmas color-by-number pages (ages 7–9)",
    description: "Every harder Christmas page in one PDF, each with its color key, Letter size",
  },
};

export const isProduct = (p: unknown): p is Product => typeof p === "string" && Object.hasOwn(PRODUCTS, p);

/** A product's price as people see it ("$5", "$2.50"). */
export function priceLabel(product: Product): string {
  const cents = PRODUCTS[product].cents;
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}
