"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DESIGNS, type HalloweenDesign } from "@/lib/halloween/designs";
import { drawHalloweenPage, makeHalloweenPage, previewSvg, type HalloweenPage } from "@/lib/halloween/make";
import { pagePdf, saveFile } from "@/lib/page-pdf";
import { fitOnPaper, fontFraction } from "@/lib/print";

/** The pages print on Letter paper. */
const FIT = fitOnPaper(1, "letter");
/** Numbers half again the usual smallest size: these pages are for little hands. */
const FONT_FRAC = fontFraction(FIT.w) * 1.5;

const previewUrl = (d: HalloweenDesign) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(d))}`;

export function HalloweenGallery() {
  const [chosen, setChosen] = useState<HalloweenDesign | null>(null);
  const [made, setMade] = useState<HalloweenPage | null>(null);
  const [colored, setColored] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (made && canvasRef.current) drawHalloweenPage(canvasRef.current, made, colored ? "colored" : "outline");
  }, [made, colored]);

  /** The design last picked: a page finished for an earlier pick is dropped. */
  const latest = useRef<HalloweenDesign | null>(null);

  function choose(d: HalloweenDesign) {
    latest.current = d;
    setChosen(d);
    setMade(null);
    setError(null);
    setColored(false);
    makeHalloweenPage(d, FONT_FRAC)
      .then((hp) => {
        if (latest.current !== d) return;
        if (hp.unnumbered) console.warn(`${d.id}: ${hp.unnumbered} shapes too small for a number`);
        setMade(hp);
      })
      .catch(() => latest.current === d && setError("Sorry, that page couldn't be made. Try another."));
    requestAnimationFrame(() => {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      pageRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    });
  }

  async function download() {
    if (!made) return;
    setBusy("Preparing your PDF…");
    await new Promise((r) => setTimeout(r, 30));
    try {
      saveFile(await pagePdf(made.page, FIT, (c, _page, view, s) => drawHalloweenPage(c, made, view, s)), `halloween-${made.design.id}.pdf`);
    } catch {
      setError("Sorry, something went wrong making the PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header>
        <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← Make one from your own photo
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Halloween Color by Number 🎃</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Fifteen cute, easy pages with big shapes and big numbers. Pick one to see it, then print it for free.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {DESIGNS.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => choose(d)}
              aria-pressed={chosen?.id === d.id}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 bg-white p-2 transition-colors dark:bg-zinc-900 ${
                chosen?.id === d.id ? "border-orange-500" : "border-zinc-200 hover:border-orange-300 dark:border-zinc-800"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a small inline drawing */}
              <img src={previewUrl(d)} alt="" className="aspect-square w-full" />
              <span className="text-sm font-semibold">{d.title}</span>
            </button>
          </li>
        ))}
      </ul>

      {chosen && (
        <section ref={pageRef} className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{chosen.title}</h2>
            {made && (
              <span className="text-sm text-zinc-500">
                {made.page.shapes} shapes · {made.page.key.length} colors
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={colored}
                disabled={!made}
                onClick={() => setColored(!colored)}
                className="rounded-full border-2 border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-orange-400 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                {colored ? "Show numbers" : "Show finished"}
              </button>
              <button
                type="button"
                disabled={!made || !!busy}
                onClick={download}
                className="rounded-full bg-orange-500 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
              >
                {busy ?? "Download free PDF (Letter)"}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="relative mx-auto aspect-square w-full max-w-xl rounded-xl border border-zinc-200 bg-white dark:border-zinc-800">
            {made ? (
              <canvas ref={canvasRef} className="h-full w-full rounded-xl" aria-label={`${chosen.title} color-by-number page`} />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" aria-hidden />
              </div>
            )}
          </div>
          {made && (
            <ul className="flex flex-wrap justify-center gap-3" aria-label="Color key">
              {made.page.key.map(({ n, rgb }) => (
                <li key={n} className="flex items-center gap-1.5">
                  <span className="h-7 w-7 rounded-md border border-zinc-300" style={{ background: `rgb(${rgb.join(",")})` }} />
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
