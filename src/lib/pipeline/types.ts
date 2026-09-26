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
  /** A pet's eyes and nose found in the full-resolution photo (working pixels). */
  face?: {
    eyes: { x: number; y: number; r: number }[];
    nose: { x: number; y: number; rx: number; ry: number } | null;
  };
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
  /** Most shapes the page may have; the smallest are merged until it fits. */
  maxShapes?: number;
  /**
   * Smallest shape (label radius, working px) that can hold a readable number, for how this
   * layer will be drawn. Defaults to one suited to drawing at 1.5 page px per working px.
   */
  minLabelRadius?: number;
  /**
   * One skin color per person: each face is a single tone, and the person's neck, arms, hands,
   * legs and feet take that same tone.
   */
  oneSkinTone?: boolean;
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
  /** Animal masks: each is outlined as its own part. */
  animals?: RegionMask[];
  /** The people's clothes: kept as their own shapes, apart from skin and background. */
  clothes?: RegionMask;
  /** The people's bare skin other than faces (neck, arms, legs, feet). */
  bodySkin?: RegionMask;
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
  /** Per palette index: what it colors (0 photo, 1 face, 2 hair, 3 clothes, 4 pet). */
  partKind?: Uint8Array;
  /** Per palette index: which part (a face, a head of hair, a pet) it colors; 0 for none. */
  partGroup?: Uint8Array;
  /** Pet eyes and noses, printed already colored in (working pixels). */
  eyes?: { x: number; y: number; r: number }[];
  noses?: { x: number; y: number; rx: number; ry: number }[];
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
