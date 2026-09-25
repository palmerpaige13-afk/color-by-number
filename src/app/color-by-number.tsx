"use client";

import { useEffect, useRef, useState } from "react";
import { detectSubjects, findPeople } from "@/lib/detect/subjects";
import {
  DIFFICULTY_PARAMS,
  WORKING_SIZE,
  runPipeline,
  type Difficulty,
  type PipelineResult,
  type RGB,
} from "@/lib/pipeline";
import { importanceMap, structureMap, type SubjectBox } from "@/lib/pipeline/importance";

/** Output canvas pixels per working-raster pixel. */
const SCALE = 1.5;

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "8 colors, big shapes" },
  { id: "medium", label: "Medium", blurb: "16 colors, more detail" },
  { id: "hard", label: "Hard", blurb: "24 colors, lots of small shapes" },
];

type View = "outline" | "colored";

type Background = "remove" | "keep";

/** Tiny scene sketches for the background picker: a person alone, or in a landscape. */
function SceneIcon({ withScene }: { withScene: boolean }) {
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16 shrink-0" aria-hidden>
      <rect width="64" height="40" rx="6" className={withScene ? "fill-sky-100" : "fill-white"} stroke="currentColor" strokeOpacity=".2" />
      {withScene && (
        <>
          <path d="M0 30 L14 16 L24 25 L36 12 L52 27 L64 20 V34 a6 6 0 0 1 -6 6 H6 a6 6 0 0 1 -6 -6Z" className="fill-emerald-300" />
          <circle cx="52" cy="9" r="4" className="fill-amber-300" />
        </>
      )}
      <circle cx="32" cy="13" r="4.5" className="fill-violet-500" />
      <path d="M25 36 q0 -13 7 -14 q7 1 7 14Z" className="fill-violet-500" />
    </svg>
  );
}

const BACKGROUNDS: { id: Background; label: string; blurb: string }[] = [
  { id: "remove", label: "No background", blurb: "Just the people, with all the detail on them" },
  { id: "keep", label: "With background", blurb: "Keep the scene around them too" },
];

function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z" />
      <path d="M9.2 12c-2 0-3.7 1.6-3.7 3.6 0 1.9-1.1 3.2-3 3.9 1.3 1.3 3.2 2 5.1 2 3.2 0 5.6-2.4 5.6-5.4z" />
    </svg>
  );
}

/**
 * Palette entries actually used by some region, numbered 1..n dark to light. Face skin has its
 * own palette entries (so faces keep their outline) but shares a number with its color twin.
 */
function usedPalette(result: PipelineResult): { number: Uint8Array; key: { n: number; rgb: RGB }[] } {
  const used = new Uint8Array(result.palette.length);
  for (let i = 0; i < result.regionCount; i++) used[result.regionColor[i]] = 1;
  if (result.background !== undefined) used[result.background] = 0;
  const number = new Uint8Array(result.palette.length);
  const key: { n: number; rgb: RGB }[] = [];
  const byColor = new Map<string, number>();
  // Base palette entries come first, already dark to light; face entries follow.
  for (const [i, rgb] of result.palette.entries()) {
    if (!used[i]) continue;
    const id = rgb.join(",");
    let n = byColor.get(id);
    if (n === undefined) {
      n = key.length + 1;
      byColor.set(id, n);
      key.push({ n, rgb });
    }
    number[i] = n;
  }
  return { number, key };
}

/** Share of the photo that must be people for the page to be cut out to just them. */
const MIN_CUTOUT_SHARE = 0.02;
/** Margin around the people when cropping, as a share of their size. */
const CROP_MARGIN = 0.06;
/** The biggest person must fill this share of the photo for it to count as a photo *of* people. */
const MAIN_PERSON_SHARE = 0.06;
/** People smaller than this share of the biggest person are background people. */
const SIDE_PERSON_SHARE = 0.25;

/** Downscales `bitmap` to the working raster. */
function toWorkingImage(bitmap: ImageBitmap) {
  const s = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * s));
  const height = Math.max(1, Math.round(bitmap.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/**
 * The photo to work on: when it's a photo of people, just the area around the main people (so
 * all the detail is spent on them), otherwise the whole photo.
 */
async function subjectImage(
  file: File,
  keepBackground: boolean,
): Promise<{ bitmap: ImageBitmap; ofPeople: boolean }> {
  const full = await createImageBitmap(file);
  if (keepBackground) return { bitmap: full, ofPeople: false };
  const found = await findPeople(full).catch(() => []);
  const area = (b: { width: number; height: number }) => b.width * b.height;
  const biggest = Math.max(0, ...found.map(area));
  if (biggest < MAIN_PERSON_SHARE * full.width * full.height) return { bitmap: full, ofPeople: false };
  const people = found.filter((b) => area(b) >= SIDE_PERSON_SHARE * biggest);
  const x0 = Math.min(...people.map((b) => b.x));
  const y0 = Math.min(...people.map((b) => b.y));
  const x1 = Math.max(...people.map((b) => b.x + b.width));
  const y1 = Math.max(...people.map((b) => b.y + b.height));
  const mx = (x1 - x0) * CROP_MARGIN;
  const my = (y1 - y0) * CROP_MARGIN;
  const sx = Math.max(0, Math.floor(x0 - mx));
  const sy = Math.max(0, Math.floor(y0 - my));
  const sw = Math.min(full.width, Math.ceil(x1 + mx)) - sx;
  const sh = Math.min(full.height, Math.ceil(y1 + my)) - sy;
  const cropped = await createImageBitmap(full, sx, sy, sw, sh);
  full.close();
  return { bitmap: cropped, ofPeople: true };
}

function describeSubjects(subjects: SubjectBox[]): string {
  const count = (k: SubjectBox["kind"]) => subjects.filter((s) => s.kind === k).length;
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (count("face")) parts.push(plural(count("face"), "face", "faces"));
  if (count("person")) parts.push(plural(count("person"), "person", "people"));
  if (count("animal")) parts.push(plural(count("animal"), "animal", "animals"));
  return parts.join(", ");
}

function draw(canvas: HTMLCanvasElement, result: PipelineResult, view: View) {
  const { width: w, height: h, labels, regionColor, palette } = result;
  const { number } = usedPalette(result);

  // Paint at working resolution, then scale up with smoothing off for crisp edges.
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const l = labels[p];
      const edge = (x < w - 1 && labels[p + 1] !== l) || (y < h - 1 && labels[p + w] !== l);
      let rgb: RGB = [255, 255, 255];
      if (edge) rgb = [70, 70, 70];
      else if (regionColor[l] === result.background) rgb = [255, 255, 255];
      else if (result.detailLines?.[p]) rgb = view === "colored" ? [90, 90, 90] : [150, 150, 150];
      else if (view === "colored") rgb = palette[regionColor[l]];
      img.data.set([rgb[0], rgb[1], rgb[2], 255], p * 4);
    }
  }
  sctx.putImageData(img, 0, 0);

  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#464646";
  ctx.lineWidth = 1;
  if (result.background === undefined) ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  if (view === "colored") return;
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < result.regionCount; i++) {
    if (regionColor[i] === result.background) continue;
    const size = Math.min(26, result.labelRadius[i] * SCALE * 1.1);
    if (size < 7) continue;
    ctx.font = `${Math.round(size)}px Arial, sans-serif`;
    ctx.fillText(String(number[regionColor[i]]), result.labelX[i] * SCALE, result.labelY[i] * SCALE);
  }
}

export default function ColorByNumber() {
  const [file, setFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [background, setBackground] = useState<Background>("remove");
  /** How far the brush has painted across the page, 0–100 (%). */
  const [reveal, setReveal] = useState(50);
  const [dragging, setDragging] = useState(false);
  const outlineRef = useRef<HTMLCanvasElement>(null);
  const paintedRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (result && outlineRef.current) draw(outlineRef.current, result, "outline");
    if (result && paintedRef.current) draw(paintedRef.current, result, "colored");
  }, [result]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file isn't a photo. Try a JPG or PNG.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  async function generate() {
    if (!file) return;
    setBusy("Finding people and buildings…");
    setError(null);
    setFocusNote(null);
    // Let the "working" state paint before the pipeline blocks the main thread.
    await new Promise((r) => setTimeout(r, 30));
    let bitmap: ImageBitmap;
    let ofPeople: boolean;
    try {
      ({ bitmap, ofPeople } = await subjectImage(file, background === "keep"));
    } catch {
      setError("Sorry, we couldn't read that photo. Try a different one.");
      setBusy(null);
      return;
    }
    const pixels = toWorkingImage(bitmap);
    let subjects: SubjectBox[] = [];
    let cutout: Uint8Array | undefined;
    let note = "";
    try {
      ({ subjects, cutout } = await detectSubjects(bitmap, pixels.width, pixels.height, {
        cutOut: ofPeople,
        sideShare: SIDE_PERSON_SHARE,
      }));
    } catch {
      note = "Couldn't load the people finder (are you offline?), so only buildings were used.";
    }
    // Only cut out when the people were actually found by the segmenter.
    if (cutout && cutout.reduce((n, v) => n + v, 0) < MIN_CUTOUT_SHARE * cutout.length) {
      cutout = undefined;
    }
    const structure = structureMap(pixels.data, pixels.width, pixels.height);
    const map = importanceMap(structure, subjects, pixels.width, pixels.height);
    const { importance } = map;
    const found = [describeSubjects(subjects), map.buildings ? "buildings" : ""];
    const list = found.filter(Boolean).join(", ");
    const kept =
      background === "remove" && !cutout
        ? " No main people to cut out, so the whole photo is kept."
        : "";
    setFocusNote(
      (note ||
        (list
          ? `Kept extra detail on: ${list}.`
          : "Didn't spot any people or buildings, so the whole photo got the same detail.")) +
        kept,
    );
    setBusy("Making your page…");
    await new Promise((r) => setTimeout(r, 30));
    bitmap.close();
    const faces = subjects.filter((s) => s.kind === "face");
    // Faces keep their shading as outlined shapes, with no drawn eyes, nose or mouth.
    setResult(
      runPipeline(
        { ...pixels, importance, faces, faceStyle: "shaded", cutout },
        DIFFICULTY_PARAMS[difficulty],
      ),
    );
    setReveal(50);
    setBusy(null);
  }

  const key = result ? usedPalette(result).key : [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="print:hidden">
        <h1 className="text-3xl font-bold tracking-tight">Color by Number</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Upload a photo, pick a difficulty, and get a printable color-by-number page.
        </p>
      </header>

      <section className="flex flex-col gap-6 print:hidden">
        <div>
          <h2 className="mb-2 font-semibold">1. Upload a photo</h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragging
                ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                : "border-zinc-300 hover:border-violet-400 dark:border-zinc-700"
            }`}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={photoUrl} alt="Your photo" className="max-h-56 rounded-lg object-contain" />
            ) : (
              <span className="text-4xl" aria-hidden>
                🖼️
              </span>
            )}
            <span className="font-medium">
              {photoUrl ? "Choose a different photo" : "Click to choose a photo, or drag one here"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">2. Pick a difficulty</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={difficulty === d.id}
                onClick={() => {
                  setDifficulty(d.id);
                  setResult(null);
                }}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  difficulty === d.id
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-zinc-200 hover:border-violet-300 dark:border-zinc-800"
                }`}
              >
                <div className="font-semibold">{d.label}</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{d.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-semibold">3. Background</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={background === b.id}
                onClick={() => {
                  setBackground(b.id);
                  setResult(null);
                }}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  background === b.id
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-zinc-200 hover:border-violet-300 dark:border-zinc-800"
                }`}
              >
                <SceneIcon withScene={b.id === "keep"} />
                <span>
                  <span className="block font-semibold">{b.label}</span>
                  <span className="block text-sm text-zinc-600 dark:text-zinc-400">{b.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!file || !!busy}
            className="rounded-full bg-violet-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ?? "4. Make my color-by-number"}
          </button>
          {!file && <span className="text-sm text-zinc-500">Upload a photo first</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </section>

      {result && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Print
            </button>
            <span className="text-sm text-zinc-500">
              {result.regionCount - (result.background === undefined ? 0 : 1)} shapes · {key.length}{" "}
              colors
            </span>
          </div>

          {focusNote && <p className="text-sm text-zinc-600 print:hidden dark:text-zinc-400">{focusNote}</p>}
          {/* Before/after: drag the brush to paint the numbered page into the finished picture. */}
          <div className="relative select-none overflow-hidden rounded-lg bg-white shadow-sm">
            <canvas ref={outlineRef} className="block h-auto w-full" />
            <canvas
              ref={paintedRef}
              className="pointer-events-none absolute inset-0 h-full w-full print:hidden"
              style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-violet-500/80 print:hidden"
              style={{ left: `${reveal}%` }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 -rotate-12 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-lg">
                <BrushIcon />
              </div>
            </div>
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-violet-600/90 px-2.5 py-1 text-xs font-semibold text-white print:hidden">
              Painted
            </span>
            <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-zinc-900/75 px-2.5 py-1 text-xs font-semibold text-white print:hidden">
              Numbers
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={reveal}
              onChange={(e) => setReveal(Number(e.target.value))}
              aria-label="Drag the brush to compare the finished picture with the numbered page"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 print:hidden"
            />
          </div>

          <div>
            <h2 className="mb-2 font-semibold">Color key</h2>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {key.map(({ n, rgb }) => (
                <li key={n} className="flex items-center gap-2">
                  <span
                    className="h-7 w-7 shrink-0 rounded-md border border-zinc-300 print:[print-color-adjust:exact]"
                    style={{ background: `rgb(${rgb.join(",")})` }}
                  />
                  <span className="font-mono text-sm font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
