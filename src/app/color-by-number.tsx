"use client";

import { useEffect, useRef, useState } from "react";
import { detectSubjects } from "@/lib/detect/subjects";
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
  { id: "medium", label: "Medium", blurb: "14 colors, more detail" },
  { id: "hard", label: "Hard", blurb: "22 colors, lots of small shapes" },
];

type View = "outline" | "colored";

/** Palette entries actually used by some region, numbered 1..n dark to light. */
function usedPalette(result: PipelineResult): { number: Uint8Array; key: { n: number; rgb: RGB }[] } {
  const used = new Uint8Array(result.palette.length);
  for (let i = 0; i < result.regionCount; i++) used[result.regionColor[i]] = 1;
  const number = new Uint8Array(result.palette.length);
  const key: { n: number; rgb: RGB }[] = [];
  result.palette.forEach((rgb, i) => {
    if (!used[i]) return;
    number[i] = key.length + 1;
    key.push({ n: key.length + 1, rgb });
  });
  return { number, key };
}

async function loadWorkingImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * s));
  const height = Math.max(1, Math.round(bitmap.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { bitmap, width, height, data: ctx.getImageData(0, 0, width, height).data };
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
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  if (view === "colored") return;
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < result.regionCount; i++) {
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
  const [view, setView] = useState<View>("outline");
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (result && canvasRef.current) draw(canvasRef.current, result, view);
  }, [result, view]);

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
    let work;
    try {
      work = await loadWorkingImage(file);
    } catch {
      setError("Sorry, we couldn't read that photo. Try a different one.");
      setBusy(null);
      return;
    }
    const { bitmap, ...pixels } = work;
    let subjects: SubjectBox[] = [];
    let note = "";
    try {
      subjects = await detectSubjects(bitmap, pixels.width, pixels.height);
    } catch {
      note = "Couldn't load the people finder (are you offline?), so only buildings were used.";
    }
    const structure = structureMap(pixels.data, pixels.width, pixels.height);
    const map = importanceMap(structure, subjects, pixels.width, pixels.height);
    const { importance } = map;
    const found = [describeSubjects(subjects), map.buildings ? "buildings" : ""];
    const list = found.filter(Boolean).join(", ");
    setFocusNote(
      note ||
        (list
          ? `Kept extra detail on: ${list}.`
          : "Didn't spot any people or buildings, so the whole photo got the same detail."),
    );
    setBusy("Making your page…");
    await new Promise((r) => setTimeout(r, 30));
    bitmap.close();
    const faces = subjects.filter((s) => s.kind === "face");
    setResult(runPipeline({ ...pixels, importance, faces }, DIFFICULTY_PARAMS[difficulty]));
    setView("outline");
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!file || !!busy}
            className="rounded-full bg-violet-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ?? "3. Make my color-by-number"}
          </button>
          {!file && <span className="text-sm text-zinc-500">Upload a photo first</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </section>

      {result && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="inline-flex rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
              {(["outline", "colored"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    view === v ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""
                  }`}
                >
                  {v === "outline" ? "Coloring page" : "Finished preview"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Print
            </button>
            <span className="text-sm text-zinc-500">
              {result.regionCount} shapes · {key.length} colors
            </span>
          </div>

          {focusNote && <p className="text-sm text-zinc-600 print:hidden dark:text-zinc-400">{focusNote}</p>}
          <canvas ref={canvasRef} className="h-auto w-full rounded-lg bg-white shadow-sm" />

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
