// The site owner's review page: reads the fix reports and shared photos, which the public key
// can't. Server only: it uses the project's secret key (SUPABASE_SECRET_KEY) and a password
// (REVIEW_PASSWORD), both set in the hosting's environment settings, never in the code.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SUPABASE_URL = "https://axdbxneqepcrlpfmwtjv.supabase.co";
const BUCKET = "shared-photos";
/** How long a photo link on the review page works, in seconds. */
const PHOTO_LINK_SECONDS = 60 * 60;
export const REVIEW_COOKIE = "review";

/** What's missing before the page can work (environment settings), or null. */
export function reviewSetupMissing(): string[] | null {
  const missing = ["SUPABASE_SECRET_KEY", "REVIEW_PASSWORD"].filter((name) => !process.env[name]);
  return missing.length ? missing : null;
}

/** The cookie value that proves the password was entered (a hash, not the password). */
export function passwordToken(password: string): string {
  return createHash("sha256").update(`color-by-number review:${password}`).digest("hex");
}

/** Whether `token` matches the review password's. */
export function tokenOk(token: string | undefined): boolean {
  const password = process.env.REVIEW_PASSWORD;
  if (!password || !token) return false;
  const want = Buffer.from(passwordToken(password));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Whether this request comes from someone who entered the review password. */
export async function signedIn(): Promise<boolean> {
  return tokenOk((await cookies()).get(REVIEW_COOKIE)?.value);
}

function headers(): Record<string, string> {
  const key = process.env.SUPABASE_SECRET_KEY!;
  // New secret keys go in `apikey`; an older service-role key (a JWT) also as a bearer token.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export interface Fix {
  tool?: string;
  part?: string;
  parts?: string[];
  how?: string;
  from_rgb?: number[];
  to_rgb?: number[];
  at?: number[];
}

export interface Report {
  id: string;
  created_at: string;
  device: string | null;
  print_size: string | null;
  difficulty: string | null;
  people: number | null;
  faces: number | null;
  shapes_before: number | null;
  colors_before: number | null;
  note: string | null;
  photo_path: string | null;
  fixes: Fix[];
  reviewed_at: string | null;
}

/** The reports, newest first: only the new ones (not yet marked reviewed) unless `all`. */
export async function loadReports(all: boolean): Promise<Report[]> {
  const fields = "id,created_at,device,print_size,difficulty,people,faces,shapes_before,colors_before,note,photo_path,fixes,reviewed_at";
  const filter = all ? "" : "&reviewed_at=is.null";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fix_reports?select=${fields}${filter}&order=created_at.desc&limit=200`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Couldn't load the reports (${res.status}).`);
  return res.json();
}

/** A link to a shared photo that works for an hour; with `download`, it saves the file. */
export async function photoLink(path: string, download = false): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: PHOTO_LINK_SECONDS }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL?: string };
  if (!signedURL) return null;
  const url = `${SUPABASE_URL}/storage/v1${signedURL}`;
  return download ? `${url}&download=${encodeURIComponent(path.split("/").pop() ?? "photo.jpg")}` : url;
}

/** Marks a report reviewed (or new again). */
export async function setReviewed(id: string, reviewed: boolean): Promise<void> {
  await setManyReviewed([id], reviewed);
}

/** Marks several reports reviewed (or new again) at once. */
export async function setManyReviewed(ids: string[], reviewed: boolean): Promise<void> {
  const ok = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (!ok.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fix_reports?id=in.(${ok.join(",")})`, {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ reviewed_at: reviewed ? new Date().toISOString() : null }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Couldn't update the report (${res.status}).`);
}
