// Runs the full photo -> color-by-number pipeline: smooth, quantize, clean up regions, place labels.

import { boundaryDistance, labelPoints } from "./distance";
import { quantize } from "./quantize";
import { labelComponents, majorityFilter, mergeRegions } from "./regions";
import { bilateralSmooth } from "./smooth";
import { DEFAULT_PARAMS, type PipelineInput, type PipelineParams, type PipelineResult } from "./types";

export * from "./types";

export type Difficulty = "easy" | "medium" | "hard";

/** Long edge of the working raster, in px. */
export const WORKING_SIZE = 600;

export const DIFFICULTY_PARAMS: Record<Difficulty, PipelineParams> = {
  easy: { ...DEFAULT_PARAMS, paletteSize: 8, minArea: 900, minRadius: 9, smoothPasses: 3, boundaryPasses: 3 },
  medium: { ...DEFAULT_PARAMS, paletteSize: 14, minArea: 300, minRadius: 6 },
  hard: { ...DEFAULT_PARAMS, paletteSize: 22, minArea: 90, minRadius: 4, smoothPasses: 1, boundaryPasses: 1 },
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

  const smoothed =
    params.smoothPasses > 0 ? bilateralSmooth(input.data, w, h, params.smoothPasses) : input.data;
  lap("smooth");

  const { indices, palette, paletteLab } = quantize(smoothed, w, h, params.paletteSize);
  lap("quantize");

  let colorMap = majorityFilter(indices, w, h, palette.length, params.boundaryPasses);
  lap("majority");

  // Pass 1: merge regions that are too small to color.
  const raw = labelComponents(colorMap, w, h);
  colorMap = mergeRegions(raw, w, h, paletteLab, (_id, area) => area < params.minArea);

  // Pass 2: merge regions too thin to fit a number. Radius is only known for the original
  // shape, so a region stops being flagged once it has absorbed a neighbor; repeating the
  // pass catches regions that are still thin after growing.
  for (let round = 0; round < 4; round++) {
    const sized = labelComponents(colorMap, w, h);
    const pts = labelPoints(sized.labels, sized.count, w, h, boundaryDistance(sized.labels, w, h));
    let thin = 0;
    for (let i = 0; i < sized.count; i++) if (pts.radius[i] < params.minRadius) thin++;
    if (thin === 0) break;
    colorMap = mergeRegions(
      sized,
      w,
      h,
      paletteLab,
      (id, area) => area === sized.area[id] && pts.radius[id] < params.minRadius,
    );
  }
  lap("merge");

  const final = labelComponents(colorMap, w, h);
  const labels = Uint16Array.from(final.labels);
  const pts = labelPoints(labels, final.count, w, h, boundaryDistance(labels, w, h));
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
    timings,
    debug: params.debug
      ? { smoothed, quantized: indices, rawRegionCount: raw.count }
      : undefined,
  };
}
