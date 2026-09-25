// Finds faces, people and animals with MediaPipe, entirely in the browser. Face candidates are
// confirmed with the face landmarker, and each face's exact shape (at any angle, without hair)
// comes from a face/hair/skin segmenter.
// Models (~9 MB, plus ~16 MB for the segmenter when a photo has faces) are fetched on first
// use and cached by the browser.

import {
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  ObjectDetector,
} from "@mediapipe/tasks-vision";
import type { SubjectBox } from "@/lib/pipeline/importance";
import { findPetFace } from "@/lib/pipeline/eyes";
import type { Box, Point, RegionMask } from "@/lib/pipeline/types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const OBJECT_MODEL = `${MODELS}/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite`;
const FACE_MODEL = `${MODELS}/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`;
const LANDMARK_MODEL = `${MODELS}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`;
const SEGMENT_MODEL = `${MODELS}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`;
/** General segmenter (PASCAL VOC classes) used to trace animals; ~3 MB, loaded only for pets. */
const ANIMAL_MODEL = `${MODELS}/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite`;
/** DeepLab category indices for animals: bird, cat, cow, dog, horse, sheep. */
const ANIMAL_CLASSES = new Set([3, 8, 10, 12, 13, 17]);
const ANIMAL_SIZE = 257;
/** Width of the close-up of a pet's head searched for eyes and nose. */
const PET_FACE_SIZE = 320;
/** Category indices in the multiclass segmenter's output. */
const HAIR = 1;
const FACE_SKIN = 3;
/** Segmenter input size, and how much around the face it looks at (x face size). */
const SEGMENT_SIZE = 256;
const SEGMENT_PAD = 3;

/** Detector score at which a face is kept even if the landmarker can't trace it (profiles). */
const SURE_FACE = 0.75;
/** Size of the square crop handed to the landmarker. */
const TRACE_SIZE = 384;

/** Bottom of the nose: left nostril, base of the nose, right nostril (landmark indices). */
const NOSE: number[] = [98, 2, 327];

const ANIMALS = ["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"];

/** Long edge of the image handed to the detectors; bigger finds smaller faces. */
const DETECT_SIZE = 1280;

let segmenter: Promise<ImageSegmenter> | null = null;

function loadSegmenter() {
  segmenter ??= FilesetResolver.forVisionTasks(WASM_URL)
    .then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENT_MODEL },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      }),
    )
    .catch((err) => {
      segmenter = null;
      throw err;
    });
  return segmenter;
}

let animalSegmenter: Promise<ImageSegmenter> | null = null;

function loadAnimalSegmenter() {
  animalSegmenter ??= FilesetResolver.forVisionTasks(WASM_URL)
    .then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: ANIMAL_MODEL },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    )
    .catch((err) => {
      animalSegmenter = null;
      throw err;
    });
  return animalSegmenter;
}

let detectors: Promise<{
  objects: ObjectDetector;
  faces: FaceDetector;
  landmarks: FaceLandmarker;
}> | null = null;

function loadDetectors() {
  detectors ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const [objects, faces, landmarks] = await Promise.all([
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: OBJECT_MODEL },
        runningMode: "IMAGE",
        scoreThreshold: 0.35,
        maxResults: 25,
        categoryAllowlist: ["person", ...ANIMALS],
      }),
      FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.3,
      }),
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: LANDMARK_MODEL },
        runningMode: "IMAGE",
        numFaces: 1,
        minFaceDetectionConfidence: 0.3,
      }),
    ]);
    return { objects, faces, landmarks };
  })().catch((err) => {
    detectors = null; // allow a retry on the next photo
    throw err;
  });
  return detectors;
}

/**
 * Returns subject boxes scaled to a `workW` x `workH` raster. The short-range face model only
 * sees faces that fill a decent share of its input, so faces are also searched inside each
 * detected person, which catches the small faces in group shots.
 */
function detectionCanvas(image: ImageBitmap) {
  const s = Math.min(1, DETECT_SIZE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * s);
  canvas.height = Math.round(image.height * s);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, scale: s };
}

/** People and animals in the photo, as boxes in the image's own pixels. Used to crop to the subject. */
export async function findPeople(image: ImageBitmap): Promise<{ people: Box[]; animals: Box[] }> {
  const { objects } = await loadDetectors();
  const { canvas, scale } = detectionCanvas(image);
  const people: Box[] = [];
  const animals: Box[] = [];
  for (const d of objects.detect(canvas).detections) {
    const b = d.boundingBox;
    if (!b) continue;
    const box = { x: b.originX / scale, y: b.originY / scale, width: b.width / scale, height: b.height / scale };
    (d.categories[0]?.categoryName === "person" ? people : animals).push(box);
  }
  return { people, animals };
}

export interface Detection {
  subjects: SubjectBox[];
  /** 1 on people and pets, 0 on background, per working pixel; absent when not cutting out. */
  cutout?: Uint8Array;
  /** Each animal's shape, in working pixels. */
  animals: RegionMask[];
}

/**
 * `cutOut`: also return a mask of the main people (anyone at least `sideShare` the size of the
 * biggest person), so the background can be left blank.
 */
export async function detectSubjects(
  image: ImageBitmap,
  workW: number,
  workH: number,
  { cutOut = false, sideShare = 0.25 } = {},
): Promise<Detection> {
  const { objects, faces, landmarks } = await loadDetectors();

  const { canvas, scale } = detectionCanvas(image);
  /** Draws a square of the detection canvas, sampled from the full-resolution photo. */
  const drawSharp = (ctx: CanvasRenderingContext2D, sx: number, sy: number, side: number, size: number) =>
    ctx.drawImage(image, sx / scale, sy / scale, side / scale, side / scale, 0, 0, size, size);
  const toWork = workW / canvas.width;

  const out: SubjectBox[] = [];
  const people: { x: number; y: number; w: number; h: number }[] = [];
  const pets: { x: number; y: number; w: number; h: number; label: string }[] = [];
  for (const d of objects.detect(canvas).detections) {
    const b = d.boundingBox;
    const name = d.categories[0]?.categoryName;
    if (!b || !name) continue;
    const kind = name === "person" ? "person" : "animal";
    if (kind === "person") people.push({ x: b.originX, y: b.originY, w: b.width, h: b.height });
    else pets.push({ x: b.originX, y: b.originY, w: b.width, h: b.height, label: name });
    out.push({ kind, x: b.originX * toWork, y: b.originY * toWork, width: b.width * toWork, height: b.height * toWork });
  }

  // Face candidates from the whole photo and from zoomed-in crops of each person; the same
  // face is usually found more than once, so candidates are resolved afterwards.
  type Candidate = { x: number; y: number; w: number; h: number; score: number };
  const candidates: Candidate[] = [];
  const addFaces = (src: HTMLCanvasElement, ox: number, oy: number, scale: number) => {
    for (const d of faces.detect(src).detections) {
      const b = d.boundingBox;
      if (!b) continue;
      candidates.push({
        x: ox + b.originX / scale,
        y: oy + b.originY / scale,
        w: b.width / scale,
        h: b.height / scale,
        score: d.categories[0]?.score ?? 0,
      });
    }
  };
  addFaces(canvas, 0, 0, 1);

  // Look for faces in the top part of each person, upscaled so the face fills the frame.
  const crop = document.createElement("canvas");
  for (const p of people) {
    const cw = p.w;
    const ch = Math.min(p.h, p.w * 1.2);
    if (cw < 12 || ch < 12) continue;
    const scale = Math.min(4, 256 / Math.max(cw, ch));
    crop.width = Math.round(cw * scale);
    crop.height = Math.round(ch * scale);
    crop.getContext("2d")!.drawImage(canvas, p.x, p.y, cw, ch, 0, 0, crop.width, crop.height);
    addFaces(crop, p.x, p.y, scale);
  }

  // Most confident first; drop any candidate overlapping one already kept.
  const overlaps = (a: Candidate, b: Candidate) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy > 0.25 * Math.min(a.w * a.h, b.w * b.h);
  };
  candidates.sort((a, b) => b.score - a.score);
  const unique: Candidate[] = [];
  for (const c of candidates) if (!unique.some((k) => overlaps(k, c))) unique.push(c);

  // Verify each candidate by tracing it with the landmarker. A traced face is certainly a face
  // (and gets an exact outline); an untraced one is kept only when the detector is very sure,
  // which covers side profiles the landmarker can't handle while rejecting bushes and patterns.
  type Face = Candidate & { lm?: Point[] };
  const traced: Face[] = unique
    .map((c): Face => ({ ...c, lm: trace(c) }))
    .filter((c) => c.lm || c.score >= SURE_FACE)
    .sort((a, b) => Number(!!b.lm) - Number(!!a.lm) || b.score - a.score);

  // When people were found, every real face belongs to one of them: at most one face per
  // person, in the upper part of their box. Faces on no one are dropped.
  let kept = traced;
  if (people.length === 0) {
    // No people: a "face" on an animal (a parrot's eye and beak) isn't a human face.
    kept = traced.filter(
      (c) =>
        !out.some((a) => {
          const fx = (c.x + c.w / 2) * toWork;
          const fy = (c.y + c.h / 2) * toWork;
          return fx >= a.x && fx <= a.x + a.width && fy >= a.y && fy <= a.y + a.height;
        }),
    );
  } else {
    const taken = new Set<number>();
    kept = traced.filter((c) => {
      const fx = c.x + c.w / 2;
      const fy = c.y + c.h / 2;
      const owner = people.findIndex(
        (p, i) =>
          !taken.has(i) && fx >= p.x && fx <= p.x + p.w && fy >= p.y && fy <= p.y + p.h * 0.45,
      );
      if (owner === -1) return false;
      taken.add(owner);
      return true;
    });
  }

  // Face shapes and the people cut-out. If the segmenter can't load, faces fall back to
  // landmark outlines and the whole photo is kept.
  const mainPeople = people.filter(
    (p) => p.w * p.h >= sideShare * Math.max(...people.map((q) => q.w * q.h)),
  );
  const wantCutout = cutOut && mainPeople.length > 0;
  const seg = kept.length || wantCutout ? await loadSegmenter().catch(() => null) : null;
  const cutout = seg && wantCutout ? cutOutPeople(seg) : undefined;

  const animalSeg = pets.length ? await loadAnimalSegmenter().catch(() => null) : null;
  const animals = animalSeg ? pets.flatMap((p) => traceAnimal(animalSeg, p) ?? []) : [];
  pets.forEach((p) => {
    const a = animals.find((m) => m.label === p.label && m.box && Math.abs(m.box.x - p.x * toWork) < 1);
    if (a && (p.label === "dog" || p.label === "cat")) a.face = petFace(p);
  });
  if (cutout) for (const a of animals) paint(a, cutout);

  const faceBoxes: SubjectBox[] = kept.map((c) => {
    const w = (pt: Point): Point => [pt[0] * toWork, pt[1] * toWork];
    const box: SubjectBox = { kind: "face", x: c.x * toWork, y: c.y * toWork, width: c.w * toWork, height: c.h * toWork };
    if (seg) Object.assign(box, segmentFace(seg, c));
    if (!c.lm) return box;
    const lm = c.lm;
    const xs = lm.map((p) => p[0]);
    const ys = lm.map((p) => p[1]);
    box.x = Math.min(...xs) * toWork;
    box.y = Math.min(...ys) * toWork;
    box.width = (Math.max(...xs) - Math.min(...xs)) * toWork;
    box.height = (Math.max(...ys) - Math.min(...ys)) * toWork;
    box.outline = chain(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL).map((i) => w(lm[i]));
    box.features = [
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
      FaceLandmarker.FACE_LANDMARKS_LIPS,
    ]
      .flatMap((conns) => conns.map((c): Point[] => [w(lm[c.start]), w(lm[c.end])]))
      .concat([NOSE.map((i) => w(lm[i]))]);
    return box;
  });

  /**
   * Face-skin and hair masks for candidate `c`, in working pixels, from the segmenter run on a
   * square around the face. The skin keeps only the blob at the face's center, holes filled.
   */
  function segmentFace(model: ImageSegmenter, c: Candidate): Pick<SubjectBox, "skin" | "hair"> {
    const side = Math.max(c.w, c.h) * SEGMENT_PAD;
    const sx = c.x + c.w / 2 - side / 2;
    const sy = c.y + c.h / 2 - side / 2;
    crop.width = crop.height = SEGMENT_SIZE;
    const ctx = crop.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SEGMENT_SIZE, SEGMENT_SIZE);
    drawSharp(ctx, sx, sy, side, SEGMENT_SIZE);
    const result = model.segment(crop);
    const cats = result.categoryMask?.getAsUint8Array().slice();
    result.close();
    if (!cats) return {};

    // Resample into working pixels.
    const x0 = Math.floor(sx * toWork);
    const y0 = Math.floor(sy * toWork);
    const size = Math.ceil(side * toWork) + 1;
    const data = new Uint8Array(size * size);
    const hair = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = Math.floor((((x0 + x + 0.5) / toWork - sx) / side) * SEGMENT_SIZE);
        const v = Math.floor((((y0 + y + 0.5) / toWork - sy) / side) * SEGMENT_SIZE);
        if (u < 0 || v < 0 || u >= SEGMENT_SIZE || v >= SEGMENT_SIZE) continue;
        const cat = cats[v * SEGMENT_SIZE + u];
        if (cat === FACE_SKIN) data[y * size + x] = 1;
        else if (cat === HAIR) hair[y * size + x] = 1;
      }
    }
    // The detector's face box always counts as face: in hard side light the segmenter can call
    // the shadowed half of a small face "hair".
    const fcx = (c.x + c.w / 2) * toWork - x0;
    const fcy = (c.y + c.h / 2) * toWork - y0;
    const rx = (c.w / 2) * toWork * 0.85;
    const ry = (c.h / 2) * toWork * 0.95;
    for (let y = Math.max(0, Math.floor(fcy - ry)); y <= Math.min(size - 1, fcy + ry); y++) {
      for (let x = Math.max(0, Math.floor(fcx - rx)); x <= Math.min(size - 1, fcx + rx); x++) {
        if (((x - fcx) / rx) ** 2 + ((y - fcy) / ry) ** 2 <= 1) {
          data[y * size + x] = 1;
          hair[y * size + x] = 0;
        }
      }
    }
    const hasSkin = cleanBlob(data, size, fcx, fcy);
    return {
      skin: hasSkin ? { x: x0, y: y0, width: size, height: size, data } : undefined,
      hair: { x: x0, y: y0, width: size, height: size, data: hair },
    };
  }

  /** Landmarks (detection-canvas pixels) for the face in candidate `c`, if the landmarker finds it. */
  function trace(c: Candidate): Point[] | undefined {
    for (const pad of [2.2, 3]) {
      const side = Math.max(c.w, c.h) * pad;
      const sx = c.x + c.w / 2 - side / 2;
      const sy = c.y + c.h / 2 - side / 2;
      crop.width = crop.height = TRACE_SIZE;
      const ctx = crop.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TRACE_SIZE, TRACE_SIZE);
      drawSharp(ctx, sx, sy, side, TRACE_SIZE);
      const lm = landmarks.detect(crop).faceLandmarks[0];
      if (!lm) continue;
      const pts = lm.map((l): Point => [sx + l.x * side, sy + l.y * side]);
      // Must be this candidate's face, not another face that happens to be in the crop.
      const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
      const my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
      if (Math.abs(mx - (c.x + c.w / 2)) < c.w && Math.abs(my - (c.y + c.h / 2)) < c.h) return pts;
    }
    return undefined;
  }

  const subjects = [...out, ...faceBoxes].map((b) => ({
    ...b,
    width: Math.min(b.width, workW - b.x),
    height: Math.min(b.height, workH - b.y),
  }));
  return { subjects, cutout, animals };

  function paint(m: RegionMask, into: Uint8Array) {
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const wx = m.x + x;
        const wy = m.y + y;
        if (m.data[y * m.width + x] && wx >= 0 && wy >= 0 && wx < workW && wy < workH) into[wy * workW + wx] = 1;
      }
    }
  }

  /**
   * A dog or cat's eyes and nose, looked for in the full-resolution photo: the top half of its
   * box (where the head is), enlarged so the eyes are clear spots. In working pixels.
   */
  function petFace(p: { x: number; y: number; w: number; h: number }): RegionMask["face"] {
    const hh = p.h * 0.55;
    const W = PET_FACE_SIZE;
    const H = Math.max(8, Math.round((W * hh) / p.w));
    crop.width = W;
    crop.height = H;
    const ctx = crop.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, p.x / scale, p.y / scale, p.w / scale, hh / scale, 0, 0, W, H);
    const found = findPetFace(ctx.getImageData(0, 0, W, H).data, W, H);
    if (!found) return undefined;
    const k = p.w / W; // close-up px -> detection-canvas px
    const toW = (x: number, y: number) => [(p.x + x * k) * toWork, (p.y + y * k) * toWork];
    return {
      eyes: found.eyes.map((e) => {
        const [x, y] = toW(e.x, e.y);
        return { x, y, r: e.r * k * toWork };
      }),
      nose: found.nose && (() => {
        const [x, y] = toW(found.nose.x, found.nose.y);
        return { x, y, rx: found.nose.rx * k * toWork, ry: found.nose.ry * k * toWork };
      })(),
    };
  }

  /** The animal's shape inside its box, from DeepLab's animal classes, cleaned to one blob. */
  function traceAnimal(
    model: ImageSegmenter,
    p: { x: number; y: number; w: number; h: number; label: string },
  ): RegionMask | undefined {
    const side = Math.max(p.w, p.h) * 1.2;
    const sx = p.x + p.w / 2 - side / 2;
    const sy = p.y + p.h / 2 - side / 2;
    const N = ANIMAL_SIZE;
    crop.width = crop.height = N;
    const ctx = crop.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, N, N);
    ctx.drawImage(canvas, sx, sy, side, side, 0, 0, N, N);
    const result = model.segment(crop);
    const cats = result.categoryMask?.getAsUint8Array().slice();
    result.close();
    if (!cats) return undefined;
    const x0 = Math.floor(sx * toWork);
    const y0 = Math.floor(sy * toWork);
    const size = Math.ceil(side * toWork) + 1;
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = Math.floor((((x0 + x + 0.5) / toWork - sx) / side) * N);
        const v = Math.floor((((y0 + y + 0.5) / toWork - sy) / side) * N);
        if (u >= 0 && v >= 0 && u < N && v < N && ANIMAL_CLASSES.has(cats[v * N + u])) data[y * size + x] = 1;
      }
    }
    const cx = (p.x + p.w / 2) * toWork - x0;
    const cy = (p.y + p.h / 2) * toWork - y0;
    return cleanBlob(data, size, cx, cy)
      ? {
          x: x0,
          y: y0,
          width: size,
          height: size,
          data,
          label: p.label,
          box: { x: p.x * toWork, y: p.y * toWork, width: p.w * toWork, height: p.h * toWork },
        }
      : undefined;
  }

  /**
   * Everything that is part of a person (skin, hair, clothes, and what they hold), from the
   * segmenter run on a square around each person. The background-confidence mask is sampled
   * bilinearly so the cut-out edge stays smooth at working resolution.
   */
  function cutOutPeople(model: ImageSegmenter): Uint8Array {
    const mask = new Uint8Array(workW * workH);
    const N = SEGMENT_SIZE;
    for (const p of mainPeople) {
      const side = Math.max(p.w, p.h) * 1.15;
      const sx = p.x + p.w / 2 - side / 2;
      const sy = p.y + p.h / 2 - side / 2;
      crop.width = crop.height = N;
      const ctx = crop.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, N, N);
      ctx.drawImage(canvas, sx, sy, side, side, 0, 0, N, N);
      const result = model.segment(crop);
      const bg = result.confidenceMasks?.[0]?.getAsFloat32Array().slice();
      result.close();
      if (!bg) continue;
      const at = (u: number, v: number) => bg[Math.min(N - 1, Math.max(0, v)) * N + Math.min(N - 1, Math.max(0, u))];
      const x0 = Math.max(0, Math.floor(sx * toWork));
      const y0 = Math.max(0, Math.floor(sy * toWork));
      const x1 = Math.min(workW - 1, Math.ceil((sx + side) * toWork));
      const y1 = Math.min(workH - 1, Math.ceil((sy + side) * toWork));
      for (let y = y0; y <= y1; y++) {
        const v = (((y + 0.5) / toWork - sy) / side) * N - 0.5;
        const vi = Math.floor(v);
        const fv = v - vi;
        for (let x = x0; x <= x1; x++) {
          const u = (((x + 0.5) / toWork - sx) / side) * N - 0.5;
          const ui = Math.floor(u);
          const fu = u - ui;
          const b =
            (at(ui, vi) * (1 - fu) + at(ui + 1, vi) * fu) * (1 - fv) +
            (at(ui, vi + 1) * (1 - fu) + at(ui + 1, vi + 1) * fu) * fv;
          if (b < 0.5) mask[y * workW + x] = 1;
        }
      }
    }
    return mask;
  }
}

/** Orders a closed loop given as unordered connections into a list of landmark indices. */
function chain(conns: { start: number; end: number }[]): number[] {
  const next = new Map<number, number>();
  for (const c of conns) next.set(c.start, c.end);
  const first = conns[0].start;
  const out = [first];
  for (let i = next.get(first); i !== undefined && i !== first && out.length <= conns.length; i = next.get(i)) {
    out.push(i);
  }
  return out;
}

/**
 * Keeps only the blob of 1s nearest (cx, cy) and fills its holes (eyes, mouth, a stray curl).
 * Returns false if there is no blob. Works in place on a size x size grid.
 */
function cleanBlob(data: Uint8Array, size: number, cx: number, cy: number): boolean {
  const n = size * size;
  let seed = -1;
  let best = Infinity;
  for (let p = 0; p < n; p++) {
    if (!data[p]) continue;
    const d = ((p % size) - cx) ** 2 + (Math.floor(p / size) - cy) ** 2;
    if (d < best) {
      best = d;
      seed = p;
    }
  }
  if (seed === -1) return false;

  const flood = (start: number[], match: (p: number) => boolean) => {
    const seen = new Uint8Array(n);
    const stack = start.filter(match);
    for (const p of stack) seen[p] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % size;
      for (const q of [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size]) {
        if (q < 0 || q >= n || seen[q] || !match(q)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    return seen;
  };

  const blob = flood([seed], (p) => data[p] === 1);
  // Everything not reachable from the border without crossing the blob is a hole.
  const border: number[] = [];
  for (let i = 0; i < size; i++) border.push(i, n - 1 - i, i * size, i * size + size - 1);
  const outside = flood(border, (p) => !blob[p]);
  for (let p = 0; p < n; p++) data[p] = outside[p] ? 0 : 1;
  return true;
}
