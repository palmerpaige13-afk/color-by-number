// Starts a payment for one PDF download: a Stripe Checkout Session shown inside the page, so
// the person keeps their finished picture while they pay. The browser says which kind of page
// (a photo page, a Halloween page); the price comes from lib/price on the server, so it can't
// be changed from the browser.

import Stripe from "stripe";
import { PRODUCTS, isProduct } from "@/lib/price";

export async function POST(request: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const kind = body?.product ?? "photo";
  if (!isProduct(kind)) return Response.json({ error: "Unknown product." }, { status: 400 });
  const product = PRODUCTS[kind];
  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      redirect_on_completion: "never",
      // Promo codes made in the Stripe dashboard (a 100%-off code makes the PDF free).
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: product.cents,
            product_data: { name: product.name, description: product.description },
          },
        },
      ],
    });
    return Response.json({ id: session.id, clientSecret: session.client_secret });
  } catch {
    return Response.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }
}
