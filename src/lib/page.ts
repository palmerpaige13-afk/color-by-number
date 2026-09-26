// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, rgbToLab } from "@/lib/pipeline/color";
import { boundaryDistance, labelPoints } from "@/lib/pipeline/distance";
import { labelComponents } from "@/lib/pipeline/regions";
import { traceOutlines, type Outline } from "@/lib/outlines";
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
  /** Per layer: palette index -> color number (0 = not numbered). */
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
const DISTINCT = 10;
/** Part kinds (see the pipeline's PartKind). */
const FACE = 1;
const HAIR = 2;
const CLOTHES = 3;
const PET = 4;
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

export function buildPage(
  width: number,
  height: number,
  layers: Layer[],
  fontFrac: number,
  maxColors = Infinity,
): Page {
  // Every color used anywhere, with how much of the page it covers.
  type Entry = { layer: number; index: number; rgb: RGB; area: number; kind: number };
  const entries: Entry[] = [];
  layers.forEach(({ result, scale }, layer) => {
    const area = new Float64Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) area[result.regionColor[i]] += result.regionArea[i] * scale * scale;
    if (result.background !== undefined) area[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (area[index] > 0) entries.push({ layer, index, rgb, area: area[index], kind: result.partKind?.[index] ?? 0 });
    });
  });

  // Merge the two closest colors (their color becomes the area-weighted mix) until every pair
  // is easy to tell apart and there are no more than `maxColors`. Shapes don't change; colors
  // that were barely different just share a number.
  type Cluster = { members: Entry[]; rgb: RGB; lab: Float32Array; area: number; faces: boolean; hair: boolean };
  const toLab = (rgb: RGB) => {
    const lab = new Float32Array(3);
    rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
    return lab;
  };
  let clusters: Cluster[] = entries.map((e) => ({
    members: [e],
    rgb: e.rgb,
    lab: toLab(e.rgb),
    area: e.area,
    faces: e.kind === FACE,
    hair: e.kind === HAIR,
  }));
  // A face and hair never share a number, however close their colors are.
  const canMerge = (a: Cluster, b: Cluster) => !((a.faces && b.hair) || (a.hair && b.faces));
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = labDist2(clusters[i].lab, 0, clusters[j].lab, 0);
        if (d < bd && canMerge(clusters[i], clusters[j])) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || (bd >= DISTINCT * DISTINCT && clusters.length <= maxColors)) break;
    const [a, b] = [clusters[bi], clusters[bj]];
    const area = a.area + b.area;
    const rgb = a.rgb.map((v, c) => Math.round((v * a.area + b.rgb[c] * b.area) / area)) as RGB;
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push({
      members: [...a.members, ...b.members],
      rgb,
      lab: toLab(rgb),
      area,
      faces: a.faces || b.faces,
      hair: a.hair || b.hair,
    });
  }

  // Numbered dark to light.
  clusters.sort((a, b) => a.lab[0] - b.lab[0]);
  const numbers = layers.map(({ result }) => new Uint8Array(result.palette.length));
  const key = clusters.map((c, i) => {
    for (const m of c.members) numbers[m.layer][m.index] = i + 1;
    return { n: i + 1, rgb: c.rgb };
  });

  // Neighboring shapes that ended up with the same number become one shape: in each layer,
  // shapes are re-found from the numbers themselves. A person's skin, hair and clothes (and a
  // pet) stay apart from each other and from the background even with the same number, so
  // every person keeps their outline. Each layer's palette becomes the key
  // (index = number, 0 = blank background).
  const palette: RGB[] = [[255, 255, 255], ...key.map((k) => k.rgb)];
  const merged = layers.map((layer, li) => {
    const { result } = layer;
    const { width: w, height: h, labels } = result;
    const byNumber = new Uint8Array(w * h);
    const owner = new Uint8Array(w * h);
    const ownerOf = (c: number) => {
      const kind = result.partKind?.[c];
      return kind === FACE || kind === HAIR || kind === CLOTHES || kind === PET ? (result.partGroup?.[c] ?? 0) : 0;
    };
    for (let p = 0; p < byNumber.length; p++) {
      const c = result.regionColor[labels[p]];
      byNumber[p] = c === result.background ? 0 : numbers[li][c];
      owner[p] = ownerOf(c);
    }
    const comps = labelComponents(byNumber, w, h, owner);
    const newLabels = Uint16Array.from(comps.labels);
    const pts = labelPoints(newLabels, comps.count, w, h, boundaryDistance(newLabels, w, h));
    const next: PipelineResult = {
      ...result,
      palette,
      labels: newLabels,
      regionCount: comps.count,
      regionColor: comps.color,
      regionArea: comps.area,
      labelX: pts.x,
      labelY: pts.y,
      labelRadius: pts.radius,
      background: result.background === undefined ? undefined : 0,
    };
    return { ...layer, result: next };
  });
  const identity = merged.map(() => Uint8Array.from(palette, (_, i) => i));

  let shapes = 0;
  for (const { result } of merged) {
    for (let i = 0; i < result.regionCount; i++) if (result.regionColor[i] !== 0) shapes++;
  }
  return { width, height, layers: merged, numbers: identity, key, shapes, fontFrac };
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
    const color = (index: number) => page.key[page.numbers[li][index] - 1]?.rgb ?? result.palette[index];
    const blank = (l: number) => regionColor[l] === result.background;

    // Fill each shape (at page resolution); outlines are drawn afterwards as smooth lines.
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
        const l = labels[at(X, Y)];
        if (blank(l)) continue; // leave whatever is underneath
        const rgb: RGB = view === "colored" ? color(regionColor[l]) : [255, 255, 255];
        const q = (Y * W + X) * 4;
        img.data[q] = rgb[0];
        img.data[q + 1] = rgb[1];
        img.data[q + 2] = rgb[2];
      }
    }
  });
  ctx.putImageData(img, 0, 0);

  // Outlines: smooth lines along every border between shapes (and around a cut-out).
  ctx.strokeStyle = `rgb(${EDGE.join(",")})`;
  ctx.lineWidth = Math.max(1, W / 1500);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  placed.forEach((layer) => {
    ctx.beginPath();
    for (const line of layerOutlines(layer.result, layer.outlineBlank)) {
      ctx.moveTo(layer.x + line[0] * layer.scale, layer.y + line[1] * layer.scale);
      for (let i = 2; i < line.length; i += 2) {
        ctx.lineTo(layer.x + line[i] * layer.scale, layer.y + line[i + 1] * layer.scale);
      }
    }
    ctx.stroke();
  });

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
        String(page.numbers[li][result.regionColor[i]]),
        layer.x + result.labelX[i] * scale,
        layer.y + result.labelY[i] * scale,
      );
    }
  });
}

/** Traced outlines per layer result (they don't depend on the drawing size, so reuse them). */
const outlineCache = new WeakMap<PipelineResult, Map<boolean, Outline[]>>();

function layerOutlines(result: PipelineResult, outlineBlank: boolean): Outline[] {
  let byMode = outlineCache.get(result);
  if (!byMode) outlineCache.set(result, (byMode = new Map()));
  let lines = byMode.get(outlineBlank);
  if (!lines) {
    const { regionColor, background } = result;
    const blank = (l: number) => regionColor[l] === background;
    // A scene under a cut-out doesn't outline its hole: the people layer on top does.
    lines = traceOutlines(result.labels, result.width, result.height, (a, b) => outlineBlank || (!blank(a) && !blank(b)));
    byMode.set(outlineBlank, lines);
  }
  return lines;
}
