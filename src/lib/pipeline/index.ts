// Runs the full photo -> color-by-number pipeline: smooth, quantize, clean up regions, place labels.

import { boundaryDistance, labelPoints } from "./distance";
import { quantize } from "./quantize";
import { petEyes, petNose } from "./eyes";
import { PartKind, paintSkin, separateFaces } from "./faces";
import { labDist2 } from "./color";
import { BLANK_GROUP, labelComponents, majorityFilter, mergeRegions, neighborContrast } from "./regions";
import { bilateralSmooth } from "./smooth";
import { DEFAULT_PARAMS, type PipelineInput, type PipelineParams, type PipelineResult } from "./types";

export * from "./types";

export type Difficulty = "easy" | "medium" | "hard";

/** Smallest label radius (working px) whose number is still legible when drawn at 1.5x. */
const MIN_PRINT_RADIUS = 4.3;

/** Mean importance per region. */
function regionImportance(labels: Int32Array, count: number, importance: Float32Array): Float32Array {
  const sum = new Float32Array(count);
  const n = new Uint32Array(count);
  for (let p = 0; p < labels.length; p++) {
    sum[labels[p]] += importance[p];
    n[labels[p]]++;
  }
  for (let i = 0; i < count; i++) sum[i] /= n[i] || 1;
  return sum;
}

/**
 * Merging for the shape budget never joins two clearly different colors within a person
 * (shirt and jeans, a white dress and a dark suit), even if that leaves a few more shapes.
 */
const BUDGET_PART_DIST = 20;
/** Within one person's clothes, colors closer than this (ΔE) are light and shadow on one piece. */
const CLOTHES_SHADE = 22;
/** Hair's numbers may be this much smaller than the smallest number elsewhere. */
export const HAIR_NUMBER = 0.7;
/** ...and differ in colorfulness (Lab chroma) by less than this. */
const CLOTHES_SHADE_CHROMA = 10;
/** On pages with flat clothes, each person's clothes get this many colors of their own. */
const FLAT_CLOTHES_COLORS = 4;
/** A pattern patch is at most this share of the piece of clothing it's on. */
const PATTERN_SHARE = 0.5;
/**
 * A head resting against someone casts a shadow on their clothes (gray on a white shirt,
 * right next to the hair). On light clothes (mostly a color at least HEAD_SHADOW_LIGHT in
 * L), a patch at least HEAD_SHADOW_MIN_L darker, at least HEAD_SHADOW_NEAR of it within this
 * share of the picture's width of hair, touching the hair or another patch of shadow, is
 * that shadow.
 */
const HEAD_SHADOW_REACH = 0.07;
const HEAD_SHADOW_NEAR = 0.5;
const HEAD_SHADOW_LIGHT = 75;
const HEAD_SHADOW_MIN_L = 5;
/** ...and only on clothes mostly (this share) one pale color less colorful (Lab chroma) than HEAD_SHADOW_CHROMA. */
const HEAD_SHADOW_BASE_SHARE = 0.2;
const HEAD_SHADOW_CHROMA = 12;

/** Region-merge group of the blank background of a cut-out photo. */
const BACKGROUND_GROUP = BLANK_GROUP;


/** Long edge of the working raster, in px. */
export const WORKING_SIZE = 900;

/** Difficulty settings are tuned at a 600px raster; sizes scale with the real one. */
const RES = WORKING_SIZE / 600;
const tuned = (p: Partial<PipelineParams> & Pick<PipelineParams, "minArea" | "minRadius">): PipelineParams => ({
  ...DEFAULT_PARAMS,
  ...p,
  minArea: p.minArea * RES * RES,
  minRadius: p.minRadius * RES,
});

/**
 * On Easy and Medium people look the same (one skin color per person, clothes without extra
 * shadow patches, as on Easy); Medium adds its shapes and colors to the background. Hard
 * keeps one skin color per person but gives people its own finer detail.
 */
const PEOPLE = { oneSkinTone: true, partMinArea: 450 * RES * RES, partMinRadius: 7 * RES };

export const DIFFICULTY_PARAMS: Record<Difficulty, PipelineParams> = {
  easy: tuned({
    paletteSize: 12,
    minArea: 450,
    minRadius: 7,
    smoothPasses: 2,
    boundaryPasses: 2,
    maxShapes: 90,
    ...PEOPLE,
    flatClothes: true,
  }),
  medium: tuned({ paletteSize: 16, minArea: 160, minRadius: 5, maxShapes: 150, ...PEOPLE, flatClothes: true }),
  hard: tuned({
    paletteSize: 24,
    minArea: 45,
    minRadius: 3,
    smoothPasses: 1,
    boundaryPasses: 1,
    maxShapes: 280,
    oneSkinTone: true,
  }),
};

/**
 * Shadows cast by a head on light clothes (see HEAD_SHADOW_REACH): each patch of shadow
 * takes the clothes' own light color. Letters and prints away from the hair stay.
 */
function removeHeadShadows(
  colorMap: Uint8Array,
  w: number,
  h: number,
  paletteLab: Float32Array,
  kind: Uint8Array,
  group?: Uint8Array,
): Uint8Array {
  if (!group) return colorMap;
  const n = w * h;
  // How far each pixel is from hair (4-connected steps), up to the reach.
  const reach = Math.max(4, Math.round(w * HEAD_SHADOW_REACH));
  const dist = new Uint16Array(n).fill(65535);
  let queue: number[] = [];
  for (let p = 0; p < n; p++) if (kind[colorMap[p]] === PartKind.hair) {
    dist[p] = 0;
    queue.push(p);
  }
  if (!queue.length) return colorMap;
  for (let d = 1; d <= reach && queue.length; d++) {
    const next: number[] = [];
    for (const p of queue) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || dist[q] <= d) continue;
        dist[q] = d;
        next.push(q);
      }
    }
    queue = next;
  }

  const comps = labelComponents(colorMap, w, h);
  const { count, labels, color, area } = comps;
  const near = new Uint32Array(count);
  for (let p = 0; p < n; p++) if (dist[p] <= reach) near[labels[p]]++;
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set());
  const touchesHair = new Uint8Array(count);
  for (let p = 0; p < n; p++) {
    const x = p % w;
    for (const q of [x < w - 1 ? p + 1 : -1, p + w < n ? p + w : -1]) {
      if (q < 0 || labels[q] === labels[p]) continue;
      const a = labels[p];
      const b = labels[q];
      adj[a].add(b);
      adj[b].add(a);
      if (kind[color[b]] === PartKind.hair) touchesHair[a] = 1;
      if (kind[color[a]] === PartKind.hair) touchesHair[b] = 1;
    }
  }
  // Each piece of clothing's own light color: the light color covering most of it. Only
  // clothes that really are light (a white shirt: mostly one pale, nearly neutral color) count;
  // a colored dress with a sunlit edge isn't, and its bodice mustn't be painted like that edge.
  const lightArea = new Map<number, number>(); // color -> area
  const groupArea = new Map<number, number>(); // group -> all its clothes' area
  for (let i = 0; i < count; i++) {
    const c = color[i];
    if (kind[c] !== PartKind.clothes) continue;
    groupArea.set(group[c], (groupArea.get(group[c]) ?? 0) + area[i]);
    const chroma = Math.hypot(paletteLab[c * 3 + 1], paletteLab[c * 3 + 2]);
    if (paletteLab[c * 3] >= HEAD_SHADOW_LIGHT && chroma < HEAD_SHADOW_CHROMA) lightArea.set(c, (lightArea.get(c) ?? 0) + area[i]);
  }
  const lightTotal = new Map<number, number>(); // group -> area of all its pale colors
  for (const [c, a] of lightArea) lightTotal.set(group[c], (lightTotal.get(group[c]) ?? 0) + a);
  const base = new Map<number, number>(); // group -> color
  for (const [c, a] of lightArea) {
    if ((lightTotal.get(group[c]) ?? 0) < (groupArea.get(group[c]) ?? 0) * HEAD_SHADOW_BASE_SHARE) continue;
    const cur = base.get(group[c]);
    if (cur === undefined || a > lightArea.get(cur)!) base.set(group[c], c);
  }
  // Shadow: darker patches of it, mostly near the hair, touching the hair or more shadow.
  // (Letters and prints right by the hair go too: they'd be cut up by the shadow anyway.)
  const shadow = new Uint8Array(count);
  const isShadow = (i: number) => {
    const c = color[i];
    const b = base.get(group[c]);
    if (kind[c] !== PartKind.clothes || b === undefined) return false;
    if (near[i] < area[i] * HEAD_SHADOW_NEAR) return false;
    if (paletteLab[c * 3] > paletteLab[b * 3] - HEAD_SHADOW_MIN_L) return false;
    if (touchesHair[i]) return true;
    for (const nb of adj[i]) if (shadow[nb]) return true;
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < count; i++) {
      if (!shadow[i] && isShadow(i)) {
        shadow[i] = 1;
        changed = true;
      }
    }
  }
  const out = Uint8Array.from(colorMap);
  for (let p = 0; p < n; p++) {
    const r = labels[p];
    if (shadow[r]) out[p] = base.get(group[color[r]])!;
  }
  return out;
}

export function runPipeline(input: PipelineInput, params: PipelineParams): PipelineResult {
  const { width: w, height: h } = input;
  const timings: Record<string, number> = {};
  let t = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = now - t;
    t = now;
  };

  // A cut-out photo keeps only the subject; the background is left blank.
  const { cutout } = input;
  const exclude = cutout ? Uint8Array.from(cutout, (v) => 1 - v) : undefined;

  // Hair gets no extra detail (curls otherwise turn into a mess of tiny shapes and lines), and
  // neither does a blank background.
  let imp = input.importance;
  if (imp && (exclude || input.faces?.some((f) => f.hair))) {
    const plain = exclude ? Uint8Array.from(exclude) : new Uint8Array(w * h);
    for (const f of input.faces ?? []) if (f.hair) paintSkin(f.hair, plain, 1, w, h);
    imp = Float32Array.from(imp, (v, p) => (plain[p] ? 0 : v));
  }
  const faceStyle = input.faceStyle ?? "lines";

  const smoothed =
    params.smoothPasses > 0 ? bilateralSmooth(input.data, w, h, params.smoothPasses) : input.data;
  lap("smooth");

  const q = quantize(smoothed, w, h, params.paletteSize, imp, exclude);
  const { indices } = q;
  const faces =
    input.faces?.length || input.animals?.length || input.clothes
      ? separateFaces(
          indices,
          smoothed,
          input.faces ?? [],
          input.animals ?? [],
          input.clothes,
          q.palette,
          q.paletteLab,
          w,
          h,
          faceStyle,
          params.oneSkinTone ? input.bodySkin : undefined,
          input.cutout,
          1,
          params.flatClothes ? FLAT_CLOTHES_COLORS : 0,
        )
      : null;
  let palette = faces?.palette ?? q.palette;
  let paletteLab = faces?.paletteLab ?? q.paletteLab;
  let group = faces?.group;

  // The blank background is one more palette entry in a group of its own, so nothing merges
  // into it or out of it, and it is never numbered.
  let background: number | undefined;
  if (exclude && palette.length < 255) {
    background = palette.length;
    palette = [...palette, [255, 255, 255]];
    paletteLab = Float32Array.from([...paletteLab, 100, 0, 0]);
    group = Uint8Array.from([...(group ?? palette.slice(0, -1).map(() => 0)), BACKGROUND_GROUP]);
    for (let p = 0; p < indices.length; p++) if (exclude[p]) indices[p] = background;
  }
  lap("quantize");

  let colorMap = majorityFilter(indices, w, h, palette.length, params.boundaryPasses);
  lap("majority");

  // In important areas, small shapes survive only if they stand out from their surroundings:
  // eyes, brows, lips and windows (high contrast) are kept, while patchy shading on skin or
  // walls (low contrast) still merges away. Never so small that a number won't fit.
  const keepFactor = (importance: number, contrast: number) =>
    importance * Math.min(1, Math.max(0, (contrast - 12) / 18));
  // A person's parts (face, hair, skin, clothes) use the people's own limits.
  const isPart = (color: number) => {
    const g = group?.[color] ?? 0;
    return g !== 0 && g !== BACKGROUND_GROUP;
  };
  const areaLimit = (k: number, color: number) =>
    (isPart(color) ? (params.partMinArea ?? params.minArea) : params.minArea) * (1 - 0.85 * k);
  const minPrint = params.minLabelRadius ?? MIN_PRINT_RADIUS;
  const radiusLimit = (k: number, color: number) =>
    Math.max(minPrint, (isPart(color) ? (params.partMinRadius ?? params.minRadius) : params.minRadius) * (1 - 0.5 * k));

  // Pass 1: merge regions that are too small to color.
  const raw = labelComponents(colorMap, w, h);
  const rawImp = imp ? regionImportance(raw.labels, raw.count, imp) : new Float32Array(raw.count);
  const rawContrast = neighborContrast(raw, w, h, paletteLab);
  colorMap = mergeRegions(
    raw,
    w,
    h,
    paletteLab,
    (id, area) => area < areaLimit(keepFactor(rawImp[id], rawContrast[id]), raw.color[id]),
    group,
  );

  if (faces) colorMap = removeHeadShadows(colorMap, w, h, paletteLab, faces.kind, group);

  // On easier pages clothes are one color per piece of clothing: shadow and light on a shirt
  // (shades close to their neighbor in the same person's clothes) merge whatever their size,
  // while a shirt and jeans (clearly different colors) stay apart. Hard keeps the shading.
  if (faces && params.flatClothes) {
    const kind = faces.kind;
    for (let round = 0; round < 3; round++) {
      const comps = labelComponents(colorMap, w, h);
      const shade = new Uint8Array(comps.count);
      let any = false;
      const visit = (a: number, b: number) => {
        const ca = comps.color[a];
        const cb = comps.color[b];
        if (kind[ca] !== PartKind.clothes || group?.[ca] !== group?.[cb]) return;
        if (labDist2(paletteLab, ca * 3, paletteLab, cb * 3) >= CLOTHES_SHADE * CLOTHES_SHADE) return;
        // Shadow only darkens a color; a colorful patch next to a gray one (denim shorts
        // under a black top) is a different piece of clothing.
        const chroma = (c: number) => Math.hypot(paletteLab[c * 3 + 1], paletteLab[c * 3 + 2]);
        if (Math.abs(chroma(ca) - chroma(cb)) >= CLOTHES_SHADE_CHROMA) return;
        shade[a] = shade[b] = 1;
        any = true;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          const a = comps.labels[p];
          if (x < w - 1 && comps.labels[p + 1] !== a) visit(a, comps.labels[p + 1]);
          if (y < h - 1 && comps.labels[p + w] !== a) visit(a, comps.labels[p + w]);
        }
      }
      if (!any) break;
      colorMap = mergeRegions(comps, w, h, paletteLab, (id, area) => !!shade[id] && area === comps.area[id], group, 0, CLOTHES_SHADE);
    }

    // A pattern (flowers, a logo) on one piece of clothing: a patch of a person's clothes
    // whose only neighbor among their clothes is one bigger patch, and that touches none of
    // their skin or hair (a top always touches arms or a neck), is part of that piece, whatever
    // its color. Touching the background or someone else doesn't matter.
    const comps = labelComponents(colorMap, w, h);
    const only = new Int32Array(comps.count).fill(-1); // the one clothes neighbor, or -2
    const note = (a: number, b: number) => {
      const ca = comps.color[a];
      const cb = comps.color[b];
      if (kind[ca] !== PartKind.clothes) return;
      if (kind[cb] === PartKind.face || kind[cb] === PartKind.hair) {
        if (group?.[cb] !== undefined) only[a] = -2;
        return;
      }
      if (kind[cb] !== PartKind.clothes || group?.[ca] !== group?.[cb]) return;
      if (only[a] === -1) only[a] = b;
      else if (only[a] !== b) only[a] = -2;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const a = comps.labels[p];
        for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || comps.labels[q] === a) continue;
          note(a, comps.labels[q]);
          note(comps.labels[q], a);
        }
      }
    }
    const inside = (id: number) => {
      const nb = only[id];
      return nb >= 0 && comps.area[id] < comps.area[nb] * PATTERN_SHARE;
    };
    colorMap = mergeRegions(comps, w, h, paletteLab, (id, area) => area === comps.area[id] && inside(id), group);
  }

  // Budget: if there are still too many shapes, merge the smallest until it fits.
  if (params.maxShapes) {
    const counted = labelComponents(colorMap, w, h);
    if (counted.count > params.maxShapes) {
      colorMap = mergeRegions(counted, w, h, paletteLab, () => true, group, params.maxShapes, BUDGET_PART_DIST);
    }
  }

  // Pass 2: merge regions too thin to fit a number. Radius is only known for the original
  // shape, so a region stops being flagged once it has absorbed a neighbor; repeating the
  // pass catches regions that are still thin after growing.
  for (let round = 0; round < 4; round++) {
    const sized = labelComponents(colorMap, w, h);
    const pts = labelPoints(sized.labels, sized.count, w, h, boundaryDistance(sized.labels, w, h));
    const sizedImp = imp
      ? regionImportance(sized.labels, sized.count, imp)
      : new Float32Array(sized.count);
    const contrast = neighborContrast(sized, w, h, paletteLab);
    const tooThin = (id: number) =>
      pts.radius[id] < radiusLimit(keepFactor(sizedImp[id], contrast[id]), sized.color[id]);
    let thin = 0;
    for (let i = 0; i < sized.count; i++) if (tooThin(i) && !group?.[sized.color[i]]) thin++;
    if (thin === 0) break;
    colorMap = mergeRegions(
      sized,
      w,
      h,
      paletteLab,
      (id, area) => area === sized.area[id] && tooThin(id),
      group,
    );
  }

  // Last resort: anything still too small for a readable number (a sliver of face, hair or
  // pet that had nothing of its own kind to join) merges into any neighbor, so every shape on
  // the page can carry a number. Only the blank background stays apart.
  {
    const left = labelComponents(colorMap, w, h);
    const pts = labelPoints(left.labels, left.count, w, h, boundaryDistance(left.labels, w, h));
    const blankOnly = group && Uint8Array.from(group, (g) => (g === BACKGROUND_GROUP ? g : 0));
    // Hair may carry a smaller number (see HAIR_NUMBER): short hair hugging a head is thin,
    // and joining the face would leave a bald, skin-colored head.
    const need = (id: number) => (faces?.kind[left.color[id]] === PartKind.hair ? minPrint * HAIR_NUMBER : minPrint);
    const tooSmall = (id: number) => pts.radius[id] < need(id) && left.color[id] !== background;
    if (pts.radius.some((_, id) => tooSmall(id))) {
      colorMap = mergeRegions(left, w, h, paletteLab, (id, area) => area === left.area[id] && tooSmall(id), blankOnly);
    }
  }
  lap("merge");

  const final = labelComponents(colorMap, w, h);
  const labels = Uint16Array.from(final.labels);
  const pts = labelPoints(labels, final.count, w, h, boundaryDistance(labels, w, h));
  const petFaces = (input.animals ?? [])
    .filter((a) => a.label === "dog" || a.label === "cat")
    .map((a) => {
      if (a.face) return a.face;
      const eyes = petEyes(input.data, a, w, h);
      return { eyes, nose: petNose(input.data, eyes, w, h) };
    });
  lap("labels");

  return {
    width: w,
    height: h,
    palette,
    regionCount: final.count,
    labels,
    regionColor: final.color,
    regionArea: final.area,
    labelX: pts.x,
    labelY: pts.y,
    labelRadius: pts.radius,
    background,
    partGroup: faces ? Uint8Array.from({ length: palette.length }, (_, i) => faces.group[i] ?? 0) : undefined,
    partKind: faces ? Uint8Array.from({ length: palette.length }, (_, i) => faces.kind[i] ?? 0) : undefined,
    eyes: petFaces.flatMap((f) => f.eyes),
    noses: petFaces.flatMap((f) => f.nose ?? []),
    timings,
    debug: params.debug
      ? { importance: imp, smoothed, quantized: indices, rawRegionCount: raw.count }
      : undefined,
  };
}
