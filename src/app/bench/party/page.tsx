"use client";

// Test bench only: the Christmas party pages.

import { useEffect, useRef } from "react";
import { PARTY, PARTY_H } from "@/lib/holidays/party";
import { drawHalloweenPage, makeHalloweenPage, type HalloweenPage } from "@/lib/halloween/make";
import { pagesPdf } from "@/lib/page-pdf";
import { fitOnPaper, fontFraction } from "@/lib/print";

const FIT = fitOnPaper(400 / PARTY_H, "letter");
const FONT_FRAC = fontFraction(FIT.w) * (5 / 6);
const made: Record<number, HalloweenPage> = {};

function One({ i }: { i: number }) {
  const colored = useRef<HTMLCanvasElement>(null);
  const outline = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    makeHalloweenPage(PARTY[i], FONT_FRAC).then(async (hp) => {
      made[i] = hp;
      if (colored.current) await drawHalloweenPage(colored.current, hp, "colored");
      if (outline.current) await drawHalloweenPage(outline.current, hp, "outline");
      document.body.dataset[`p${i}`] = `${hp.page.key.length} colors, ${hp.page.shapes} shapes, ${hp.unnumbered} too small`;
    });
  }, [i]);
  return (
    <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <canvas ref={colored} style={{ width: "45%" }} />
      <canvas ref={outline} style={{ width: "45%" }} />
    </section>
  );
}

async function savePdf() {
  const blob = await pagesPdf(PARTY.map((_, i) => ({ page: made[i].page, fit: FIT, draw: (c: HTMLCanvasElement, _p: unknown, view: "outline" | "colored", s?: number) => drawHalloweenPage(c, made[i], view, s) })));
  const data = await new Promise<string>((r) => {
    const f = new FileReader();
    f.onload = () => r(String(f.result));
    f.readAsDataURL(blob);
  });
  await fetch("/api/bench", { method: "POST", body: JSON.stringify({ kind: "pdf", name: "christmas-party", pdf: data }) });
}
if (typeof window !== "undefined") (window as unknown as { __savePdf: typeof savePdf }).__savePdf = savePdf;

export default function Party() {
  if (process.env.NODE_ENV === "production") return null;
  return <main style={{ padding: 12 }}>{PARTY.map((_, i) => <One key={i} i={i} />)}</main>;
}
