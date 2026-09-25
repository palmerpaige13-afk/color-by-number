// Feature lines: a Canny-style edge sketch of the photo, used to draw eyes, brows, lips and
// window frames as thin lines inside important areas, where they are too thin to be shapes.

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
): Uint8Array {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const mag = new Float32Array(n);
  const dir = new Uint8Array(n); // 0: horizontal gradient, 1: 45°, 2: vertical, 3: 135°
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (importance[p] < minImportance) continue;
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
  return out;
}
