// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, labInGamut, labToRgb, rgbToLab } from "@/lib/pipeline/color";
import { boundaryDistance, labelPoints } from "@/lib/pipeline/distance";
import { labelComponents } from "@/lib/pipeline/regions";
import { traceOutlines, type Outline } from "@/lib/outlines";
import { HAIR_NUMBER, type PipelineResult, type RGB } from "@/lib/pipeline";

export interface Layer {
  result: PipelineResult;
  /** Top-left of the layer on the page, in page pixels. */
  x: number;
  y: number;
  /** Page pixels per working pixel of this layer. */
  scale: number;
  /** Draw the outline where this layer meets its own blank (cut-out) area. */
  outlineBlank: boolean;
  /** Keep this layer's colors as they are (people): no cooling nudge for backgrounds. */
  natural?: boolean;
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
  /** Biggest shape (page px²): bigger ones are broken into patches of the nearest other colors (murals). */
  maxArea?: number,
): Page {
  // Every color used anywhere, with how much of the page it covers.
  type Entry = { layer: number; index: number; rgb: RGB; area: number; kind: number; face?: string; natural?: boolean };
  const entries: Entry[] = [];
  layers.forEach(({ result, scale, natural }, layer) => {
    const area = new Float64Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) area[result.regionColor[i]] += result.regionArea[i] * scale * scale;
    if (result.background !== undefined) area[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (area[index] <= 0) return;
      const kind = result.partKind?.[index] ?? 0;
      // Whose skin or clothes this is (a person's clothes are a part of their own).
      const face =
        kind === FACE || kind === CLOTHES ? `${kind === CLOTHES ? "c" : "f"}${layer}:${result.partGroup?.[index] ?? 0}` : undefined;
      entries.push({ layer, index, rgb: kind || natural ? rgb : coolBoost(rgb, cool), area: area[index], kind, face, natural });
    });
  });

  // Which people's skin touches someone else's (a cheek-to-cheek hug, a child in arms), and
  // whose clothes touch someone else's (her denim shorts against his dark shorts): only those
  // need their own numbers; people standing apart can share one.
  const touching = new Set<string>();
  layers.forEach(({ result }, layer) => {
    const { width: w, height: h, labels, regionColor, partKind, partGroup } = result;
    const skinOf = (p: number) => {
      const c = regionColor[labels[p]];
      const kind = partKind?.[c];
      return kind === FACE || kind === CLOTHES ? `${kind === CLOTHES ? "c" : "f"}${layer}:${partGroup?.[c] ?? 0}` : null;
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
    /** Has colors of a layer drawn in the photo's own colors (faces shown). */
    natural: boolean;
    /** The faces (and skin), and people's clothes, whose colors are in this cluster. */
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
    natural: !!e.natural,
    who: new Set(e.face ? [e.face] : []),
  }));
  // A face and hair never share a number, however close their colors are. The skin (or
  // clothes) of two people who touch shares a number only if it's exactly the same color, so
  // faces cheek to cheek don't read as one face, nor two people's clothes as one piece. (A
  // person's arms and legs are exact copies of their face's color, so they still join it.)
  const canMerge = (a: Cluster, b: Cluster, d2: number) => {
    if ((a.faces && b.hair) || (a.hair && b.faces)) return false;
    // With people in the photo's own colors, faces' colors and everything else (hair right
    // next to them) keep apart, so giving faces colors of their own doesn't change the hair.
    if ((a.natural || b.natural) && a.faces !== b.faces) return false;
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
      natural: a.natural || b.natural,
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
  const keyLab = new Float32Array(key.length * 3);
  key.forEach((k, i) => rgbToLab(k.rgb[0], k.rgb[1], k.rgb[2], keyLab, i * 3));
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
    if (maxArea) breakUpBig(byNumber, owner, w, h, maxArea / (layer.scale * layer.scale), keyLab);
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

/** A shape broken up by breakUpBig takes patches of the nearest other key colors at least this far (ΔE)... */
const BREAKUP_MIN = 6;
/** ...and at most this far, so it still reads as the same thing (a robe's creams and golds). */
const BREAKUP_MAX = 45;

/** Smooth random values (-1..1) over a w × h grid, varying over about `cell` cells. */
function blobs(w: number, h: number, cell: number, seed: number): Float32Array {
  let state = seed >>> 0;
  const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const gw = Math.ceil(w / cell) + 2;
  const grid = Float32Array.from({ length: gw * (Math.ceil(h / cell) + 2) }, rnd);
  const out = new Float32Array(w * h);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.floor(gy), ty = s(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.floor(gx), tx = s(gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/**
 * Murals: any shape (one number, one owner) bigger than `maxArea` (layer px²) is broken into
 * blob-shaped patches of the nearest other key colors, so no one piece fills much of a sheet.
 * Works on the final numbers, so the color count can't merge the patches back. In place.
 */
function breakUpBig(byNumber: Uint8Array, owner: Uint8Array, w: number, h: number, maxArea: number, keyLab: Float32Array) {
  const colors = keyLab.length / 3;
  const near = new Map<number, number[]>();
  const nearFor = (n: number) => {
    let found = near.get(n);
    if (found) return found;
    const list: [number, number][] = [];
    for (let o = 1; o <= colors; o++) {
      if (o === n) continue;
      const d = Math.sqrt(labDist2(keyLab, (n - 1) * 3, keyLab, (o - 1) * 3));
      if (d >= BREAKUP_MIN && d <= BREAKUP_MAX) list.push([o, d]);
    }
    list.sort((a, b) => a[1] - b[1]);
    found = list.slice(0, 3).map(([o]) => o);
    near.set(n, found);
    return found;
  };
  const cell = Math.max(3, Math.sqrt(maxArea) * 0.45);
  for (let round = 0; round < 4; round++) {
    const comps = labelComponents(byNumber, w, h, owner);
    const big = new Uint8Array(comps.count);
    let any = false;
    for (let i = 0; i < comps.count; i++) {
      if (comps.area[i] <= maxArea || comps.color[i] === 0) continue;
      big[i] = 1;
      any = true;
    }
    if (!any) return;
    const a = blobs(w, h, cell, 11 + round * 97);
    const b = blobs(w, h, cell * 0.7, 23 + round * 89);
    for (let p = 0; p < w * h; p++) {
      if (!big[comps.labels[p]]) continue;
      const alts = nearFor(byNumber[p]);
      if (!alts.length) continue;
      if (a[p] > 0.2) byNumber[p] = alts[0];
      else if (b[p] > 0.3 && alts[1]) byNumber[p] = alts[1];
      else if (a[p] < -0.45 && alts[2]) byNumber[p] = alts[2];
    }
  }
}

const EDGE: RGB = [70, 70, 70];

/** A part of the page (in page units): one sheet of a mural. */
export interface PageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws the page at `pxScale` times its layout size (1 for the screen, more for printing).
 * Lines stay thin but visible at any resolution; numbers keep their printed size. With
 * `region`, only that part is drawn (one sheet of a mural), and every piece of a shape the
 * region's edge cuts through gets a number of its own.
 */
export function drawPage(canvas: HTMLCanvasElement, page: Page, view: "outline" | "colored", pxScale = 1, region?: PageRegion) {
  const fullW = Math.round(page.width * pxScale);
  const ox = region ? region.x * pxScale : 0;
  const oy = region ? region.y * pxScale : 0;
  const W = region ? Math.round(region.w * pxScale) : fullW;
  const H = region ? Math.round(region.h * pxScale) : Math.round(page.height * pxScale);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  img.data.fill(255);

  // Numbers follow the whole page's width (a share of it), so a mural's sheets match each other.
  const MIN_FONT = minFont(fullW, page.fontFrac);
  const MAX_FONT = MIN_FONT * MAX_FONT_RATIO;
  /** Line thickness in pixels: about 0.2 mm when printed (one sheet's width, for a mural). */
  const t = Math.max(1, Math.round(W / 1800));
  const placed = page.layers.map((l) => ({ ...l, x: l.x * pxScale - ox, y: l.y * pxScale - oy, scale: l.scale * pxScale }));
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
  if (!region && bottom && bottom.background === undefined) {
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
    if (region) {
      drawRegionNumbers(ctx, layer, page.numbers[li], W, H, MIN_FONT, MAX_FONT);
      return;
    }
    for (let i = 0; i < result.regionCount; i++) {
      if (result.regionColor[i] === result.background) continue;
      const size = Math.min(MAX_FONT, result.labelRadius[i] * scale * 1.1);
      // Thin hair may carry a slightly smaller number (see HAIR_NUMBER).
      if (size < (result.regionKind?.[i] === HAIR ? MIN_FONT * HAIR_NUMBER : MIN_FONT)) continue;
      ctx.font = `${Math.round(size)}px Arial, sans-serif`;
      ctx.fillText(
        String(page.numbers[li][result.regionColor[i]]),
        layer.x + result.labelX[i] * scale,
        layer.y + result.labelY[i] * scale,
      );
    }
  });
}

/**
 * Numbers for the part of a layer showing on a W × H canvas (one sheet of a mural): the shapes
 * are cut at the canvas's edges, and each piece that's big enough gets its shape's number,
 * placed where the piece is widest.
 */
function drawRegionNumbers(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  numbers: Uint8Array,
  W: number,
  H: number,
  minFontPx: number,
  maxFontPx: number,
) {
  const { result, x, y, scale } = layer;
  const { width: w, height: h, labels, regionColor, regionKind } = result;
  // The layer's pixels under the canvas.
  const x0 = Math.max(0, Math.floor(-x / scale));
  const y0 = Math.max(0, Math.floor(-y / scale));
  const x1 = Math.min(w, Math.ceil((W - x) / scale));
  const y1 = Math.min(h, Math.ceil((H - y) / scale));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return;
  // Pieces: connected pixels of one shape inside the cut.
  const piece = new Int32Array(cw * ch).fill(-1);
  const pieceShape: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cw * ch; start++) {
    if (piece[start] !== -1) continue;
    const shape = labels[(y0 + Math.floor(start / cw)) * w + x0 + (start % cw)];
    const id = pieceShape.length;
    pieceShape.push(shape);
    piece[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % cw;
      for (const q of [px > 0 ? p - 1 : -1, px < cw - 1 ? p + 1 : -1, p - cw, p + cw]) {
        if (q < 0 || q >= cw * ch || piece[q] !== -1) continue;
        if (labels[(y0 + Math.floor(q / cw)) * w + x0 + (q % cw)] !== shape) continue;
        piece[q] = id;
        stack.push(q);
      }
    }
  }
  const pts = labelPoints(piece, pieceShape.length, cw, ch, boundaryDistance(piece, cw, ch));
  for (let i = 0; i < pieceShape.length; i++) {
    const shape = pieceShape[i];
    if (regionColor[shape] === result.background) continue;
    const size = Math.min(maxFontPx, pts.radius[i] * scale * 1.1);
    if (size < (regionKind?.[shape] === HAIR ? minFontPx * HAIR_NUMBER : minFontPx)) continue;
    ctx.font = `${Math.round(size)}px Arial, sans-serif`;
    ctx.fillText(String(numbers[regionColor[shape]]), x + (x0 + pts.x[i]) * scale, y + (y0 + pts.y[i]) * scale);
  }
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
