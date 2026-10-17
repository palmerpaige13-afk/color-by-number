// Steps for the small cards (4×6, 5×7) only. A card's smallest number is big next to the
// picture, so most of the photo's shapes are too small to keep. Merged away one at a time they
// leave jagged, speckled blobs; these steps simplify the shapes first, so what's left is a few
// smooth ones. Letter pages and murals never run anything here.

/** Smoothing passes per working px of the smallest number's radius. */
const SMOOTH_PASSES_PER_RADIUS = 0.6;
/** Most smoothing passes (each is one pass over the picture). */
const MAX_SMOOTH_PASSES = 12;

/**
 * Rounds the scene's shapes off and dissolves its speckles: each pass, every pixel of the scene
 * takes the color most of the 3×3 pixels around it have, counting only scene pixels. People and
 * pets aren't touched (a hairline's strands are what makes it look like hair). Repeated, edges
 * smooth out and bits smaller than about the number size disappear into what's around them.
 */
export function smoothCardShapes(
  colorMap: Uint8Array,
  w: number,
  h: number,
  paletteSize: number,
  /** Per color: which thing it colors (0 for the scene). */
  group: Uint8Array | undefined,
  minPrint: number,
): Uint8Array {
  const passes = Math.min(MAX_SMOOTH_PASSES, Math.round(minPrint * SMOOTH_PASSES_PER_RADIUS));
  let src = colorMap;
  const counts = new Uint16Array(paletteSize);
  for (let pass = 0; pass < passes; pass++) {
    const dst = new Uint8Array(src.length);
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const own = src[p];
        const g = group?.[own] ?? 0;
        // People (faces, hair, clothes, what they hold) and pets keep their shapes exactly.
        if (g !== 0) {
          dst[p] = own;
          continue;
        }
        let best = own;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const c = src[yy * w + xx];
            if ((group?.[c] ?? 0) !== g) continue;
            counts[c]++;
            if (counts[c] > counts[best]) best = c;
          }
        }
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w) counts[src[yy * w + xx]] = 0;
          }
        }
        dst[p] = best;
        if (best !== own) changed++;
      }
    }
    src = dst;
    if (!changed) break;
  }
  return src;
}
