// Test bench only (never on the live site): saves approved results and the last run's report
// into public/test-images/bench, which is kept out of git and out of deploys.

import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "test-images", "bench");
const APPROVED = path.join(DIR, "approved");

type Saved = { id: string; size: string; faces: number; people: number; shapes: number; colors: number };

/**
 * GET ?kind=detect-version: a fingerprint of the code that finds people, faces and pets
 * (src/lib/detect and make-page.ts), so the bench's memory of what it found in each test photo
 * (lib/detect/bench-cache.ts) is forgotten whenever that code changes.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  if (new URL(request.url).searchParams.get("kind") !== "detect-version") return new Response(null, { status: 400 });
  const src = path.join(process.cwd(), "src", "lib");
  const files = [
    ...(await readdir(path.join(src, "detect"))).filter((f) => f.endsWith(".ts")).sort().map((f) => path.join(src, "detect", f)),
    path.join(src, "make-page.ts"),
  ];
  const hash = createHash("sha256");
  for (const f of files) hash.update(await readFile(f));
  return new Response(hash.digest("hex").slice(0, 16));
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const body = await request.json();
  if (body.kind === "snapshot") {
    // A picture to look at while working on a fix (bench/snapshots/<name>.jpg).
    if (!/^[\w-]+$/.test(body.name) || !String(body.image).startsWith("data:image/jpeg;base64,")) {
      return new Response("bad snapshot", { status: 400 });
    }
    await mkdir(path.join(DIR, "snapshots"), { recursive: true });
    await writeFile(path.join(DIR, "snapshots", `${body.name}.jpg`), Buffer.from(body.image.split(",")[1], "base64"));
    return Response.json({ ok: true });
  }
  if (body.kind === "video") {
    // A video made while working (bench/snapshots/<name>.mp4).
    if (!/^[\w-]+$/.test(body.name) || !String(body.video).startsWith("data:video/mp4;base64,")) {
      return new Response("bad video", { status: 400 });
    }
    await mkdir(path.join(DIR, "snapshots"), { recursive: true });
    await writeFile(path.join(DIR, "snapshots", `${body.name}.mp4`), Buffer.from(body.video.split(",")[1], "base64"));
    return Response.json({ ok: true });
  }
  if (body.kind === "debug") {
    // Notes from the page-making code while working on a fix (bench/debug.log).
    await appendFile(path.join(DIR, "debug.log"), JSON.stringify(body.note) + "\n");
    return Response.json({ ok: true });
  }
  if (body.kind === "report") {
    await writeFile(path.join(DIR, "last-run.json"), JSON.stringify(body.report, null, 2));
    return Response.json({ ok: true });
  }
  // An approval: the result's picture and numbers become the standard for that photo and size.
  const { id, size, image, ...numbers } = body as Saved & { image: string };
  if (!/^b\d\d$/.test(id) || !/^[\w×-]+$/.test(size) || !image.startsWith("data:image/jpeg;base64,")) {
    return new Response("bad approval", { status: 400 });
  }
  await mkdir(APPROVED, { recursive: true });
  await writeFile(path.join(APPROVED, `${id}-${size}.jpg`), Buffer.from(image.split(",")[1], "base64"));
  const file = path.join(APPROVED, "approved.json");
  const all = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  all[`${id}-${size}`] = { ...numbers, approvedAt: new Date().toISOString() };
  await writeFile(file, JSON.stringify(all, null, 2));
  return Response.json({ ok: true });
}
