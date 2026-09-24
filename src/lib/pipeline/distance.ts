// Label placement: for each region, the pixel furthest from any region boundary
// (the pole of inaccessibility on the pixel grid), via an exact Euclidean distance transform.

const INF = 1e20;

/** Felzenszwalb & Huttenlocher 1D squared-distance transform, in place over f[offset + i*stride]. */
function edt1d(
  f: Float64Array,
  offset: number,
  stride: number,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    const fq = f[offset + q * stride];
    let s: number;
    for (;;) {
      const vk = v[k];
      s = (fq + q * q - (f[offset + vk * stride] + vk * vk)) / (2 * q - 2 * vk);
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    if (s <= z[k]) {
      // k === 0 and parabola q dominates from -inf.
      v[0] = q;
      z[0] = -INF;
      z[1] = INF;
      continue;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const vk = v[k];
    d[q] = (q - vk) * (q - vk) + f[offset + vk * stride];
  }
  for (let q = 0; q < n; q++) f[offset + q * stride] = d[q];
}

/**
 * Squared distance from each pixel to the nearest boundary pixel. A pixel is a boundary pixel
 * if it touches a different region (4-neighborhood) or the image edge.
 */
export function boundaryDistance(labels: Int32Array | Uint16Array, w: number, h: number): Float64Array {
  const f = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const l = labels[p];
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        labels[p - 1] !== l ||
        labels[p + 1] !== l ||
        labels[p - w] !== l ||
        labels[p + w] !== l;
      f[p] = edge ? 0 : INF;
    }
  }
  const m = Math.max(w, h);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) edt1d(f, x, w, h, d, v, z);
  for (let y = 0; y < h; y++) edt1d(f, y * w, 1, w, d, v, z);
  return f;
}

export interface LabelPoints {
  x: Float32Array;
  y: Float32Array;
  radius: Float32Array;
}

export function labelPoints(
  labels: Int32Array | Uint16Array,
  count: number,
  w: number,
  h: number,
  dist2: Float64Array,
): LabelPoints {
  const best = new Float64Array(count).fill(-1);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  for (let p = 0; p < w * h; p++) {
    const l = labels[p];
    if (dist2[p] > best[l]) {
      best[l] = dist2[p];
      x[l] = (p % w) + 0.5;
      y[l] = Math.floor(p / w) + 0.5;
    }
  }
  // +0.5: a boundary pixel still has half a pixel of its own region around its center.
  const radius = new Float32Array(count);
  for (let i = 0; i < count; i++) radius[i] = Math.sqrt(Math.max(0, best[i])) + 0.5;
  return { x, y, radius };
}
