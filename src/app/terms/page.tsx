import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";
import { priceLabel } from "@/lib/price";

export const metadata: Metadata = {
  title: "Terms & Refunds · Color by Number",
  description: "What you get when you buy a Color by Number PDF, and how refunds work.",
};

const UPDATED = "October 7, 2026";
/** How long after buying someone can ask for a fix or a refund. */
const REFUND_DAYS = 14;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const email = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
    {CONTACT_EMAIL}
  </a>
);

export default function Terms() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 leading-relaxed text-zinc-800 sm:px-8 dark:text-zinc-200">
      <header>
        <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← Back to Color by Number
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Terms &amp; Refunds</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated {UPDATED}</p>
      </header>

      <p>
        These are the simple rules for using Color by Number and buying a page. By using the site or buying a PDF,
        you agree to them. Questions? Email {email}.
      </p>

      <Section title="What you're buying">
        <p>
          Making and previewing a color-by-number page is free. If you like it, you can buy the printable PDF: the
          page and its color key, ready to print at home.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>A page made from your own photo: {priceLabel("photo")}</li>
          <li>A Halloween page: {priceLabel("halloween")}</li>
        </ul>
        <p>
          Prices are in US dollars. It&apos;s a digital download: nothing is shipped. The PDF downloads right after
          you pay, and you can print it as many times as you like for your own use.
        </p>
      </Section>

      <Section title="Paying">
        <p>
          Payments are handled by <strong>Stripe</strong>. Your card details go straight to Stripe, and we never see or
          store them.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          Because the PDF is a digital download you get right away, purchases are usually final. But we want you to be
          happy with your page, so if something goes wrong, email {email} within {REFUND_DAYS} days of buying and
          we&apos;ll make it right:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>The download didn&apos;t work</strong> or you were charged more than once: we&apos;ll send you the
            PDF or refund the extra charge.
          </li>
          <li>
            <strong>The page came out wrong</strong> (a face, hair or clothes that don&apos;t look right): send us the
            photo and what you&apos;d like fixed, and we&apos;ll try to fix it by hand. If we can&apos;t, we&apos;ll
            refund you.
          </li>
        </ul>
        <p>Refunds go back to the card you paid with and can take a few days to show up.</p>
      </Section>

      <Section title="Your photos">
        <p>
          Your photos stay yours. Your photo stays on your device while the page is made (see{" "}
          <Link href="/privacy" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            Privacy
          </Link>
          ). Please only use photos you have the right to use, and don&apos;t use the site for anything illegal or
          hurtful.
        </p>
      </Section>

      <Section title="Personal use">
        <p>
          Pages you buy are for personal use: print them, color them, give them as gifts. Please don&apos;t resell
          the PDFs, or the Halloween designs, which belong to Color by Number.
        </p>
      </Section>

      <Section title="The fine print">
        <p>
          We work hard to make good pages, but the site is provided as it is, and pages made automatically won&apos;t
          always be perfect. If something goes wrong, the most we&apos;ll owe you is a refund of what you paid for
          that page.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change these terms, we&apos;ll update this page and the date at the top. The terms that apply are the
          ones posted when you buy.
        </p>
      </Section>

      <Section title="Contact">
        <p>Email {email}. We usually reply within a couple of days.</p>
      </Section>
    </main>
  );
}
