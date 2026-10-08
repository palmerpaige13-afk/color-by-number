import Link from "next/link";
import { priceLabel } from "@/lib/price";

/** The kinds of pages on offer, one bubble each. Add a bubble here for each new kind. */
const CHOICES = [
  {
    href: "/photo",
    emoji: "📷",
    title: "Personalized color by number",
    blurb: "Turn your own photo into a printable page: family, pets, anything you love.",
    price: priceLabel("photo"),
    tint: "bg-violet-100 text-violet-950 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900",
  },
  {
    href: "/halloween",
    emoji: "🎃",
    title: "Halloween pages",
    blurb: "Fifteen cute, ready-made Halloween pictures to print and color.",
    price: priceLabel("halloween"),
    tint: "bg-orange-100 text-orange-950 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-100 dark:hover:bg-orange-900",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Color by Number</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Printable color-by-number pages. What would you like to color?</p>
      </header>
      <ul className="grid gap-5 sm:grid-cols-2">
        {CHOICES.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className={`flex h-full flex-col items-center gap-3 rounded-[2rem] px-6 py-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${c.tint}`}
            >
              <span className="text-6xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="text-xl font-bold">{c.title}</span>
              <span className="opacity-80">{c.blurb}</span>
              <span className="mt-auto rounded-full bg-white/70 px-3 py-1 text-sm font-semibold dark:bg-black/30">{c.price} a page</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
