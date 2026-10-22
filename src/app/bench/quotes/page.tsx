"use client";

// Test bench only: a look at the draft quote pages (colored, and as pages to color).

import { useEffect, useRef } from "react";
import { QUOTE_CARDS } from "@/lib/holidays/quotes";

const QUOTES = QUOTE_CARDS.filter((d) => typeof window === "undefined" || !location.search.includes("only=") || d.id.startsWith(new URLSearchParams(location.search).get("only") ?? ""));
import { drawHalloweenPage, makeHalloweenPage } from "@/lib/halloween/make";
import { pagesPdf } from "@/lib/page-pdf";
import { fitOnPaper, fontFraction } from "@/lib/print";

const FIT = fitOnPaper(400 / 560, "5x7");
// Grown-up pages: small numbers, like adult color-by-number kits.
// Grown-up cards: numbers a little smaller than on photo cards (5 pt).
const FONT_FRAC = fontFraction(FIT.w) * (5 / 6);

function One({ i }: { i: number }) {
  const colored = useRef<HTMLCanvasElement>(null);
  const outline = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    makeHalloweenPage(QUOTES[i], FONT_FRAC).then(async (hp) => {
      if (colored.current) await drawHalloweenPage(colored.current, hp, "colored");
      if (outline.current) await drawHalloweenPage(outline.current, hp, "outline");
      document.body.dataset[`q${i}`] = `${hp.page.key.length} colors, ${hp.page.shapes} shapes, ${hp.unnumbered} too small`;
    });
  }, [i]);
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontWeight: 700, margin: "8px 0" }}>
        {i + 1}. {QUOTES[i].title}
      </h2>
      <div style={{ display: "flex", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- raw drawing */}
        <img alt="" data-raw={i} style={{ width: "32%", border: "1px solid #ddd" }} src={`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 ${QUOTES[i].height ?? 400}">${QUOTES[i].shapes}${QUOTES[i].ink}</svg>`)}`} />
        <canvas ref={colored} style={{ width: "32%", border: "1px solid #ddd" }} />
        <canvas ref={outline} style={{ width: "32%", border: "1px solid #ddd" }} />
      </div>
    </section>
  );
}

/** All the cards in one PDF (each: page to color, key, finished picture), saved on the bench. */
async function savePdf() {
  const pages = [];
  for (const d of QUOTES) {
    const hp = await makeHalloweenPage(d, FONT_FRAC);
    pages.push({ page: hp.page, fit: FIT, draw: (c: HTMLCanvasElement, _p: unknown, view: "outline" | "colored", s?: number) => drawHalloweenPage(c, hp, view, s) });
  }
  const blob = await pagesPdf(pages);
  const data = await new Promise<string>((r) => {
    const f = new FileReader();
    f.onload = () => r(String(f.result));
    f.readAsDataURL(blob);
  });
  await fetch("/api/bench", { method: "POST", body: JSON.stringify({ kind: "pdf", name: "quote-cards-5x7", pdf: data }) });
  document.body.dataset.pdf = "saved";
}
if (typeof window !== "undefined") (window as unknown as { __savePdf: () => Promise<void> }).__savePdf = savePdf;

export default function Quotes() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui" }}>
      {QUOTES.map((_, i) => (
        <One key={i} i={i} />
      ))}
    </main>
  );
}
