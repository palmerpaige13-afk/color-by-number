// Runs the full photo -> color-by-number pipeline: smooth, quantize, clean up regions, place labels.

import { boundaryDistance, labelPoints } from "./distance";
import { quantize } from "./quantize";
import { petEyes } from "./eyes";
import { paintSkin, separateFaces } from "./faces";
import type { RegionMask } from "./types";
import { featureLines } from "./lines";
import { labelComponents, majorityFilter, mergeRegions, neighborContrast } from "./regions";
import { bilateralSmooth } from "./smooth";
import { DEFAULT_PARAMS, type PipelineInput, type PipelineParams, type PipelineResult } from "./types";

export * from "./types";

export type Difficulty = "easy" | "medium" | "hard";

/** Smallest label radius (working px) whose number is still legible when drawn at 1.5x. */
const MIN_PRINT_RADIUS = 4.3;
/**
 * On faces and pets, standout features (eyes, nose, tongue) are kept however small; the ones
 * too small for a number are printed already colored in. Applies from this keep factor
 * (importance x contrast) up, down to shapes of TINY_AREA pixels / TINY_RADIUS.
 */
const DETAIL_LEVEL = 0.8;
const TINY_AREA = 4;
const TINY_RADIUS = 1;

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
 * Brightens the dark end of each animal so a face in shade (a black dog's eyes and nose) still
 * separates into shapes: the animal's lightness range is stretched so its 5th percentile maps
 * to a mid-dark tone, keeping each pixel's hue.
 */
function liftShadows(data: Uint8ClampedArray, animals: RegionMask[], w: number, h: number) {
  for (const a of animals) {
    const px: number[] = [];
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const mx = a.x + x;
        const my = a.y + y;
        if (mx >= 0 && my >= 0 && mx < w && my < h && a.data[y * a.width + x]) px.push(my * w + mx);
      }
    }
    if (px.length < 16) continue;
    const luma = (p: number) => 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
    const sorted = px.map(luma).sort((x, y) => x - y);
    const lo = sorted[Math.floor(sorted.length * 0.05)];
    const hi = Math.max(lo + 1, sorted[Math.floor(sorted.length * 0.95)]);
    if (lo >= 70) continue; // not dark enough to need it
    for (const p of px) {
      const l = luma(p);
      const t = Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
      const target = 55 + t * (Math.max(hi, 200) - 55);
      // Scale the color up by at most 2x (more would exaggerate a faint tint, turning black fur
      // brown) and add the rest of the lift as neutral gray. Light fur is only nudged.
      const k = Math.min(2, Math.max(0.9, target / Math.max(1, l)));
      const gray = Math.max(0, target - l * k);
      for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.min(255, data[p * 4 + c] * k + gray);
    }
  }
}

/** Region-merge group of the blank background of a cut-out photo. */
const BACKGROUND_GROUP = 255;

/** Importance above which photo edges are drawn as feature lines. */
const LINE_LEVEL = 0.35;

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

export const DIFFICULTY_PARAMS: Record<Difficulty, PipelineParams> = {
  easy: tuned({ paletteSize: 8, minArea: 900, minRadius: 9, smoothPasses: 3, boundaryPasses: 3 }),
  medium: tuned({ paletteSize: 16, minArea: 160, minRadius: 5 }),
  hard: tuned({ paletteSize: 24, minArea: 45, minRadius: 3, smoothPasses: 1, boundaryPasses: 1 }),
};

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
    params.smoothPasses > 0 ? bilateralSmooth(input.data, w, h, params.smoothPasses) : input.data.slice();
  if (input.animals?.length) liftShadows(smoothed, input.animals, w, h);
  lap("smooth");

  const q = quantize(smoothed, w, h, params.paletteSize, imp, exclude);
  const { indices } = q;
  const faces =
    input.faces?.length || input.animals?.length
      ? separateFaces(
          indices,
          smoothed,
          input.faces ?? [],
          input.animals ?? [],
          q.palette,
          q.paletteLab,
          w,
          h,
          faceStyle,
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
  const areaLimit = (k: number) => (k >= DETAIL_LEVEL ? TINY_AREA : params.minArea * (1 - 0.85 * k));
  const radiusLimit = (k: number) =>
    k >= DETAIL_LEVEL ? TINY_RADIUS : Math.max(MIN_PRINT_RADIUS, params.minRadius * (1 - 0.5 * k));

  // Pass 1: merge regions that are too small to color.
  const raw = labelComponents(colorMap, w, h);
  const rawImp = imp ? regionImportance(raw.labels, raw.count, imp) : new Float32Array(raw.count);
  const rawContrast = neighborContrast(raw, w, h, paletteLab);
  colorMap = mergeRegions(
    raw,
    w,
    h,
    paletteLab,
    (id, area) => area < areaLimit(keepFactor(rawImp[id], rawContrast[id])),
    group,
  );

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
      pts.radius[id] < radiusLimit(keepFactor(sizedImp[id], contrast[id]));
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
  lap("merge");

  const final = labelComponents(colorMap, w, h);
  const labels = Uint16Array.from(final.labels);
  const pts = labelPoints(labels, final.count, w, h, boundaryDistance(labels, w, h));
  const detailLines = imp
    ? featureLines(smoothed, labels, imp, LINE_LEVEL, w, h, faces?.mask, input.faces, faceStyle === "lines")
    : undefined;
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
    eyes: (input.animals ?? [])
      .filter((a) => a.label === "dog" || a.label === "cat")
      .flatMap((a) => petEyes(input.data, a, w, h)),
    detailLines,
    timings,
    debug: params.debug
      ? { importance: imp, smoothed, quantized: indices, rawRegionCount: raw.count }
      : undefined,
  };
}
