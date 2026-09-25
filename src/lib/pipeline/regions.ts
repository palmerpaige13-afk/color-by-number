// Region extraction and cleanup on a palette-index raster ("color map").

import { labDist2 } from "./color";

export interface Components {
  /** Region id per pixel. */
  labels: Int32Array;
  count: number;
  /** Palette index per region. */
  color: Uint8Array;
  area: Uint32Array;
}

/** 4-connected component labeling via iterative flood fill. */
export function labelComponents(colorMap: Uint8Array, w: number, h: number): Components {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const colors: number[] = [];
  const areas: number[] = [];
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1) continue;
    const c = colorMap[start];
    let top = 0;
    stack[top++] = start;
    labels[start] = count;
    let area = 0;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const x = p % w;
      if (x > 0 && labels[p - 1] === -1 && colorMap[p - 1] === c) {
        labels[p - 1] = count;
        stack[top++] = p - 1;
      }
      if (x < w - 1 && labels[p + 1] === -1 && colorMap[p + 1] === c) {
        labels[p + 1] = count;
        stack[top++] = p + 1;
      }
      if (p >= w && labels[p - w] === -1 && colorMap[p - w] === c) {
        labels[p - w] = count;
        stack[top++] = p - w;
      }
      if (p < n - w && labels[p + w] === -1 && colorMap[p + w] === c) {
        labels[p + w] = count;
        stack[top++] = p + w;
      }
    }
    colors.push(c);
    areas.push(area);
    count++;
  }
  return { labels, count, color: Uint8Array.from(colors), area: Uint32Array.from(areas) };
}

/** Min-heap of [priority, id] pairs with lazy deletion. */
class Heap {
  private pri: number[] = [];
  private ids: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(p: number, id: number): void {
    this.pri.push(p);
    this.ids.push(id);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.pri[0], this.ids[0]];
    const lastP = this.pri.pop()!;
    const lastId = this.ids.pop()!;
    if (this.ids.length > 0) {
      this.pri[0] = lastP;
      this.ids[0] = lastId;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.ids.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
  }
}

/**
 * Merges every region flagged by `needsMerge` into its most similar neighbor (Lab distance
 * between palette colors, longest shared border breaks ties), smallest first, until no
 * flagged region remains or a flagged region has no neighbors. Returns a new color map.
 *
 * `needsMerge` is evaluated against the region's *current* (possibly grown) area.
 */
export function mergeRegions(
  comps: Components,
  w: number,
  h: number,
  paletteLab: Float32Array,
  needsMerge: (id: number, area: number) => boolean,
): Uint8Array {
  const { labels, count } = comps;
  const color = Uint8Array.from(comps.color);
  const area = Uint32Array.from(comps.area);

  // Adjacency: neighbor id -> shared border length.
  const adj: Map<number, number>[] = new Array(count);
  for (let i = 0; i < count; i++) adj[i] = new Map();
  const link = (a: number, b: number) => {
    adj[a].set(b, (adj[a].get(b) ?? 0) + 1);
    adj[b].set(a, (adj[b].get(a) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = labels[p];
      if (x < w - 1 && labels[p + 1] !== a) link(a, labels[p + 1]);
      if (y < h - 1 && labels[p + w] !== a) link(a, labels[p + w]);
    }
  }

  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const flagged = new Uint8Array(count);
  const heap = new Heap();
  for (let i = 0; i < count; i++) {
    if (needsMerge(i, area[i])) {
      flagged[i] = 1;
      heap.push(area[i], i);
    }
  }

  while (heap.size > 0) {
    const [pri, r] = heap.pop();
    if (parent[r] !== r || pri !== area[r] || !flagged[r]) continue; // stale entry
    if (adj[r].size === 0) continue;

    let target = -1;
    let bestD = Infinity;
    let bestBorder = -1;
    for (const [nb, border] of adj[r]) {
      const d = labDist2(paletteLab, color[r] * 3, paletteLab, color[nb] * 3);
      if (d < bestD || (d === bestD && border > bestBorder)) {
        bestD = d;
        bestBorder = border;
        target = nb;
      }
    }

    // Absorb r into target.
    parent[r] = target;
    area[target] += area[r];
    adj[target].delete(r);
    for (const [nb, border] of adj[r]) {
      if (nb === target) continue;
      adj[nb].delete(r);
      adj[nb].set(target, (adj[nb].get(target) ?? 0) + border);
      adj[target].set(nb, (adj[target].get(nb) ?? 0) + border);
    }
    adj[r].clear();

    flagged[target] = needsMerge(target, area[target]) ? 1 : 0;
    if (flagged[target]) heap.push(area[target], target);
  }

  const out = new Uint8Array(w * h);
  for (let p = 0; p < out.length; p++) out[p] = color[find(labels[p])];
  return out;
}

/** 3x3 majority filter on the color map; a pixel only changes if another color strictly wins. */
export function majorityFilter(
  colorMap: Uint8Array,
  w: number,
  h: number,
  paletteSize: number,
  passes: number,
): Uint8Array {
  let src = colorMap;
  const counts = new Uint8Array(paletteSize);
  for (let pass = 0; pass < passes; pass++) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const own = src[p];
        let best = own;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            counts[src[yy * w + xx]]++;
          }
        }
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const c = src[yy * w + xx];
            if (counts[c] > counts[best]) best = c;
          }
        }
        dst[p] = best;
        // Reset only the touched counters.
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            counts[src[yy * w + xx]] = 0;
          }
        }
      }
    }
    src = dst;
  }
  return src;
}

/** Per region, the Lab distance (ΔE) to its most similar neighbor: how much it stands out. */
export function neighborContrast(
  comps: Components,
  w: number,
  h: number,
  paletteLab: Float32Array,
): Float32Array {
  const { labels, count, color } = comps;
  const best = new Float32Array(count).fill(Infinity);
  const visit = (a: number, b: number) => {
    const d = labDist2(paletteLab, color[a] * 3, paletteLab, color[b] * 3);
    if (d < best[a]) best[a] = d;
    if (d < best[b]) best[b] = d;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = labels[p];
      if (x < w - 1 && labels[p + 1] !== a) visit(a, labels[p + 1]);
      if (y < h - 1 && labels[p + w] !== a) visit(a, labels[p + w]);
    }
  }
  for (let i = 0; i < count; i++) best[i] = Math.sqrt(best[i]);
  return best;
}
