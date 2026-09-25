// Feature lines: thin lines for details too small to be shapes. Inside faces they come from
// the face landmarks (eyes, brows, nose, lips), which is far cleaner than edge detection on a
// few dozen pixels. Elsewhere in important areas (bodies, buildings) they come from a
// Canny-style edge sketch of the photo.

import type { FaceShape, Point } from "./types";

/** Sobel magnitude (0..~1440) above which an edge pixel starts a line, and below which it stops. */
const HIGH = 90;
const LOW = 45;
/** Lines shorter than this many pixels are specks, not features. */
const MIN_LENGTH = 8;

export function featureLines(
  data: Uint8ClampedArray,
  labels: Uint16Array,
  importance: Float32Array,
  minImportance: number,
  w: number,
  h: number,
  faceMask?: Uint8Array,
  faces?: FaceShape[],
  faceLines = true,
): Uint8Array {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Faces traced by landmarks get their features from those, and faces drawn without lines
  // get none; either way, skip edge scribbles there.
  const traced = (p: number) => {
    const k = faceMask?.[p];
    return !!k && (!faceLines || !!faces?.[k - 1]?.features);
  };

  const mag = new Float32Array(n);
  const dir = new Uint8Array(n); // 0: horizontal gradient, 1: 45°, 2: vertical, 3: 135°
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (importance[p] < minImportance || traced(p)) continue;
      const gx =
        gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1];
      const gy =
        gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1];
      mag[p] = Math.hypot(gx, gy);
      const a = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      dir[p] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }

  // Non-maximum suppression: keep only the ridge of each edge, one pixel wide.
  const OFFSETS = [1, w + 1, w, w - 1];
  const thin = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const m = mag[p];
    if (m < LOW) continue;
    const o = OFFSETS[dir[p]];
    if (m >= mag[p - o] && m > mag[p + o]) thin[p] = m;
  }

  // Hysteresis: grow from strong pixels through weak ones, and drop short fragments.
  const out = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const line: number[] = [];
  for (let start = 0; start < n; start++) {
    if (thin[start] < HIGH || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    line.length = 0;
    while (stack.length) {
      const p = stack.pop()!;
      line.push(p);
      const x = p % w;
      for (let dy = -w; dy <= w; dy += w) {
        for (let dx = -1; dx <= 1; dx++) {
          const q = p + dy + dx;
          if (q < 0 || q >= n || seen[q] || thin[q] < LOW) continue;
          if ((dx === -1 && x === 0) || (dx === 1 && x === w - 1)) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (line.length >= MIN_LENGTH) for (const p of line) out[p] = 1;
  }

  // Don't double up on outlines the coloring page already draws.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!out[p]) continue;
      const l = labels[p];
      if (
        (x > 0 && labels[p - 1] !== l) ||
        (x < w - 1 && labels[p + 1] !== l) ||
        (y > 0 && labels[p - w] !== l) ||
        (y < h - 1 && labels[p + w] !== l)
      ) {
        out[p] = 0;
      }
    }
  }
  if (faceLines) {
    for (const f of faces ?? []) for (const line of f.features ?? []) drawPolyline(line, out, w, h);
  }
  return out;
}

function drawPolyline(line: Point[], out: Uint8Array, w: number, h: number) {
  for (let i = 0; i + 1 < line.length; i++) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
    }
  }
}
