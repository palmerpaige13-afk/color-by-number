// sRGB (D65) -> CIE Lab. Distances in Lab track perceived difference far better than RGB.

const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047;
const ZN = 1.08883;

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

/** Writes L, a, b into out[offset..offset+2]. */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array, offset: number): void {
  const lr = LINEAR[r];
  const lg = LINEAR[g];
  const lb = LINEAR[b];
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / XN;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  out[offset] = 116 * fy - 16;
  out[offset + 1] = 500 * (fx - fy);
  out[offset + 2] = 200 * (fy - fz);
}

export function labDist2(a: Float32Array, ai: number, b: Float32Array, bi: number): number {
  const dl = a[ai] - b[bi];
  const da = a[ai + 1] - b[bi + 1];
  const db = a[ai + 2] - b[bi + 2];
  return dl * dl + da * da + db * db;
}

/** CIE Lab -> sRGB (0–255). `inGamut` is false when the color had to be clipped. */
export function labToRgb(L: number, a: number, b: number): { rgb: [number, number, number]; inGamut: boolean } {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  const X = inv(fx) * XN;
  const Y = inv(fy);
  const Z = inv(fz) * ZN;
  const lin = [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
  let inGamut = true;
  const rgb = lin.map((c) => {
    if (c < -0.001 || c > 1.001) inGamut = false;
    const v = Math.min(1, Math.max(0, c));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  }) as [number, number, number];
  return { rgb, inGamut };
}
