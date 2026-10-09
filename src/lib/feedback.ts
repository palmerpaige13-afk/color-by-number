// Sends a fix report: what someone fixed by hand on their page, so the automatic results can
// be improved. Only sent when the person taps Send; their photo only if they also ask to share
// it. Also counts visits (the kind of device, the page and where they came from, nothing about
// the person), so the site's owner can see how much it's used. Both go to the site's Supabase
// project, where the public key can add rows and shared photos but not read them back.

const SUPABASE_URL = "https://axdbxneqepcrlpfmwtjv.supabase.co";
/** Publishable (public) key: safe in the browser; the database only lets it add reports. */
const SUPABASE_KEY = "sb_publishable_GbbXbeOcMGmqeU34fzFqBA_3tbPIOTR";

/** Which version of the site made the page (bump when the automatic results change). */
export const APP_VERSION = "2026-09-26";

/** One hand fix, described without anything from the photo itself. */
export type FixEntry = Record<string, string | number | boolean | number[] | string[]>;

export interface FixReport {
  difficulty: string;
  background: string;
  print_size: string;
  people: number;
  faces: number;
  shapes_before: number;
  shapes_after: number;
  colors_before: number;
  colors_after: number;
  fixes: FixEntry[];
  note?: string;
}

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

function device(): "phone" | "tablet" | "computer" {
  const w = Math.min(window.screen.width, window.screen.height);
  return w < 600 ? "phone" : w < 1000 ? "tablet" : "computer";
}

/** The photo made smaller (at most 1600 px on its long side) as a JPEG, for sharing. */
async function shrink(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo"))), "image/jpeg", 0.85),
  );
}

/** Sends the report (and the photo, if given). Throws if it couldn't be sent. */
export async function sendReport(report: FixReport, photo?: Blob): Promise<void> {
  let photo_path: string | undefined;
  if (photo) {
    photo_path = `uploads/${crypto.randomUUID()}.jpg`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/shared-photos/${photo_path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/jpeg" },
      body: await shrink(photo),
    });
    if (!res.ok) throw new Error("Couldn't send the photo");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fix_reports`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ...report, app_version: APP_VERSION, device: device(), photo_path, note: report.note || undefined }),
  });
  if (!res.ok) throw new Error("Couldn't send the report");
}

/** Sites people arrive from, by a part of their address (or app name), and the name each is counted as. */
const SOURCES: [RegExp, string][] = [
  [/facebook|fb\.(com|me)|com\.facebook/, "facebook"],
  [/instagram/, "instagram"],
  [/pinterest|pin\.it/, "pinterest"],
  [/tiktok/, "tiktok"],
  [/(^|\.)t\.co$|twitter|(^|\.)x\.com$/, "x"],
  [/youtube|youtu\.be/, "youtube"],
  [/reddit/, "reddit"],
  [/google/, "google"],
  [/bing|yahoo|duckduckgo/, "search"],
];

/**
 * Where a visitor came from, as one word: a ?from= tag on the link they followed (links shared
 * on social media can carry one), else the site that sent them (just its name, never the full
 * address), else "direct".
 */
function visitSource(): string {
  const tag = new URLSearchParams(window.location.search).get("from")?.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
  if (tag) return tag;
  let host = "";
  try {
    host = document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    host = document.referrer.slice(0, 60); // e.g. android-app://com.facebook.katana
  }
  if (host === window.location.hostname) host = "";
  // Facebook's and Instagram's own browsers often send no address at all, but say who they are.
  const app = /FBAN|FBAV/.test(navigator.userAgent) ? "facebook" : /Instagram/.test(navigator.userAgent) ? "instagram" : "";
  for (const [pattern, name] of SOURCES) if (pattern.test(host)) return name;
  return app || (host ? "other" : "direct");
}

/** Marks this browser tab as counted, so reloads and new pages in the same visit don't count again. */
const VISIT_KEY = "counted-visit";

/**
 * Counts one visit to the site: the kind of device, the page they arrived on and where they
 * came from (see visitSource), nothing else. Once per browser tab session. Never blocks or
 * breaks the page if it can't be sent, and isn't counted while testing locally.
 */
export function countVisit() {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return;
    sessionStorage.setItem(VISIT_KEY, "1");
  } catch {
    // Private browsing without storage: count it anyway.
  }
  fetch(`${SUPABASE_URL}/rest/v1/visits`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ device: device(), page: window.location.pathname.slice(0, 100), source: visitSource(), app_version: APP_VERSION }),
    keepalive: true,
  }).catch(() => {});
}
