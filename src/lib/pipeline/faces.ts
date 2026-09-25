// Face cleanup: shading on skin (lit cheek, shadowed jaw, pink nose) otherwise quantizes into
// several skin tones and turns faces into a patchwork. For each detected face, the skin is
// flood-filled outward from the cheeks through pixels close to the face's skin tone and given
// one palette color, so the skin becomes a single shape and only real features (eyes, brows,
// lips, hair) stay separate. Growing from the cheeks, rather than recoloring every skin-toned
// pixel near the face, keeps a similar-colored background from being swallowed. Feature lines
// drawn later carry the eyes, nose and mouth.

import { labDist2, rgbToLab } from "./color";
import type { Box } from "./types";

/** ΔE from the face's typical skin color within which a pixel counts as skin. */
const SKIN_TOLERANCE = 20;

export function flattenFaces(
  indices: Uint8Array,
  smoothed: Uint8ClampedArray,
  faces: Box[],
  paletteLab: Float32Array,
  w: number,
  h: number,
): void {
  const lab = new Float32Array(3);
  const counts = new Uint32Array(paletteLab.length / 3);
  for (const f of faces) {
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;

    // Typical skin: median-ish Lab over the central part of the face (cheeks and nose),
    // which avoids hair, eyes and background.
    const coreRx = f.width * 0.28;
    const coreRy = f.height * 0.3;
    const samples: number[][] = [];
    counts.fill(0);
    for (let y = Math.max(0, Math.floor(cy - coreRy)); y <= Math.min(h - 1, cy + coreRy); y++) {
      for (let x = Math.max(0, Math.floor(cx - coreRx)); x <= Math.min(w - 1, cx + coreRx); x++) {
        if (((x - cx) / coreRx) ** 2 + ((y - cy) / coreRy) ** 2 > 1) continue;
        const p = y * w + x;
        rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
        samples.push([lab[0], lab[1], lab[2]]);
        counts[indices[p]]++;
      }
    }
    if (samples.length < 4) continue;
    const skin = new Float32Array(3);
    for (let c = 0; c < 3; c++) {
      const v = samples.map((s) => s[c]).sort((a, b) => a - b);
      skin[c] = v[v.length >> 1];
    }
    // The palette color the skin will be drawn in: the most common one on the cheeks.
    let skinColor = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[skinColor]) skinColor = i;

    // Grow from the core, never past the chin or into the background beyond the face.
    const rx = f.width * 0.6;
    const ry = f.height * 0.7;
    const tol2 = SKIN_TOLERANCE * SKIN_TOLERANCE;
    const inFace = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const isSkin = (p: number) => {
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
      return labDist2(lab, 0, skin, 0) <= tol2;
    };
    const seen = new Set<number>();
    const stack: number[] = [];
    // Seed from every skin pixel in the core, so a dark nostril at the exact center can't block it.
    for (let y = Math.max(0, Math.floor(cy - coreRy)); y <= Math.min(h - 1, cy + coreRy); y++) {
      for (let x = Math.max(0, Math.floor(cx - coreRx)); x <= Math.min(w - 1, cx + coreRx); x++) {
        const p = y * w + x;
        if (((x - cx) / coreRx) ** 2 + ((y - cy) / coreRy) ** 2 <= 1 && isSkin(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
    while (stack.length) {
      const p = stack.pop()!;
      indices[p] = skinColor;
      const x = p % w;
      const y = (p - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !inFace(nx, ny)) continue;
        const q = ny * w + nx;
        if (seen.has(q)) continue;
        seen.add(q);
        if (isSkin(q)) stack.push(q);
      }
    }
  }
}
