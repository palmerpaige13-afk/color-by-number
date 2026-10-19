// Test bench only (never on the live site): remembers what was found in each test photo
// (its framing, and the people, faces and pets in each crop of it) across reloads, so a check
// of all the test photos skips finding them again when only the page-making changed.
// It's switched on by the bench (localStorage "benchDetectCache" = "1") and forgets everything
// whenever the finding code changes: the key includes a fingerprint of src/lib/detect and
// make-page.ts, from the bench API.

const DB = "bench-detect";
const STORE = "found";

export function benchCacheOn(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return localStorage.getItem("benchDetectCache") === "1";
  } catch {
    return false;
  }
}

let version: Promise<string | null> | null = null;
/** The finding code's fingerprint, or null (no caching) if the bench API can't say. */
function codeVersion(): Promise<string | null> {
  version ??= fetch("/api/bench?kind=detect-version")
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null);
  return version;
}

let db: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

/** A photo's fingerprint (its bytes), to know a test photo when it's loaded again. */
export async function photoKey(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fullKey(key: string): Promise<string | null> {
  const v = await codeVersion();
  return v ? `${v}|${key}` : null;
}

export async function benchGet<T>(key: string): Promise<T | undefined> {
  const k = await fullKey(key);
  if (!k) return undefined;
  const d = await open();
  return new Promise((resolve) => {
    const req = d.transaction(STORE).objectStore(STORE).get(k);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function benchSet(key: string, value: unknown): Promise<void> {
  const k = await fullKey(key);
  if (!k) return;
  const d = await open();
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
