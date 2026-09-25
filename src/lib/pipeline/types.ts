export type RGB = [number, number, number];

/** Axis-aligned box in working-raster pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = [number, number];

/** A detected face, with landmark contours (working-raster pixels) when available. */
export interface FaceShape extends Box {
  /** Closed polygon around the face: jaw, chin and hairline. */
  outline?: Point[];
  /** Open polylines for eyes, eyebrows, nose and lips. */
  features?: Point[][];
  /** Face-skin mask from segmentation. */
  skin?: RegionMask;
  /** Hair mask from segmentation; hair is simplified like background. */
  hair?: RegionMask;
}

/** A 0/1 mask covering a rectangle of working pixels. */
export interface RegionMask {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8Array;
  /** What it is, when known (e.g. "dog"). */
  label?: string;
  /** The detector's box around it, in working pixels, when known. */
  box?: Box;
}

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
  /** Detected faces; each is kept as its own outlined area. */
  faces?: FaceShape[];
  /**
   * How faces are drawn: "lines" keeps shading and draws eyes, nose and mouth as lines;
   * "shaded" keeps shading shapes only; "faceless" is one smooth shape per face.
   */
  faceStyle?: "lines" | "shaded" | "faceless";
  /** 1 on the subject (people and pets), 0 on background. Background is left blank: no shapes. */
  cutout?: Uint8Array;
  /** Animal masks: each is outlined as its own part, with its shadows lifted. */
  animals?: RegionMask[];
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
  /** Palette index of the blank background, if the photo was cut out; never numbered. */
  background?: number;
  /** Pet eyes, printed already colored in (working pixels). */
  eyes?: { x: number; y: number; r: number }[];
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
