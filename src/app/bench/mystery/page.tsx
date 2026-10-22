"use client";

// Test bench only: Christmas pictures as mystery honeycomb pages.

import { useEffect, useRef } from "react";
import { CHRISTMAS } from "@/lib/holidays/christmas";
import { drawHalloweenPage, makeHalloweenPage } from "@/lib/halloween/make";
import { hexDesign, scrambleNumbers } from "@/lib/mystery/hex";
import { fitOnPaper, fontFraction } from "@/lib/print";
import { mysteryPdf } from "@/lib/page-pdf";
import type { HalloweenPage } from "@/lib/halloween/make";

const FIT = fitOnPaper(1, "letter");
const FONT_FRAC = fontFraction(FIT.w);

function One({ i }: { i: number }) {
  const colored = useRef<HTMLCanvasElement>(null);
  const outline = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      const d = await hexDesign(CHRISTMAS[i], Number(q.get("across") ?? 22));
      const hp = scrambleNumbers(await makeHalloweenPage(d, FONT_FRAC));
      (window as unknown as { __hp: Record<number, unknown> }).__hp = { ...((window as unknown as { __hp?: Record<number, unknown> }).__hp ?? {}), [i]: hp };
      if (colored.current) await drawHalloweenPage(colored.current, hp, "colored");
      if (outline.current) await drawHalloweenPage(outline.current, hp, "outline");
      document.body.dataset[`m${i}`] = `${hp.page.key.length} colors, ${hp.page.shapes} shapes, ${hp.unnumbered} too small`;
    })();
  }, [i]);
  return (
    <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <b style={{ width: 120 }}>{i + 1}. {CHRISTMAS[i].title}</b>
      <canvas ref={colored} style={{ width: "40%" }} />
      <canvas ref={outline} style={{ width: "40%" }} />
    </section>
  );
}

async function savePdf(order: number[]) {
  const all = (window as unknown as { __hp: Record<number, HalloweenPage> }).__hp;
  const blob = await mysteryPdf(order.map((i) => ({ page: all[i].page, fit: FIT, draw: (c: HTMLCanvasElement, _p: unknown, view: "outline" | "colored", s?: number) => drawHalloweenPage(c, all[i], view, s) })));
  const data = await new Promise<string>((r) => {
    const f = new FileReader();
    f.onload = () => r(String(f.result));
    f.readAsDataURL(blob);
  });
  await fetch("/api/bench", { method: "POST", body: JSON.stringify({ kind: "pdf", name: "mystery-christmas", pdf: data }) });
}
if (typeof window !== "undefined") (window as unknown as { __mysteryPdf: typeof savePdf }).__mysteryPdf = savePdf;

export default function Mystery() {
  if (process.env.NODE_ENV === "production") return null;
  const pick = typeof window === "undefined" ? null : new URLSearchParams(location.search).get("pick");
  const list = pick ? pick.split(",").map(Number) : CHRISTMAS.map((_, i) => i);
  return <main style={{ padding: 12 }}>{list.map((i) => <One key={i} i={i} />)}</main>;
}
