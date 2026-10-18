"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addColor, cleanUp, describe, drawHighlight, join, joinSameColor, lineShape, numberAt, recolor, sameColorNeighbors, shapeAt, splitAlong, type Spot } from "@/lib/edit";
import { countTry, sendReport, type FixEntry } from "@/lib/feedback";
import { ColorWheel } from "@/app/color-wheel";
import { Checkout, paymentsOn } from "@/app/checkout";
import { noSaving, Watermark } from "@/app/watermark";
import { priceLabel } from "@/lib/price";
import { CONTACT_EMAIL } from "@/lib/contact";
import { MURAL_PICTURES, muralSrc, muralThumb, type MuralPicture } from "@/lib/murals";
import { type Difficulty } from "@/lib/pipeline";
import { drawPage, type Page } from "@/lib/page";
import { muralPdf, pagePdf, saveFile, sheetName } from "@/lib/page-pdf";
import { loadPhoto, makePage, type Photo } from "@/lib/make-page";
import { MURALS, PRINT_SIZES, isMural, levelFor, type Fit, type PrintSizeId } from "@/lib/print";

/** While testing locally, ?level=expert tries the Expert level (no print size picks it). */
const testLevel = (): Difficulty | null =>
  window.location.hostname === "localhost" && new URLSearchParams(window.location.search).get("level") === "expert" ? "expert" : null;

/** How each level of detail is described (the print size picks the level). */
const LEVEL_NAMES: Record<Difficulty, string> = {
  easy: "Simple: big shapes, few colors",
  medium: "Medium: more shapes and detail",
  hard: "Detailed: lots of small shapes",
  expert: "Expert: hundreds of tiny shapes",
};

/** The optional nudge to a size's detail. */
const DETAIL_SHIFTS: { shift: -1 | 0 | 1; label: string }[] = [
  { shift: -1, label: "Simpler" },
  { shift: 0, label: "Standard" },
  { shift: 1, label: "More detail" },
];

function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z" />
      <path d="M9.2 12c-2 0-3.7 1.6-3.7 3.6 0 1.9-1.1 3.2-3 3.9 1.3 1.3 3.2 2 5.1 2 3.2 0 5.6-2.4 5.6-5.4z" />
    </svg>
  );
}

type Tool = "color" | "join" | "clean" | "line";
/** Hand fixes, with what to do first. */
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "color", label: "Change color", hint: "Tap the shape whose color is wrong." },
  { id: "join", label: "Join", hint: "Tap a shape, then a shape touching it, to remove the line between them." },
  { id: "clean", label: "Clean up a speck", hint: "Tap a small spot to blend it into what's around it." },
  { id: "line", label: "Add a line", hint: "Drag your finger across a shape to cut it in two, or draw a loop around a part to make it its own shape. (Use two fingers to move around.)" },
];
/** Most zoom while fixing. */
const MAX_ZOOM = 5;
/** Where people can send a photo that came out badly, to have it fixed by hand. */
const FIX_BY_HAND_EMAIL = CONTACT_EMAIL;
/** Shortest drawn line that counts as a line (not a tap), in screen pixels. */
const MIN_LINE_PX = 8;
/** How thick the line being drawn with Add a line is on the screen (CSS px). */
const LINE_PX = 4;

/** Draws a line (page px) with Add a line's look: purple, about LINE_PX on screen however small or zoomed the picture is. */
function strokeLine(canvas: HTMLCanvasElement, line: [number, number][]) {
  if (line.length < 2) return;
  const ctx = canvas.getContext("2d")!;
  const onScreen = canvas.getBoundingClientRect().width;
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = Math.max(3, canvas.width / 250, onScreen > 0 ? (LINE_PX * canvas.width) / onScreen : 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(...line[0]);
  for (const pt of line.slice(1)) ctx.lineTo(...pt);
  ctx.stroke();
}
/** Width the photo is drawn at when shown in place of the page (pixels). */
const PEEK_WIDTH = 1600;
/** Most fixes kept for one report. */
const MAX_LOG = 300;
/** How many fixes can be undone. */
const MAX_UNDO = 30;


/** A mural sheet shown big is drawn this many pixels wide (sharp on big screens). */
const BIG_SHEET_PX = 1600;
/** A press that moves less than this (px) is a tap, not a drag of the brush. */
const TAP_SLOP = 8;

/** "mural": the Group mural page (only mural sizes); else the photo page (only regular sizes). */
export default function ColorByNumber({ mode = "photo" }: { mode?: "photo" | "mural" }) {
  const muralMode = mode === "mural";
  const [file, setFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<Page | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A mural's plain areas (sky, walls) in extra colors, so every sheet has plenty to color. */
  const [extraColors, setExtraColors] = useState(false);
  const [printSize, setPrintSize] = useState<PrintSizeId>(muralMode ? "mural-4" : "letter");
  /** Letter on the photo page can be split across 2 or 4 sheets (same price as one page). */
  const [split, setSplit] = useState<1 | 2 | 4>(1);
  /** The size the page is made at: the chosen size, or a 2- or 4-sheet split of Letter. */
  const pageSize: PrintSizeId = !muralMode && printSize === "letter" && split > 1 ? (split === 2 ? "mural-2" : "mural-4") : printSize;
  /** The print size decides the detail; people can make it one step simpler or more detailed. */
  const [detailShift, setDetailShift] = useState<-1 | 0 | 1>(0);
  const difficulty = levelFor(printSize, detailShift);
  /** Where the page sits on the chosen paper (set with the result). */
  const [fit, setFit] = useState<Fit | null>(null);
  /** How far the brush has painted across the page, 0–100 (%). */
  const [reveal, setReveal] = useState(50);
  /** A mural sheet shown big (its index, row by row), and whether it's shown colored in. */
  const [bigSheet, setBigSheet] = useState<number | null>(null);
  const [bigColored, setBigColored] = useState(false);
  const bigRef = useRef<HTMLCanvasElement>(null);
  /** Where a press on the picture started (and the brush then), to tell a tap from a drag. */
  const tapStart = useRef<{ x: number; y: number; reveal: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const outlineRef = useRef<HTMLCanvasElement>(null);
  const paintedRef = useRef<HTMLCanvasElement>(null);
  const highlightRef = useRef<HTMLCanvasElement>(null);
  // Fixing the page by hand: the chosen tool, the shape picked first, and earlier versions of
  // the page for undo.
  const [fixing, setFixing] = useState(false);
  /** Picture choices by Fix it: faces with eyes, nose and mouth; the whole photo, not framed closer. */
  const [showFaces, setShowFaces] = useState(false);
  const [zoomOut, setZoomOut] = useState(false);
  /** Whether zooming changes anything: the photo has people framed closer than the whole photo. */
  const [canZoom, setCanZoom] = useState(false);
  /** The photo, and the people and faces found in it, kept while it's the same photo (see generate). */
  const photoCache = useRef<Photo | null>(null);
  /** The part of the photo the page shows, and whether the photo is shown in its place. */
  const pageShows = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [peek, setPeek] = useState(false);
  const peekRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("color");
  /** The last line drawn with Add a line, kept on the picture until the next fix. */
  const [cutLine, setCutLine] = useState<[number, number][] | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [history, setHistory] = useState<Page[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  /** Where the shape being recolored was tapped (page pixels), to find it again afterwards. */
  const pickedAt = useRef<[number, number] | null>(null);
  /** A recolored shape that now matches a touching shape: offer to join them. */
  const [offer, setOffer] = useState<Spot | null>(null);
  /** The color wheel for making a new color is open. */
  const [wheelOpen, setWheelOpen] = useState(false);
  // Helping improve the site: the fixes made since the last report, the page as first made,
  // and the "help" form at the bottom.
  const [fixLog, setFixLog] = useState<FixEntry[]>([]);
  const made = useRef({ people: 0, faces: 0, shapes: 0, colors: 0 });
  const [sharePhoto, setSharePhoto] = useState(false);
  const [helpNote, setHelpNote] = useState("");
  const [helpState, setHelpState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // Paying for the PDF: this page has been paid for, and the checkout box is open.
  const [paid, setPaid] = useState(false);
  const [paying, setPaying] = useState(false);
  /** The line being drawn with the line tool, in page pixels. */
  const drawn = useRef<[number, number][] | null>(null);
  // Zoom while fixing: the picture is scaled by `z` and moved by (x, y) screen pixels.
  const frameRef = useRef<HTMLDivElement>(null);
  /** The finished page, and whether to bring it into view (just made, not just edited). */
  const resultRef = useRef<HTMLElement>(null);
  const showResult = useRef(false);
  useEffect(() => {
    if (!result || !showResult.current) return;
    showResult.current = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, [result]);
  const [view, setViewState] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  /** Sets the zoom, keeping `viewRef` current at once for the next finger move. */
  const setView = (v: { z: number; x: number; y: number }) => {
    viewRef.current = v;
    setViewState(v);
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; z: number } | null>(null);
  const pan = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  /** A pinch or a pan just ended: the click that follows isn't a tap. */
  const skipClick = useRef(false);

  useEffect(() => {
    if (result && outlineRef.current) drawPage(outlineRef.current, result, "outline");
    if (result && paintedRef.current) drawPage(paintedRef.current, result, "colored");
  }, [result]);

  // The photo in place of the page (to compare while fixing): the same part of it, page-sized.
  useEffect(() => {
    const c = peekRef.current;
    const photo = photoCache.current;
    const r = pageShows.current;
    if (!peek || !c || !photo || !r || !result) return;
    c.width = Math.min(PEEK_WIDTH, result.width);
    c.height = Math.round((c.width * result.height) / result.width);
    c.getContext("2d")!.drawImage(photo.full, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height);
  }, [peek, result]);

  useEffect(() => {
    if (result && highlightRef.current) drawHighlight(highlightRef.current, result, fixing && picked ? [picked] : []);
    // The last line drawn stays on the picture, so a cut shows even through a dark shape.
    if (fixing && cutLine && highlightRef.current) strokeLine(highlightRef.current, cutLine);
  }, [result, picked, fixing, cutLine]);

  /**
   * Makes a fix: the new page replaces the current one, which is kept for undo. `entry`
   * describes the fix for a report (if the person later chooses to send one).
   */
  function apply(next: Page | string, entry?: FixEntry) {
    if (typeof next === "string") {
      setHint(next);
      return;
    }
    if (entry) {
      setFixLog((log) => [...log.slice(-(MAX_LOG - 1)), entry]);
      if (helpState === "sent") setHelpState("idle");
    }
    if (result) setHistory((h) => [...h.slice(-(MAX_UNDO - 1)), result]);
    setResult(next);
    setCutLine(null);
    setPicked(null);
    setOffer(null);
    setHint(TOOLS.find((t) => t.id === tool)?.hint ?? null);
  }

  /**
   * Changes the picked shape's color to number `n` (of `base`, the page with any new color);
   * if it now matches a touching shape, asks about joining.
   */
  function recolorPicked(n: number, how: "eyedropper" | "key" | "new color", base = result) {
    if (!base || !picked) return;
    const next = recolor(base, picked, n);
    setWheelOpen(false);
    apply(next, {
      tool: "color",
      how,
      ...describe(base, picked),
      from: numberAt(base, picked),
      to: n,
      from_rgb: [...(base.key[numberAt(base, picked) - 1]?.rgb ?? [])],
      to_rgb: [...(base.key[n - 1]?.rgb ?? [])],
    });
    const at = pickedAt.current;
    const spot = at && shapeAt(next, at[0], at[1]);
    if (spot && sameColorNeighbors(next, spot) > 0) {
      setOffer(spot);
      setHint("It's now the same color as a shape it touches. Remove the line between them?");
    }
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setFixLog((log) => [...log, { tool: "undo" }]);
    setHistory((h) => h.slice(0, -1));
    setResult(last);
    setCutLine(null);
    setPicked(null);
    setOffer(null);
  }

  /** A point on the picture, in page pixels. */
  function pagePoint(e: { clientX: number; clientY: number }): [number, number] | null {
    if (!result || !outlineRef.current) return null;
    const box = outlineRef.current.getBoundingClientRect();
    return [((e.clientX - box.left) / box.width) * result.width, ((e.clientY - box.top) / box.height) * result.height];
  }

  /** A zoom and position kept so the picture always fills its frame. */
  function clampView(z: number, x: number, y: number) {
    const box = frameRef.current?.getBoundingClientRect();
    const zz = Math.min(MAX_ZOOM, Math.max(1, z));
    if (!box) return { z: zz, x: 0, y: 0 };
    return {
      z: zz,
      x: Math.min(0, Math.max(box.width * (1 - zz), x)),
      y: Math.min(0, Math.max(box.height * (1 - zz), y)),
    };
  }

  /** Zooms by `factor` keeping the point (px, py) of the frame (screen pixels) in place. */
  function zoomAround(factor: number, px: number, py: number) {
    const v = viewRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z * factor));
    const cx = (px - v.x) / v.z;
    const cy = (py - v.y) / v.z;
    setView(clampView(z, px - cx * z, py - cy * z));
  }

  function zoomButton(factor: number) {
    const box = frameRef.current?.getBoundingClientRect();
    if (box) zoomAround(factor, box.width / 2, box.height / 2);
  }

  // Trackpad pinch (and ctrl + scroll wheel) zooms while fixing.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !fixing) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAround(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomAround only reads refs
  }, [fixing, result]);

  /**
   * Fingers on the picture while fixing: two fingers pinch to zoom and move; one finger draws
   * (line tool), or taps, or moves the zoomed picture around.
   */
  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!fixing) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep following the finger if it strays
    } catch {
      // not a real pointer (nothing to capture)
    }
    if (pointers.current.size === 2) {
      // A second finger: stop drawing and pinch instead.
      if (drawn.current && result && highlightRef.current) drawHighlight(highlightRef.current, result, picked ? [picked] : []);
      drawn.current = null;
      pan.current = null;
      const [a, b] = [...pointers.current.values()];
      const box = frameRef.current!.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - box.left, cy: (a.y + b.y) / 2 - box.top, z: viewRef.current.z };
      skipClick.current = true;
      return;
    }
    if (tool === "line") lineStart(e);
    else if (viewRef.current.z > 1) pan.current = { x: viewRef.current.x, y: viewRef.current.y, sx: e.clientX, sy: e.clientY };
  }

  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const box = frameRef.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - box.left;
      const my = (a.y + b.y) / 2 - box.top;
      const z = Math.min(MAX_ZOOM, Math.max(1, (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.d)));
      // Keep the picture point that was under the fingers under them, and follow them.
      const v = viewRef.current;
      const cx = (p.cx - v.x) / v.z;
      const cy = (p.cy - v.y) / v.z;
      setView(clampView(z, mx - cx * z, my - cy * z));
      p.cx = mx;
      p.cy = my;
      return;
    }
    if (drawn.current) {
      lineMove(e);
      return;
    }
    const q = pan.current;
    if (q) {
      const dx = e.clientX - q.sx;
      const dy = e.clientY - q.sy;
      if (Math.hypot(dx, dy) > 6) skipClick.current = true;
      setView(clampView(viewRef.current.z, q.x + dx, q.y + dy));
    }
  }

  function pointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (drawn.current) lineEnd();
    pan.current = null;
  }

  /** Drawing a line with the line tool: shown as it's drawn, then the shape is cut along it. */
  function lineStart(e: React.PointerEvent<HTMLDivElement>) {
    const pt = pagePoint(e);
    if (!pt) return;
    drawn.current = [pt];
  }
  function lineMove(e: React.PointerEvent<HTMLDivElement>) {
    const line = drawn.current;
    const pt = pagePoint(e);
    if (!line || !pt || !highlightRef.current) return;
    line.push(pt);
    strokeLine(highlightRef.current, line.slice(-2));
  }
  function lineEnd() {
    const line = drawn.current;
    drawn.current = null;
    if (!line || !result) return;
    // How long a line must be is measured on the screen, so a short cut on a small shape still
    // works when zoomed in.
    const box = outlineRef.current?.getBoundingClientRect();
    const next = splitAlong(result, line, box ? (MIN_LINE_PX * result.width) / box.width : undefined);
    if (typeof next === "string" && highlightRef.current) drawHighlight(highlightRef.current, result, []);
    const spot = lineShape(result, line);
    // Where the line was drawn (its ends), as shares of the page.
    const ends = [line[0], line[line.length - 1]].flatMap(([x, y]) => [Math.round((x / result.width) * 1000) / 1000, Math.round((y / result.height) * 1000) / 1000]);
    apply(next, spot ? { tool: "line", ...describe(result, spot), line: ends } : undefined);
    if (typeof next !== "string") setCutLine(line);
  }

  /** A tap on the picture while fixing: pick or change the shape under the finger. */
  function tapPicture(e: React.MouseEvent<HTMLDivElement>) {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    if (!fixing || !result || tool === "line") return;
    const pt = pagePoint(e);
    const spot = pt && shapeAt(result, pt[0], pt[1]);
    if (!spot) return;
    if (tool === "clean") apply(cleanUp(result, spot), { tool: "clean", ...describe(result, spot) });
    else if (tool === "join" && picked) {
      const [a, b] = [describe(result, picked), describe(result, spot)];
      apply(join(result, picked, spot), { tool: "join", layer: a.layer, parts: [a.part, b.part], sizes: [a.size, b.size], at: [...a.at, ...b.at] });
    } else if (tool === "color" && picked && (spot.layer !== picked.layer || spot.region !== picked.region)) {
      // Eyedropper: copy the color of the shape tapped second.
      recolorPicked(numberAt(result, spot), "eyedropper");
    } else {
      setPicked(spot);
      setOffer(null);
      setWheelOpen(false);
      pickedAt.current = pt;
      setHint(
        tool === "join"
          ? "Now tap a shape touching it to join them."
          : "Now tap a shape in the picture that has the color you want. You can also pick from the key below, or tap 🎨 More colors for common hair, skin and clothes colors or a color code.",
      );
    }
  }

  /** Sends what was fixed (and the photo, if the person chose to share it). */
  async function sendHelp() {
    if (!result) return;
    setHelpState("sending");
    try {
      await sendReport(
        {
          difficulty,
          // Every page keeps the scene around the people (reports still say so).
          background: "keep",
          print_size: pageSize,
          people: made.current.people,
          faces: made.current.faces,
          shapes_before: made.current.shapes,
          shapes_after: result.shapes,
          colors_before: made.current.colors,
          colors_after: result.key.length,
          fixes: fixLog,
          note: helpNote.trim().slice(0, 1000),
        },
        sharePhoto && file ? file : undefined,
      );
      setHelpState("sent");
      setFixLog([]);
      setHelpNote("");
    } catch {
      setHelpState("failed");
    }
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setCutLine(null);
    setPicked(null);
    setOffer(null);
    setWheelOpen(false);
    setHint(TOOLS.find((x) => x.id === t)?.hint ?? null);
  }

  /** The gallery picture picked for a mural, if any (cleared when someone uploads their own). */
  const [galleryPick, setGalleryPick] = useState<string | null>(null);

  /** Picks a ready-made mural picture: loads it like an upload, with faces shown if it has people. */
  async function pickMuralPicture(m: MuralPicture) {
    setGalleryPick(m.id);
    setShowFaces(m.faces);
    try {
      const blob = await (await fetch(muralSrc(m))).blob();
      pickFile(new File([blob], `${m.id}.jpg`, { type: "image/jpeg" }), true);
    } catch {
      setError("Sorry, that picture didn't load. Check your connection and try again.");
    }
  }

  function pickFile(f: File | undefined, fromGallery = false) {
    if (!f) return;
    if (!fromGallery) setGalleryPick(null);
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

  /**
   * Makes the page. `options` are the picture choices by Fix it (faces shown, zoomed out),
   * passed when one was just changed, before its new value is in state.
   */
  async function generate(options: { faces?: boolean; zoomOut?: boolean } = {}) {
    const withFaces = options.faces ?? showFaces;
    const wide = options.zoomOut ?? zoomOut;
    if (!file) return;
    setBusy("Finding people and faces…");
    setError(null);
    setFocusNote(null);
    // Let the "working" state paint before the pipeline blocks the main thread.
    await new Promise((r) => setTimeout(r, 30));
    let photo = photoCache.current;
    if (!photo || photo.file !== file) {
      photo?.full.close();
      photoCache.current = null;
      try {
        photo = await loadPhoto(file);
      } catch {
        setError("Sorry, we couldn't read that photo. Try a different one.");
        setBusy(null);
        return;
      }
      photoCache.current = photo;
    }
    const { page, fit: pageFit, shows, people, faces } = await makePage(
      photo,
      { printSize: pageSize, difficulty: testLevel() ?? difficulty, faces: withFaces, zoomOut: wide, colorful: muralMode && extraColors, ownColors: !muralMode },
      { onStep: setBusy, onNote: setFocusNote },
    );
    setFit(pageFit);
    setCanZoom(!!photo.frame);
    countTry(`${file.name}:${file.size}:${file.lastModified}`, muralMode ? (galleryPick ? "mural-gallery" : "mural") : "photo", pageSize);
    pageShows.current = shows;
    setPeek(false);
    made.current = { people, faces, shapes: page.shapes, colors: page.key.length };
    setFixLog([]);
    setPaid(false);
    setHelpState("idle");
    setHelpNote("");
    setSharePhoto(false);
    setHistory([]);
    setFixing(false);
    setView({ z: 1, x: 0, y: 0 });
    setPicked(null);
    showResult.current = true;
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
      saveFile(fit.mural ? await muralPdf(result, fit) : await pagePdf(result, fit), `color-by-number-${pageSize}.pdf`);
    } catch {
      setError("Sorry, something went wrong making the PDF. Try a smaller print size.");
    } finally {
      setBusy(null);
    }
  }

  const key = result?.key ?? [];
  const sizeLabel =
    pageSize !== printSize
      ? `Letter, ${split} sheets`
      : (PRINT_SIZES.find((p) => p.id === printSize)?.label ?? `mural, ${MURALS.find((m) => m.id === printSize)?.label}`);
  /** What the download costs: a mural is priced by its number of sheets; a split Letter page is one photo. */
  const product = isMural(printSize) ? printSize : "photo";

  // The sheet shown big: drawn sharp from the page itself, like its printed sheet.
  useEffect(() => {
    const m = fit?.mural;
    if (bigSheet === null || !result || !m || !bigRef.current) return;
    const u = result.width / fit.w;
    const row = Math.floor(bigSheet / m.cols), col = bigSheet % m.cols;
    drawPage(bigRef.current, result, bigColored ? "colored" : "outline", BIG_SHEET_PX / (m.cellW * u), { x: col * m.cellW * u, y: row * m.cellH * u, w: m.cellW * u, h: m.cellH * u });
  }, [bigSheet, bigColored, result, fit]);
  // Arrow keys step through the sheets; Escape closes.
  useEffect(() => {
    const m = fit?.mural;
    if (bigSheet === null || !m) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBigSheet(null);
      else if (e.key === "ArrowRight") setBigSheet((i) => (i === null ? i : (i + 1) % (m.cols * m.rows)));
      else if (e.key === "ArrowLeft") setBigSheet((i) => (i === null ? i : (i - 1 + m.cols * m.rows) % (m.cols * m.rows)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bigSheet, fit]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="print:hidden">
        <Link href="/" className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← All pages
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{muralMode ? "Group mural 🧩" : "Color by Number"}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {muralMode
            ? "One picture split across several Letter sheets: everyone colors a sheet, then you put them together into a big picture. Great for classes, parties and family get-togethers."
            : "Upload a photo, pick a print size, and get a printable color-by-number page."}
        </p>
      </header>

      <section className="flex flex-col gap-6 print:hidden">
        {muralMode && (
          <div>
            <h2 className="mb-2 font-semibold">1. Pick a picture</h2>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Use your own photo, or pick one of ours: they&apos;re chosen to give every sheet lots of color.
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {/* Their own photo: opens the photo picker (a photo can be dropped on it too). */}
              <li>
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
                  className={`flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border-2 text-left transition-colors ${
                    dragging || (photoUrl && !galleryPick)
                      ? "border-violet-500"
                      : "border-dashed border-zinc-300 hover:border-violet-400 dark:border-zinc-700"
                  }`}
                >
                  {photoUrl && !galleryPick ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                    <img src={photoUrl} alt="Your photo" className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <span className="flex aspect-[3/4] w-full items-center justify-center bg-violet-50 text-5xl text-violet-500 dark:bg-violet-950/30" aria-hidden>
                      +
                    </span>
                  )}
                  <span className="px-2 pt-1.5 text-sm font-semibold">Create your own</span>
                  <span className="px-2 pb-1.5 text-xs text-zinc-500">{photoUrl && !galleryPick ? "Tap to choose a different photo" : "Use your own photo"}</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
              </li>
              {MURAL_PICTURES.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pickMuralPicture(m)}
                    aria-pressed={galleryPick === m.id}
                    className={`flex w-full flex-col overflow-hidden rounded-xl border-2 text-left transition-colors ${
                      galleryPick === m.id ? "border-violet-500" : "border-zinc-200 hover:border-violet-300 dark:border-zinc-800"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- small static picture */}
                    <img src={muralThumb(m)} alt="" className="aspect-[3/4] w-full object-cover" />
                    <span className="px-2 pt-1.5 text-sm font-semibold">{m.title}</span>
                    <span className="px-2 pb-1.5 text-xs text-zinc-500">{m.credit}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!muralMode && <div>
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
        </div>}

        <div>
          <h2 className="mb-2 font-semibold">{muralMode ? "2. How many sheets" : "2. Print size"}</h2>
          {muralMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="How many sheets"
                value={printSize}
                onChange={(e) => {
                  setPrintSize(e.target.value as PrintSizeId);
                  setResult(null);
                }}
                className="rounded-lg border-2 border-violet-500 bg-white px-3 py-1.5 text-sm dark:bg-zinc-900"
              >
                {MURALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {paymentsOn ? `: ${priceLabel(m.id)}` : ""}
                  </option>
                ))}
              </select>
              <label className="flex w-full items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={extraColors}
                  onChange={(e) => {
                    setExtraColors(e.target.checked);
                    setResult(null);
                  }}
                  className="h-4 w-4 accent-violet-600"
                />
                Extra colorful: add fun colors to plain areas like sky, so every sheet has lots to color
              </label>
              <span className="w-full text-sm text-zinc-500">
                Tip: colorful pictures with color all the way to the edges make the best murals. After making it, tap Face to
                show faces.
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup">
                {PRINT_SIZES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={printSize === p.id}
                    onClick={() => {
                      setPrintSize(p.id);
                      // A nudge that does nothing at the new size goes back to standard.
                      if (levelFor(p.id, detailShift) === levelFor(p.id, 0)) setDetailShift(0);
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
              {printSize === "letter" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Sheets:</span>
                  <div className="inline-flex rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800" role="radiogroup" aria-label="Sheets">
                    {([1, 2, 4] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={split === n}
                        onClick={() => {
                          setSplit(n);
                          // Sheets have room for real faces: shown from the photo (Face can still turn them off).
                          setShowFaces(n > 1);
                          setResult(null);
                        }}
                        className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                          split === n
                            ? "bg-violet-600 text-white"
                            : "text-zinc-600 hover:text-violet-700 dark:text-zinc-400 dark:hover:text-violet-300"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-zinc-500">
                    {split === 1 ? "One page" : `A bigger picture in ${split} pieces to tape together, same price`}
                  </span>
                </div>
              )}
              <p className="mt-2 text-sm text-zinc-500">
                Bigger paper fits more small shapes while keeping every number easy to read. 4 × 6 and 5 × 7 print on
                regular paper with a dashed line to cut along; the picture fills the card.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Detail:</span>
                <div className="inline-flex rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800" role="radiogroup" aria-label="Detail">
                  {DETAIL_SHIFTS.map((d) => (
                    <button
                      key={d.shift}
                      type="button"
                      role="radio"
                      aria-checked={detailShift === d.shift}
                      // Already as simple (or detailed) as it gets at this size.
                      disabled={d.shift !== 0 && levelFor(printSize, d.shift) === levelFor(printSize, 0)}
                      onClick={() => {
                        setDetailShift(d.shift);
                        setResult(null);
                      }}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                        detailShift === d.shift
                          ? "bg-violet-600 text-white"
                          : "text-zinc-600 hover:text-violet-700 dark:text-zinc-400 dark:hover:text-violet-300"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-zinc-500">{LEVEL_NAMES[difficulty]}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => generate()}
            disabled={!file || !!busy}
            className="rounded-full bg-violet-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                {busy}
              </span>
            ) : (
              "3. Make my color-by-number"
            )}
          </button>
          {!file && <span className="text-sm text-zinc-500">Upload a photo first</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </section>

      {result && (
        <section ref={resultRef} className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-sm text-zinc-500">
              {result.shapes} shapes · {key.length} colors
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Picture choices: each click remakes the page with the other choice. */}
            <button
              type="button"
              aria-pressed={showFaces}
              disabled={!!busy}
              title={showFaces ? "Faces have eyes, nose and mouth. Click for no face." : "Faces are left blank. Click to show eyes, nose and mouth."}
              onClick={() => {
                if (fixLog.length && !window.confirm("Changing faces remakes the page, so the fixes you made will be lost. Change anyway?")) return;
                setShowFaces(!showFaces);
                generate({ faces: !showFaces });
              }}
              className="rounded-full border-2 border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-violet-400 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              {showFaces ? "Face" : "No face"}
            </button>
            {canZoom && (
              <button
                type="button"
                aria-pressed={zoomOut}
                disabled={!!busy}
                title={zoomOut ? "The whole photo, with more background. Click to focus on the people." : "Focused on the people. Click for the whole photo."}
                onClick={() => {
                  if (fixLog.length && !window.confirm("Zooming remakes the page, so the fixes you made will be lost. Zoom anyway?")) return;
                  setZoomOut(!zoomOut);
                  generate({ zoomOut: !zoomOut });
                }}
                className="rounded-full border-2 border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-violet-400 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                {zoomOut ? "Zoom in on the people" : "Show the whole photo"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFixing((f) => !f);
                setView({ z: 1, x: 0, y: 0 });
                setPicked(null);
                setHint(fixing ? null : (TOOLS.find((t) => t.id === tool)?.hint ?? null));
              }}
              className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${
                fixing
                  ? "border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
                  : "border-violet-500 text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30"
              }`}
            >
              {fixing ? "Done fixing" : "Fix it"}
            </button>
            </div>
          </div>

          {fixing && (
            <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 print:hidden dark:border-violet-900 dark:bg-violet-950/30">
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Fix tool">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tool === t.id}
                    onClick={() => chooseTool(t.id)}
                    className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors ${
                      tool === t.id
                        ? "border-violet-600 bg-white text-violet-700 dark:bg-zinc-900 dark:text-violet-300"
                        : "border-transparent text-zinc-700 hover:border-violet-300 dark:text-zinc-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => zoomButton(1 / 1.5)}
                    disabled={view.z <= 1}
                    aria-label="Zoom out"
                    className="h-8 w-8 rounded-full text-lg font-semibold text-zinc-700 hover:bg-white disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomButton(1.5)}
                    disabled={view.z >= MAX_ZOOM}
                    aria-label="Zoom in"
                    className="h-8 w-8 rounded-full text-lg font-semibold text-zinc-700 hover:bg-white disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setView({ z: 1, x: 0, y: 0 })}
                    disabled={view.z <= 1}
                    className="rounded-full px-2 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-white disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeek((p) => !p)}
                    aria-pressed={peek}
                    title="Show your photo in place of the page, to compare"
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white dark:hover:bg-zinc-900 ${
                      peek ? "bg-violet-600 text-white hover:bg-violet-700" : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    📷 Photo
                  </button>
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!history.length}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-white disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    ↶ Undo
                  </button>
                </span>
              </div>
              {hint && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-violet-900 dark:text-violet-200">{hint}</p>
                  {offer && (
                    <>
                      <button
                        type="button"
                        onClick={() => result && apply(joinSameColor(result, offer), { tool: "join same color", ...describe(result, offer) })}
                        className="rounded-full bg-violet-600 px-3 py-1 text-sm font-semibold text-white hover:bg-violet-700"
                      >
                        Join them
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOffer(null);
                          setHint(TOOLS.find((t) => t.id === tool)?.hint ?? null);
                        }}
                        className="rounded-full border border-violet-300 px-3 py-1 text-sm font-semibold text-violet-800 hover:bg-white dark:text-violet-200 dark:hover:bg-zinc-900"
                      >
                        Keep the line
                      </button>
                    </>
                  )}
                  {tool === "color" && picked && !wheelOpen && (
                    <button
                      type="button"
                      onClick={() => setWheelOpen(true)}
                      className="rounded-full border border-violet-300 bg-white px-3 py-1 text-sm font-semibold text-violet-800 hover:bg-violet-100 dark:bg-zinc-900 dark:text-violet-200"
                    >
                      🎨 More colors
                    </button>
                  )}
                </div>
              )}
              {tool === "color" && picked && wheelOpen && result && (
                <ColorWheel
                  start={result.key[numberAt(result, picked) - 1]?.rgb ?? [200, 160, 120]}
                  onUse={(rgb) => {
                    const added = addColor(result, rgb);
                    recolorPicked(added.n, "new color", added.page);
                  }}
                  onCancel={() => setWheelOpen(false)}
                />
              )}
            </div>
          )}

          {focusNote && <p className="text-sm text-zinc-600 print:hidden dark:text-zinc-400">{focusNote}</p>}
          {/* Before/after: drag the brush to paint the numbered page into the finished picture. */}
          <div
            ref={frameRef}
            onClick={tapPicture}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            {...noSaving}
            style={{ touchAction: fixing ? "none" : undefined }}
            className={`relative select-none overflow-hidden rounded-lg bg-white shadow-sm ${
              fixing ? (tool === "line" ? "cursor-crosshair ring-2 ring-violet-500" : "cursor-pointer ring-2 ring-violet-500") : ""
            }`}
          >
            {!paid && <Watermark />}
            <div
              className="relative origin-top-left"
              style={fixing ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` } : undefined}
            >
              <canvas ref={outlineRef} className="block h-auto w-full" />
              <canvas
                ref={paintedRef}
                className="pointer-events-none absolute inset-0 h-full w-full print:hidden"
                style={{ clipPath: `inset(0 ${fixing ? 0 : 100 - reveal}% 0 0)` }}
              />
              <canvas ref={highlightRef} className="pointer-events-none absolute inset-0 h-full w-full print:hidden" />
              {peek && fixing && <canvas ref={peekRef} className="pointer-events-none absolute inset-0 h-full w-full print:hidden" />}
              {fit?.mural && (
                // Where the mural's sheets split, with each sheet's name.
                <div
                  className="pointer-events-none absolute inset-0 grid print:hidden"
                  style={{ gridTemplateColumns: `repeat(${fit.mural.cols}, 1fr)`, gridTemplateRows: `repeat(${fit.mural.rows}, 1fr)` }}
                >
                  {Array.from({ length: fit.mural.cols * fit.mural.rows }, (_, i) => (
                    <div key={i} className="relative border border-dashed border-violet-500/80">
                      <span className="absolute top-1 left-1 rounded bg-violet-600/85 px-1.5 text-[10px] font-semibold text-white">
                        {sheetName(Math.floor(i / fit.mural!.cols), i % fit.mural!.cols)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-violet-500/80 print:hidden ${fixing ? "hidden" : ""}`}
              style={{ left: `${reveal}%` }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 -rotate-12 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-lg">
                <BrushIcon />
              </div>
            </div>
            {!fixing && (
              <>
                <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-violet-600/90 px-2.5 py-1 text-xs font-semibold text-white print:hidden">
                  Painted
                </span>
                <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-zinc-900/75 px-2.5 py-1 text-xs font-semibold text-white print:hidden">
                  Numbers
                </span>
              </>
            )}
            <input
              hidden={fixing}
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={reveal}
              onChange={(e) => setReveal(Number(e.target.value))}
              onPointerDown={(e) => (tapStart.current = { x: e.clientX, y: e.clientY, reveal })}
              onClick={(e) => {
                // On a mural, a tap (not a drag of the brush) shows that sheet big.
                const m = fit?.mural, start = tapStart.current;
                if (!m || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
                const box = e.currentTarget.getBoundingClientRect();
                const col = Math.min(m.cols - 1, Math.floor(((e.clientX - box.left) / box.width) * m.cols));
                const row = Math.min(m.rows - 1, Math.floor(((e.clientY - box.top) / box.height) * m.rows));
                setReveal(start.reveal);
                setBigColored(false);
                setBigSheet(row * m.cols + col);
              }}
              aria-label="Drag the brush to compare the finished picture with the numbered page"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 print:hidden"
            />
          </div>

          {fit?.mural && !fixing && <p className="-mt-2 text-sm text-zinc-500 print:hidden">Tap a sheet to see it bigger.</p>}
          {fit?.mural && bigSheet !== null && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Sheet ${sheetName(Math.floor(bigSheet / fit.mural.cols), bigSheet % fit.mural.cols)}`}
              onClick={(e) => e.target === e.currentTarget && setBigSheet(null)}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-3 print:hidden"
            >
              <div className="flex w-full max-w-3xl flex-wrap items-center gap-2 text-white">
                <span className="whitespace-nowrap text-lg font-bold">Sheet {sheetName(Math.floor(bigSheet / fit.mural.cols), bigSheet % fit.mural.cols)}</span>
                <span className="whitespace-nowrap text-sm text-white/70">
                  {bigSheet + 1} of {fit.mural.cols * fit.mural.rows}
                </span>
                <div role="radiogroup" aria-label="Show" className="ml-auto flex rounded-full bg-white/15 p-0.5">
                  {[false, true].map((on) => (
                    <button
                      key={String(on)}
                      type="button"
                      role="radio"
                      aria-checked={bigColored === on}
                      onClick={() => setBigColored(on)}
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${bigColored === on ? "bg-white text-zinc-900" : "text-white"}`}
                    >
                      {on ? "Colored" : "Numbers"}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setBigSheet(null)} aria-label="Close" className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-lg font-bold">
                  ×
                </button>
              </div>
              <div className="flex w-full max-w-3xl min-h-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous sheet"
                  onClick={() => setBigSheet((bigSheet - 1 + fit.mural!.cols * fit.mural!.rows) % (fit.mural!.cols * fit.mural!.rows))}
                  className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xl font-bold text-white"
                >
                  ‹
                </button>
                <div className="relative min-w-0 flex-1" {...noSaving}>
                  <canvas ref={bigRef} className="block max-h-[78vh] w-full rounded bg-white object-contain" />
                  {!paid && <Watermark />}
                </div>
                <button
                  type="button"
                  aria-label="Next sheet"
                  onClick={() => setBigSheet((bigSheet + 1) % (fit.mural!.cols * fit.mural!.rows))}
                  className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-xl font-bold text-white"
                >
                  ›
                </button>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-semibold">Color key</h2>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {key.map(({ n, rgb }) => {
                const choosing = fixing && tool === "color" && !!picked;
                return (
                  <li key={n}>
                    <button
                      type="button"
                      disabled={!choosing}
                      onClick={() => recolorPicked(n, "key")}
                      className={`flex items-center gap-2 rounded-lg p-0.5 ${choosing ? "cursor-pointer ring-violet-400 hover:ring-2" : "cursor-default"}`}
                    >
                      <span
                        className="h-7 w-7 shrink-0 rounded-md border border-zinc-300 print:[print-color-adjust:exact]"
                        style={{ background: `rgb(${rgb.join(",")})` }}
                      />
                      <span className="font-mono text-sm font-semibold">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 print:hidden dark:border-zinc-800">
            <h2 className="font-semibold">Help make this site better</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Did something come out wrong? Fix it with <span className="font-semibold">Fix it</span>, then send us what
              you changed, and we&apos;ll use it to make the pages come out right on their own. We only get your settings
              and a list of your fixes (like &ldquo;joined two clothes shapes&rdquo;), not your photo, unless you
              choose to share it below.{" "}
              <Link href="/privacy" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
                How we handle this
              </Link>
            </p>
            <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={sharePhoto}
                onChange={(e) => setSharePhoto(e.target.checked)}
                className="mt-0.5 accent-violet-600"
              />
              <span>Also share my photo, so you can see exactly what went wrong. It&apos;s kept private and only used to improve the site.</span>
            </label>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Does your picture look way off? Email your photo to{" "}
              <a
                href={`mailto:${FIX_BY_HAND_EMAIL}?subject=${encodeURIComponent("Please fix my color-by-number")}`}
                className="font-semibold whitespace-nowrap text-violet-700 hover:underline dark:text-violet-300"
              >
                {FIX_BY_HAND_EMAIL}
              </a>{" "}
              with what you&apos;d like fixed, and we&apos;ll try to fix it by hand for you.
            </p>
            <textarea
              value={helpNote}
              onChange={(e) => setHelpNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Anything else we should know? (optional)"
              className="rounded-lg border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendHelp}
                disabled={helpState === "sending" || (!fixLog.length && !helpNote.trim())}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
              >
                {helpState === "sending" ? "Sending…" : "Send"}
              </button>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {helpState === "sent"
                  ? "Thank you! We got it."
                  : helpState === "failed"
                    ? "Sorry, that didn't send. Check your connection and try again."
                    : fixLog.length
                      ? `${fixLog.length} ${fixLog.length === 1 ? "fix" : "fixes"} to send`
                      : "Make a fix or write a note to send."}
              </span>
            </div>
          </div>

          {/* Download last, after the help box, so people see they can share what went wrong. */}
          <div className="flex flex-col items-center gap-2 py-2 print:hidden">
            <button
              type="button"
              onClick={() => (paymentsOn && !paid ? setPaying(true) : downloadPdf())}
              disabled={!!busy}
              className="rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Download PDF ({sizeLabel}){paymentsOn && !paid ? `: ${priceLabel(product)}` : ""}
            </button>
            <span className="text-sm text-zinc-500">
              {fit?.mural
                ? "A map of how the sheets go together, the color key, and every sheet to color."
                : "The page to color, the color key, and the finished picture."}
            </span>
            {paying && (
              <Checkout
                product={product}
                onClose={() => setPaying(false)}
                onPaid={() => {
                  setPaid(true);
                  setPaying(false);
                  downloadPdf();
                }}
              />
            )}
          </div>
        </section>
      )}
    </main>
  );
}
