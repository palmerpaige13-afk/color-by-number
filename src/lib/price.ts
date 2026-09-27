/** What one PDF download costs, in cents (US dollars). */
export const PRICE_CENTS = 500;

/** The price as people see it. */
export const PRICE_LABEL = `$${(PRICE_CENTS / 100).toFixed(PRICE_CENTS % 100 ? 2 : 0)}`;
