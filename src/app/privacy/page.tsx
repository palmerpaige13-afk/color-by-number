import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · Color by Number",
  description: "How Color by Number handles your photos and the fixes you choose to send.",
};

const UPDATED = "October 9, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Privacy() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 leading-relaxed text-zinc-800 sm:px-8 dark:text-zinc-200">
      <header>
        <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← Back to Color by Number
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated {UPDATED}</p>
      </header>

      <p>
        Your photos are personal, so this site is built to keep them with you. Here is exactly what happens to them,
        and to anything you choose to send us.
      </p>

      <Section title="Your photo stays on your device">
        <p>
          When you make a color-by-number page, all the work happens in your own web browser, on your phone or
          computer. Your photo is <strong>not uploaded</strong> to us to make the page, and we don&apos;t keep a copy.
          The same goes for your fixes and the PDF you download: they stay on your device.
        </p>
        <p>
          To find the people, faces and pets in your photo, your browser downloads free picture-reading tools
          (MediaPipe, made by Google) from Google&apos;s and jsDelivr&apos;s servers. Those tools run on your device;
          your photo isn&apos;t sent to Google or jsDelivr. Like any website file, downloading them lets those
          companies see a normal web request (such as your internet address).
        </p>
      </Section>

      <Section title="Counting visits">
        <p>
          Each visit to the site is counted once, so we know how much it&apos;s used. The count includes only whether
          you used a phone, tablet or computer, which page you arrived on, the date, and where you came from as one
          word (like &ldquo;facebook&rdquo; or &ldquo;google&rdquo;, never the full address). It includes nothing from
          your photo and nothing that identifies you, and nothing is saved on your device to recognize you later.
        </p>
      </Section>

      <Section title="Paying for a PDF">
        <p>
          Downloading the printable PDF costs a small fee, paid through <strong>Stripe</strong>, a payment company used by
          millions of businesses. The checkout box on this site is Stripe&apos;s: your card details go straight to Stripe,
          and we never see or store them. Stripe tells us whether the payment went through, and keeps a record of it (for
          example the amount, and the email or name you give at checkout) that the site&apos;s owner can see in their
          Stripe account. Paying doesn&apos;t send your photo anywhere; the PDF is still made on your device.
        </p>
        <p>
          Stripe handles your payment information under its own{" "}
          <a href="https://stripe.com/privacy" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            privacy policy
          </a>
          .
        </p>
      </Section>

      <Section title="What you can choose to send us">
        <p>
          At the bottom of a finished page there&apos;s a box to help make this site better. Nothing is sent unless
          you tap <strong>Send</strong>. If you do, we receive:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>the settings you picked (print size and detail) and whether you used a phone, tablet or computer;</li>
          <li>how many people and faces were found, and how many shapes and colors the page had before and after your fixes;</li>
          <li>
            a list of the fixes you made with Fix it, such as &ldquo;changed a clothes shape from gray to blue&rdquo; or
            &ldquo;joined two shapes&rdquo;, with the kind and size of each shape and the colors involved;
          </li>
          <li>the note you write, if any.</li>
        </ul>
        <p>
          This doesn&apos;t include your name, an account, or your photo. Please don&apos;t put personal details in the
          note.
        </p>
      </Section>

      <Section title="Sharing your photo (only if you choose to)">
        <p>
          If you tick <strong>&ldquo;Also share my photo&rdquo;</strong> before tapping Send, a smaller copy of your
          photo is sent along with your fixes, so we can see exactly what went wrong. Shared photos are:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>stored privately. They can&apos;t be seen through this website or by other visitors;</li>
          <li>used only to test and improve how this site makes pages;</li>
          <li>never sold, published, or used to identify anyone;</li>
          <li>deleted once they&apos;re no longer needed for that.</li>
        </ul>
        <p>Only share photos you&apos;re comfortable sharing, and that the people in them would be okay with.</p>
      </Section>

      <Section title="Where it's kept">
        <p>
          Reports, shared photos and the visit count are stored with Supabase, a database service, in the United
          States. The website itself can only add to them. It can&apos;t read them back, so no visitor can see anyone
          else&apos;s. Only the site&apos;s owner can see them.
        </p>
        <p>
          The site is hosted by Vercel, which, like any web host, keeps basic technical logs (such as internet
          addresses and the pages requested) to run the service.
        </p>
      </Section>

      <Section title="No ads, no tracking">
        <p>
          This site has no ads and no tracking or analytics tools (beyond the simple visit count above), and
          doesn&apos;t use cookies of its own. It doesn&apos;t ask you to sign in. (When you open the checkout, Stripe may use its own cookies to keep payments safe from
          fraud.)
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change how the site handles your information, we&apos;ll update this page and the date at the top.
        </p>
      </Section>
    </main>
  );
}
