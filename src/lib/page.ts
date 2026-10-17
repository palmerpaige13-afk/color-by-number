// A printable page built from one or more pipeline results ("layers"). With the background
// kept, the people and pets are made into a paint-by-number on their own, in full detail, and
// laid over a separate, coarser paint-by-number of the scene. Each layer is placed in page
// pixels; the color key is shared, so the same color gets the same number in every layer.

import { labDist2, labInGamut, labToRgb, rgbToLab } from "@/lib/pipeline/color";
import { boundaryDistance, labelPoints } from "@/lib/pipeline/distance";
import { labelComponents } from "@/lib/pipeline/regions";
import { traceOutlines, type Outline } from "@/lib/outlines";
import { HAIR_BAND, HAIR_NUMBER, PATCH_GROUP, type PipelineResult, type RGB } from "@/lib/pipeline";

export interface Layer {
  result: PipelineResult;
  /** Top-left of the layer on the page, in page pixels. */
  x: number;
  y: number;
  /** Page pixels per working pixel of this layer. */
  scale: number;
  /** Draw the outline where this layer meets its own blank (cut-out) area. */
  outlineBlank: boolean;
  /** Keep this layer's colors as they are (people): no cooling nudge for backgrounds. */
  natural?: boolean;
  /** The people layer: never broken up in `gentle` mode (see buildPage). */
  people?: boolean;
}

export interface Page {
  width: number;
  height: number;
  /** Bottom to top. */
  layers: Layer[];
  /** Per layer: palette index -> color number (0 = not numbered). */
  numbers: Uint8Array[];
  key: { n: number; rgb: RGB }[];
  /** Number of shapes to color, over all layers. */
  shapes: number;
  /** Smallest readable number as a share of the page width, set by the print size. */
  fontFrac: number;
  /**
   * Per layer, per shape: text printed instead of the shape's number (a math problem whose
   * answer is the number). A shape too small for its text keeps the plain number.
   */
  labels?: (string | undefined)[][];
  /**
   * Per color number (index n − 1): what the key and the page print for it instead of n (the
   * answer of a multiplication problem: 12, 18, 24…). The colors stay numbered 1, 2, 3 inside.
   */
  answers?: number[];
}

/**
 * By default, every pair of colors in the key must differ by at least this (ΔE, where about
 * 10 is the smallest difference that's easy to see on paper); closer colors share one number.
 */
const DISTINCT = 10;
/** Two very dark key colors must differ by at least this (ΔE)... */
const DARK_DISTINCT = 14;
/** ...easing back to the usual difference as the lighter of the two gets this light (Lab L). */
const DARK_KEY_L = 40;
/**
 * Photos lose some color on the way to a handful of paints (averaging, smoothing), so the
 * paint colors are made livelier: more saturated, by LIVELY (skin a little less, so faces
 * don't turn orange). Grays stay gray. Light warm colors (blond hair, sand, sunlit grass) get
 * a little extra yellow.
 */
const LIVELY = 1.3;
const LIVELY_SKIN = 1.12;
const WARM_YELLOW = 1.12;
/** A color in the range of skin tones: warm (Lab hue between orange and yellow), not gray, not too dark. */
function skinLike(lab: Float32Array): boolean {
  const [L, a, b] = lab;
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return L >= SKIN_LIKE_L[0] && L <= SKIN_LIKE_L[1] && chroma >= SKIN_LIKE_CHROMA[0] && chroma <= SKIN_LIKE_CHROMA[1] && hue >= SKIN_LIKE_HUE[0] && hue <= SKIN_LIKE_HUE[1];
}
/** Skin tones' ranges, in Lab: lightness, colorfulness (chroma) and hue (degrees). */
const SKIN_LIKE_L = [35, 90];
const SKIN_LIKE_CHROMA = [10, 60];
const SKIN_LIKE_HUE = [25, 75];

function lively(c: { lab: Float32Array; faces: boolean; hair: boolean }): RGB {
  const [L, a, b] = c.lab;
  const k = c.faces ? LIVELY_SKIN : LIVELY;
  const warm = !c.faces && L > 55 && b > 8 && b > a ? WARM_YELLOW : 1;
  // Boost only as far as the screen can show: past that, a channel clips and the color
  // shifts (a bright orange turns red), so back off until it fits.
  let t = 1;
  if (!labInGamut(L, a * k, b * k * warm)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (labInGamut(L, a * (1 + (k - 1) * mid), b * (1 + (k * warm - 1) * mid))) lo = mid;
      else hi = mid;
    }
    t = lo;
  }
  return labToRgb(L, a * (1 + (k - 1) * t), b * (1 + (k * warm - 1) * t));
}

/**
 * Background colors in a warm photo (golden light on dry brush) all come out as tans and
 * browns, close to each other. With `cool` > 0, some are nudged toward cooler colors, the way
 * a painter would: muted olive and khaki tones (foliage washed out by warm light) turn toward
 * soft sage green, and pale washed-out tones get a light blue tint. Saturated golds and warm
 * browns stay as they are. `cool` 0 leaves everything alone; 1 is the full nudge.
 */
function coolBoost(rgb: RGB, cool: number): RGB {
  if (cool <= 0) return rgb;
  const lab = new Float32Array(3);
  rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
  const L = lab[0];
  let a = lab[1];
  let b = lab[2];
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (chroma < COOL_OLIVE_CHROMA && hue > 55 && hue < 120 && L > 20 && L < 80) {
    // Olive and khaki: turn toward sage green, more for the more muted.
    const t = cool * (1 - chroma / COOL_OLIVE_CHROMA);
    const h = ((hue + (COOL_GREEN_HUE - hue) * Math.min(1, t * 1.2)) * Math.PI) / 180;
    const c = Math.max(chroma, 10 * t) * (1 + 0.3 * t);
    a = c * Math.cos(h);
    b = c * Math.sin(h);
  } else if (L >= 80 && chroma < COOL_PALE_CHROMA) {
    // Pale and washed out: a light blue tint.
    a -= 2 * cool;
    b -= 9 * cool;
  } else {
    return rgb;
  }
  return labToRgb(L, a, b);
}
/** Foliage tones: Lab chroma below this; they turn toward this hue (degrees, a sage green). */
const COOL_OLIVE_CHROMA = 30;
const COOL_GREEN_HUE = 135;
/** Pale tones: Lab chroma below this get a blue tint. */
const COOL_PALE_CHROMA = 14;

/** Skin colors closer than this (ΔE) share a number: a person's arms and legs are exact copies of their face color; different people's skin never is. */
const SAME_SKIN = 0.5;
/** Different people's skin colors are kept at least this far apart (ΔE), nudging lightness. */
const MIN_SKIN_GAP = 7;
/** Something in front and what it meets (sharing at least this share of the page's width of edge)... */
const MIN_APART_EDGE = 0.04;
/** ...that came out closer than this (ΔE, exact copies) are nudged this far apart in lightness. */
const MIN_APART_GAP = 5;

/** Part kinds (see the pipeline's PartKind). */
const FACE = 1;
const HAIR = 2;
const CLOTHES = 3;
const PET = 4;
/**
 * Smallest readable number, in page pixels: a share of the page width (`fontFrac`, from the
 * print size), so it prints at a readable size however the page is scaled. The pipeline
 * merges away shapes too small for it; the coloring page itself is never colored in (only a
 * pet's black eyes and nose are).
 */
export const minFont = (pageWidth: number, fontFrac: number) => pageWidth * fontFrac;
/** Label radius (working px) a layer's shapes need for a readable number at `scale`. */
export const minLabelRadius = (pageWidth: number, scale: number, fontFrac: number) =>
  minFont(pageWidth, fontFrac) / (1.1 * scale);
/** Largest number, as a multiple of the smallest. */
const MAX_FONT_RATIO = 2.4;

export function buildPage(
  width: number,
  height: number,
  layers: Layer[],
  fontFrac: number,
  distinct = DISTINCT,
  cool = 0,
  maxColors = Infinity,
  /** Biggest shape (page px²): bigger ones are broken into patches of the nearest other colors (murals). */
  maxArea?: number,
  /**
   * Someone's own photo on sheets: only the background is broken up (people, their clothes and
   * pets stay whole), and only into its own nearby shades (up to BREAKUP_GENTLE_MAX apart).
   */
  gentle = false,
): Page {
  // Every color used anywhere, with how much of the page it covers.
  type Entry = { layer: number; index: number; rgb: RGB; area: number; kind: number; face?: string; natural?: boolean };
  const entries: Entry[] = [];
  layers.forEach(({ result, scale, natural }, layer) => {
    const area = new Float64Array(result.palette.length);
    for (let i = 0; i < result.regionCount; i++) area[result.regionColor[i]] += result.regionArea[i] * scale * scale;
    if (result.background !== undefined) area[result.background] = 0;
    result.palette.forEach((rgb, index) => {
      if (area[index] <= 0) return;
      const kind = result.partKind?.[index] ?? 0;
      // Whose skin or clothes this is (a person's clothes are a part of their own).
      // A person's arms and neck count as that person's face (not someone else's skin).
      const face =
        kind === FACE || kind === CLOTHES ? `${kind === CLOTHES ? "c" : "f"}${layer}:${(kind === FACE ? result.partPerson?.[index] : undefined) ?? result.partGroup?.[index] ?? 0}` : undefined;
      entries.push({ layer, index, rgb: kind || natural ? rgb : coolBoost(rgb, cool), area: area[index], kind, face, natural });
    });
  });

  // Which people's skin touches someone else's (a cheek-to-cheek hug, a child in arms), and
  // whose clothes touch someone else's (her denim shorts against his dark shorts): only those
  // need their own numbers; people standing apart can share one.
  const touching = new Set<string>();
  layers.forEach(({ result }, layer) => {
    const { width: w, height: h, labels, regionColor, partKind, partGroup } = result;
    const skinOf = (p: number) => {
      const c = regionColor[labels[p]];
      const kind = partKind?.[c];
      return kind === FACE || kind === CLOTHES ? `${kind === CLOTHES ? "c" : "f"}${layer}:${(kind === FACE ? result.partPerson?.[c] : undefined) ?? partGroup?.[c] ?? 0}` : null;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const a = skinOf(p);
        if (!a) continue;
        for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
          const b = q >= 0 ? skinOf(q) : null;
          if (b && b !== a) touching.add(`${a}|${b}`).add(`${b}|${a}`);
        }
      }
    }
  });
  const touch = (a: Set<string>, b: Set<string>) => [...a].some((x) => [...b].some((y) => touching.has(`${x}|${y}`)));

  // Colors that meet along a real stretch of edge where something in front (a person's skin,
  // hair or clothes, a pet) meets what's behind it or someone else: a dog's tan legs on tan
  // sand. Those never share a number, so the two can be colored apart. (Their colors stay the
  // photo's own; only exact copies are nudged, see MIN_APART_GAP.) Counted in page px of edge.
  const apartCount = new Map<string, number>();
  const meet = (a: string, b: string, n: number) => {
    if (a === b) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    apartCount.set(k, (apartCount.get(k) ?? 0) + n);
  };
  const isFront = (kind: number | undefined) => kind === FACE || kind === HAIR || kind === CLOTHES || kind === PET;
  layers.forEach(({ result, scale, x: lx, y: ly }, li) => {
    const { width: w, height: h, labels, regionColor, partKind, partGroup, background } = result;
    const colorAt = (p: number) => regionColor[labels[p]];
    // A person's own face, neck and arms are one owner (their skin), not things that meet.
    const owner = (c: number) =>
      isFront(partKind?.[c]) ? `${partKind![c]}:${(partKind![c] === FACE ? result.partPerson?.[c] : undefined) ?? partGroup?.[c] ?? 0}` : "";
    // Within the layer: a front part against anything that isn't the same part.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const a = colorAt(p);
        for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0) continue;
          const b = colorAt(q);
          if (a === b || a === background || b === background) continue;
          const oa = owner(a), ob = owner(b);
          if ((oa || ob) && oa !== ob) meet(`${li}:${a}`, `${li}:${b}`, scale);
        }
      }
    }
    // A cut-out layer (the people) against the scene under it, along its edge.
    if (li === 0 || background === undefined) return;
    const under = layers[0];
    const u = under.result;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = colorAt(y * w + x);
        if (a === background || !isFront(partKind?.[a])) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && colorAt(ny * w + nx) !== background) continue;
          const sx = Math.floor((lx + (nx + 0.5) * scale - under.x) / under.scale);
          const sy = Math.floor((ly + (ny + 0.5) * scale - under.y) / under.scale);
          if (sx < 0 || sy < 0 || sx >= u.width || sy >= u.height) continue;
          const c0 = u.regionColor[u.labels[sy * u.width + sx]];
          if (c0 !== u.background) meet(`${li}:${a}`, `0:${c0}`, scale);
        }
      }
    }
  });
  const apartOf = new Map<string, Set<string>>();
  for (const [k, n] of apartCount) {
    if (n < MIN_APART_EDGE * width) continue;
    const [a, b] = k.split("|");
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!apartOf.has(x)) apartOf.set(x, new Set());
      apartOf.get(x)!.add(y);
    }
  }
  const keyOf = (e: Entry) => `${e.layer}:${e.index}`;
  const keptApart = (a: Cluster, b: Cluster) => {
    if (!apartOf.size) return false;
    const inB = new Set(b.members.map(keyOf));
    return a.members.some((m) => [...(apartOf.get(keyOf(m)) ?? [])].some((k) => inB.has(k)));
  };

  // Merge the two closest colors (their color becomes the area-weighted mix) until every pair
  // is easy to tell apart and there are no more than `maxColors`. Shapes don't change; colors
  // that were barely different just share a number.
  type Cluster = {
    members: Entry[];
    rgb: RGB;
    lab: Float32Array;
    area: number;
    faces: boolean;
    hair: boolean;
    /** Has colors of a layer drawn in the photo's own colors (faces shown). */
    natural: boolean;
    /** The faces (and skin), and people's clothes, whose colors are in this cluster. */
    who: Set<string>;
  };
  const toLab = (rgb: RGB) => {
    const lab = new Float32Array(3);
    rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
    return lab;
  };
  let clusters: Cluster[] = entries.map((e) => ({
    members: [e],
    rgb: e.rgb,
    lab: toLab(e.rgb),
    area: e.area,
    faces: e.kind === FACE,
    hair: e.kind === HAIR,
    natural: !!e.natural,
    who: new Set(e.face ? [e.face] : []),
  }));
  // A face and hair never share a number, however close their colors are. The skin (or
  // clothes) of two people who touch shares a number only if it's exactly the same color, so
  // faces cheek to cheek don't read as one face, nor two people's clothes as one piece. (A
  // person's arms and legs are exact copies of their face's color, so they still join it.)
  const canMerge = (a: Cluster, b: Cluster, d2: number) => {
    if ((a.faces && b.hair) || (a.hair && b.faces)) return false;
    // With people in the photo's own colors, faces' colors and everything else (hair right
    // next to them) keep apart, so giving faces colors of their own doesn't change the hair.
    if ((a.natural || b.natural) && a.faces !== b.faces) return false;
    if (keptApart(a, b)) return false;
    if (a.who.size && b.who.size && touch(a.who, b.who)) return d2 < SAME_SKIN * SAME_SKIN;
    return true;
  };
  // Dark colors are harder to tell apart on paper than light ones (a near-black and a dark
  // navy both print nearly black), so two dark colors must differ by more to keep their own
  // numbers: up to DARK_DISTINCT when both are very dark. Pairs are compared by their distance
  // over what they need.
  const need2 = (a: Cluster, b: Cluster) => {
    const t = Math.min(1, Math.max(a.lab[0], b.lab[0]) / DARK_KEY_L);
    const need = Math.max(distinct, distinct + (DARK_DISTINCT - distinct) * (1 - t));
    return need * need;
  };
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = labDist2(clusters[i].lab, 0, clusters[j].lab, 0);
        const nd = d / need2(clusters[i], clusters[j]);
        if (nd < bd && canMerge(clusters[i], clusters[j], d)) {
          bd = nd;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || (bd >= 1 && clusters.length <= maxColors)) break;
    const [a, b] = [clusters[bi], clusters[bj]];
    const area = a.area + b.area;
    const rgb = a.rgb.map((v, c) => Math.round((v * a.area + b.rgb[c] * b.area) / area)) as RGB;
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push({
      members: [...a.members, ...b.members],
      rgb,
      lab: toLab(rgb),
      area,
      faces: a.faces || b.faces,
      hair: a.hair || b.hair,
      natural: a.natural || b.natural,
      who: new Set([...a.who, ...b.who]),
    });
  }

  // Touching people's skin that came out nearly the same color is nudged apart in lightness
  // (the lighter a little lighter, the darker a little darker), so two faces side by side
  // read as two faces.
  for (let round = 0; round < 3; round++) {
    for (const a of clusters) {
      for (const b of clusters) {
        if (a === b || !a.who.size || !b.who.size || !touch(a.who, b.who) || [...a.who].some((f) => b.who.has(f))) continue;
        const d = Math.sqrt(labDist2(a.lab, 0, b.lab, 0));
        if (d >= MIN_SKIN_GAP) continue;
        const [light, dark] = a.lab[0] >= b.lab[0] ? [a, b] : [b, a];
        const push = (MIN_SKIN_GAP - d) / 2;
        for (const [c, dl] of [[light, push], [dark, -push]] as const) {
          c.lab[0] = Math.min(95, Math.max(5, c.lab[0] + dl));
          c.rgb = labToRgb(c.lab[0], c.lab[1], c.lab[2]);
        }
      }
    }
  }

  // What's in front and what it meets that are exact copies of one color (a twin of the
  // sand's tan on a dog's legs) are nudged just enough that the key's two swatches differ.
  for (const a of clusters) {
    for (const b of clusters) {
      if (a === b || !keptApart(a, b)) continue;
      const d = Math.sqrt(labDist2(a.lab, 0, b.lab, 0));
      if (d >= MIN_APART_GAP) continue;
      const [light, dark] = a.lab[0] >= b.lab[0] ? [a, b] : [b, a];
      const push = (MIN_APART_GAP - d) / 2;
      for (const [c, dl] of [[light, push], [dark, -push]] as const) {
        c.lab[0] = Math.min(95, Math.max(5, c.lab[0] + dl));
        c.rgb = labToRgb(c.lab[0], c.lab[1], c.lab[2]);
      }
    }
  }

  // Numbered dark to light.
  clusters.sort((a, b) => a.lab[0] - b.lab[0]);
  const noFaces = !clusters.some((c) => c.faces);
  const numbers = layers.map(({ result }) => new Uint8Array(result.palette.length));
  const key = clusters.map((c, i) => {
    for (const m of c.members) numbers[m.layer][m.index] = i + 1;
    // When no one's face is in the picture (cropped at the shoulders), skin-colored colors on
    // the people (arms, shoulders) keep the photo's own color: livelier, they turn orange.
    const bareSkin = noFaces && !c.hair && c.members.some((m) => layers[m.layer].people) && skinLike(c.lab);
    return { n: i + 1, rgb: bareSkin ? c.rgb : lively(c) };
  });

  // Neighboring shapes that ended up with the same number become one shape: in each layer,
  // shapes are re-found from the numbers themselves. A person's skin, hair and clothes (and a
  // pet) stay apart from each other and from the background even with the same number, so
  // every person keeps their outline. Each layer's palette becomes the key
  // (index = number, 0 = blank background).
  const palette: RGB[] = [[255, 255, 255], ...key.map((k) => k.rgb)];
  const keyLab = new Float32Array(key.length * 3);
  key.forEach((k, i) => rgbToLab(k.rgb[0], k.rgb[1], k.rgb[2], keyLab, i * 3));
  const merged = layers.map((layer, li) => {
    const { result } = layer;
    const { width: w, height: h, labels } = result;
    const byNumber = new Uint8Array(w * h);
    const owner = new Uint8Array(w * h);
    const ownerOf = (c: number) => {
      const kind = result.partKind?.[c];
      return kind === FACE || kind === HAIR || kind === CLOTHES || kind === PET ? (result.partGroup?.[c] ?? 0) : 0;
    };
    for (let p = 0; p < byNumber.length; p++) {
      const c = result.regionColor[labels[p]];
      byNumber[p] = c === result.background ? 0 : numbers[li][c];
      owner[p] = ownerOf(c);
    }
    if (maxArea && !(gentle && layer.people)) {
      // Faces, skin and hair are never broken up: a face in patches of random colors isn't a face.
      const keep = new Uint8Array(w * h);
      for (let p = 0; p < keep.length; p++) {
        const kind = result.partKind?.[result.regionColor[labels[p]]];
        keep[p] = kind === FACE || kind === HAIR || (gentle && (kind === CLOTHES || kind === PET)) ? 1 : 0;
      }
      breakUpBig(byNumber, owner, w, h, maxArea / (layer.scale * layer.scale), keyLab, keep, gentle ? BREAKUP_GENTLE_MAX : BREAKUP_MAX);
    }
    const comps = labelComponents(byNumber, w, h, owner);
    const newLabels = Uint16Array.from(comps.labels);
    const regionKind = new Uint8Array(comps.count);
    for (let p = 0; p < newLabels.length; p++) regionKind[newLabels[p]] = result.partKind?.[result.regionColor[labels[p]]] ?? 0;
    const pts = labelPoints(newLabels, comps.count, w, h, boundaryDistance(newLabels, w, h));
    const next: PipelineResult = {
      ...result,
      palette,
      labels: newLabels,
      regionCount: comps.count,
      regionColor: comps.color,
      regionArea: comps.area,
      labelX: pts.x,
      labelY: pts.y,
      labelRadius: pts.radius,
      regionKind,
      background: result.background === undefined ? undefined : 0,
    };
    return { ...layer, result: next };
  });
  const identity = merged.map(() => Uint8Array.from(palette, (_, i) => i));

  let shapes = 0;
  for (const { result } of merged) {
    for (let i = 0; i < result.regionCount; i++) if (result.regionColor[i] !== 0) shapes++;
  }
  return { width, height, layers: merged, numbers: identity, key, shapes, fontFrac };
}

/**
 * Hairline gaps where one layer ends and the one under it doesn't quite start (white specks
 * along a person's edge) take the color around them. A pixel is a gap when three of its four
 * neighbors are painted, or there's color on both sides of it (within two pixels), so the edge
 * of a big blank area is left alone. In place.
 */
function fillGaps(data: Uint8ClampedArray, painted: Uint8Array, W: number, H: number) {
  for (let pass = 0; pass < 3; pass++) {
    const fill: [number, number][] = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (painted[p]) continue;
        const n = painted[p - 1] + painted[p + 1] + painted[p - W] + painted[p + W];
        // Color on both opposite sides (up to two pixels away) is a gap, not the edge of a blank area.
        const across =
          (painted[p - W] && (painted[p + W] || (y < H - 2 && painted[p + 2 * W]))) ||
          (painted[p - 1] && (painted[p + 1] || (x < W - 2 && painted[p + 2])));
        if (n >= 3 || across) fill.push([p, painted[p - W] ? p - W : painted[p - 1] ? p - 1 : painted[p + 1] ? p + 1 : p + W]);
      }
    }
    if (!fill.length) return;
    for (const [p, q] of fill) {
      data[p * 4] = data[q * 4];
      data[p * 4 + 1] = data[q * 4 + 1];
      data[p * 4 + 2] = data[q * 4 + 2];
      painted[p] = 1;
    }
  }
}

/** A shape broken up by breakUpBig takes patches of the nearest other key colors at least this far (ΔE)... */
const BREAKUP_MIN = 6;
/** ...and at most this far, so it still reads as the same thing (a robe's creams and golds). */
const BREAKUP_MAX = 45;
/** ...or this, for someone's own photo: the sky in its own shades of blue, nothing else. */
const BREAKUP_GENTLE_MAX = 13;
/** Below this chroma a color counts as grey. */
const GREY_CHROMA = 8;

/** Whether key colors `i` and `j` are shades of the same color (hue within 30°, or both grey). */
function sameHue(keyLab: Float32Array, i: number, j: number) {
  const ci = Math.hypot(keyLab[i * 3 + 1], keyLab[i * 3 + 2]);
  const cj = Math.hypot(keyLab[j * 3 + 1], keyLab[j * 3 + 2]);
  let dh = Math.abs(Math.atan2(keyLab[i * 3 + 2], keyLab[i * 3 + 1]) - Math.atan2(keyLab[j * 3 + 2], keyLab[j * 3 + 1]));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  // Greys: only other greys of the same tint (a blue-grey sky never takes a warm taupe).
  if (ci < GREY_CHROMA || cj < GREY_CHROMA) return ci < GREY_CHROMA && cj < GREY_CHROMA && (Math.max(ci, cj) < 4 || dh <= Math.PI / 3);
  return dh <= Math.PI / 6;
}

/** Smooth random values (-1..1) over a w × h grid, varying over about `cell` cells. */
function blobs(w: number, h: number, cell: number, seed: number): Float32Array {
  let state = seed >>> 0;
  const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const gw = Math.ceil(w / cell) + 2;
  const grid = Float32Array.from({ length: gw * (Math.ceil(h / cell) + 2) }, rnd);
  const out = new Float32Array(w * h);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.floor(gy), ty = s(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.floor(gx), tx = s(gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/**
 * Murals: any shape (one number, one owner) bigger than `maxArea` (layer px²) is broken into
 * blob-shaped patches of the nearest other key colors, so no one piece fills much of a sheet
 * (faces, skin and hair, marked in `keep`, are left whole).
 * Works on the final numbers, so the color count can't merge the patches back. In place.
 */
function breakUpBig(
  byNumber: Uint8Array,
  owner: Uint8Array,
  w: number,
  h: number,
  maxArea: number,
  keyLab: Float32Array,
  keep: Uint8Array,
  maxDelta = BREAKUP_MAX,
) {
  const colors = keyLab.length / 3;
  const near = new Map<number, number[]>();
  const nearFor = (n: number) => {
    let found = near.get(n);
    if (found) return found;
    const list: [number, number][] = [];
    for (let o = 1; o <= colors; o++) {
      if (o === n) continue;
      const d = Math.sqrt(labDist2(keyLab, (n - 1) * 3, keyLab, (o - 1) * 3));
      if (d < BREAKUP_MIN || d > maxDelta) continue;
      // Gentle (someone's own photo): only shades of the same color, so a grey sky never takes
      // the sand's beige. A nearly grey color takes only other greys.
      if (maxDelta === BREAKUP_GENTLE_MAX && !sameHue(keyLab, n - 1, o - 1)) continue;
      list.push([o, d]);
    }
    list.sort((a, b) => a[1] - b[1]);
    found = list.slice(0, 3).map(([o]) => o);
    near.set(n, found);
    return found;
  };
  const cell = Math.max(3, Math.sqrt(maxArea) * 0.45);
  for (let round = 0; round < 4; round++) {
    const comps = labelComponents(byNumber, w, h, owner);
    const big = new Uint8Array(comps.count);
    let any = false;
    for (let i = 0; i < comps.count; i++) {
      if (comps.area[i] <= maxArea || comps.color[i] === 0) continue;
      big[i] = 1;
      any = true;
    }
    if (!any) return;
    const a = blobs(w, h, cell, 11 + round * 97);
    const b = blobs(w, h, cell * 0.7, 23 + round * 89);
    for (let p = 0; p < w * h; p++) {
      if (!big[comps.labels[p]] || keep[p]) continue;
      const alts = nearFor(byNumber[p]);
      if (!alts.length) continue;
      if (a[p] > 0.2) byNumber[p] = alts[0];
      else if (b[p] > 0.3 && alts[1]) byNumber[p] = alts[1];
      else if (a[p] < -0.45 && alts[2]) byNumber[p] = alts[2];
    }
  }
}

const EDGE: RGB = [70, 70, 70];
/** A shape's text (a math problem) spans at most this share of its widest circle. */
const LABEL_FILL = 0.9;
/** A math problem prints no smaller than this share of the smallest number size. */
const LABEL_MIN_FONT = 0.8;

/** A part of the page (in page units): one sheet of a mural. */
export interface PageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws the page at `pxScale` times its layout size (1 for the screen, more for printing).
 * Lines stay thin but visible at any resolution; numbers keep their printed size. With
 * `region`, only that part is drawn (one sheet of a mural), and every piece of a shape the
 * region's edge cuts through gets a number of its own.
 */
export function drawPage(canvas: HTMLCanvasElement, page: Page, view: "outline" | "colored", pxScale = 1, region?: PageRegion) {
  const fullW = Math.round(page.width * pxScale);
  const ox = region ? region.x * pxScale : 0;
  const oy = region ? region.y * pxScale : 0;
  const W = region ? Math.round(region.w * pxScale) : fullW;
  const H = region ? Math.round(region.h * pxScale) : Math.round(page.height * pxScale);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  img.data.fill(255);
  /** Pixels some layer painted (the rest is the blank paper). */
  const painted = new Uint8Array(W * H);

  // Numbers follow the whole page's width (a share of it), so a mural's sheets match each other.
  const MIN_FONT = minFont(fullW, page.fontFrac);
  const MAX_FONT = MIN_FONT * MAX_FONT_RATIO;
  /** Line thickness in pixels: about 0.2 mm when printed (one sheet's width, for a mural). */
  const t = Math.max(1, Math.round(W / 1800));
  const placed = page.layers.map((l) => ({ ...l, x: l.x * pxScale - ox, y: l.y * pxScale - oy, scale: l.scale * pxScale }));
  placed.forEach((layer, li) => {
    const { result, scale } = layer;
    const { width: w, height: h, labels, regionColor } = result;
    const color = (index: number) => page.key[page.numbers[li][index] - 1]?.rgb ?? result.palette[index];
    const blank = (l: number) => regionColor[l] === result.background;

    // Fill each shape (at page resolution); outlines are drawn afterwards as smooth lines.
    const x0 = Math.max(0, Math.floor(layer.x));
    const y0 = Math.max(0, Math.floor(layer.y));
    const x1 = Math.min(W, Math.ceil(layer.x + w * scale));
    const y1 = Math.min(H, Math.ceil(layer.y + h * scale));
    const at = (X: number, Y: number) => {
      const lx = Math.min(w - 1, Math.max(0, Math.floor((X + 0.5 - layer.x) / scale)));
      const ly = Math.min(h - 1, Math.max(0, Math.floor((Y + 0.5 - layer.y) / scale)));
      return ly * w + lx;
    };
    for (let Y = y0; Y < y1; Y++) {
      for (let X = x0; X < x1; X++) {
        const l = labels[at(X, Y)];
        if (blank(l)) continue; // leave whatever is underneath
        const rgb: RGB = view === "colored" ? color(regionColor[l]) : [255, 255, 255];
        painted[Y * W + X] = 1;
        const q = (Y * W + X) * 4;
        img.data[q] = rgb[0];
        img.data[q + 1] = rgb[1];
        img.data[q + 2] = rgb[2];
      }
    }
  });
  if (view === "colored") fillGaps(img.data, painted, W, H);
  ctx.putImageData(img, 0, 0);

  // Outlines: smooth lines along every border between shapes (and around a cut-out).
  ctx.strokeStyle = `rgb(${EDGE.join(",")})`;
  ctx.lineWidth = Math.max(1, W / 1500);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  placed.forEach((layer) => {
    ctx.beginPath();
    for (const line of layerOutlines(layer.result, layer.outlineBlank)) {
      ctx.moveTo(layer.x + line[0] * layer.scale, layer.y + line[1] * layer.scale);
      for (let i = 2; i < line.length; i += 2) {
        ctx.lineTo(layer.x + line[i] * layer.scale, layer.y + line[i + 1] * layer.scale);
      }
    }
    ctx.stroke();
  });

  // Frame a full scene; a cut-out stands on its own.
  const bottom = page.layers[0]?.result;
  if (!region && bottom && bottom.background === undefined) {
    ctx.strokeStyle = "#464646";
    ctx.lineWidth = t;
    ctx.strokeRect(t / 2, t / 2, W - t, H - t);
  }

  placed.forEach((layer, li) => {
    const { result, scale } = layer;
    // Pet eyes and nose: plain black spots, printed already filled in, to color around.
    ctx.fillStyle = "#111";
    for (const n of result.noses ?? []) {
      ctx.beginPath();
      ctx.ellipse(layer.x + n.x * scale, layer.y + n.y * scale, Math.max(2 * t, n.rx * scale), Math.max(1.6 * t, n.ry * scale), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of result.eyes ?? []) {
      ctx.beginPath();
      ctx.arc(layer.x + e.x * scale, layer.y + e.y * scale, Math.max(2 * t, e.r * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    if (view === "colored") return;
    ctx.fillStyle = "#555";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (region) {
      drawRegionNumbers(ctx, layer, page.numbers[li], W, H, MIN_FONT, MAX_FONT);
      return;
    }
    for (let i = 0; i < result.regionCount; i++) {
      if (result.regionColor[i] === result.background) continue;
      const size = Math.min(MAX_FONT, result.labelRadius[i] * scale * 1.1);
      // Thin hair, a pet's nose, a thin arm and a baby's outfit against a dress may carry a
      // slightly smaller number (see HAIR_NUMBER).
      const kind = result.regionKind?.[i];
      const patch = kind === CLOTHES && (result.partGroup?.[result.regionColor[i]] ?? 0) >= PATCH_GROUP;
      if (size < (kind === HAIR ? MIN_FONT * HAIR_BAND : kind === PET || kind === FACE || patch ? MIN_FONT * HAIR_NUMBER : MIN_FONT)) continue;
      const n = page.numbers[li][result.regionColor[i]];
      let text = String(page.answers?.[n - 1] ?? n);
      let px = size;
      const label = page.labels?.[li]?.[i];
      if (label) {
        // A problem is wider than a number: smaller to fit across the shape (never below the
        // smallest size problems print at), then without its spaces; a shape too small for
        // either keeps its number.
        ctx.font = `${Math.round(size)}px Arial, sans-serif`;
        for (const t of [label, label.replace(/ /g, "")]) {
          const fit = Math.min(size, (size * 2 * result.labelRadius[i] * scale * LABEL_FILL) / ctx.measureText(t).width);
          if (fit >= MIN_FONT * LABEL_MIN_FONT) {
            text = t;
            px = fit;
            break;
          }
        }
      }
      ctx.font = `${Math.round(px)}px Arial, sans-serif`;
      ctx.fillText(text, layer.x + result.labelX[i] * scale, layer.y + result.labelY[i] * scale);
    }
  });
}

/**
 * Numbers for the part of a layer showing on a W × H canvas (one sheet of a mural): the shapes
 * are cut at the canvas's edges, and each piece that's big enough gets its shape's number,
 * placed where the piece is widest.
 */
function drawRegionNumbers(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  numbers: Uint8Array,
  W: number,
  H: number,
  minFontPx: number,
  maxFontPx: number,
) {
  const { result, x, y, scale } = layer;
  const { width: w, height: h, labels, regionColor, regionKind } = result;
  // The layer's pixels under the canvas.
  const x0 = Math.max(0, Math.floor(-x / scale));
  const y0 = Math.max(0, Math.floor(-y / scale));
  const x1 = Math.min(w, Math.ceil((W - x) / scale));
  const y1 = Math.min(h, Math.ceil((H - y) / scale));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return;
  // Pieces: connected pixels of one shape inside the cut.
  const piece = new Int32Array(cw * ch).fill(-1);
  const pieceShape: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cw * ch; start++) {
    if (piece[start] !== -1) continue;
    const shape = labels[(y0 + Math.floor(start / cw)) * w + x0 + (start % cw)];
    const id = pieceShape.length;
    pieceShape.push(shape);
    piece[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % cw;
      for (const q of [px > 0 ? p - 1 : -1, px < cw - 1 ? p + 1 : -1, p - cw, p + cw]) {
        if (q < 0 || q >= cw * ch || piece[q] !== -1) continue;
        if (labels[(y0 + Math.floor(q / cw)) * w + x0 + (q % cw)] !== shape) continue;
        piece[q] = id;
        stack.push(q);
      }
    }
  }
  const pts = labelPoints(piece, pieceShape.length, cw, ch, boundaryDistance(piece, cw, ch));
  for (let i = 0; i < pieceShape.length; i++) {
    const shape = pieceShape[i];
    if (regionColor[shape] === result.background) continue;
    const size = Math.min(maxFontPx, pts.radius[i] * scale * 1.1);
    if (size < (regionKind?.[shape] === HAIR ? minFontPx * HAIR_BAND : regionKind?.[shape] === PET || regionKind?.[shape] === FACE ? minFontPx * HAIR_NUMBER : minFontPx)) continue;
    ctx.font = `${Math.round(size)}px Arial, sans-serif`;
    ctx.fillText(String(numbers[regionColor[shape]]), x + (x0 + pts.x[i]) * scale, y + (y0 + pts.y[i]) * scale);
  }
}

/** Traced outlines per layer result (they don't depend on the drawing size, so reuse them). */
const outlineCache = new WeakMap<PipelineResult, Map<boolean, Outline[]>>();

function layerOutlines(result: PipelineResult, outlineBlank: boolean): Outline[] {
  let byMode = outlineCache.get(result);
  if (!byMode) outlineCache.set(result, (byMode = new Map()));
  let lines = byMode.get(outlineBlank);
  if (!lines) {
    const { regionColor, background } = result;
    const blank = (l: number) => regionColor[l] === background;
    // A scene under a cut-out doesn't outline its hole: the people layer on top does.
    lines = traceOutlines(result.labels, result.width, result.height, (a, b) => outlineBlank || (!blank(a) && !blank(b)));
    byMode.set(outlineBlank, lines);
  }
  return lines;
}
