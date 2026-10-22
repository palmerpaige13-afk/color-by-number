// Making a color-by-number page from a photo: finding the people (and pets) and framing the
// page around them, then building the people and the scene behind them as two layers, and
// joining them into one page with one color key. Used by the site and by the test bench, so
// both make pages exactly the same way.

import { drawClipped } from "@/lib/draw";
import { benchCacheOn, benchGet, benchSet, photoKey } from "@/lib/detect/bench-cache";
import { detectSubjects, findPeople } from "@/lib/detect/subjects";
import { DIFFICULTY_PARAMS, WORKING_SIZE, type Difficulty, type RegionMask } from "@/lib/pipeline";
import { importanceMap, structureMap, type SubjectBox } from "@/lib/pipeline/importance";
import { buildPage, minLabelRadius, type Layer, type Page, type SceneColors } from "@/lib/page";
import { runPipelineAsync } from "@/lib/run-pipeline";
import { labToRgb, rgbToLab } from "@/lib/pipeline/color";
import { MURALS, cardShape, fitOnPaper, fontFraction, isMural, pictureShape, type Fit, type PrintSizeId } from "@/lib/print";

/** Page pixels per working pixel of the most detailed layer. */
const SCALE = 1.5;
/** Largest page width, in pixels (a two-layer page scales up to keep the people's detail). */
const MAX_PAGE_WIDTH = 2700;
/** Share of the shape budget spent on the people on a two-layer page; the rest is the scene. */
const PEOPLE_SHARE = 0.65;

/** Share of the photo that must be people for the page to be cut out to just them. */
const MIN_CUTOUT_SHARE = 0.02;

/** Skin is at least this red (Lab a, typical of a face) when faces are shown; greener skin is warmed. */
const SKIN_MIN_RED = 12;
/** Only skin less red than this (Lab a) is warmed. */
const SKIN_WARM_BELOW = 10;
/** ...and only when that's at most this much (further off is left as the photo has it). */
const SKIN_MAX_WARM = 3;
/** Skin darker than this (Lab L) isn't warmed; up to twice it, partly. */
const SKIN_DARK = 35;


/** Faces smaller than this share of the picture keep the photo's shared colors (too small for colors of their own). */
const OWN_FACE_MIN_SHARE = 0.006;
/** A face at the top edge showing less than this share of its width in height is just a chin. */
const CHIN_ONLY = 0.6;
/** ...smaller faces (a big group) on someone's own photo get just one skin color of their own (two lets the shadow take over). */
const SMALL_FACE_COLORS = 1;
/** How important a pet is on a page with faces shown (0-1, like a face). */
const PET_IMPORTANCE = 1;

/** Shapes inside faces (when shown) may be this share of a level's smallest shape. */
const FACE_DETAIL: Record<Difficulty, number> = { easy: 0.6, medium: 0.4, hard: 0.3, expert: 0.3 };

/** Colors per layer when faces are shown (people in the photo's own colors). */
const PHOTO_COLORS_PALETTE: Record<Difficulty, number> = { easy: 16, medium: 24, hard: 40, expert: 40 };

/**
 * How different two paint colors must be (ΔE) to get their own numbers. Easy keeps colors
 * clearly apart; Hard allows nearby shades, so water, sky and grass get several.
 */
/** Expert pages print their numbers this much smaller (as adult kits do), so shapes can be smaller. */
const EXPERT_FONT = 0.75;
const KEY_DISTINCT: Record<Difficulty, number> = { easy: 10, medium: 8, hard: 6, expert: 4 };
/**
 * How much the background's muted tones are nudged toward soft greens and blues (0–1), so
 * harder pages get some subtle green and blue shapes among the tans instead of everything
 * being close in color.
 */
const COOL_BOOST: Record<Difficulty, number> = { easy: 0, medium: 0.4, hard: 0.8, expert: 0.3 };
/** Separate bits of the cut-out smaller than this share of the picture are dropped. */
const MIN_CUTOUT_PIECE = 0.002;
/** Holes inside the people smaller than this share of the picture are filled in. */
const MAX_CUTOUT_HOLE = 0.001;
/** Margin around the people when cropping, as a share of their size. */
const CROP_MARGIN = 0.06;
/** The biggest person must fill this share of the photo for it to count as a photo *of* people. */
const MAIN_PERSON_SHARE = 0.06;
/** Smaller people (but at least this share) keep the whole view and still get their own layer. */
const SMALL_PERSON_SHARE = 0.003;
/** People smaller than this share of the biggest person are background people. */
const SIDE_PERSON_SHARE = 0.25;
/** Animals at least this share of the biggest person's size are kept with the people. */
const PET_SHARE = 0.05;
/** With background, the scene is framed so the people and pets span this share of it. */
const SUBJECT_FILL = 0.8;
/** With faces shown, hair down to this share of the face's height is the head's own part. */
const HEAD_TOP_SHARE = 0.4;
/** Hair covering less than this share of the face's box is short hair (or a cap). */
const SHORT_HAIR_OF_FACE = 1;

/** A mural gets about this many shapes per sheet, up to MURAL_MAX_SHAPES in all. */
const MURAL_SHAPES_PER_SHEET = 135;
const MURAL_MAX_SHAPES = 7000;
/** A mural's numbers print this much smaller than a page's (about 4.5 pt), and its shapes can be this much smaller. */
const MURAL_FONT = 0.75;
const MURAL_SHAPE_SIZE = 0.8;
/** A mural's people get this many times their share of the picture in shapes (the scene the rest). */
const MURAL_PEOPLE_DETAIL = 1.6;
/** ...and a mural's faces keep this much finer detail still (a crowd's small faces: eyes, a beard). */
/** A mural's faces darker than this (Lab L, their middle) are in shadow (see liftShadowedFaces)... */
const FACE_SHADOW = 40;
/** ...and are lifted toward this lightness... */
const FACE_LIFT_LIT = 55;
/** ...by at most this much... */
const FACE_LIFT_MAX = 18;
/** ...with their light-to-dark spread stretched toward this (Lab L), at most this many times. */
const FACE_LIFT_RANGE = 45;
const FACE_LIFT_MAX_GAIN = 1.8;
/**
 * No piece of a mural is bigger than this share of a sheet (1/14): bigger ones are broken up.
 * With the shape budget above, a sheet has about 150-200 shapes: 30-40 minutes to color.
 */
const MURAL_PIECES = 14;
/** On sheets of someone's own photo, no piece is bigger than this share of a sheet (1/7). */
const OWN_SHEET_PIECES = 7;
/** A mural's working raster grows with its size, up to this (long side, px). */
const MURAL_MAX_WORKING = 2600;
/** ...and is at least this, so small murals' sheets are as full as big ones'. */
const MURAL_MIN_WORKING = 1800;
/** A mural's colors, at most. */
const MURAL_MAX_COLORS = 30;
/** Detail kept everywhere on a mural (0-1: how much plain areas count as important). */
const MURAL_MIN_IMPORTANCE = 0.6;
/**
 * "Extra colorful" murals: plain areas (sky, walls, water) drift into neighboring colors in
 * patches, like a painter's mural (blue sky with purple, teal and green), so every sheet has
 * several colors to color, not one. Hue turns up to this far (degrees) either way...
 */
const COLORFUL_HUE = 70;
/** ...lightness moves up to this much (Lab L)... */
const COLORFUL_LIGHT = 14;
/** ...pale colors get at least this much color (Lab chroma)... */
const COLORFUL_MIN_CHROMA = 26;
/** ...picked from this many colors before the key is cut down to MURAL_MAX_COLORS... */
const COLORFUL_PALETTE = 40;
/** ...in patches about this share of a sheet's width... */
const COLORFUL_PATCH = 0.3;
/** ...people's clothes drift this much as far (faces and skin not at all). */
const COLORFUL_PEOPLE = 0.6;
/** Clothes' patches, as a share of the background's... */
const COLORFUL_CLOTHES_PATCH = 0.45;
/** ...pale cloth (Lab chroma below this) turns warm: around this hue (degrees: 70 is a golden yellow)... */
const COLORFUL_WARM_BELOW = 22;
const COLORFUL_WARM_HUE = 70;
/** ...anywhere from this far either way (peach and orange to yellow)... */
const COLORFUL_WARM_SPREAD = 40;
/** ...with about this much color (Lab chroma). */
const COLORFUL_WARM_CHROMA = 30;
/** ...and only where the picture is smooth: less local variation than this (0-255 lightness). */
const COLORFUL_SMOOTH_BELOW = 18;

/** Smooth random values (-1..1) over a w × h image, varying over about `cell` pixels. */
function noiseField(w: number, h: number, cell: number, seed: number): Float32Array {
  let state = seed >>> 0;
  const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const grid = Float32Array.from({ length: gw * gh }, rnd);
  const out = new Float32Array(w * h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.floor(gy), ty = smooth(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.floor(gx), tx = smooth(gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Local variation of lightness (standard deviation over about r pixels), per pixel. */
function localVariation(data: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const n = w * h;
  const Y = new Float32Array(n);
  for (let p = 0; p < n; p++) Y[p] = 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
  const box = (src: Float32Array) => {
    const t = new Float32Array(n), o = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        t[y * w + x] = sum / (2 * r + 1);
        sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        o[y * w + x] = sum / (2 * r + 1);
        sum += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
    return o;
  };
  const mean = box(Y);
  const sq = box(Y.map((v) => v * v));
  return mean.map((m, p) => Math.sqrt(Math.max(0, sq[p] - m * m)));
}

/**
 * See COLORFUL_HUE. `keep(x, y)` marks pixels left as they are (faces, skin); `strength` (0-1)
 * how far colors drift. Returns new pixels.
 */
function colorful(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  patchPx: number,
  keep?: (x: number, y: number) => boolean,
  strength = 1,
  clothes = false,
): Uint8ClampedArray {
  // Two sizes of patches (big and a third the size), so plain areas break into many small shapes.
  const fine = noiseField(w, h, patchPx / 3, 53);
  const fineLight = noiseField(w, h, patchPx / 3, 29);
  const hue = noiseField(w, h, patchPx, 17).map((v, p) => 0.65 * v + 0.45 * fine[p]);
  const light = noiseField(w, h, patchPx * 0.8, 91).map((v, p) => 0.6 * v + 0.5 * fineLight[p]);
  const variation = localVariation(data, w, h, Math.max(2, Math.round(patchPx / 8)));
  const out = Uint8ClampedArray.from(data);
  const lab = new Float32Array(3);
  // Clothes: smaller patches of their own.
  const clothesHue = clothes ? noiseField(w, h, patchPx * COLORFUL_CLOTHES_PATCH, 61) : null;
  const clothesLight = clothes ? noiseField(w, h, patchPx * COLORFUL_CLOTHES_PATCH, 73) : null;
  for (let p = 0; p < w * h; p++) {
    if (keep?.(p % w, Math.floor(p / w))) continue;
    rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab, 0);
    let [L, a, b] = lab;
    let chroma = Math.hypot(a, b);
    let angle = Math.atan2(b, a);
    if (clothesHue && clothesLight) {
      // Clothes, folds and all: pale cloth (a white robe) in warm patches (cream, gold, yellow,
      // peach, light orange); colored cloth turns a little either way and keeps its color.
      if (chroma < COLORFUL_WARM_BELOW) {
        angle = ((COLORFUL_WARM_HUE + clothesHue[p] * COLORFUL_WARM_SPREAD) * Math.PI) / 180;
        chroma = COLORFUL_WARM_CHROMA * (0.6 + 0.5 * Math.abs(clothesHue[p] + clothesLight[p]));
      } else angle += (clothesHue[p] * 35 * Math.PI) / 180;
      L = Math.max(8, Math.min(96, L + clothesLight[p] * COLORFUL_LIGHT));
      const rgb = labToRgb(L, chroma * Math.cos(angle), chroma * Math.sin(angle));
      for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[c])));
      continue;
    }
    // Only plain areas drift; detailed ones keep their colors.
    const k = strength * Math.max(0, Math.min(1, 1.5 * (1 - variation[p] / COLORFUL_SMOOTH_BELOW)));
    if (k <= 0) continue;
    // Grays and pale colors take on the patch's color.
    if (chroma < COLORFUL_MIN_CHROMA) {
      if (chroma < 4) angle = hue[p] * Math.PI;
      chroma += (COLORFUL_MIN_CHROMA - chroma) * k;
    }
    angle += (hue[p] * COLORFUL_HUE * Math.PI * k) / 180;
    L = Math.max(5, Math.min(97, L + light[p] * COLORFUL_LIGHT * k));
    a = chroma * Math.cos(angle);
    b = chroma * Math.sin(angle);
    const rgb = labToRgb(L, a, b);
    for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(rgb[c])));
  }
  return out;
}

/** Expert pages work on a bigger raster, so fur, feathers and scales survive as shapes. */
const EXPERT_WORKING_SIZE = 1500;

/** Downscales `bitmap` to the working raster (`size` px on its long side). */
function toWorkingImage(bitmap: ImageBitmap, size = WORKING_SIZE) {
  const s = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * s));
  const height = Math.max(1, Math.round(bitmap.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

type Rect = { x: number; y: number; width: number; height: number };

/** What was found in the part of a photo looked at for people (see generate). */
type FoundSubjects = {
  main: ReturnType<typeof toWorkingImage>;
  subjects: SubjectBox[];
  cutout?: Uint8Array;
  animals: RegionMask[];
  clothes?: RegionMask;
  bodySkin?: RegionMask;
  held?: RegionMask;
  hair?: RegionMask;
  note: string;
};

/**
 * Where the main people (and pets with them) are, and how to frame the page:
 * - `subjects`: just around them (the whole page without background, the detail layer with it);
 * - `scene`: with background, the photo framed closer when they're small in it.
 * Null when it isn't a photo *of* people.
 */
async function framing(
  full: ImageBitmap,
): Promise<{ subjects: Rect; scene: Rect; animals: (Rect & { label: string })[] } | null> {
  const found = await findPeople(full).catch(() => ({ people: [], animals: [], peopleReach: [], animalReach: [] }));
  const area = (b: { width: number; height: number }) => b.width * b.height;
  const biggest = Math.max(0, ...found.people.map(area));
  const biggestReach = Math.max(0, ...found.people.map((b, i) => area(found.peopleReach[i] ?? b)));
  // People small in a big view (a canyon, a beach): the view stays as it is, but they still
  // get their own detailed layer, so their arms and legs don't melt into the ground.
  const small = biggest < MAIN_PERSON_SHARE * full.width * full.height;
  if (small && biggest < SMALL_PERSON_SHARE * full.width * full.height) return null;
  // Someone cut off at the side of the photo (a leg and an arm showing) isn't a subject.
  const sliver = (b: Rect) => (b.x <= full.width * 0.02 || b.x + b.width >= full.width * 0.98) && b.width < b.height * 0.3;
  // Who's a subject is judged by their boxes; the frame then takes in all of each (a bride the
  // detector boxed only half of, a dog's body across someone's lap).
  const keep = [
    // By the detector's box or each person's whole outline (reach), whichever says they're
    // big enough: someone bent over (hugging a dog) is boxed only at their back and shoulders.
    ...found.people.flatMap((b, i) => {
      const big = area(b) >= SIDE_PERSON_SHARE * biggest || area(found.peopleReach[i] ?? b) >= SIDE_PERSON_SHARE * biggestReach;
      return big && !sliver(b) ? [found.peopleReach[i] ?? b] : [];
    }),
    ...found.animals.flatMap((b, i) => (area(b) >= PET_SHARE * biggest ? [found.animalReach[i] ?? b] : [])),
  ];
  const x0 = Math.min(...keep.map((b) => b.x));
  const y0 = Math.min(...keep.map((b) => b.y));
  const x1 = Math.max(...keep.map((b) => b.x + b.width));
  const y1 = Math.max(...keep.map((b) => b.y + b.height));

  const mx = (x1 - x0) * CROP_MARGIN;
  const my = (y1 - y0) * CROP_MARGIN;
  const sx = Math.max(0, x0 - mx);
  const sy = Math.max(0, y0 - my);
  const subjects = {
    x: sx,
    y: sy,
    width: Math.min(full.width, x1 + mx) - sx,
    height: Math.min(full.height, y1 + my) - sy,
  };

  // Same shape as the photo, just big enough that the subjects fill SUBJECT_FILL of it.
  const zoom = Math.min(1, Math.max((y1 - y0) / full.height, (x1 - x0) / full.width) / SUBJECT_FILL);
  const sw = full.width * zoom;
  const sh = full.height * zoom;
  const scene = {
    x: Math.min(full.width - sw, Math.max(0, (x0 + x1) / 2 - sw / 2)),
    y: Math.min(full.height - sh, Math.max(0, (y0 + y1) / 2 - sh / 2)),
    width: sw,
    height: sh,
  };
  // The animals found, in the subjects' own pixels, so the closer look doesn't lose them.
  const animals = found.animals.map((a) => ({ ...a, x: a.x - subjects.x, y: a.y - subjects.y }));
  return { subjects, scene: small ? { x: 0, y: 0, width: full.width, height: full.height } : scene, animals };
}

/**
 * Skin lit by green leaves (under trees) comes out greenish. For faces shown in the photo's own
 * colors, each face's skin, and the bare skin of the people, is warmed back toward a skin color:
 * shifted toward red by however much the face's typical color is short of it. Other things keep
 * their colors. Returns a copy of the pixels.
 */
/**
 * Faces in shadow (a crowd in a painting, lit from one side) on a mural: eyes, brows and a beard
 * are nearly the skin's own brown, so at a mural's few colors the face comes out one blank
 * brown. Such a face is lightened and its contrast stretched, inside an oval over its box
 * (fading out toward the edge), so its features get colors of their own. Lit faces are left
 * as they are.
 */
/**
 * With faces shown, a cap or short hair on top of a head (down to the eyes), so it stays the
 * head's own part instead of joining the shirt.
 */
function headTop(f: SubjectBox): RegionMask | undefined {
  const m = f.hair;
  if (!m) return undefined;
  // Only short hair or a cap: long hair keeps the photo's colors as before.
  let n = 0;
  for (const v of m.data) n += v;
  if (n > f.width * f.height * SHORT_HAIR_OF_FACE) return undefined;
  const rows = Math.max(0, Math.min(m.height, Math.round(f.y + f.height * HEAD_TOP_SHARE - m.y)));
  if (!rows) return undefined;
  return { ...m, height: rows, data: m.data.slice(0, rows * m.width) };
}

function liftShadowedFaces(data: Uint8ClampedArray, width: number, faces: SubjectBox[]): Uint8ClampedArray {
  const height = data.length / 4 / width;
  const out = Uint8ClampedArray.from(data);
  const lab = new Float32Array(3);
  for (const f of faces) {
    const cx = f.x + f.width / 2, cy = f.y + f.height / 2;
    const rx = f.width / 2, ry = f.height / 2;
    const x0 = Math.max(0, Math.floor(f.x)), x1 = Math.min(width - 1, Math.ceil(f.x + f.width));
    const y0 = Math.max(0, Math.floor(f.y)), y1 = Math.min(height - 1, Math.ceil(f.y + f.height));
    const ls: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        const p = y * width + x;
        rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab, 0);
        ls.push(lab[0]);
      }
    }
    if (ls.length < 50) continue;
    ls.sort((a, b) => a - b);
    const lo = ls[Math.floor(ls.length * 0.05)], mid = ls[ls.length >> 1], hi = ls[Math.floor(ls.length * 0.95)];
    // Lit faces (Jesus's, in the light) are left alone.
    if (mid >= FACE_SHADOW) continue;
    const gain = Math.min(FACE_LIFT_MAX_GAIN, Math.max(1, FACE_LIFT_RANGE / Math.max(1, hi - lo)));
    const lift = Math.min(FACE_LIFT_MAX, FACE_LIFT_LIT - mid);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        // Full strength in the middle of the face, fading to none at the oval's edge.
        const k = d < 0.5 ? 1 : (1 - d) / 0.5;
        const p = y * width + x;
        rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab, 0);
        const L = mid + lift + (lab[0] - mid) * gain;
        const rgb = labToRgb(lab[0] + (Math.min(95, Math.max(3, L)) - lab[0]) * k, lab[1], lab[2]);
        for (let c = 0; c < 3; c++) out[p * 4 + c] = rgb[c];
      }
    }
  }
  return out;
}

function warmSkin(data: Uint8ClampedArray, width: number, faces: SubjectBox[], bodySkin?: RegionMask): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(data);
  const lab = new Float32Array(3);
  const shifts: number[] = [];
  const shift = (p: number, da: number) => {
    rgbToLab(out[p * 4], out[p * 4 + 1], out[p * 4 + 2], lab, 0);
    // Dark parts (hair over a face turned away, deep shadow) are left alone; they'd turn red.
    const k = Math.min(1, Math.max(0, (lab[0] - SKIN_DARK) / SKIN_DARK));
    const rgb = labToRgb(lab[0], lab[1] + da * k, lab[2]);
    for (let c = 0; c < 3; c++) out[p * 4 + c] = rgb[c];
  };
  const each = (m: RegionMask, f: (p: number) => void) => {
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const px = m.x + x;
        const py = m.y + y;
        if (m.data[y * m.width + x] && px >= 0 && px < width && py >= 0 && py * width + px < data.length / 4) f(py * width + px);
      }
    }
  };
  for (const f of faces) {
    if (!f.skin) continue;
    const a: number[] = [];
    each(f.skin, (p) => {
      rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab, 0);
      a.push(lab[1]);
    });
    if (a.length < 20) continue;
    const median = a.sort((x, y) => x - y)[a.length >> 1];
    // Only skin that's clearly off (greenish); skin near normal is left as the photo has it.
    if (median >= SKIN_WARM_BELOW) continue;
    // Only a little off: far-off skin (strong colored light) is left as the photo has it.
    const da = Math.max(0, SKIN_MIN_RED - median);
    if (da > SKIN_MAX_WARM) continue;
    if (!da) continue;
    shifts.push(da);
    each(f.skin, (p) => shift(p, da));
  }
  // Bare skin (arms, necks) gets the faces' typical shift.
  if (bodySkin && shifts.length) {
    const da = shifts.sort((x, y) => x - y)[shifts.length >> 1];
    each(bodySkin, (p) => shift(p, da));
  }
  return out;
}

/** `r` trimmed to width/height ratio `aspect`, centered on `focus` as far as `r` allows. */
function toAspect(r: Rect, aspect: number, focus: Rect): Rect {
  const width = Math.min(r.width, r.height * aspect);
  const height = width / aspect;
  const cx = focus.x + focus.width / 2;
  const cy = focus.y + focus.height / 2;
  return {
    x: Math.min(r.x + r.width - width, Math.max(r.x, cx - width / 2)),
    y: Math.min(r.y + r.height - height, Math.max(r.y, cy - height / 2)),
    width,
    height,
  };
}

/** `importance` with pets as important as faces, so a dog's nose and tongue keep their own shapes. */
function petsImportant(importance: Float32Array, animals: RegionMask[], w: number): Float32Array {
  if (!animals.length) return importance;
  const out = Float32Array.from(importance);
  for (const a of animals) {
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const p = (a.y + y) * w + a.x + x;
        if (a.data[y * a.width + x] && a.x + x >= 0 && a.x + x < w && p >= 0 && p < out.length) out[p] = Math.max(out[p], PET_IMPORTANCE);
      }
    }
  }
  return out;
}

/**
 * A rectangle of shape `aspect` (width / height) cut from `r`, centered on `focus`, that
 * still holds all of `focus`: when `r` trimmed to the shape would cut into it, the rectangle
 * grows into the rest of the photo instead (as far as the photo allows).
 */
function fitAround(r: Rect, aspect: number, focus: Rect, photo: { width: number; height: number }): Rect {
  const t = toAspect(r, aspect, focus);
  if (contains(t, focus)) return t;
  let width = Math.max(t.width, focus.width, focus.height * aspect);
  let height = width / aspect;
  if (height > photo.height) [height, width] = [photo.height, photo.height * aspect];
  if (width > photo.width) [width, height] = [photo.width, photo.width / aspect];
  const cx = focus.x + focus.width / 2, cy = focus.y + focus.height / 2;
  return {
    x: Math.min(photo.width - width, Math.max(0, cx - width / 2)),
    y: Math.min(photo.height - height, Math.max(0, cy - height / 2)),
    width,
    height,
  };
}

/** Whether `outer` holds all of `inner` (to within half a pixel). */
function contains(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 && outer.x + outer.width >= inner.x + inner.width - 0.5 && outer.y + outer.height >= inner.y + inner.height - 0.5;
}

/** The overlap of two rectangles. */
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
}

/**
 * Cuts a rectangle out of the (upright) photo. Done by drawing rather than with
 * createImageBitmap's crop, which on phone photos stored sideways (EXIF rotation) crops the
 * stored, unrotated pixels, cutting out the wrong area.
 */
function crop(full: ImageBitmap, r: Rect): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(r.width));
  canvas.height = Math.max(1, Math.ceil(r.height));
  drawClipped(canvas.getContext("2d")!, full, Math.floor(r.x), Math.floor(r.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}

/**
 * The part of the scene not covered by the people layer, in the scene layer's pixels: 1 where
 * the scene should be drawn. Shrunk by a pixel so scene shapes reach under the people's edge
 * and no white seam shows where the two layers meet.
 */
function sceneMask(
  scene: { width: number; height: number },
  sceneRect: Rect,
  people: { width: number; height: number; cutout: Uint8Array },
  peopleRect: Rect,
): Uint8Array {
  const under = new Uint8Array(scene.width * scene.height);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      // Scene pixel -> photo pixel -> people-layer pixel.
      const fx = sceneRect.x + ((x + 0.5) / scene.width) * sceneRect.width;
      const fy = sceneRect.y + ((y + 0.5) / scene.height) * sceneRect.height;
      const px = Math.floor(((fx - peopleRect.x) / peopleRect.width) * people.width);
      const py = Math.floor(((fy - peopleRect.y) / peopleRect.height) * people.height);
      if (px >= 0 && py >= 0 && px < people.width && py < people.height && people.cutout[py * people.width + px]) {
        under[y * scene.width + x] = 1;
      }
    }
  }
  const keep = new Uint8Array(under.length);
  for (let y = 0; y < scene.height; y++) {
    for (let x = 0; x < scene.width; x++) {
      const p = y * scene.width + x;
      // Keep the scene unless this pixel is well inside the people (all 4 neighbors covered).
      const inside =
        under[p] &&
        (x === 0 || under[p - 1]) &&
        (x === scene.width - 1 || under[p + 1]) &&
        (y === 0 || under[p - scene.width]) &&
        (y === scene.height - 1 || under[p + scene.width]);
      keep[p] = inside ? 0 : 1;
    }
  }
  return keep;
}

/**
 * Tidies a cut-out: tiny separate bits (a speck the segmenter picked up) are dropped, so they
 * are painted as part of the scene instead of becoming an unreadable shape of their own, and
 * small holes inside the people are filled.
 */
function dropSpecks(mask: Uint8Array, w: number) {
  const h = mask.length / w;
  const seen = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (seen[start]) continue;
    const v = mask[start];
    const piece = [start];
    seen[start] = 1;
    let edge = false;
    for (let i = 0; i < piece.length; i++) {
      const p = piece[i];
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < mask.length && mask[q] === v && !seen[q]) {
          seen[q] = 1;
          piece.push(q);
        }
      }
    }
    // A speck of person on its own goes; so does a small hole inside a person (a bright patch
    // of hair or skin the segmenter took for background), which would let the scene show through.
    if (v && piece.length < mask.length * MIN_CUTOUT_PIECE) for (const p of piece) mask[p] = 0;
    if (!v && !edge && piece.length < mask.length * MAX_CUTOUT_HOLE) for (const p of piece) mask[p] = 1;
  }
}

function describeSubjects(subjects: SubjectBox[]): string {
  const count = (k: SubjectBox["kind"]) => subjects.filter((s) => s.kind === k).length;
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (count("face")) parts.push(plural(count("face"), "face", "faces"));
  if (count("person")) parts.push(plural(count("person"), "person", "people"));
  if (count("animal")) parts.push(plural(count("animal"), "animal", "animals"));
  return parts.join(", ");
}

/** How a photo is framed (see framing). */
type Frame = Awaited<ReturnType<typeof framing>>;

/**
 * A photo ready to make pages from. Finding the people and faces is the slow part and depends
 * only on the photo (and the part of it looked at), so it's done once per photo and reused for
 * a new size, zoom or face choice.
 */
export interface Photo {
  file: Blob;
  full: ImageBitmap;
  frame: Frame;
  found: Map<string, FoundSubjects>;
  /** The photo's fingerprint, on the test bench (see bench-cache). */
  key?: string;
  /** The people's shape count with faces not shown, by settings (see the scene's budget). */
  peopleShapes?: Map<string, number>;
  /** The scene's colors with faces not shown, by settings (see buildPage's sceneFrom). */
  sceneColors?: Map<string, SceneColors>;
}

/** Reads a photo (upright, as the phone shows it) and finds how to frame it. Throws if it can't be read. */
export async function loadPhoto(file: Blob): Promise<Photo> {
  const full = await createImageBitmap(file, { imageOrientation: "from-image" });
  // On the test bench, a test photo seen before skips the finding (see bench-cache).
  const key = benchCacheOn() ? await photoKey(file) : undefined;
  let frame = key ? await benchGet<Frame>(`${key}|framing`) : undefined;
  if (frame === undefined) {
    frame = await framing(full);
    if (key) await benchSet(`${key}|framing`, frame);
  }
  return { file, full, frame, found: new Map(), key };
}

/** The choices a page is made with. */
export interface PageChoices {
  printSize: PrintSizeId;
  difficulty: Difficulty;
  /** People in the photo's own colors, faces and all, or simplified with blank faces. */
  faces: boolean;
  /** The whole photo around the people, not framed closer on them. */
  zoomOut: boolean;
  /** A mural's plain areas in extra colors (see COLORFUL_HUE). */
  colorful?: boolean;
  /**
   * Sheets of someone's own photo (Letter split in 2 or 4): the photo's own colors and pieces,
   * as on one page; no extra colors, no limit on colors, no big pieces broken up.
   */
  ownColors?: boolean;
}

export interface MadePage {
  page: Page;
  fit: Fit;
  /** The part of the photo the page shows (photo pixels), to show the photo beside it. */
  shows: Rect;
  /** What was found, in words ("Kept extra detail on: 2 faces, 1 person."). */
  note: string;
  people: number;
  faces: number;
}

/** Makes a page. `onStep` hears each step as it starts, and `onNote` what was found. */
export async function makePage(
  photo: Photo,
  { printSize, difficulty, faces: askedFaces, zoomOut, colorful: askedColorful, ownColors = false }: PageChoices,
  { onStep, onNote }: { onStep?: (step: string) => void; onNote?: (note: string) => void } = {},
): Promise<MadePage> {
  const { full } = photo;
  const extraColors = !!askedColorful && !ownColors;
  // Expert pages (ready-made animal art) are one detailed scene: no people or pets are looked
  // for, so nothing is cut out and simplified the way people are.
  const plain = difficulty === "expert";
  let frame = plain ? null : photo.frame;
  // Zoomed out: the whole photo around the people, not framed closer on them.
  if (frame && zoomOut) frame = { ...frame, scene: { x: 0, y: 0, width: full.width, height: full.height } };
  // A mural is many pages' worth of detail: more shapes in all (about MURAL_SHAPES_PER_SHEET
  // per sheet) and a bigger working raster, so each sheet is as full as a Letter page.
  const sheets = isMural(printSize) ? MURALS.find((m) => m.id === printSize)!.sheets : 1;
  const base = DIFFICULTY_PARAMS[difficulty];
  const params =
    sheets > 1
      ? {
          ...base,
          maxShapes: Math.min(MURAL_MAX_SHAPES, MURAL_SHAPES_PER_SHEET * sheets),
          minArea: base.minArea * MURAL_SHAPE_SIZE,
          minRadius: base.minRadius * Math.sqrt(MURAL_SHAPE_SIZE),
        }
      : base;
  // A mural's colors are shared by everyone coloring it: few enough for one box of markers.
  const maxColors = sheets > 1 && !ownColors ? MURAL_MAX_COLORS : Infinity;
  // Every sheet should have something to color: a mural keeps detail everywhere (the sky's
  // shades of blue as shapes of their own), not just on the people.
  const even = (importance: Float32Array) => (sheets > 1 ? importance.map((v) => Math.max(v, MURAL_MIN_IMPORTANCE)) : importance);
  const workingSize = plain ? EXPERT_WORKING_SIZE : sheets > 1 && !ownColors ? Math.min(MURAL_MAX_WORKING, Math.max(MURAL_MIN_WORKING, Math.round(WORKING_SIZE * Math.sqrt(sheets)))) : WORKING_SIZE;

  // A card (4 × 6, 5 × 7) is filled edge to edge, so the picture is trimmed to its shape,
  // around the people.
  let photoRect: Rect = { x: 0, y: 0, width: full.width, height: full.height };
  if (frame) {
    // Sheets of someone's photo show all of it (see muralLayout's `whole`): nothing is trimmed.
    let shape = ownColors && isMural(printSize) ? null : pictureShape(printSize, frame.scene.width / frame.scene.height);
    // A card turned the other way round when that way keeps more of the people (a wide group
    // on 5 × 7): all of them if it can, else the most of them.
    if (shape && cardShape(printSize, true)) {
      const f = frame;
      const kept = (a: number) => {
        const r = intersect(fitAround(f.scene, a, f.subjects, full), f.subjects);
        return (Math.max(0, r.width) * Math.max(0, r.height)) / (f.subjects.width * f.subjects.height);
      };
      if (kept(1 / shape) > kept(shape) + 0.001) shape = 1 / shape;
    }
    if (shape) {
      // Trimmed to the card's shape around everyone: it takes in more of the photo rather than
      // cut anyone off (only background is ever trimmed, if the photo has room).
      const scene = fitAround(frame.scene, shape, frame.subjects, full);
      const subjects = intersect(frame.subjects, scene);
      const moved = { x: frame.subjects.x - subjects.x, y: frame.subjects.y - subjects.y };
      const animals = frame.animals.map((a) => ({ ...a, x: a.x + moved.x, y: a.y + moved.y }));
      frame = { scene, subjects, animals };
    }
  } else {
    const shape = ownColors && isMural(printSize) ? null : pictureShape(printSize, full.width / full.height);
    if (shape) photoRect = toAspect(photoRect, shape, photoRect);
  }

  // The main layer: the people (and pets) on their own when there are some, else the photo.
  const mainRect: Rect = frame?.subjects ?? photoRect;
  const foundKey = `${plain ? "plain" : !!frame} ${workingSize} ${Math.round(mainRect.x)} ${Math.round(mainRect.y)} ${Math.round(mainRect.width)} ${Math.round(mainRect.height)}`;
  let found = photo.found.get(foundKey) ?? (photo.key ? await benchGet<FoundSubjects>(`${photo.key}|${foundKey}`) : undefined);
  if (found) photo.found.set(foundKey, found);
  else {
    const mainBitmap = frame || photoRect.width !== full.width || photoRect.height !== full.height ? await crop(full, mainRect) : full;
    const image = toWorkingImage(mainBitmap, workingSize);
    found = { main: image, subjects: [], animals: [], note: "" };
    if (!plain) try {
      Object.assign(
        found,
        await detectSubjects(mainBitmap, image.width, image.height, {
          cutOut: !!frame,
          sideShare: SIDE_PERSON_SHARE,
          knownAnimals: frame?.animals,
        }),
      );
    } catch {
      found.note = "Couldn't load the people finder (are you offline?), so only buildings were used.";
    }
    if (mainBitmap !== full) mainBitmap.close();
    // Only cut out when the people were actually found by the segmenter.
    if (found.cutout && found.cutout.reduce((n, v) => n + v, 0) < MIN_CUTOUT_SHARE * found.cutout.length) {
      found.cutout = undefined;
    }
    if (found.cutout) dropSpecks(found.cutout, image.width);
    photo.found.set(foundKey, found);
    if (photo.key) await benchSet(`${photo.key}|${foundKey}`, found);
  }
  const { main, subjects, cutout, animals, clothes, bodySkin, held, hair } = found;
  const structure = structureMap(main.data, main.width, main.height);
  const map = importanceMap(structure, subjects, main.width, main.height);
  const list = [describeSubjects(subjects), map.buildings ? "buildings" : ""].filter(Boolean).join(", ");
  const note =
    found.note ||
    (list ? `Kept extra detail on: ${list}.` : "Didn't spot any people or buildings, so the whole photo got the same detail.");
  onNote?.(note);
  await new Promise((r) => setTimeout(r, 30));

  const faces = subjects.filter((s) => s.kind === "face");
  // Faces shown changes only the people's faces: with no one's face in the picture (a dog, a
  // landscape), it changes nothing.
  const withFaces = askedFaces && faces.length > 0;
  const twoLayers = !!(frame && cutout);
  // With faces shown, people are drawn in the photo's own colors throughout (faces with their
  // eyes and smiles, hair, clothes, what they hold), from more colors, like a paint-by-number
  // kit. Without, people are simplified: blank faces, one hair color, flat clothes.
  // On the small cards there's no room for that: people stay simplified, and faces just keep a
  // few colors of their own (eyes, smile).
  // Someone's own photo with faces shown: real hair too, in its own colors (see hairOwn),
  // including hair whose face wasn't found (a head bent down). On one page, pets are parts of
  // their own, so their small features (a nose, a tongue) keep the people's finer detail.
  const card = !!cardShape(printSize, true);
  // A mural's sheets are each printed full size, so a face a share of the whole picture prints
  // that many times bigger: the smallest face with colors of its own is that much smaller (the
  // crowd around Jesus in a painting).
  const ownFaceMin = OWN_FACE_MIN_SHARE / sheets;
  const realPeople = ownColors && sheets > 1;
  const photoColors = withFaces && !card;
  const colorParams = photoColors && twoLayers
    ? { paletteSize: PHOTO_COLORS_PALETTE[difficulty] }
    : sheets > 1 && extraColors
      ? { paletteSize: COLORFUL_PALETTE }
      : {};

  // The print size decides how small numbers (and so shapes) can be: the smallest number is
  // a fixed share of the picture's width, from how wide it will be printed.
  const pageRect = twoLayers && frame ? frame.scene : { width: main.width, height: main.height };
  const fit = fitOnPaper(pageRect.width / pageRect.height, printSize, ownColors);
  const fontFrac = fontFraction(fit.w) * (difficulty === "expert" ? EXPERT_FONT : sheets > 1 ? MURAL_FONT : 1);

  // How big each layer is drawn decides how small its shapes can be and stay readable.
  let k = 0; // page px per photo px (two layers)
  let mainScale = SCALE;
  let pageWidth = main.width * SCALE;
  if (twoLayers && frame) {
    k = Math.min((SCALE * main.width) / mainRect.width, MAX_PAGE_WIDTH / frame.scene.width);
    mainScale = (k * mainRect.width) / main.width;
    pageWidth = frame.scene.width * k;
  }
  /** A mural's working image with its plain areas in extra colors (if asked), people left alone. */
  // Faces, hair and bare skin keep their own colors; clothes (a white robe) get gentler extra colors.
  const colored = (img: { width: number; height: number; data: Uint8ClampedArray }, faceBoxes: SubjectBox[], skin?: RegionMask, strength = 1) => {
    if (sheets <= 1 || !extraColors) return img.data;
    const sheetPx = img.width / (fit.mural ? fit.mural.cols : 1);
    const inMask = (m: RegionMask | undefined, x: number, y: number) =>
      !!m && x >= m.x && y >= m.y && x < m.x + m.width && y < m.y + m.height && !!m.data[(y - m.y) * m.width + x - m.x];
    const hair = img === main ? faceBoxes.map((f) => (f as SubjectBox & { hair?: RegionMask }).hair).filter((m) => !!m) : [];
    const inSkin = (x: number, y: number) => inMask(skin, x, y) || hair.some((m) => inMask(m, x, y));
    return colorful(
      img.data,
      img.width,
      img.height,
      sheetPx * COLORFUL_PATCH,
      (x, y) => inSkin(x, y) || faceBoxes.some((b) => x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height),
      strength,
      strength < 1,
    );
  };
  /** A mural's biggest piece (page px²): a share of a sheet. */
  const maxPiece = sheets > 1 ? (pageWidth * pageWidth * (fit.h / fit.w)) / sheets / (ownColors ? OWN_SHEET_PIECES : MURAL_PIECES) : undefined;
  const budget = (share: number) => ({
    ...params,
    maxShapes: params.maxShapes && Math.round(params.maxShapes * share),
  });

  onStep?.(twoLayers ? "Building the people…" : "Building your shapes…");
  /** The people's layer, with faces shown or not. */
  const runPeople = (faceOn: boolean) => {
    const photoColors = faceOn && !card;
    const colorParams = photoColors && twoLayers
      ? { paletteSize: PHOTO_COLORS_PALETTE[difficulty] }
      : sheets > 1 && extraColors
        ? { paletteSize: COLORFUL_PALETTE }
        : {};
    return runPipelineAsync(
    // Faces shown: the people straight from the photo; else hair, skin and clothes simplified.
    photoColors
      ? { ...main, data: warmSkin(sheets > 1 && !ownColors ? liftShadowedFaces(colored(main, faces, bodySkin, twoLayers ? COLORFUL_PEOPLE : 1), main.width, faces) : colored(main, faces, bodySkin, twoLayers ? COLORFUL_PEOPLE : 1), main.width, faces, bodySkin), importance: ownColors && !realPeople ? petsImportant(even(map.importance), animals, main.width) : even(map.importance), faces: faces.filter((f) => ownColors || f.width * f.height >= main.width * main.height * ownFaceMin).map((f) => ({ ...f, hair: undefined, hairOwn: ownColors ? f.hair : headTop(f), colors: f.width * f.height < main.width * main.height * ownFaceMin ? SMALL_FACE_COLORS : undefined })), looseHair: ownColors ? hair : undefined, animals: ownColors && !realPeople ? animals : undefined, bodySkin, faceStyle: "own" as const, cutout }
      : { ...main, data: colored(main, faces, bodySkin, twoLayers ? COLORFUL_PEOPLE : 1), importance: even(map.importance), faces, faceStyle: faceOn ? "card" : "shaded", cutout, animals, clothes, bodySkin, held },
    {
      ...budget(twoLayers ? PEOPLE_SHARE : 1),
      ...colorParams,
      // People are kept simple so a page's detail goes into the background; when the whole
      // photo is one layer (no one to cut out), everything gets the level's own detail.
      ...(twoLayers ? {} : { partMinArea: undefined, partMinRadius: undefined }),
      // Faces shown: smaller shapes are kept inside faces (eyes, brows, the smile), less so on
      // the small cards.
      ...(photoColors ? { partMinArea: params.minArea * FACE_DETAIL[difficulty], partMinRadius: params.minRadius * Math.sqrt(FACE_DETAIL[difficulty]) } : {}),
      minLabelRadius: minLabelRadius(pageWidth, mainScale, fontFrac),
      card,
      smallFaceNumbers: sheets > 1 && photoColors,
      teeth: photoColors,
      // The card steps that simplify shapes are for the scene behind cut-out people only: the
      // people keep their shapes exactly.
      cardScene: card && !twoLayers,
    },
  );
  };
  const mainResult = await runPeople(withFaces);

  let page: Page;
  if (twoLayers && frame && cutout) {
    // Scene layer underneath: the framed photo, coarser, with the people's area left out.
    const sceneBitmap = await crop(full, frame.scene);
    const scene = toWorkingImage(sceneBitmap, workingSize);
    sceneBitmap.close();
    const keep = sceneMask(scene, frame.scene, { ...main, cutout }, mainRect);
    const sceneScale = (k * frame.scene.width) / scene.width;
    // The scene gets whatever part of the budget the people didn't use.
    // Counted with faces not shown, so showing faces (more shapes on the people) never changes
    // the scene: the people's own shapes with faces off, made once and remembered.
    const shapesOf = (r: typeof mainResult) => r.regionCount - (r.background === undefined ? 0 : 1);
    const countKey = `${foundKey}|${printSize}|${difficulty}|${zoomOut}|${extraColors}`;
    photo.peopleShapes ??= new Map();
    photo.sceneColors ??= new Map();
    // With faces shown and this photo not yet made without, the people as they'd be without
    // (for the scene's budget and colors).
    const noFace = withFaces && !(photo.peopleShapes.has(countKey) && photo.sceneColors.has(countKey)) ? await runPeople(false) : undefined;
    if (!withFaces) photo.peopleShapes.set(countKey, shapesOf(mainResult));
    else if (!photo.peopleShapes.has(countKey)) photo.peopleShapes.set(countKey, shapesOf(noFace!));
    const peopleShapes = photo.peopleShapes.get(countKey)!;
    // A mural's scene gets a fixed share, so showing faces (more shapes on the people) never
    // changes the scene.
    const peopleArea = (mainRect.width * mainRect.height) / (frame.scene.width * frame.scene.height);
    const sceneBudget = params.maxShapes && (sheets > 1 ? Math.round(params.maxShapes * (1 - Math.min(PEOPLE_SHARE, peopleArea * MURAL_PEOPLE_DETAIL))) : Math.max(Math.round(params.maxShapes * (1 - PEOPLE_SHARE)), params.maxShapes - peopleShapes));
    onStep?.("Building the background…");
    const sceneResult = await runPipelineAsync(
      { ...scene, data: colored(scene, []), importance: even(structureMap(scene.data, scene.width, scene.height)), cutout: keep },
      // The people's extra colors (faces shown) are theirs: the scene keeps its usual colors either way.
      { ...params, ...(photoColors ? {} : colorParams), maxShapes: sceneBudget, minLabelRadius: minLabelRadius(pageWidth, sceneScale, fontFrac), card, cardScene: card },
    );
    const layers: Layer[] = [
      { result: sceneResult, x: 0, y: 0, scale: sceneScale, outlineBlank: false },
      {
        result: mainResult,
        x: (mainRect.x - frame.scene.x) * k,
        y: (mainRect.y - frame.scene.y) * k,
        scale: mainScale,
        outlineBlank: true,
        natural: photoColors,
        people: true,
        // Only a chin at the top edge "seen" as a face (bridesmaids cropped at the shoulders):
        // no one's face is really in the picture.
        noFaces: faces.every((f) => f.y <= 1 && f.height < f.width * CHIN_ONLY),
      },
    ];
    const build = (ls: Layer[], sceneFrom?: SceneColors) =>
      buildPage(frame.scene.width * k, frame.scene.height * k, ls, fontFrac, KEY_DISTINCT[difficulty], COOL_BOOST[difficulty], maxColors, maxPiece, ownColors, sheets > 1 && !extraColors, sceneFrom);
    // Faces shown changes only the people: the scene keeps the colors it has without them.
    if (withFaces && !photo.sceneColors.has(countKey)) {
      const without = build([layers[0], { ...layers[1], result: noFace!, natural: false, noFaces: layers[1].noFaces }]);
      if (without.sceneColors) photo.sceneColors.set(countKey, without.sceneColors);
    }
    page = build(layers, withFaces ? photo.sceneColors.get(countKey) : undefined);
    if (!withFaces && page.sceneColors) photo.sceneColors.set(countKey, page.sceneColors);
  } else {
    page = buildPage(
      main.width * SCALE,
      main.height * SCALE,
      [{ result: mainResult, x: 0, y: 0, scale: SCALE, outlineBlank: true, natural: photoColors && faces.length > 0 }],
      fontFrac,
      KEY_DISTINCT[difficulty],
      COOL_BOOST[difficulty],
      maxColors,
      maxPiece,
      ownColors,
    );
  }
  return { page, fit, shows: frame?.scene ?? photoRect, note, people: subjects.filter((s) => s.kind === "person").length, faces: faces.length };
}
