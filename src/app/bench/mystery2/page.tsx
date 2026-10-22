"use client";

// Test bench only: grown-up mystery pages from photos (random pieces, see lib/mystery/cells).

import { useEffect, useRef } from "react";
import { drawHalloweenPage, makeHalloweenPage, type HalloweenPage } from "@/lib/halloween/make";
import { CELL_DEFAULTS, mysteryDesign, shuffleNumbers } from "@/lib/mystery/cells";
import { mysteryPdf } from "@/lib/page-pdf";
import { fitOnPaper, fontFraction } from "@/lib/print";

const PICS = [
  { id: "bauble", title: "Mystery 1", colors: 14 },
  { id: "snowglobe", title: "Mystery 2", colors: 16 },
  { id: "cocoa", title: "Mystery 3", colors: 14 },
];
const pages: Record<string, { hp: HalloweenPage; fit: ReturnType<typeof fitOnPaper> }> = {};

function One({ p }: { p: (typeof PICS)[number] }) {
  const colored = useRef<HTMLCanvasElement>(null);
  const outline = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      const opt = { ...CELL_DEFAULTS, small: Number(q.get("small") ?? CELL_DEFAULTS.small), big: Number(q.get("big") ?? CELL_DEFAULTS.big), colors: p.colors, seed: p.id };
      const t0 = performance.now();
      document.body.dataset[`${p.id}Step`] = 'design';
      const d = await mysteryDesign(`mystery-${p.id}`, p.title, `/test-images/mystery/${p.id}.jpg`, opt);
      document.body.dataset[`${p.id}Step`] = `page after ${Math.round(performance.now() - t0)}ms, ${d.shapes.length} chars`;
      const fit = fitOnPaper(400 / (d.height ?? 400), "letter");
      // Grown-up pages: 5 pt numbers.
      const hp = shuffleNumbers(await makeHalloweenPage(d, fontFraction(fit.w) * (5 / 6)), p.id);
      pages[p.id] = { hp, fit };
      if (colored.current) await drawHalloweenPage(colored.current, hp, "colored");
      if (outline.current) await drawHalloweenPage(outline.current, hp, "outline");
      document.body.dataset[p.id] = `${hp.page.key.length} numbers, ${hp.page.shapes} shapes, ${hp.unnumbered} too small`;
    })();
  }, [p]);
  return (
    <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <canvas ref={colored} style={{ width: "48%" }} />
      <canvas ref={outline} style={{ width: "48%" }} />
    </section>
  );
}

async function savePdf() {
  const blob = await mysteryPdf(PICS.map((p) => ({ page: pages[p.id].hp.page, fit: pages[p.id].fit, draw: (c: HTMLCanvasElement, _x: unknown, view: "outline" | "colored", s?: number) => drawHalloweenPage(c, pages[p.id].hp, view, s) })));
  const data = await new Promise<string>((r) => {
    const f = new FileReader();
    f.onload = () => r(String(f.result));
    f.readAsDataURL(blob);
  });
  await fetch("/api/bench", { method: "POST", body: JSON.stringify({ kind: "pdf", name: "mystery-christmas-adult", pdf: data }) });
}
if (typeof window !== "undefined") (window as unknown as { __savePdf: typeof savePdf }).__savePdf = savePdf;

export default function Mystery2() {
  if (process.env.NODE_ENV === "production") return null;
  return <main style={{ padding: 12 }}>{PICS.map((p) => <One key={p.id} p={p} />)}</main>;
}
