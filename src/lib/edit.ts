// Hand fixes to a finished page: change a shape's color, join two neighboring shapes, or
// clean up a speck into its surroundings. Every fix returns a new page (the old one is left
// as it was), so undo is just going back to the previous page.

import { boundaryDistanceAround, labelPoints } from "@/lib/pipeline/distance";
import type { PipelineResult, RGB } from "@/lib/pipeline";
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
  const labels = Uint32Array.from(r.labels, into);
  const colors = Array.from(r.regionColor, (c, region) => color?.get(region) ?? c);
  return finish(page, li, labels, colors, Array.from(r.regionKind ?? []));
}

/**
 * The page with one layer's shapes replaced: `ids` gives each pixel's shape (any numbering,
 * gaps allowed) and `colors` each shape's number. Shapes are renumbered from 0 and their
 * number spots found again.
 */
function finish(page: Page, li: number, ids: Uint32Array, colors: number[], kinds: number[]): Page {
  const r = page.layers[li].result;
  const { width: w, height: h } = r;
  const remap = new Map<number, number>();
  const regionColor: number[] = [];
  const regionKind: number[] = [];
  const labels = new Uint16Array(ids.length);
  for (let p = 0; p < ids.length; p++) {
    let to = remap.get(ids[p]);
    if (to === undefined) {
      to = regionColor.length;
      remap.set(ids[p], to);
      regionColor.push(colors[ids[p]]);
      regionKind.push(kinds[ids[p]] ?? 0);
    }
    labels[p] = to;
  }
  const count = regionColor.length;
  const area = new Uint32Array(count);
  for (let p = 0; p < labels.length; p++) area[labels[p]]++;
  const pts = labelPoints(labels, count, w, h, boundaryDistanceAround(labels, w, h, r.faceLines));
  const result: PipelineResult = {
    ...r,
    labels,
    regionCount: count,
    regionColor: Uint8Array.from(regionColor),
    regionArea: area,
    labelX: pts.x,
    labelY: pts.y,
    labelRadius: pts.radius,
    regionKind: Uint8Array.from(regionKind),
  };
  const layers = page.layers.map((l, i) => (i === li ? { ...l, result } : l));
  let shapes = 0;
  for (const { result: lr } of layers) for (let i = 0; i < lr.regionCount; i++) if (!isBlank(lr, i)) shapes++;
  return dropUnusedColors({ ...page, layers, shapes });
}

/**
 * The page without key colors that no shape uses any more (a color someone recolored away
 * entirely), the rest renumbered in order so the key has no gaps. A page's palette is its
 * key (index = number, 0 = blank), so each shape's color index is its number.
 */
function dropUnusedColors(page: Page): Page {
  const used = new Set<number>();
  for (const { result: r } of page.layers) {
    for (let i = 0; i < r.regionCount; i++) if (!isBlank(r, i) && r.regionColor[i] > 0) used.add(r.regionColor[i]);
  }
  if (used.size === page.key.length) return page;
  const renumber = new Map<number, number>();
  const key = page.key.filter((k) => used.has(k.n)).map((k, i) => {
    renumber.set(k.n, i + 1);
    return { n: i + 1, rgb: k.rgb };
  });
  const layers = page.layers.map((l) => {
    const r = l.result;
    const palette: RGB[] = [r.palette[0], ...key.map((k) => k.rgb)];
    const regionColor = Uint8Array.from(r.regionColor, (c) => renumber.get(c) ?? c);
    return { ...l, result: { ...r, palette, regionColor } };
  });
  const numbers = layers.map(({ result: r }) => Uint8Array.from(r.palette, (_, i) => i));
  return { ...page, layers, numbers, key };
}

/** The page with `spot` colored as number `n` (1-based, from the key). */
export function recolor(page: Page, spot: Spot, n: number): Page {
  return rebuild(page, spot.layer, (region) => region, new Map([[spot.region, n]]));
}

/**
 * The page with a new color added to the key (the next number), and that number. Every
 * layer's palette gets it too, so shapes can be colored with it.
 */
export function addColor(page: Page, rgb: RGB): { page: Page; n: number } {
  const n = page.key.length + 1;
  const key = [...page.key, { n, rgb }];
  const layers = page.layers.map((l) => ({ ...l, result: { ...l.result, palette: [...l.result.palette, rgb] } }));
  const numbers = page.numbers.map((nums) => Uint8Array.from([...nums, n]));
  return { page: { ...page, key, layers, numbers }, n };
}

/** What a shape is, in words, and how much of the page it covers (share of the page area). */
export function describe(page: Page, spot: Spot): { part: string; layer: string; size: number } {
  const { result: r, scale } = page.layers[spot.layer];
  const kind = r.regionKind?.[spot.region] ?? 0;
  const layer = page.layers.length > 1 && spot.layer === 0 ? "background" : "main";
  const part = ["other", "skin", "hair", "clothes", "pet"][kind] ?? "other";
  const size = (r.regionArea[spot.region] * scale * scale) / (page.width * page.height);
  return { part: kind === 0 && layer === "background" ? "background" : part, layer, size: Math.round(size * 100000) / 100000 };
}

/** The color number of the shape at `spot`. */
export function numberAt(page: Page, spot: Spot): number {
  const li = spot.layer;
  return page.numbers[li][page.layers[li].result.regionColor[spot.region]];
}

/** How many touching shapes have the same number as `spot` (a line between them could go). */
export function sameColorNeighbors(page: Page, spot: Spot): number {
  const r = page.layers[spot.layer].result;
  const n = r.regionColor[spot.region];
  return [...neighbors(r, spot.region).keys()].filter((nb) => r.regionColor[nb] === n).length;
}

/** The page with every touching shape of the same number joined into `spot`. */
export function joinSameColor(page: Page, spot: Spot): Page {
  const r = page.layers[spot.layer].result;
  const n = r.regionColor[spot.region];
  const same = new Set([...neighbors(r, spot.region).keys()].filter((nb) => r.regionColor[nb] === n));
  return rebuild(page, spot.layer, (region) => (same.has(region) ? spot.region : region));
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

/**
 * The page with the shape under a drawn line cut in two along it, or a reason it can't be done.
 * `line` is the path of the finger in page pixels (x, y pairs). A line that stops short of the
 * shape's edges is carried straight on to them.
 */
export function splitAlong(page: Page, line: [number, number][]): Page | string {
  let length = 0;
  for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  // A tap or a tiny slip of the finger isn't a line.
  if (length < page.width * MIN_LINE) return "Drag a longer line across the shape you want to cut.";
  const mid = line[Math.floor(line.length / 2)];
  const spot = shapeAt(page, mid[0], mid[1]);
  if (!spot) return "Draw the line across a shape.";
  const { result: r, x: lx, y: ly, scale } = page.layers[spot.layer];
  const { width: w, height: h, labels } = r;
  const inShape = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[Math.floor(y) * w + Math.floor(x)] === spot.region;

  // The line in the layer's pixels, carried on past each end until it leaves the shape.
  const pts = line.map(([x, y]) => [(x - lx) / scale, (y - ly) / scale] as [number, number]);
  const extend = (from: [number, number], toward: [number, number]) => {
    const dx = from[0] - toward[0];
    const dy = from[1] - toward[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return from;
    let [x, y] = from;
    for (let i = 0; i < Math.max(w, h) && inShape(x, y); i++) {
      x += dx / len;
      y += dy / len;
    }
    return [x, y] as [number, number];
  };
  const back = Math.min(pts.length - 1, 4);
  pts.unshift(extend(pts[0], pts[back]));
  pts.push(extend(pts[pts.length - 1], pts[pts.length - 1 - back]));

  // Mark the cut: every pixel of the shape the line passes through (sampled finely enough that
  // the cut has no gaps a shape could leak through).
  const cut = new Uint8Array(w * h);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const y = ay + ((by - ay) * s) / steps;
      if (inShape(x, y)) cut[Math.floor(y) * w + Math.floor(x)] = 1;
    }
  }

  // The pieces of the shape on either side of the cut.
  const piece = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== spot.region || cut[start] || piece[start] >= 0) continue;
    const id = sizes.length;
    const stack = [start];
    piece[start] = id;
    let n = 0;
    while (stack.length) {
      const p = stack.pop()!;
      n++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || piece[q] >= 0 || cut[q] || labels[q] !== spot.region) continue;
        piece[q] = id;
        stack.push(q);
      }
    }
    sizes.push(n);
  }
  const real = sizes.filter((n) => n >= MIN_PIECE).length;
  if (real < 2) return "Draw the line all the way across the shape, from one edge to the other.";

  // Crumbs (tiny pieces) and the cut itself join a neighboring real piece.
  const keep = (id: number) => id >= 0 && sizes[id] >= MIN_PIECE;
  let left = true;
  for (let round = 0; left && round < w + h; round++) {
    left = false;
    for (let p = 0; p < labels.length; p++) {
      if (labels[p] !== spot.region || keep(piece[p])) continue;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w].find((q) => q >= 0 && q < w * h && keep(piece[q]));
      if (nb === undefined) left = true;
      else piece[p] = piece[nb];
    }
  }

  // The biggest piece stays the shape; the others become new shapes of the same number.
  let biggest = 0;
  sizes.forEach((n, id) => {
    if (n > sizes[biggest]) biggest = id;
  });
  const colors = Array.from(r.regionColor);
  const kinds = Array.from(r.regionKind ?? []);
  const ids = Uint32Array.from(labels);
  const newId = new Map<number, number>();
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] !== spot.region || piece[p] === biggest) continue;
    let id = newId.get(piece[p]);
    if (id === undefined) {
      id = colors.length;
      colors.push(r.regionColor[spot.region]);
      kinds[id] = r.regionKind?.[spot.region] ?? 0;
      newId.set(piece[p], id);
    }
    ids[p] = id;
  }
  return finish(page, spot.layer, ids, colors, kinds);
}

/** Shortest line that counts, as a share of the page width. */
const MIN_LINE = 0.03;
/** Pieces smaller than this (layer pixels) left by a wobbly line don't count as pieces. */
const MIN_PIECE = 12;

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
