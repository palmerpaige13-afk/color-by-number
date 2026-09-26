// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, labToRgb, rgbToLab } from "@/lib/pipeline/color";
import type { PipelineResult, RGB } from "@/lib/pipeline";

export interface Layer {
  result: PipelineResult;
  /** Top-left of the layer on the page, in page pixels. */
  x: number;
  y: number;
  /** Page pixels per working pixel of this layer. */
  scale: number;
  /** Draw the outline where this layer meets its own blank (cut-out) area. */
  outlineBlank: boolean;
}

export interface Page {
  width: number;
  height: number;
  /** Bottom to top. */
  layers: Layer[];
  /** Per layer: region -> color number (0 = the blank background, not numbered). */
  numbers: Uint8Array[];
  key: { n: number; rgb: RGB }[];
  /** Number of shapes to color, over all layers. */
  shapes: number;
  /** Smallest readable number as a share of the page width, set by the print size. */
  fontFrac: number;
}

/**
 * Every pair of colors in the key must differ by at least this (ΔE, where about 10 is the
 * smallest difference that's easy to see on paper); closer colors share one number.
 */
const DISTINCT = 14;
/**
 * To keep a page from falling under its fewest colors, colors are only merged below that count
 * when they're closer than this (hard to tell apart at all); background variations may also go
 * this close to other colors.
 */
const MIN_DISTINCT = 9;
/** A background variation stays within this ΔE of the color it varies. */
const VARIATION_MAX = 20;
/**
 * Smallest readable number, in page pixels: a share of the page width (`fontFrac`, from the
 * print size), so it prints at a readable size however the page is scaled. The pipeline
 * merges away shapes too small for it; the coloring page itself is never colored in (only a
 * pet's black eyes and nose are).
 */
export const minFont = (pageWidth: number, fontFrac: number) => pageWidth * fontFrac;
/** Label radius (working px) a layer's shapes need for a readable number at `scale`. */
export const minLabelRadius = (pageWidth: number, scale: number, fontFrac: number) =>
  minFont(pageWidth, fontFrac) / (1.1 * scale);
/** Largest number, as a multiple of the smallest. */
const MAX_FONT_RATIO = 2.4;

/**
 * `colors` is the fewest colors the key should have: a colorful photo may have more, and one
 * with fewer distinct colors gets gentle variations in the background (layer `vary`).
 */
export function buildPage(
  width: number,
  height: number,
  layers: Layer[],
  fontFrac: number,
  colors = Infinity,
  vary?: number,
): Page {
  // Every color used anywhere, with how much of the page it covers.
  type Entry = { layer: number; index: number; rgb: RGB; area: number };
  const entries: Entry[] = [];
  layers.forEach(({ result, scale }, layer) => {
    const area = new Float64Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) area[result.regionColor[i]] += result.regionArea[i] * scale * scale;
    if (result.background !== undefined) area[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (area[index] > 0) entries.push({ layer, index, rgb, area: area[index] });
    });
  });

  // Merge the two closest colors (their color becomes the area-weighted mix) until every pair
  // is easy to tell apart, or, once at the page's fewest colors, until no two are nearly the
  // same. Shapes don't change; colors that were barely different just share a number.
  type Cluster = { members: Entry[]; rgb: RGB; lab: Float32Array; area: number };
  const toLab = (rgb: RGB) => {
    const lab = new Float32Array(3);
    rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
    return lab;
  };
  let clusters: Cluster[] = entries.map((e) => ({ members: [e], rgb: e.rgb, lab: toLab(e.rgb), area: e.area }));
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = labDist2(clusters[i].lab, 0, clusters[j].lab, 0);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || bd >= DISTINCT * DISTINCT) break;
    if (clusters.length <= colors && bd >= MIN_DISTINCT * MIN_DISTINCT) break;
    const [a, b] = [clusters[bi], clusters[bj]];
    const area = a.area + b.area;
    const rgb = a.rgb.map((v, c) => Math.round((v * a.area + b.rgb[c] * b.area) / area)) as RGB;
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push({ members: [...a.members, ...b.members], rgb, lab: toLab(rgb), area });
  }

  // Per-region color numbers (palette index -> cluster), then background variations.
  const byIndex = layers.map(({ result }) => new Int16Array(result.palette.length).fill(-1));
  clusters.forEach((c, ci) => c.members.forEach((m) => (byIndex[m.layer][m.index] = ci)));
  const colorsList = clusters.map((c) => ({ rgb: c.rgb, lab: c.lab }));
  const regionColor = layers.map(({ result }, li) =>
    Int16Array.from(result.regionColor, (c) => (c === result.background ? -1 : byIndex[li][c])),
  );
  if (vary !== undefined && Number.isFinite(colors)) addVariations(layers[vary].result, regionColor[vary], colorsList, colors);

  // Numbered dark to light.
  const order = colorsList.map((c, i) => ({ c, i })).sort((a, b) => a.c.lab[0] - b.c.lab[0]);
  const numberOf = new Uint8Array(colorsList.length);
  order.forEach(({ i }, rank) => (numberOf[i] = rank + 1));
  const key = order.map(({ c }, rank) => ({ n: rank + 1, rgb: c.rgb }));
  const numbers = regionColor.map((rc) => Uint8Array.from(rc, (c) => (c < 0 ? 0 : numberOf[c])));

  let shapes = 0;
  for (const { result } of layers) {
    for (let i = 0; i < result.regionCount; i++) if (result.regionColor[i] !== result.background) shapes++;
  }
  return { width, height, layers, numbers, key, shapes, fontFrac };
}

const EDGE: RGB = [70, 70, 70];

/**
 * Draws the page at `pxScale` times its layout size (1 for the screen, more for printing).
 * Lines stay thin but visible at any resolution; numbers keep their printed size.
 */
export function drawPage(canvas: HTMLCanvasElement, page: Page, view: "outline" | "colored", pxScale = 1) {
  const W = Math.round(page.width * pxScale);
  const H = Math.round(page.height * pxScale);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  img.data.fill(255);

  const MIN_FONT = minFont(W, page.fontFrac);
  const MAX_FONT = MIN_FONT * MAX_FONT_RATIO;
  /** Line thickness in pixels: about 0.2 mm when printed. */
  const t = Math.max(1, Math.round(W / 1800));
  const placed = page.layers.map((l) => ({ ...l, x: l.x * pxScale, y: l.y * pxScale, scale: l.scale * pxScale }));
  placed.forEach((layer, li) => {
    const { result, scale } = layer;
    const { width: w, height: h, labels, regionColor } = result;
    const color = (region: number) => page.key[page.numbers[li][region] - 1]?.rgb ?? [255, 255, 255];
    const blank = (l: number) => regionColor[l] === result.background;

    // Walk the layer's area in page pixels, so lines are one page pixel wide at any scale.
    const x0 = Math.max(0, Math.floor(layer.x));
    const y0 = Math.max(0, Math.floor(layer.y));
    const x1 = Math.min(W, Math.ceil(layer.x + w * scale));
    const y1 = Math.min(H, Math.ceil(layer.y + h * scale));
    const at = (X: number, Y: number) => {
      const lx = Math.min(w - 1, Math.max(0, Math.floor((X + 0.5 - layer.x) / scale)));
      const ly = Math.min(h - 1, Math.max(0, Math.floor((Y + 0.5 - layer.y) / scale)));
      return ly * w + lx;
    };
    for (let Y = y0; Y < y1; Y++) {
      for (let X = x0; X < x1; X++) {
        const p = at(X, Y);
        const l = labels[p];
        const right = X + t < x1 ? labels[at(X + t, Y)] : l;
        const down = Y + t < y1 ? labels[at(X, Y + t)] : l;
        const edgeWith = (o: number) => o !== l && (layer.outlineBlank || (!blank(o) && !blank(l)));
        const edge = edgeWith(right) || edgeWith(down);
        let rgb: RGB | null;
        if (blank(l)) rgb = edge ? EDGE : null;
        else if (edge) rgb = EDGE;
        else rgb = view === "colored" ? color(l) : [255, 255, 255];
        if (!rgb) continue; // leave whatever is underneath
        const q = (Y * W + X) * 4;
        img.data[q] = rgb[0];
        img.data[q + 1] = rgb[1];
        img.data[q + 2] = rgb[2];
      }
    }
  });
  ctx.putImageData(img, 0, 0);

  // Frame a full scene; a cut-out stands on its own.
  const bottom = page.layers[0]?.result;
  if (bottom && bottom.background === undefined) {
    ctx.strokeStyle = "#464646";
    ctx.lineWidth = t;
    ctx.strokeRect(t / 2, t / 2, W - t, H - t);
  }

  placed.forEach((layer, li) => {
    const { result, scale } = layer;
    // Pet eyes and nose: plain black spots, printed already filled in, to color around.
    ctx.fillStyle = "#111";
    for (const n of result.noses ?? []) {
      ctx.beginPath();
      ctx.ellipse(layer.x + n.x * scale, layer.y + n.y * scale, Math.max(2 * t, n.rx * scale), Math.max(1.6 * t, n.ry * scale), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of result.eyes ?? []) {
      ctx.beginPath();
      ctx.arc(layer.x + e.x * scale, layer.y + e.y * scale, Math.max(2 * t, e.r * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    if (view === "colored") return;
    ctx.fillStyle = "#555";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < result.regionCount; i++) {
      if (result.regionColor[i] === result.background) continue;
      const size = Math.min(MAX_FONT, result.labelRadius[i] * scale * 1.1);
      if (size < MIN_FONT) continue;
      ctx.font = `${Math.round(size)}px Arial, sans-serif`;
      ctx.fillText(
        String(page.numbers[li][i]),
        layer.x + result.labelX[i] * scale,
        layer.y + result.labelY[i] * scale,
      );
    }
  });
}

/**
 * Adds colors until there are `target`, each a gentle variation of a background color with
 * the same hue: the farther (upper) half of that color's shapes gets a slightly lighter,
 * softer version, as distance haze would give it (or, if that's too close to another color, a
 * slightly darker, richer or softer one). Greens stay green and blues stay blue. A variation is
 * always clearly different from every other color but stays close to the color it came from. `regionColor` (color index per region) is updated.
 */
function addVariations(
  result: PipelineResult,
  regionColor: Int16Array,
  colors: { rgb: RGB; lab: Float32Array }[],
  target: number,
) {
  const tried = new Set<number>();
  while (colors.length < target) {
    // The background color covering the most area across at least two shapes.
    const area = new Float64Array(colors.length);
    const count = new Uint32Array(colors.length);
    for (let i = 0; i < result.regionCount; i++) {
      const c = regionColor[i];
      if (c < 0 || tried.has(c)) continue;
      area[c] += result.regionArea[i];
      count[c]++;
    }
    let pick = -1;
    for (let c = 0; c < colors.length; c++) if (count[c] >= 2 && (pick < 0 || area[c] > area[pick])) pick = c;
    if (pick < 0) return;
    tried.add(pick);

    const base = colors[pick].lab;
    const [L, a, b] = base;
    // Same hue, always: haze first (lighter, softer), then darker, then richer or softer at
    // the same lightness, each at two strengths; the first that's clearly its own color wins.
    const options: [number, number, number][] = [];
    for (const k of [1, 1.4]) {
      options.push(
        [L + 11 * k, a * (1 - 0.15 * k), b * (1 - 0.15 * k)],
        [L - 11 * k, a * (1 + 0.1 * k), b * (1 + 0.1 * k)],
        [L + 4 * k, a * (1 + 0.35 * k), b * (1 + 0.35 * k)],
        [L - 4 * k, a * (1 - 0.35 * k), b * (1 - 0.35 * k)],
      );
    }
    const variant = options
      .map(([l, aa, bb]) => ({ ...labToRgb(l, aa, bb), lab: new Float32Array([l, aa, bb]) }))
      .find(
        (v) =>
          v.inGamut &&
          labDist2(v.lab, 0, base, 0) <= VARIATION_MAX * VARIATION_MAX &&
          colors.every((c) => labDist2(v.lab, 0, c.lab, 0) >= MIN_DISTINCT * MIN_DISTINCT),
      );
    if (!variant) continue;

    // The upper (farther) half of this color's shapes, by area, takes the variation.
    const shapes = [];
    for (let i = 0; i < result.regionCount; i++) if (regionColor[i] === pick) shapes.push(i);
    shapes.sort((i, j) => result.labelY[i] - result.labelY[j]);
    const half = area[pick] / 2;
    const index = colors.length;
    colors.push({ rgb: variant.rgb, lab: toLab(variant.rgb) });
    let moved = 0;
    for (const i of shapes) {
      if (moved >= half && moved > 0) break;
      regionColor[i] = index;
      moved += result.regionArea[i];
    }
  }
}

function toLab(rgb: RGB) {
  const lab = new Float32Array(3);
  rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
  return lab;
}
