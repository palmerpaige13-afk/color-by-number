// Making a color-by-number page from a photo: finding the people (and pets) and framing the
// page around them, then building the people and the scene behind them as two layers, and
// joining them into one page with one color key. Used by the site and by the test bench, so
// both make pages exactly the same way.

import { drawClipped } from "@/lib/draw";
import { detectSubjects, findPeople } from "@/lib/detect/subjects";
import { DIFFICULTY_PARAMS, WORKING_SIZE, type Difficulty, type RegionMask } from "@/lib/pipeline";
import { importanceMap, structureMap, type SubjectBox } from "@/lib/pipeline/importance";
import { buildPage, minLabelRadius, type Layer, type Page } from "@/lib/page";
import { runPipelineAsync } from "@/lib/run-pipeline";
import { cardShape, fitOnPaper, fontFraction, type Fit, type PrintSizeId } from "@/lib/print";

/** Page pixels per working pixel of the most detailed layer. */
const SCALE = 1.5;
/** Largest page width, in pixels (a two-layer page scales up to keep the people's detail). */
const MAX_PAGE_WIDTH = 2700;
/** Share of the shape budget spent on the people on a two-layer page; the rest is the scene. */
const PEOPLE_SHARE = 0.65;

/** Share of the photo that must be people for the page to be cut out to just them. */
const MIN_CUTOUT_SHARE = 0.02;

/** Colors per layer when faces are shown (people in the photo's own colors). */
const PHOTO_COLORS_PALETTE: Record<Difficulty, number> = { easy: 16, medium: 24, hard: 40 };

/**
 * How different two paint colors must be (ΔE) to get their own numbers. Easy keeps colors
 * clearly apart; Hard allows nearby shades, so water, sky and grass get several.
 */
const KEY_DISTINCT: Record<Difficulty, number> = { easy: 10, medium: 8, hard: 6 };
/**
 * How much the background's muted tones are nudged toward soft greens and blues (0–1), so
 * harder pages get some subtle green and blue shapes among the tans instead of everything
 * being close in color.
 */
const COOL_BOOST: Record<Difficulty, number> = { easy: 0, medium: 0.4, hard: 0.8 };
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

/** Downscales `bitmap` to the working raster. */
function toWorkingImage(bitmap: ImageBitmap) {
  const s = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height));
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
  // People small in a big view (a canyon, a beach): the view stays as it is, but they still
  // get their own detailed layer, so their arms and legs don't melt into the ground.
  const small = biggest < MAIN_PERSON_SHARE * full.width * full.height;
  if (small && biggest < SMALL_PERSON_SHARE * full.width * full.height) return null;
  // Someone cut off at the side of the photo (a leg and an arm showing) isn't a subject.
  const sliver = (b: Rect) => (b.x <= full.width * 0.02 || b.x + b.width >= full.width * 0.98) && b.width < b.height * 0.3;
  // Who's a subject is judged by their boxes; the frame then takes in all of each (a bride the
  // detector boxed only half of, a dog's body across someone's lap).
  const keep = [
    ...found.people.flatMap((b, i) => (area(b) >= SIDE_PERSON_SHARE * biggest && !sliver(b) ? [found.peopleReach[i] ?? b] : [])),
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
}

/** Reads a photo (upright, as the phone shows it) and finds how to frame it. Throws if it can't be read. */
export async function loadPhoto(file: Blob): Promise<Photo> {
  const full = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { file, full, frame: await framing(full), found: new Map() };
}

/** The choices a page is made with. */
export interface PageChoices {
  printSize: PrintSizeId;
  difficulty: Difficulty;
  /** People in the photo's own colors, faces and all, or simplified with blank faces. */
  faces: boolean;
  /** The whole photo around the people, not framed closer on them. */
  zoomOut: boolean;
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
  { printSize, difficulty, faces: withFaces, zoomOut }: PageChoices,
  { onStep, onNote }: { onStep?: (step: string) => void; onNote?: (note: string) => void } = {},
): Promise<MadePage> {
  const { full } = photo;
  let frame = photo.frame;
  // Zoomed out: the whole photo around the people, not framed closer on them.
  if (frame && zoomOut) frame = { ...frame, scene: { x: 0, y: 0, width: full.width, height: full.height } };
  const params = DIFFICULTY_PARAMS[difficulty];

  // A card (4 × 6, 5 × 7) is filled edge to edge, so the picture is trimmed to its shape,
  // around the people.
  let photoRect: Rect = { x: 0, y: 0, width: full.width, height: full.height };
  if (frame) {
    const shape = cardShape(printSize, frame.scene.width > frame.scene.height);
    if (shape) {
      const scene = toAspect(frame.scene, shape, frame.subjects);
      const subjects = intersect(frame.subjects, scene);
      const moved = { x: frame.subjects.x - subjects.x, y: frame.subjects.y - subjects.y };
      const animals = frame.animals.map((a) => ({ ...a, x: a.x + moved.x, y: a.y + moved.y }));
      frame = { scene, subjects, animals };
    }
  } else {
    const shape = cardShape(printSize, full.width > full.height);
    if (shape) photoRect = toAspect(photoRect, shape, photoRect);
  }

  // The main layer: the people (and pets) on their own when there are some, else the photo.
  const mainRect: Rect = frame?.subjects ?? photoRect;
  const foundKey = `${!!frame} ${Math.round(mainRect.x)} ${Math.round(mainRect.y)} ${Math.round(mainRect.width)} ${Math.round(mainRect.height)}`;
  let found = photo.found.get(foundKey);
  if (!found) {
    const mainBitmap = frame || photoRect.width !== full.width || photoRect.height !== full.height ? await crop(full, mainRect) : full;
    const image = toWorkingImage(mainBitmap);
    found = { main: image, subjects: [], animals: [], note: "" };
    try {
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
  }
  const { main, subjects, cutout, animals, clothes, bodySkin, held } = found;
  const structure = structureMap(main.data, main.width, main.height);
  const map = importanceMap(structure, subjects, main.width, main.height);
  const list = [describeSubjects(subjects), map.buildings ? "buildings" : ""].filter(Boolean).join(", ");
  const note =
    found.note ||
    (list ? `Kept extra detail on: ${list}.` : "Didn't spot any people or buildings, so the whole photo got the same detail.");
  onNote?.(note);
  await new Promise((r) => setTimeout(r, 30));

  const faces = subjects.filter((s) => s.kind === "face");
  const twoLayers = !!(frame && cutout);
  // With faces shown, people are drawn in the photo's own colors throughout (faces with their
  // eyes and smiles, hair, clothes, what they hold), from more colors, like a paint-by-number
  // kit. Without, people are simplified: blank faces, one hair color, flat clothes.
  const photoColors = withFaces;
  const colorParams = photoColors ? { paletteSize: PHOTO_COLORS_PALETTE[difficulty] } : {};

  // The print size decides how small numbers (and so shapes) can be: the smallest number is
  // a fixed share of the picture's width, from how wide it will be printed.
  const pageRect = twoLayers && frame ? frame.scene : { width: main.width, height: main.height };
  const fit = fitOnPaper(pageRect.width / pageRect.height, printSize);
  const fontFrac = fontFraction(fit.w);

  // How big each layer is drawn decides how small its shapes can be and stay readable.
  let k = 0; // page px per photo px (two layers)
  let mainScale = SCALE;
  let pageWidth = main.width * SCALE;
  if (twoLayers && frame) {
    k = Math.min((SCALE * main.width) / mainRect.width, MAX_PAGE_WIDTH / frame.scene.width);
    mainScale = (k * mainRect.width) / main.width;
    pageWidth = frame.scene.width * k;
  }
  const budget = (share: number) => ({
    ...params,
    maxShapes: params.maxShapes && Math.round(params.maxShapes * share),
  });

  onStep?.(twoLayers ? "Building the people…" : "Building your shapes…");
  const mainResult = await runPipelineAsync(
    // Faces shown: the people straight from the photo; else hair, skin and clothes simplified.
    photoColors
      ? { ...main, importance: map.importance, cutout }
      : { ...main, importance: map.importance, faces, faceStyle: "shaded", cutout, animals, clothes, bodySkin, held },
    {
      ...budget(twoLayers ? PEOPLE_SHARE : 1),
      ...colorParams,
      // People are kept simple so a page's detail goes into the background; when the whole
      // photo is one layer (no one to cut out), everything gets the level's own detail.
      ...(twoLayers ? {} : { partMinArea: undefined, partMinRadius: undefined }),
      minLabelRadius: minLabelRadius(pageWidth, mainScale, fontFrac),
    },
  );

  let page: Page;
  if (twoLayers && frame && cutout) {
    // Scene layer underneath: the framed photo, coarser, with the people's area left out.
    const sceneBitmap = await crop(full, frame.scene);
    const scene = toWorkingImage(sceneBitmap);
    sceneBitmap.close();
    const keep = sceneMask(scene, frame.scene, { ...main, cutout }, mainRect);
    const sceneScale = (k * frame.scene.width) / scene.width;
    // The scene gets whatever part of the budget the people didn't use.
    const peopleShapes = mainResult.regionCount - (mainResult.background === undefined ? 0 : 1);
    const sceneBudget = params.maxShapes && Math.max(Math.round(params.maxShapes * (1 - PEOPLE_SHARE)), params.maxShapes - peopleShapes);
    onStep?.("Building the background…");
    const sceneResult = await runPipelineAsync(
      { ...scene, importance: structureMap(scene.data, scene.width, scene.height), cutout: keep },
      { ...params, ...colorParams, maxShapes: sceneBudget, minLabelRadius: minLabelRadius(pageWidth, sceneScale, fontFrac) },
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
      },
    ];
    page = buildPage(frame.scene.width * k, frame.scene.height * k, layers, fontFrac, KEY_DISTINCT[difficulty], COOL_BOOST[difficulty]);
  } else {
    page = buildPage(
      main.width * SCALE,
      main.height * SCALE,
      [{ result: mainResult, x: 0, y: 0, scale: SCALE, outlineBlank: true, natural: photoColors && faces.length > 0 }],
      fontFrac,
      KEY_DISTINCT[difficulty],
      COOL_BOOST[difficulty],
    );
  }
  return { page, fit, shows: frame?.scene ?? photoRect, note, people: subjects.filter((s) => s.kind === "person").length, faces: faces.length };
}
