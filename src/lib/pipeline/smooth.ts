// Edge-preserving smoothing: a separable bilateral filter (horizontal then vertical pass).
// True 2D bilateral is ~13x slower at the same radius; the separable version is a standard
// approximation that flattens texture while keeping strong edges, which is what quantization needs.

const RADIUS = 5;
const SIGMA_S = 3;
const SIGMA_R = 28; // color distance (RGB units) at which a neighbor's weight falls off

const SPATIAL = new Float32Array(RADIUS * 2 + 1);
for (let i = -RADIUS; i <= RADIUS; i++) {
  SPATIAL[i + RADIUS] = Math.exp(-(i * i) / (2 * SIGMA_S * SIGMA_S));
}

// Range weights indexed by squared RGB distance >> 4 (max 195075 >> 4).
const RANGE = new Float32Array((195075 >> 4) + 1);
for (let i = 0; i < RANGE.length; i++) {
  RANGE[i] = Math.exp(-(i << 4) / (2 * SIGMA_R * SIGMA_R));
}

function pass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  horizontal: boolean,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r0 = src[i];
      const g0 = src[i + 1];
      const b0 = src[i + 2];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sw = 0;
      for (let k = -RADIUS; k <= RADIUS; k++) {
        let xx = x;
        let yy = y;
        if (horizontal) xx = Math.min(w - 1, Math.max(0, x + k));
        else yy = Math.min(h - 1, Math.max(0, y + k));
        const j = (yy * w + xx) * 4;
        const r = src[j];
        const g = src[j + 1];
        const b = src[j + 2];
        const dr = r - r0;
        const dg = g - g0;
        const db = b - b0;
        const wgt = SPATIAL[k + RADIUS] * RANGE[(dr * dr + dg * dg + db * db) >> 4];
        sr += r * wgt;
        sg += g * wgt;
        sb += b * wgt;
        sw += wgt;
      }
      dst[i] = sr / sw;
      dst[i + 1] = sg / sw;
      dst[i + 2] = sb / sw;
      dst[i + 3] = 255;
    }
  }
}

export function bilateralSmooth(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  passes: number,
): Uint8ClampedArray {
  const a = new Uint8ClampedArray(data);
  const b = new Uint8ClampedArray(data.length);
  // Each full pass goes a -> b (horizontal) -> a (vertical).
  for (let p = 0; p < passes; p++) {
    pass(a, b, w, h, true);
    pass(b, a, w, h, false);
  }
  return a;
}
