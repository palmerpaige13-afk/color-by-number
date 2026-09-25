// Finds faces, people and animals with MediaPipe, entirely in the browser.
// Models (~5 MB total) are fetched on first use and cached by the browser.

import { FaceDetector, FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import type { SubjectBox } from "@/lib/pipeline/importance";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELS = "https://storage.googleapis.com/mediapipe-models";
const OBJECT_MODEL = `${MODELS}/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite`;
const FACE_MODEL = `${MODELS}/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`;

const ANIMALS = ["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"];

/** Long edge of the image handed to the detectors; bigger finds smaller faces. */
const DETECT_SIZE = 1280;

let detectors: Promise<{ objects: ObjectDetector; faces: FaceDetector }> | null = null;

function loadDetectors() {
  detectors ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const [objects, faces] = await Promise.all([
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
        minDetectionConfidence: 0.5,
      }),
    ]);
    return { objects, faces };
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
export async function detectSubjects(
  image: ImageBitmap,
  workW: number,
  workH: number,
): Promise<SubjectBox[]> {
  const { objects, faces } = await loadDetectors();

  const s = Math.min(1, DETECT_SIZE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * s);
  canvas.height = Math.round(image.height * s);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const toWork = workW / canvas.width;

  const out: SubjectBox[] = [];
  const people: { x: number; y: number; w: number; h: number }[] = [];
  for (const d of objects.detect(canvas).detections) {
    const b = d.boundingBox;
    const name = d.categories[0]?.categoryName;
    if (!b || !name) continue;
    const kind = name === "person" ? "person" : "animal";
    if (kind === "person") people.push({ x: b.originX, y: b.originY, w: b.width, h: b.height });
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
  let kept: Candidate[] = [];
  for (const c of candidates) if (!kept.some((k) => overlaps(k, c))) kept.push(c);

  // When people were found, every real face belongs to one of them: at most one face per
  // person, in the upper part of their box. Faces on no one (a bouquet, a pattern) are dropped.
  if (people.length > 0) {
    const taken = new Set<number>();
    kept = kept.filter((c) => {
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

  const faceBoxes: SubjectBox[] = kept.map((c) => ({
    kind: "face",
    x: c.x * toWork,
    y: c.y * toWork,
    width: c.w * toWork,
    height: c.h * toWork,
  }));

  return [...out, ...faceBoxes].map((b) => ({
    ...b,
    width: Math.min(b.width, workW - b.x),
    height: Math.min(b.height, workH - b.y),
  }));
}
