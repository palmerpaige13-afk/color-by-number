"use client";

import { useEffect, useRef, useState } from "react";
import { detectSubjects, findPeople } from "@/lib/detect/subjects";
import {
  DIFFICULTY_PARAMS,
  WORKING_SIZE,
  runPipeline,
  type Difficulty,
  type RegionMask,
} from "@/lib/pipeline";
import { importanceMap, structureMap, type SubjectBox } from "@/lib/pipeline/importance";
import { buildPage, drawPage, minLabelRadius, type Layer, type Page } from "@/lib/page";
import { canvasJpeg, makePdf, type PdfPage } from "@/lib/pdf";
import { PRINT_SIZES, fitOnPaper, fontFraction, type Fit, type PrintSizeId } from "@/lib/print";

/** Page pixels per working pixel of the most detailed layer. */
const SCALE = 1.5;
/** Largest page width, in pixels (a two-layer page scales up to keep the people's detail). */
const MAX_PAGE_WIDTH = 2700;
/** Share of the shape budget spent on the people on a two-layer page; the rest is the scene. */
const PEOPLE_SHARE = 0.65;
/** Print resolution, and the most pixels on a printed page's long side (keeps memory in check). */
const PRINT_DPI = 300;
const MAX_PRINT_PX = 6000;
/** Resolution of the color-key sheet. */
const KEY_DPI = 150;
/** How many colors the key aims for, per difficulty. */
const KEY_COLORS: Record<Difficulty, number> = { easy: 8, medium: 16, hard: 25 };

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "8 colors, big shapes" },
  { id: "medium", label: "Medium", blurb: "16 colors, more detail" },
  { id: "hard", label: "Hard", blurb: "25 colors, lots of small shapes" },
];

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

/** Share of the photo that must be people for the page to be cut out to just them. */
const MIN_CUTOUT_SHARE = 0.02;
/** Margin around the people when cropping, as a share of their size. */
const CROP_MARGIN = 0.06;
/** The biggest person must fill this share of the photo for it to count as a photo *of* people. */
const MAIN_PERSON_SHARE = 0.06;
/** People smaller than this share of the biggest person are background people. */
const SIDE_PERSON_SHARE = 0.25;
/** Animals at least this share of the biggest person's size are kept with the people. */
const PET_SHARE = 0.05;
/** With background, the scene is framed so the people and pets span this share of it. */
const SUBJECT_FILL = 0.8;

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

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where the main people (and pets with them) are, and how to frame the page:
 * - `subjects`: just around them (the whole page without background, the detail layer with it);
 * - `scene`: with background, the photo framed closer when they're small in it.
 * Null when it isn't a photo *of* people.
 */
async function framing(full: ImageBitmap): Promise<{ subjects: Rect; scene: Rect } | null> {
  const found = await findPeople(full).catch(() => ({ people: [], animals: [] }));
  const area = (b: { width: number; height: number }) => b.width * b.height;
  const biggest = Math.max(0, ...found.people.map(area));
  if (biggest < MAIN_PERSON_SHARE * full.width * full.height) return null;
  const keep = [
    ...found.people.filter((b) => area(b) >= SIDE_PERSON_SHARE * biggest),
    ...found.animals.filter((b) => area(b) >= PET_SHARE * biggest),
  ];
  const x0 = Math.min(...keep.map((b) => b.x));
  const y0 = Math.min(...keep.map((b) => b.y));
  const x1 = Math.max(...keep.map((b) => b.x + b.width));
  const y1 = Math.max(...keep.map((b) => b.y + b.height));

  const mx = (x1 - x0) * CROP_MARGIN;
  const my = (y1 - y0) * CROP_MARGIN;
  const sx = Math.max(0, x0 - mx);
  const sy = Math.max(0, y0 - my);
  const subjects = {
    x: sx,
    y: sy,
    width: Math.min(full.width, x1 + mx) - sx,
    height: Math.min(full.height, y1 + my) - sy,
  };

  // Same shape as the photo, just big enough that the subjects fill SUBJECT_FILL of it.
  const zoom = Math.min(1, Math.max((y1 - y0) / full.height, (x1 - x0) / full.width) / SUBJECT_FILL);
  const sw = full.width * zoom;
  const sh = full.height * zoom;
  const scene = {
    x: Math.min(full.width - sw, Math.max(0, (x0 + x1) / 2 - sw / 2)),
    y: Math.min(full.height - sh, Math.max(0, (y0 + y1) / 2 - sh / 2)),
    width: sw,
    height: sh,
  };
  return { subjects, scene };
}

/**
 * Cuts a rectangle out of the (upright) photo. Done by drawing rather than with
 * createImageBitmap's crop, which on phone photos stored sideways (EXIF rotation) crops the
 * stored, unrotated pixels, cutting out the wrong area.
 */
function crop(full: ImageBitmap, r: Rect): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(r.width));
  canvas.height = Math.max(1, Math.ceil(r.height));
  canvas.getContext("2d")!.drawImage(full, Math.floor(r.x), Math.floor(r.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}

/**
 * The part of the scene not covered by the people layer, in the scene layer's pixels: 1 where
 * the scene should be drawn. Shrunk by a pixel so scene shapes reach under the people's edge
 * and no white seam shows where the two layers meet.
 */
function sceneMask(
  scene: { width: number; height: number },
  sceneRect: Rect,
  people: { width: number; height: number; cutout: Uint8Array },
  peopleRect: Rect,
): Uint8Array {
  const under = new Uint8Array(scene.width * scene.height);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      // Scene pixel -> photo pixel -> people-layer pixel.
      const fx = sceneRect.x + ((x + 0.5) / scene.width) * sceneRect.width;
      const fy = sceneRect.y + ((y + 0.5) / scene.height) * sceneRect.height;
      const px = Math.floor(((fx - peopleRect.x) / peopleRect.width) * people.width);
      const py = Math.floor(((fy - peopleRect.y) / peopleRect.height) * people.height);
      if (px >= 0 && py >= 0 && px < people.width && py < people.height && people.cutout[py * people.width + px]) {
        under[y * scene.width + x] = 1;
      }
    }
  }
  const keep = new Uint8Array(under.length);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      const p = y * scene.width + x;
      // Keep the scene unless this pixel is well inside the people (all 4 neighbors covered).
      const inside =
        under[p] &&
        (x === 0 || under[p - 1]) &&
        (x === scene.width - 1 || under[p + 1]) &&
        (y === 0 || under[p - scene.width]) &&
        (y === scene.height - 1 || under[p + scene.width]);
      keep[p] = inside ? 0 : 1;
    }
  }
  return keep;
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

/**
 * The second printed sheet: the finished picture (what it will look like) and the color key,
 * with big swatches so colors are easy to match.
 */
function drawKeySheet(page: Page, fit: Fit): HTMLCanvasElement {
  const W = Math.round(fit.paperW * KEY_DPI);
  const H = Math.round(fit.paperH * KEY_DPI);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const m = 0.5 * KEY_DPI;
  ctx.fillStyle = "#222";
  ctx.font = `bold ${Math.round(0.3 * KEY_DPI)}px Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Color key", m, m);

  // Swatches, in rows, sized to fill the sheet's width.
  const cols = Math.max(4, Math.floor((W - 2 * m) / (1.1 * KEY_DPI)));
  const cell = (W - 2 * m) / cols;
  const sw = Math.min(cell * 0.45, 0.45 * KEY_DPI);
  const top = m + 0.55 * KEY_DPI;
  ctx.font = `bold ${Math.round(sw * 0.7)}px Arial, sans-serif`;
  ctx.textBaseline = "middle";
  page.key.forEach(({ n, rgb }, i) => {
    const x = m + (i % cols) * cell;
    const y = top + Math.floor(i / cols) * (sw + 0.2 * KEY_DPI);
    ctx.fillStyle = `rgb(${rgb.join(",")})`;
    ctx.fillRect(x, y, sw, sw);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, sw, sw);
    ctx.fillStyle = "#222";
    ctx.fillText(String(n), x + sw + 0.08 * KEY_DPI, y + sw / 2);
  });
  const keyBottom = top + Math.ceil(page.key.length / cols) * (sw + 0.2 * KEY_DPI);

  // The finished picture under the key, as big as fits.
  const painted = document.createElement("canvas");
  drawPage(painted, page, "colored");
  const room = { w: W - 2 * m, h: H - m - (keyBottom + 0.3 * KEY_DPI) };
  if (room.h > 0.5 * KEY_DPI) {
    const k = Math.min(room.w / painted.width, room.h / painted.height);
    const pw = painted.width * k;
    const ph = painted.height * k;
    ctx.drawImage(painted, (W - pw) / 2, keyBottom + 0.3 * KEY_DPI, pw, ph);
  }
  return canvas;
}

export default function ColorByNumber() {
  const [file, setFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [result, setResult] = useState<Page | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [background, setBackground] = useState<Background>("remove");
  const [printSize, setPrintSize] = useState<PrintSizeId>("letter");
  /** Where the page sits on the chosen paper (set with the result). */
  const [fit, setFit] = useState<Fit | null>(null);
  /** How far the brush has painted across the page, 0–100 (%). */
  const [reveal, setReveal] = useState(50);
  const [dragging, setDragging] = useState(false);
  const outlineRef = useRef<HTMLCanvasElement>(null);
  const paintedRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (result && outlineRef.current) drawPage(outlineRef.current, result, "outline");
    if (result && paintedRef.current) drawPage(paintedRef.current, result, "colored");
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
    let full: ImageBitmap;
    try {
      full = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      setError("Sorry, we couldn't read that photo. Try a different one.");
      setBusy(null);
      return;
    }
    const frame = await framing(full);
    const params = DIFFICULTY_PARAMS[difficulty];

    // The main layer: the people (and pets) on their own when there are some, else the photo.
    const mainRect: Rect =
      frame?.subjects ?? { x: 0, y: 0, width: full.width, height: full.height };
    const mainBitmap = frame ? await crop(full, frame.subjects) : full;
    const main = toWorkingImage(mainBitmap);
    let subjects: SubjectBox[] = [];
    let cutout: Uint8Array | undefined;
    let animals: RegionMask[] = [];
    let note = "";
    try {
      ({ subjects, cutout, animals } = await detectSubjects(mainBitmap, main.width, main.height, {
        cutOut: !!frame,
        sideShare: SIDE_PERSON_SHARE,
      }));
    } catch {
      note = "Couldn't load the people finder (are you offline?), so only buildings were used.";
    }
    if (mainBitmap !== full) mainBitmap.close();
    // Only cut out when the people were actually found by the segmenter.
    if (cutout && cutout.reduce((n, v) => n + v, 0) < MIN_CUTOUT_SHARE * cutout.length) {
      cutout = undefined;
    }
    const structure = structureMap(main.data, main.width, main.height);
    const map = importanceMap(structure, subjects, main.width, main.height);
    const list = [describeSubjects(subjects), map.buildings ? "buildings" : ""].filter(Boolean).join(", ");
    setFocusNote(
      note ||
        (list
          ? `Kept extra detail on: ${list}.`
          : "Didn't spot any people or buildings, so the whole photo got the same detail."),
    );
    setBusy("Making your page…");
    await new Promise((r) => setTimeout(r, 30));

    const faces = subjects.filter((s) => s.kind === "face");
    const twoLayers = !!(frame && cutout && background === "keep");

    // The print size decides how small numbers (and so shapes) can be: the smallest number is
    // a fixed share of the picture's width, from how wide it will be printed.
    const pageRect = twoLayers && frame ? frame.scene : { width: main.width, height: main.height };
    const pageFit = fitOnPaper(pageRect.width / pageRect.height, printSize);
    const fontFrac = fontFraction(pageFit.w);

    // How big each layer is drawn decides how small its shapes can be and stay readable.
    let k = 0; // page px per photo px (two layers)
    let mainScale = SCALE;
    let pageWidth = main.width * SCALE;
    if (twoLayers && frame) {
      k = Math.min((SCALE * main.width) / mainRect.width, MAX_PAGE_WIDTH / frame.scene.width);
      mainScale = (k * mainRect.width) / main.width;
      pageWidth = frame.scene.width * k;
    }
    const budget = (share: number) => ({
      ...params,
      maxShapes: params.maxShapes && Math.round(params.maxShapes * share),
    });

    // Faces keep their shading as outlined shapes, with no drawn eyes, nose or mouth.
    const mainResult = runPipeline(
      { ...main, importance: map.importance, faces, faceStyle: "shaded", cutout, animals },
      { ...budget(twoLayers ? PEOPLE_SHARE : 1), minLabelRadius: minLabelRadius(pageWidth, mainScale, fontFrac) },
    );

    let page: Page;
    if (twoLayers && frame && cutout) {
      // Scene layer underneath: the framed photo, coarser, with the people's area left out.
      const sceneBitmap = await crop(full, frame.scene);
      const scene = toWorkingImage(sceneBitmap);
      sceneBitmap.close();
      const keep = sceneMask(scene, frame.scene, { ...main, cutout }, mainRect);
      const sceneScale = (k * frame.scene.width) / scene.width;
      // The scene gets whatever part of the budget the people didn't use.
      const peopleShapes = mainResult.regionCount - (mainResult.background === undefined ? 0 : 1);
      const sceneBudget = params.maxShapes && Math.max(Math.round(params.maxShapes * (1 - PEOPLE_SHARE)), params.maxShapes - peopleShapes);
      const sceneResult = runPipeline(
        { ...scene, importance: structureMap(scene.data, scene.width, scene.height), cutout: keep },
        { ...params, maxShapes: sceneBudget, minLabelRadius: minLabelRadius(pageWidth, sceneScale, fontFrac) },
      );
      const layers: Layer[] = [
        { result: sceneResult, x: 0, y: 0, scale: sceneScale, outlineBlank: false },
        {
          result: mainResult,
          x: (mainRect.x - frame.scene.x) * k,
          y: (mainRect.y - frame.scene.y) * k,
          scale: mainScale,
          outlineBlank: true,
        },
      ];
      // The scene (layer 0) is where extra color variations may go.
      page = buildPage(frame.scene.width * k, frame.scene.height * k, layers, fontFrac, KEY_COLORS[difficulty], 0);
    } else {
      page = buildPage(
        main.width * SCALE,
        main.height * SCALE,
        [{ result: mainResult, x: 0, y: 0, scale: SCALE, outlineBlank: true }],
        fontFrac,
        KEY_COLORS[difficulty],
        // Variations only go in a background: never on a cut-out of people.
        mainResult.background === undefined ? 0 : undefined,
      );
    }
    full.close();
    setFit(pageFit);
    setResult(page);
    setReveal(50);
    setBusy(null);
  }

  /** Renders the page at print resolution for the chosen size and downloads it as a PDF. */
  async function downloadPdf() {
    if (!result || !fit) return;
    setBusy("Preparing your PDF…");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const longIn = Math.max(fit.w, fit.h);
      const dpi = Math.min(PRINT_DPI, MAX_PRINT_PX / longIn);
      const sheet = document.createElement("canvas");
      drawPage(sheet, result, "outline", (fit.w * dpi) / result.width);
      const keySheet = drawKeySheet(result, fit);
      const pages: PdfPage[] = [
        { jpeg: await canvasJpeg(sheet), pxW: sheet.width, pxH: sheet.height, paperW: fit.paperW, paperH: fit.paperH, x: fit.x, y: fit.y, w: fit.w, h: fit.h },
        { jpeg: await canvasJpeg(keySheet, 0.9), pxW: keySheet.width, pxH: keySheet.height, paperW: fit.paperW, paperH: fit.paperH, x: 0, y: 0, w: fit.paperW, h: fit.paperH },
      ];
      const url = URL.createObjectURL(makePdf(pages));
      const a = document.createElement("a");
      a.href = url;
      a.download = `color-by-number-${printSize}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Sorry, something went wrong making the PDF. Try a smaller print size.");
    } finally {
      setBusy(null);
    }
  }

  const key = result?.key ?? [];
  const sizeLabel = PRINT_SIZES.find((p) => p.id === printSize)?.label;

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

        <div>
          <h2 className="mb-2 font-semibold">4. Print size</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup">
            {PRINT_SIZES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={printSize === p.id}
                onClick={() => {
                  setPrintSize(p.id);
                  setResult(null);
                }}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  printSize === p.id
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-zinc-200 hover:border-violet-300 dark:border-zinc-800"
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{p.blurb}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Bigger paper fits more small shapes while keeping every number easy to read.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!file || !!busy}
            className="rounded-full bg-violet-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ?? "5. Make my color-by-number"}
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
              onClick={downloadPdf}
              disabled={!!busy}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Download PDF ({sizeLabel})
            </button>
            <span className="text-sm text-zinc-500">
              {result.shapes} shapes · {key.length} colors
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
