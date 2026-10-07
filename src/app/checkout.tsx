"use client";

// Paying for a PDF: Stripe's secure checkout, shown in a box over the page so the person's
// finished picture stays put. Card details go straight to Stripe; this site never sees them.
// Once Stripe says the checkout is complete, the payment is double-checked on the server
// before the download is unlocked.

import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { priceLabel, type Product } from "@/lib/price";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/** Whether payments are switched on (the site's Stripe key is set). Without it, PDFs are free. */
export const paymentsOn = !!PUBLISHABLE_KEY;

const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

export function Checkout({
  product = "photo",
  onPaid,
  onClose,
}: {
  /** What's being bought (sets the price, on the server). */
  product?: Product;
  onPaid: () => void;
  onClose: () => void;
}) {
  const price = priceLabel(product);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "open" | "checking" | "failed" | "unavailable">("loading");

  useEffect(() => {
    let checkout: StripeEmbeddedCheckout | null = null;
    let cancelled = false;
    let sessionId = "";
    (async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe || cancelled) throw new Error("Stripe didn't load");
        checkout = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret: async () => {
            const res = await fetch("/api/checkout", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ product }),
            });
            const data = await res.json();
            if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Couldn't start the payment");
            sessionId = data.id;
            return data.clientSecret;
          },
          onComplete: async () => {
            setState("checking");
            const res = await fetch(`/api/checkout/status?id=${encodeURIComponent(sessionId)}`);
            const data = await res.json().catch(() => ({ paid: false }));
            if (data.paid) onPaid();
            else setState("failed");
          },
        });
        if (cancelled) {
          checkout.destroy();
          return;
        }
        if (box.current) checkout.mount(box.current);
        setState("open");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      checkout?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per opening
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Pay ${price} for your PDF`}
    >
      <div className="my-6 w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Get your PDF: {price}</h2>
            <p className="text-sm text-zinc-500">
              Secure payment by Stripe.{product === "photo" && " Your photo isn't sent anywhere."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
        {state === "loading" && <p className="py-8 text-center text-sm text-zinc-500">Opening secure checkout…</p>}
        {state === "checking" && <p className="py-8 text-center text-sm text-zinc-500">Payment received. Preparing your PDF…</p>}
        {state === "unavailable" && (
          <p className="py-8 text-center text-sm text-red-600">
            Sorry, checkout couldn&apos;t open. Check your connection and try again in a moment.
          </p>
        )}
        {state === "failed" && (
          <p className="py-8 text-center text-sm text-red-600">
            Sorry, the payment didn&apos;t go through. You haven&apos;t been charged unless you got a receipt from Stripe. Please try
            again.
          </p>
        )}
        <div ref={box} className={state === "open" ? "" : "hidden"} />
      </div>
    </div>
  );
}
