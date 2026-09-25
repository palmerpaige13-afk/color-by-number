export type RGB = [number, number, number];

export interface PipelineParams {
  /** Number of palette colors (8–24). */
  paletteSize: number;
  /** Regions smaller than this many working-resolution pixels are merged away. */
  minArea: number;
  /** Regions whose widest point is thinner than this radius (px) are merged away. */
  minRadius: number;
  /** Edge-preserving smoothing passes (0 disables; spec says don't). */
  smoothPasses: number;
  /** Majority-filter passes used to smooth region boundaries. */
  boundaryPasses: number;
  /** Include intermediate rasters (smoothed, quantized) for the lab page. */
  debug: boolean;
}

export interface PipelineInput {
  width: number;
  height: number;
  /** RGBA, already downscaled to working resolution. */
  data: Uint8ClampedArray;
  /** Optional 0..1 per pixel; higher keeps more detail (faces, people, buildings). */
  importance?: Float32Array;
}

export interface PipelineResult {
  width: number;
  height: number;
  palette: RGB[];
  regionCount: number;
  /** Region id per pixel (0..regionCount-1). */
  labels: Uint16Array;
  /** Per-region metadata, indexed by region id. */
  regionColor: Uint8Array;
  regionArea: Uint32Array;
  labelX: Float32Array;
  labelY: Float32Array;
  /** Distance from label point to nearest boundary, in px. */
  labelRadius: Float32Array;
  /**
   * 1 where a thin feature line should be drawn: an outline in an important area (eyes, brows,
   * lips, window frames) that was too thin to become its own numbered shape.
   */
  detailLines?: Uint8Array;
  timings: Record<string, number>;
  debug?: {
    importance?: Float32Array;
    smoothed: Uint8ClampedArray;
    quantized: Uint8Array;
    rawRegionCount: number;
  };
}

export const DEFAULT_PARAMS: PipelineParams = {
  paletteSize: 16,
  minArea: 120,
  minRadius: 3,
  smoothPasses: 2,
  boundaryPasses: 2,
  debug: false,
};
