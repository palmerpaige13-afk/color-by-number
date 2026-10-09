"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DESIGNS, type HalloweenDesign } from "@/lib/halloween/designs";
import { drawHalloweenPage, makeHalloweenPage, previewSvg, type HalloweenPage } from "@/lib/halloween/make";
import { Checkout, paymentsOn } from "@/app/checkout";
import { pagePdf, pagesPdf, saveFile } from "@/lib/page-pdf";
import { PRODUCTS, priceLabel } from "@/lib/price";
import { fitOnPaper, fontFraction } from "@/lib/print";

/** The pages print on Letter paper. */
const FIT = fitOnPaper(1, "letter");
/** Numbers a quarter bigger than the usual smallest size, for younger colorers. */
const FONT_FRAC = fontFraction(FIT.w) * 1.25;

const previewUrl = (d: HalloweenDesign) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(d))}`;
/** Gallery pictures are drawn at this share of the page's full size. */
const THUMB_SCALE = 0.5;

/** Each design's page, made once and shared by its gallery picture and the big view. */
const pages = new Map<string, Promise<HalloweenPage>>();
function pageFor(d: HalloweenDesign): Promise<HalloweenPage> {
  let p = pages.get(d.id);
  if (!p) {
    p = makeHalloweenPage(d, FONT_FRAC);
    p.catch(() => pages.delete(d.id));
    pages.set(d.id, p);
  }
  return p;
}

export function HalloweenGallery() {
  const [chosen, setChosen] = useState<HalloweenDesign | null>(null);
  const [made, setMade] = useState<HalloweenPage | null>(null);
  const [colored, setColored] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Pages paid for this visit (each download is paid for once), and the checkout box is open. */
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  /** The checkout box for all the pages at once is open. */
  const [payingAll, setPayingAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  /** Gallery pictures shown with numbers instead of colored in, and their drawings. */
  const [numbered, setNumbered] = useState<Record<string, boolean>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  /** Whether every gallery picture shows numbers (true), none does (false), or some do (null). */
  const allNumbered = DESIGNS.every((d) => numbered[d.id]) ? true : DESIGNS.some((d) => numbered[d.id]) ? null : false;

  /** Draws the numbered gallery picture of `d`, if it isn't drawn yet. */
  async function drawThumb(d: HalloweenDesign) {
    if (thumbs[d.id]) return;
    // Let the spinner show before the page is made (it holds the main thread briefly).
    await new Promise((r) => setTimeout(r, 30));
    try {
      const canvas = document.createElement("canvas");
      await drawHalloweenPage(canvas, await pageFor(d), "outline", THUMB_SCALE);
      const url = canvas.toDataURL("image/png");
      setThumbs((t) => ({ ...t, [d.id]: url }));
    } catch {
      setNumbered((n) => ({ ...n, [d.id]: false }));
    }
  }

  function toggleNumbers(d: HalloweenDesign) {
    const on = !numbered[d.id];
    setNumbered((n) => ({ ...n, [d.id]: on }));
    if (on) drawThumb(d);
  }

  async function showAll(on: boolean) {
    setNumbered(Object.fromEntries(DESIGNS.map((d) => [d.id, on])));
    // One at a time, so the page stays responsive while they're made.
    if (on) for (const d of DESIGNS) await drawThumb(d);
  }

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
    pageFor(d)
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

  async function download(hp = made) {
    if (!hp) return;
    setBusy("Preparing your PDF…");
    await new Promise((r) => setTimeout(r, 30));
    try {
      saveFile(await pagePdf(hp.page, FIT, (c, _page, view, s) => drawHalloweenPage(c, hp, view, s)), `halloween-${hp.design.id}.pdf`);
    } catch {
      setError("Sorry, something went wrong making the PDF.");
    } finally {
      setBusy(null);
    }
  }

  /** Every page in one PDF (the bundle). */
  async function downloadAll() {
    setBusyAll(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const all = [];
      for (const d of DESIGNS) all.push(await pageFor(d));
      const pdf = await pagesPdf(all.map((hp) => ({ page: hp.page, fit: FIT, draw: (c, _page, view, s) => drawHalloweenPage(c, hp, view, s) })));
      saveFile(pdf, "halloween-all-pages.pdf");
    } catch {
      setError("Sorry, something went wrong making the PDF.");
    } finally {
      setBusyAll(false);
    }
  }
  const allPaid = DESIGNS.every((d) => paid.has(d.id));
  /** What all the pages would cost one at a time, as people see it. */
  const separately = `$${(DESIGNS.length * PRODUCTS.halloween.cents) / 100}`;

  /** This page has to be paid for before it downloads. */
  const mustPay = paymentsOn && !!chosen && !paid.has(chosen.id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header>
        <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← All pages
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Halloween Color by Number 🎃</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Fifteen cute Halloween pages full of colors and shapes. Pick one to see it, then download it to print on Letter paper.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-orange-100 p-4 sm:flex-row sm:items-center dark:bg-orange-950">
        <div className="flex-1">
          <p className="font-bold text-orange-950 dark:text-orange-100">🎃 Get all {DESIGNS.length} pages for {priceLabel("halloween-all")}</p>
          <p className="text-sm text-orange-900 dark:text-orange-200">
            Every design in one PDF, each with its color key: {separately} if bought one by one.
          </p>
        </div>
        <button
          type="button"
          disabled={busyAll}
          onClick={() => (paymentsOn && !allPaid ? setPayingAll(true) : downloadAll())}
          className="shrink-0 rounded-full bg-orange-500 px-5 py-2 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          {busyAll ? "Preparing all the pages…" : paymentsOn && !allPaid ? `Buy all ${DESIGNS.length}: ${priceLabel("halloween-all")}` : `Download all ${DESIGNS.length}`}
        </button>
      </section>
      {payingAll && (
        <Checkout
          product="halloween-all"
          onClose={() => setPayingAll(false)}
          onPaid={() => {
            setPaid(new Set(DESIGNS.map((d) => d.id)));
            setPayingAll(false);
            downloadAll();
          }}
        />
      )}

      <div className="-mb-4 flex items-center justify-end gap-2">
        <span className="text-sm text-zinc-500">Show all:</span>
        <div role="radiogroup" aria-label="Show all pictures" className="flex rounded-full border-2 border-zinc-200 p-0.5 dark:border-zinc-800">
          {[false, true].map((on) => (
            <button
              key={String(on)}
              type="button"
              role="radio"
              aria-checked={allNumbered === on}
              onClick={() => allNumbered !== on && showAll(on)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                allNumbered === on ? "bg-orange-500 text-white" : "text-zinc-600 hover:text-orange-600 dark:text-zinc-400"
              }`}
            >
              {on ? "With numbers" : "Colored"}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DESIGNS.map((d) => {
          const showNumbers = !!numbered[d.id];
          return (
            <li
              key={d.id}
              className={`flex flex-col gap-2 rounded-2xl border-2 bg-white p-2 transition-colors dark:bg-zinc-900 ${
                chosen?.id === d.id ? "border-orange-500" : "border-zinc-200 hover:border-orange-300 dark:border-zinc-800"
              }`}
            >
              <button
                type="button"
                onClick={() => choose(d)}
                aria-pressed={chosen?.id === d.id}
                aria-label={`Open ${d.title}`}
                className="relative aspect-square w-full overflow-hidden rounded-xl bg-white"
              >
                {showNumbers && thumbs[d.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- drawn on the page
                  <img src={thumbs[d.id]} alt="" className="h-full w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a small inline drawing
                  <img src={previewUrl(d)} alt="" className={`h-full w-full ${showNumbers ? "opacity-30" : ""}`} />
                )}
                {showNumbers && !thumbs[d.id] && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="h-7 w-7 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" aria-hidden />
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-sm font-semibold">{d.title}</span>
                <button
                  type="button"
                  aria-pressed={showNumbers}
                  onClick={() => toggleNumbers(d)}
                  className="shrink-0 rounded-full border-2 border-zinc-300 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-orange-400 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {showNumbers ? "Colored" : "Numbers"}
                </button>
              </div>
            </li>
          );
        })}
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
                onClick={() => (mustPay ? setPaying(true) : download())}
                className="rounded-full bg-orange-500 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
              >
                {busy ?? `Download PDF (Letter)${mustPay ? `: ${priceLabel("halloween")}` : ""}`}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {paying && made && (
            <Checkout
              product="halloween"
              onClose={() => setPaying(false)}
              onPaid={() => {
                setPaid((p) => new Set(p).add(made.design.id));
                setPaying(false);
                download(made);
              }}
            />
          )}
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
