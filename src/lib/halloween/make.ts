// A ready-made drawing as a color-by-number page. The drawing is drawn on a grid without
// smoothing, so every pixel is exactly one of its paint colors; each connected patch of one
// color is a shape, numbered by its color. The page is the same kind as a photo's, so it's
// drawn, printed and keyed the same way; only the ink details are added on top.

import { drawPage, minLabelRadius, type Page } from "@/lib/page";
import { boundaryDistance, labelPoints } from "@/lib/pipeline/distance";
import { labelComponents } from "@/lib/pipeline/regions";
import { rgbToLab } from "@/lib/pipeline/color";
import type { PipelineResult, RGB } from "@/lib/pipeline";
import { INK, SIZE, type HalloweenDesign } from "./designs";

/** Grid the drawing is cut into shapes on (pixels a side). */
const GRID = 1200;
/** Patches smaller than this many grid pixels (where shapes just touch) join a neighbor. */
const MIN_PATCH = 80;

export interface HalloweenPage {
  design: HalloweenDesign;
  page: Page;
  /** Shapes too small to hold a readable number (should be none). */
  unnumbered: number;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function svg(body: string, px: number, crisp: boolean) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${px}" height="${px}"` +
    `${crisp ? ' shape-rendering="crispEdges"' : ""}>${body}</svg>`
  );
}

function loadSvg(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't draw the picture"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

/** Paint colors used in the drawing, in order of first use. */
function paints(design: HalloweenDesign): string[] {
  const found = [...design.shapes.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
  return [...new Set(found)];
}

/**
 * Patches smaller than MIN_PATCH take the color most of their border touches, until none
 * are left (slivers where two shapes just meet, a corner of a star).
 */
function joinSpecks(map: Uint8Array, w: number, h: number) {
  for (let round = 0; round < 4; round++) {
    const { labels, count, area } = labelComponents(map, w, h);
    const small = (l: number) => area[l] < MIN_PATCH;
    let changed = false;
    const votes = new Map<number, Map<number, number>>();
    for (let p = 0; p < w * h; p++) {
      const l = labels[p];
      if (!small(l)) continue;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || labels[q] === l) continue;
        const v = votes.get(l) ?? new Map<number, number>();
        v.set(map[q], (v.get(map[q]) ?? 0) + 1);
        votes.set(l, v);
      }
    }
    const to = new Int16Array(count).fill(-1);
    for (const [l, v] of votes) to[l] = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (let p = 0; p < w * h; p++) {
      const t = to[labels[p]];
      if (t >= 0 && t !== map[p]) {
        map[p] = t;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * Shapes too thin to hold a number (where a background line just grazes a shape) take the
 * color of the neighbor they share the most border with. Paper and ink are left as they are.
 */
function joinThin(map: Uint8Array, w: number, h: number, minRadius: number) {
  for (let round = 0; round < 3; round++) {
    const { labels, count, color } = labelComponents(map, w, h);
    const { radius } = labelPoints(labels, count, w, h, boundaryDistance(labels, w, h));
    const thin = (l: number) => color[l] !== 0 && radius[l] < minRadius;
    const votes = new Map<number, Map<number, number>>();
    for (let p = 0; p < w * h; p++) {
      const l = labels[p];
      if (!thin(l)) continue;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || map[q] === 0 || labels[q] === l) continue;
        const v = votes.get(l) ?? new Map<number, number>();
        v.set(map[q], (v.get(map[q]) ?? 0) + 1);
        votes.set(l, v);
      }
    }
    if (!votes.size) break;
    const to = new Int16Array(count).fill(-1);
    for (const [l, v] of votes) to[l] = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (let p = 0; p < w * h; p++) if (to[labels[p]] >= 0) map[p] = to[labels[p]];
  }
}

/** The color-by-number page of `design`, with numbers at least `fontFrac` of the page width. */
export async function makeHalloweenPage(design: HalloweenDesign, fontFrac: number): Promise<HalloweenPage> {
  const colors = paints(design);
  // Palette: 0 is the paper (and the ink, both left uncolored), then the paints.
  const rgbs = colors.map(hex);
  const ink = hex(INK);

  const img = await loadSvg(svg(design.shapes + design.ink, GRID, true));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GRID;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.drawImage(img, 0, 0, GRID, GRID);
  const data = ctx.getImageData(0, 0, GRID, GRID).data;

  // Each pixel to its nearest paint (0 for paper or ink; ink is 255 until specks are joined,
  // so a fleck of ink inside a shape doesn't split it).
  const INK_ID = 255;
  const choices: [number, RGB][] = [[0, [255, 255, 255]], [INK_ID, ink], ...rgbs.map((c, i): [number, RGB] => [i + 1, c])];
  const map = new Uint8Array(GRID * GRID);
  const memo = new Map<number, number>();
  for (let p = 0; p < map.length; p++) {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    const k = (r << 16) | (g << 8) | b;
    let best = memo.get(k);
    if (best === undefined) {
      let bd = Infinity;
      for (const [id, c] of choices) {
        const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      memo.set(k, best!);
    }
    map[p] = best!;
  }
  joinSpecks(map, GRID, GRID);
  for (let p = 0; p < map.length; p++) if (map[p] === INK_ID) map[p] = 0;
  const minRadius = minLabelRadius(GRID, 1, fontFrac);
  joinThin(map, GRID, GRID, minRadius);

  const comps = labelComponents(map, GRID, GRID);
  const labels = Uint16Array.from(comps.labels);
  const pts = labelPoints(labels, comps.count, GRID, GRID, boundaryDistance(labels, GRID, GRID));
  const palette: RGB[] = [[255, 255, 255], ...rgbs];
  const result: PipelineResult = {
    width: GRID,
    height: GRID,
    palette,
    regionCount: comps.count,
    labels,
    regionColor: comps.color,
    regionArea: comps.area,
    labelX: pts.x,
    labelY: pts.y,
    labelRadius: pts.radius,
    background: 0,
    timings: {},
  };

  // Numbered dark to light, like photo pages; only the colors still on the page.
  const used = new Set(comps.color);
  const lab = new Float32Array(3);
  const order = rgbs
    .map((rgb, i) => {
      rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
      return { index: i + 1, rgb, L: lab[0] };
    })
    .filter((c) => used.has(c.index))
    .sort((a, b) => a.L - b.L);
  const numbers = new Uint8Array(palette.length);
  const key = order.map((c, i) => {
    numbers[c.index] = i + 1;
    return { n: i + 1, rgb: c.rgb };
  });

  let shapes = 0;
  let unnumbered = 0;
  for (let i = 0; i < comps.count; i++) {
    if (comps.color[i] === 0) continue;
    shapes++;
    if (pts.radius[i] < minRadius) unnumbered++;
  }

  const page: Page = {
    width: GRID,
    height: GRID,
    layers: [{ result, x: 0, y: 0, scale: 1, outlineBlank: true }],
    numbers: [numbers],
    key,
    shapes,
    fontFrac,
  };
  return { design, page, unnumbered };
}

/** Ink drawings already made, by design and size. */
const inkCache = new Map<string, Promise<HTMLImageElement>>();

/** Draws the page (see drawPage), then its ink details on top, crisp at any size. */
export async function drawHalloweenPage(canvas: HTMLCanvasElement, hp: HalloweenPage, view: "outline" | "colored", pxScale = 1) {
  drawPage(canvas, hp.page, view, pxScale);
  const px = canvas.width;
  const id = `${hp.design.id}@${px}`;
  let ink = inkCache.get(id);
  if (!ink) inkCache.set(id, (ink = loadSvg(svg(hp.design.ink, px, false))));
  canvas.getContext("2d")!.drawImage(await ink, 0, 0, px, canvas.height);
}

/** The drawing in full color, as an SVG (for the gallery). */
export const previewSvg = (design: HalloweenDesign) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${design.shapes}${design.ink}</svg>`;
