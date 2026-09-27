// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, labInGamut, labToRgb, rgbToLab } from "@/lib/pipeline/color";
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
 * By default, every pair of colors in the key must differ by at least this (ΔE, where about
 * 10 is the smallest difference that's easy to see on paper); closer colors share one number.
 */
const DISTINCT = 10;
/**
 * Photos lose some color on the way to a handful of paints (averaging, smoothing), so the
 * paint colors are made livelier: more saturated, by LIVELY (skin a little less, so faces
 * don't turn orange). Grays stay gray. Light warm colors (blond hair, sand, sunlit grass) get
 * a little extra yellow.
 */
const LIVELY = 1.3;
const LIVELY_SKIN = 1.12;
const WARM_YELLOW = 1.12;
function lively(c: { lab: Float32Array; faces: boolean; hair: boolean }): RGB {
  const [L, a, b] = c.lab;
  const k = c.faces ? LIVELY_SKIN : LIVELY;
  const warm = !c.faces && L > 55 && b > 8 && b > a ? WARM_YELLOW : 1;
  // Boost only as far as the screen can show: past that, a channel clips and the color
  // shifts (a bright orange turns red), so back off until it fits.
  let t = 1;
  if (!labInGamut(L, a * k, b * k * warm)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (labInGamut(L, a * (1 + (k - 1) * mid), b * (1 + (k * warm - 1) * mid))) lo = mid;
      else hi = mid;
    }
    t = lo;
  }
  return labToRgb(L, a * (1 + (k - 1) * t), b * (1 + (k * warm - 1) * t));
}

/**
 * Background colors in a warm photo (golden light on dry brush) all come out as tans and
 * browns, close to each other. With `cool` > 0, some are nudged toward cooler colors, the way
 * a painter would: muted olive and khaki tones (foliage washed out by warm light) turn toward
 * soft sage green, and pale washed-out tones get a light blue tint. Saturated golds and warm
 * browns stay as they are. `cool` 0 leaves everything alone; 1 is the full nudge.
 */
function coolBoost(rgb: RGB, cool: number): RGB {
  if (cool <= 0) return rgb;
  const lab = new Float32Array(3);
  rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
  const L = lab[0];
  let a = lab[1];
  let b = lab[2];
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (chroma < COOL_OLIVE_CHROMA && hue > 55 && hue < 120 && L > 20 && L < 80) {
    // Olive and khaki: turn toward sage green, more for the more muted.
    const t = cool * (1 - chroma / COOL_OLIVE_CHROMA);
    const h = ((hue + (COOL_GREEN_HUE - hue) * Math.min(1, t * 1.2)) * Math.PI) / 180;
    const c = Math.max(chroma, 10 * t) * (1 + 0.3 * t);
    a = c * Math.cos(h);
    b = c * Math.sin(h);
  } else if (L >= 80 && chroma < COOL_PALE_CHROMA) {
    // Pale and washed out: a light blue tint.
    a -= 2 * cool;
    b -= 9 * cool;
  } else {
    return rgb;
  }
  return labToRgb(L, a, b);
}
/** Foliage tones: Lab chroma below this; they turn toward this hue (degrees, a sage green). */
const COOL_OLIVE_CHROMA = 30;
const COOL_GREEN_HUE = 135;
/** Pale tones: Lab chroma below this get a blue tint. */
const COOL_PALE_CHROMA = 14;

/** Skin colors closer than this (ΔE) share a number: a person's arms and legs are exact copies of their face color; different people's skin never is. */
const SAME_SKIN = 0.5;
/** Different people's skin colors are kept at least this far apart (ΔE), nudging lightness. */
const MIN_SKIN_GAP = 7;

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
  distinct = DISTINCT,
  cool = 0,
  maxColors = Infinity,
): Page {
  // Every color used anywhere, with how much of the page it covers.
  type Entry = { layer: number; index: number; rgb: RGB; area: number; kind: number; face?: string };
  const entries: Entry[] = [];
  layers.forEach(({ result, scale }, layer) => {
    const area = new Float64Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) area[result.regionColor[i]] += result.regionArea[i] * scale * scale;
    if (result.background !== undefined) area[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (area[index] <= 0) return;
      const kind = result.partKind?.[index] ?? 0;
      const face = kind === FACE ? `${layer}:${result.partGroup?.[index] ?? 0}` : undefined;
      entries.push({ layer, index, rgb: kind ? rgb : coolBoost(rgb, cool), area: area[index], kind, face });
    });
  });

  // Which people's skin touches someone else's (a cheek-to-cheek hug, a child in arms): only
  // those need their own numbers; people standing apart can share one.
  const touching = new Set<string>();
  layers.forEach(({ result }, layer) => {
    const { width: w, height: h, labels, regionColor, partKind, partGroup } = result;
    const skinOf = (p: number) => {
      const c = regionColor[labels[p]];
      return partKind?.[c] === FACE ? `${layer}:${partGroup?.[c] ?? 0}` : null;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const a = skinOf(p);
        if (!a) continue;
        for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
          const b = q >= 0 ? skinOf(q) : null;
          if (b && b !== a) touching.add(`${a}|${b}`).add(`${b}|${a}`);
        }
      }
    }
  });
  const touch = (a: Set<string>, b: Set<string>) => [...a].some((x) => [...b].some((y) => touching.has(`${x}|${y}`)));

  // Merge the two closest colors (their color becomes the area-weighted mix) until every pair
  // is easy to tell apart and there are no more than `maxColors`. Shapes don't change; colors
  // that were barely different just share a number.
  type Cluster = {
    members: Entry[];
    rgb: RGB;
    lab: Float32Array;
    area: number;
    faces: boolean;
    hair: boolean;
    /** The faces (and skin) whose colors are in this cluster. */
    who: Set<string>;
  };
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
    who: new Set(e.face ? [e.face] : []),
  }));
  // A face and hair never share a number, however close their colors are. The skin of two
  // people who touch shares a number only if it's exactly the same color, so faces cheek to
  // cheek don't read as one face. (A person's arms and legs are exact copies of their face's
  // color, so they still join it.)
  const canMerge = (a: Cluster, b: Cluster, d2: number) => {
    if ((a.faces && b.hair) || (a.hair && b.faces)) return false;
    if (a.who.size && b.who.size && touch(a.who, b.who)) return d2 < SAME_SKIN * SAME_SKIN;
    return true;
  };
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = labDist2(clusters[i].lab, 0, clusters[j].lab, 0);
        if (d < bd && canMerge(clusters[i], clusters[j], d)) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || (bd >= distinct * distinct && clusters.length <= maxColors)) break;
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
      who: new Set([...a.who, ...b.who]),
    });
  }

  // Touching people's skin that came out nearly the same color is nudged apart in lightness
  // (the lighter a little lighter, the darker a little darker), so two faces side by side
  // read as two faces.
  for (let round = 0; round < 3; round++) {
    for (const a of clusters) {
      for (const b of clusters) {
        if (a === b || !a.who.size || !b.who.size || !touch(a.who, b.who) || [...a.who].some((f) => b.who.has(f))) continue;
        const d = Math.sqrt(labDist2(a.lab, 0, b.lab, 0));
        if (d >= MIN_SKIN_GAP) continue;
        const [light, dark] = a.lab[0] >= b.lab[0] ? [a, b] : [b, a];
        const push = (MIN_SKIN_GAP - d) / 2;
        for (const [c, dl] of [[light, push], [dark, -push]] as const) {
          c.lab[0] = Math.min(95, Math.max(5, c.lab[0] + dl));
          c.rgb = labToRgb(c.lab[0], c.lab[1], c.lab[2]);
        }
      }
    }
  }

  // Numbered dark to light.
  clusters.sort((a, b) => a.lab[0] - b.lab[0]);
  const numbers = layers.map(({ result }) => new Uint8Array(result.palette.length));
  const key = clusters.map((c, i) => {
    for (const m of c.members) numbers[m.layer][m.index] = i + 1;
    return { n: i + 1, rgb: lively(c) };
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
    const regionKind = new Uint8Array(comps.count);
    for (let p = 0; p < newLabels.length; p++) regionKind[newLabels[p]] = result.partKind?.[result.regionColor[labels[p]]] ?? 0;
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
      regionKind,
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
