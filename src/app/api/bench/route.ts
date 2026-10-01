// Test bench only (never on the live site): saves approved results and the last run's report
// into public/test-images/bench, which is kept out of git and out of deploys.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "test-images", "bench");
const APPROVED = path.join(DIR, "approved");

type Saved = { id: string; size: string; faces: number; people: number; shapes: number; colors: number };

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
