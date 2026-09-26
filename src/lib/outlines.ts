// Smooth outlines. Shapes live on a pixel grid, so their borders are staircases; drawn as is
// and enlarged, every outline shows little steps. Here the borders between shapes are traced
// along the pixel corners into connected lines (one per stretch between junctions, where
// three or more shapes meet), then rounded with Chaikin corner cutting, which turns the steps
// into smooth curves while junctions stay put so neighboring lines still meet.

/** A traced outline: x, y pairs in grid (working pixel) coordinates. */
export type Outline = Float32Array;

/**
 * Outlines of every border between two shapes of `labels` (w x h) for which `keep(a, b)` is
 * true, smoothed with `rounds` of corner cutting.
 */
export function traceOutlines(
  labels: ArrayLike<number>,
  w: number,
  h: number,
  keep: (a: number, b: number) => boolean,
  rounds = 3,
): Outline[] {
  // Border edges run along pixel corners; corner (cx, cy) has id cy * (w + 1) + cx.
  const W1 = w + 1;
  const ea: number[] = [];
  const eb: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const l = labels[p];
      if (x < w - 1) {
        const r = labels[p + 1];
        if (r !== l && keep(l, r)) {
          ea.push(y * W1 + x + 1);
          eb.push((y + 1) * W1 + x + 1);
        }
      }
      if (y < h - 1) {
        const d = labels[p + w];
        if (d !== l && keep(l, d)) {
          ea.push((y + 1) * W1 + x);
          eb.push((y + 1) * W1 + x + 1);
        }
      }
    }
  }

  // Corner -> its edges (at most 4).
  const degree = new Uint8Array(W1 * (h + 1));
  const incident = new Int32Array(W1 * (h + 1) * 4);
  const addIncident = (v: number, e: number) => {
    incident[v * 4 + degree[v]] = e;
    degree[v]++;
  };
  for (let e = 0; e < ea.length; e++) {
    addIncident(ea[e], e);
    addIncident(eb[e], e);
  }

  const used = new Uint8Array(ea.length);
  const out: Outline[] = [];
  const walk = (start: number, firstEdge: number) => {
    const pts = [start];
    let v = start;
    let e = firstEdge;
    for (;;) {
      used[e] = 1;
      v = ea[e] === v ? eb[e] : ea[e];
      pts.push(v);
      if (degree[v] !== 2 || v === start) break;
      const a = incident[v * 4];
      const b = incident[v * 4 + 1];
      e = used[a] ? b : a;
      if (used[e]) break;
    }
    const closed = pts[pts.length - 1] === start && pts.length > 2;
    out.push(smooth(pts.map((id) => [id % W1, Math.floor(id / W1)] as [number, number]), closed, rounds));
  };
  // Open lines first, from every junction or end; then the closed loops that remain.
  for (let v = 0; v < degree.length; v++) {
    if (degree[v] === 0 || degree[v] === 2) continue;
    for (let k = 0; k < degree[v]; k++) {
      const e = incident[v * 4 + k];
      if (!used[e]) walk(v, e);
    }
  }
  for (let e = 0; e < ea.length; e++) if (!used[e]) walk(ea[e], e);
  return out;
}

/** Chaikin corner cutting; an open line keeps its two ends exactly where they were. */
function smooth(pts: [number, number][], closed: boolean, rounds: number): Outline {
  let cur = closed ? pts.slice(0, -1) : pts;
  for (let r = 0; r < rounds && cur.length > 2; r++) {
    const next: [number, number][] = [];
    const n = cur.length;
    if (!closed) next.push(cur[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [ax, ay] = cur[i];
      const [bx, by] = cur[(i + 1) % n];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    if (!closed) next.push(cur[n - 1]);
    cur = next;
  }
  if (closed) cur.push(cur[0]);
  const flat = new Float32Array(cur.length * 2);
  cur.forEach(([x, y], i) => {
    flat[i * 2] = x;
    flat[i * 2 + 1] = y;
  });
  return flat;
}
