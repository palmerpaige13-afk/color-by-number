// Starts a payment for one PDF download: a Stripe Checkout Session shown inside the page, so
// the person keeps their finished picture while they pay. The price is set here, on the
// server, so it can't be changed from the browser.

import Stripe from "stripe";
import { PRICE_CENTS } from "@/lib/price";

export async function POST() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ error: "Payments aren't set up yet." }, { status: 503 });
  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      redirect_on_completion: "never",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: "Color-by-number PDF",
              description: "Your printable color-by-number page and its color key",
            },
          },
        },
      ],
    });
    return Response.json({ id: session.id, clientSecret: session.client_secret });
  } catch {
    return Response.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }
}
