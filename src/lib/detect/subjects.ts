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

  const faceBoxes: SubjectBox[] = [];
  const addFaces = (src: CanvasImageSource, ox: number, oy: number, scale: number) => {
    for (const d of faces.detect(src as HTMLCanvasElement).detections) {
      const b = d.boundingBox;
      if (!b) continue;
      const box: SubjectBox = {
        kind: "face",
        x: (ox + b.originX / scale) * toWork,
        y: (oy + b.originY / scale) * toWork,
        width: (b.width / scale) * toWork,
        height: (b.height / scale) * toWork,
      };
      // Skip duplicates of a face already found at another scale.
      const dup = faceBoxes.some(
        (f) => Math.abs(f.x - box.x) < f.width / 2 && Math.abs(f.y - box.y) < f.height / 2,
      );
      if (!dup) faceBoxes.push(box);
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

  return [...out, ...faceBoxes].map((b) => ({
    ...b,
    width: Math.min(b.width, workW - b.x),
    height: Math.min(b.height, workH - b.y),
  }));
}
