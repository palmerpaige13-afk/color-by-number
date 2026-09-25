// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, rgbToLab } from "@/lib/pipeline/color";
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
}

/** Colors from different layers closer than this (ΔE) share a number. */
const SAME_COLOR = 7;
/** Smallest number drawn, in page pixels. Smaller shapes are printed already colored in. */
export const MIN_FONT = 6.5;
const MAX_FONT = 26;

export function buildPage(width: number, height: number, layers: Layer[]): Page {
  // Every color used anywhere, dark to light, then numbered, merging near-identical colors.
  const entries: { layer: number; index: number; rgb: RGB; lab: Float32Array }[] = [];
  layers.forEach(({ result }, layer) => {
    const used = new Uint8Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) used[result.regionColor[i]] = 1;
    if (result.background !== undefined) used[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (!used[index]) return;
      const lab = new Float32Array(3);
      rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
      entries.push({ layer, index, rgb, lab });
    });
  });
  entries.sort((a, b) => a.lab[0] - b.lab[0]);

  const numbers = layers.map(({ result }) => new Uint8Array(result.palette.length));
  const key: { n: number; rgb: RGB; lab: Float32Array }[] = [];
  for (const e of entries) {
    let match = key.find((k) => labDist2(k.lab, 0, e.lab, 0) < SAME_COLOR * SAME_COLOR);
    if (!match) {
      match = { n: key.length + 1, rgb: e.rgb, lab: e.lab };
      key.push(match);
    }
    numbers[e.layer][e.index] = match.n;
  }

  let shapes = 0;
  for (const { result } of layers) {
    for (let i = 0; i < result.regionCount; i++) if (result.regionColor[i] !== result.background) shapes++;
  }
  return { width, height, layers, numbers, key: key.map(({ n, rgb }) => ({ n, rgb })), shapes };
}

const EDGE: RGB = [70, 70, 70];

export function drawPage(canvas: HTMLCanvasElement, page: Page, view: "outline" | "colored") {
  const W = Math.round(page.width);
  const H = Math.round(page.height);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  img.data.fill(255);

  page.layers.forEach((layer, li) => {
    const { result, scale } = layer;
    const { width: w, height: h, labels, regionColor } = result;
    const color = (index: number) => page.key[page.numbers[li][index] - 1]?.rgb ?? result.palette[index];
    const blank = (l: number) => regionColor[l] === result.background;
    const tiny = new Uint8Array(result.regionCount);
    for (let i = 0; i < result.regionCount; i++) {
      tiny[i] = !blank(i) && result.labelRadius[i] * scale * 1.1 < MIN_FONT ? 1 : 0;
    }

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
        const right = X + 1 < x1 ? labels[at(X + 1, Y)] : l;
        const down = Y + 1 < y1 ? labels[at(X, Y + 1)] : l;
        const edgeWith = (o: number) => o !== l && (layer.outlineBlank || (!blank(o) && !blank(l)));
        const edge = edgeWith(right) || edgeWith(down);
        let rgb: RGB | null;
        if (blank(l)) rgb = edge ? EDGE : null;
        else if (tiny[l]) rgb = color(regionColor[l]);
        else if (edge) rgb = EDGE;
        else if (result.detailLines?.[p]) rgb = view === "colored" ? [90, 90, 90] : [150, 150, 150];
        else rgb = view === "colored" ? color(regionColor[l]) : [255, 255, 255];
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
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  page.layers.forEach((layer, li) => {
    const { result, scale } = layer;
    // Pet noses and eyes: already colored in, with a small highlight.
    for (const n of result.noses ?? []) {
      const nx = layer.x + n.x * scale;
      const ny = layer.y + n.y * scale;
      const rx = Math.max(2.5, n.rx * scale);
      const ry = Math.max(2, n.ry * scale);
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.ellipse(nx, ny, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.ellipse(nx - rx * 0.3, ny - ry * 0.35, rx * 0.3, ry * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of result.eyes ?? []) {
      const ex = layer.x + e.x * scale;
      const ey = layer.y + e.y * scale;
      const r = Math.max(2.5, e.r * scale);
      // A light rim so the eye still shows on dark fur, then the eye and its shine.
      ctx.fillStyle = "#c9c2b8";
      ctx.beginPath();
      ctx.arc(ex, ey, r + Math.max(1, r * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex - r * 0.35, ey - r * 0.35, Math.max(1, r * 0.35), 0, Math.PI * 2);
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
