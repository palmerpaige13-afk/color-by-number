// Hand fixes to a finished page: change a shape's color, join two neighboring shapes, or
// clean up a speck into its surroundings. Every fix returns a new page (the old one is left
// as it was), so undo is just going back to the previous page.

import { boundaryDistance, labelPoints } from "@/lib/pipeline/distance";
import type { PipelineResult } from "@/lib/pipeline";
import type { Page } from "@/lib/page";

/** A shape on the page: which layer, and which shape (region) in it. */
export interface Spot {
  layer: number;
  region: number;
}

const isBlank = (r: PipelineResult, region: number) => r.regionColor[region] === r.background;

/** The shape at page point (x, y), from the top layer down; null on blank paper. */
export function shapeAt(page: Page, x: number, y: number): Spot | null {
  for (let li = page.layers.length - 1; li >= 0; li--) {
    const { result: r, x: lx, y: ly, scale } = page.layers[li];
    const wx = Math.floor((x - lx) / scale);
    const wy = Math.floor((y - ly) / scale);
    if (wx < 0 || wy < 0 || wx >= r.width || wy >= r.height) continue;
    const region = r.labels[wy * r.width + wx];
    if (!isBlank(r, region)) return { layer: li, region };
  }
  return null;
}

/** Shared border length (in pixels) between `region` and each of its neighbors. */
function neighbors(r: PipelineResult, region: number): Map<number, number> {
  const out = new Map<number, number>();
  const { labels, width: w, height: h } = r;
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] !== region) continue;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || labels[q] === region) continue;
      out.set(labels[q], (out.get(labels[q]) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * The page with one layer's shapes changed: `into` maps each shape to the shape it becomes
 * part of (itself if unchanged), and `color` optionally sets a shape's number. Shapes are then
 * renumbered and their number spots found again.
 */
function rebuild(page: Page, li: number, into: (region: number) => number, color?: Map<number, number>): Page {
  const r = page.layers[li].result;
  const { width: w, height: h } = r;
  const remap = new Int32Array(r.regionCount).fill(-1);
  const regionColor: number[] = [];
  const labels = new Uint16Array(r.labels.length);
  for (let p = 0; p < labels.length; p++) {
    const to = into(r.labels[p]);
    if (remap[to] < 0) {
      remap[to] = regionColor.length;
      regionColor.push(color?.get(to) ?? r.regionColor[to]);
    }
    labels[p] = remap[to];
  }
  const count = regionColor.length;
  const area = new Uint32Array(count);
  for (let p = 0; p < labels.length; p++) area[labels[p]]++;
  const pts = labelPoints(labels, count, w, h, boundaryDistance(labels, w, h));
  const result: PipelineResult = {
    ...r,
    labels,
    regionCount: count,
    regionColor: Uint8Array.from(regionColor),
    regionArea: area,
    labelX: pts.x,
    labelY: pts.y,
    labelRadius: pts.radius,
  };
  const layers = page.layers.map((l, i) => (i === li ? { ...l, result } : l));
  let shapes = 0;
  for (const { result: lr } of layers) for (let i = 0; i < lr.regionCount; i++) if (!isBlank(lr, i)) shapes++;
  return { ...page, layers, shapes };
}

/**
 * The page with `spot` colored as number `n` (1-based, from the key). Touching shapes that
 * already have that number join it, so no line is left between two areas of the same color.
 */
export function recolor(page: Page, spot: Spot, n: number): Page {
  const r = page.layers[spot.layer].result;
  const same = new Set([...neighbors(r, spot.region).keys()].filter((nb) => r.regionColor[nb] === n));
  return rebuild(page, spot.layer, (region) => (same.has(region) ? spot.region : region), new Map([[spot.region, n]]));
}

/**
 * The page with shape `b` joined into shape `a` (keeping `a`'s number), or a reason it can't
 * be done: the two must be in the same layer and touch.
 */
export function join(page: Page, a: Spot, b: Spot): Page | string {
  if (a.layer !== b.layer) return "Those two are in different parts of the picture, so they can't be joined.";
  if (a.region === b.region) return "That's the same shape. Tap a shape next to it.";
  const r = page.layers[a.layer].result;
  if (!neighbors(r, a.region).has(b.region)) return "Those two shapes don't touch. Tap a shape right next to the first one.";
  return rebuild(page, a.layer, (region) => (region === b.region ? a.region : region));
}

/**
 * The page with a small shape blended into the neighbor it shares the most border with
 * (taking that neighbor's number), or a reason it can't be done.
 */
export function cleanUp(page: Page, spot: Spot): Page | string {
  const r = page.layers[spot.layer].result;
  let best = -1;
  let longest = 0;
  for (const [nb, border] of neighbors(r, spot.region)) {
    if (isBlank(r, nb) || border <= longest) continue;
    best = nb;
    longest = border;
  }
  if (best < 0) return "There's nothing next to that shape to blend it into.";
  return rebuild(page, spot.layer, (region) => (region === spot.region ? best : region));
}

/** Draws a see-through highlight over the given shapes (page-sized canvas, like drawPage). */
export function drawHighlight(canvas: HTMLCanvasElement, page: Page, spots: Spot[]) {
  canvas.width = Math.round(page.width);
  canvas.height = Math.round(page.height);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!spots.length) return;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (const s of spots) {
    const { result: r, x: lx, y: ly, scale } = page.layers[s.layer];
    const x0 = Math.max(0, Math.floor(lx));
    const y0 = Math.max(0, Math.floor(ly));
    const x1 = Math.min(canvas.width, Math.ceil(lx + r.width * scale));
    const y1 = Math.min(canvas.height, Math.ceil(ly + r.height * scale));
    for (let Y = y0; Y < y1; Y++) {
      const wy = Math.min(r.height - 1, Math.floor((Y + 0.5 - ly) / scale));
      for (let X = x0; X < x1; X++) {
        const wx = Math.min(r.width - 1, Math.floor((X + 0.5 - lx) / scale));
        if (r.labels[wy * r.width + wx] !== s.region) continue;
        // Diagonal stripes, so the shape's own color still shows through.
        const q = (Y * canvas.width + X) * 4;
        const stripe = (X + Y) % 10 < 5;
        img.data[q] = stripe ? 124 : 255;
        img.data[q + 1] = stripe ? 58 : 255;
        img.data[q + 2] = stripe ? 237 : 255;
        img.data[q + 3] = stripe ? 170 : 90;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
