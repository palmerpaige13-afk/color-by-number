// Checks with Stripe whether a checkout was actually paid, before the PDF is unlocked.

import Stripe from "stripe";

export async function GET(request: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ paid: false }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return Response.json({ paid: false }, { status: 400 });
  try {
    const session = await new Stripe(key).checkout.sessions.retrieve(id);
    const paid = session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
    return Response.json({ paid });
  } catch {
    return Response.json({ paid: false }, { status: 404 });
  }
}
