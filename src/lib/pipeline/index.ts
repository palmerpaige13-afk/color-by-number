// Runs the full photo -> color-by-number pipeline: smooth, quantize, clean up regions, place labels.

import { boundaryDistance, labelPoints } from "./distance";
import { quantize } from "./quantize";
import { featureLines } from "./lines";
import { labelComponents, majorityFilter, mergeRegions, neighborContrast } from "./regions";
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
  medium: tuned({ paletteSize: 14, minArea: 300, minRadius: 6 }),
  hard: tuned({ paletteSize: 22, minArea: 90, minRadius: 4, smoothPasses: 1, boundaryPasses: 1 }),
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

  const imp = input.importance;

  const smoothed =
    params.smoothPasses > 0 ? bilateralSmooth(input.data, w, h, params.smoothPasses) : input.data;
  lap("smooth");

  const { indices, palette, paletteLab } = quantize(smoothed, w, h, params.paletteSize, imp);
  lap("quantize");

  let colorMap = majorityFilter(indices, w, h, palette.length, params.boundaryPasses);
  lap("majority");

  // In important areas, small shapes survive only if they stand out from their surroundings:
  // eyes, brows, lips and windows (high contrast) are kept, while patchy shading on skin or
  // walls (low contrast) still merges away. Never so small that a number won't fit.
  const keepFactor = (importance: number, contrast: number) =>
    importance * Math.min(1, Math.max(0, (contrast - 12) / 18));
  const areaLimit = (k: number) => params.minArea * (1 - 0.85 * k);
  const radiusLimit = (k: number) => Math.max(MIN_PRINT_RADIUS, params.minRadius * (1 - 0.5 * k));

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
    for (let i = 0; i < sized.count; i++) if (tooThin(i)) thin++;
    if (thin === 0) break;
    colorMap = mergeRegions(
      sized,
      w,
      h,
      paletteLab,
      (id, area) => area === sized.area[id] && tooThin(id),
    );
  }
  lap("merge");

  const final = labelComponents(colorMap, w, h);
  const labels = Uint16Array.from(final.labels);
  const pts = labelPoints(labels, final.count, w, h, boundaryDistance(labels, w, h));
  const detailLines = imp ? featureLines(smoothed, labels, imp, LINE_LEVEL, w, h) : undefined;
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
    detailLines,
    timings,
    debug: params.debug
      ? { importance: imp, smoothed, quantized: indices, rawRegionCount: raw.count }
      : undefined,
  };
}
