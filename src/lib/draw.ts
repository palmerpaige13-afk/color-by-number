// Drawing part of an image, safely in every browser. Safari (on iPhone especially) draws
// nothing at all when the part asked for reaches past the image's edge, where other browsers
// just leave that bit blank. So the part is trimmed to the image first, and drawn where it
// belongs in the destination.

type Source = HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** Like ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh), but safe past the image's edges. */
export function drawClipped(
  ctx: CanvasRenderingContext2D,
  src: Source,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  if (sw <= 0 || sh <= 0) return;
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(src.width, sx + sw);
  const y1 = Math.min(src.height, sy + sh);
  if (x1 <= x0 || y1 <= y0) return;
  const kx = dw / sw;
  const ky = dh / sh;
  ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
}
