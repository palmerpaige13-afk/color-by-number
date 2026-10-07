"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { REVIEW_COOKIE, passwordToken, setManyReviewed, setReviewed, signedIn, tokenOk } from "@/lib/review";

/** Signs in with the review password (kept as a hash in a cookie for 30 days). */
export async function signIn(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const token = passwordToken(password);
  if (!tokenOk(token)) return;
  (await cookies()).set(REVIEW_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/review",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/review");
}

export async function signOut() {
  (await cookies()).delete({ name: REVIEW_COOKIE, path: "/review" });
  revalidatePath("/review");
}

/** Marks a report reviewed, or new again (`reviewed` = "0"). */
export async function markReviewed(formData: FormData) {
  if (!(await signedIn())) return;
  await setReviewed(String(formData.get("id") ?? ""), formData.get("reviewed") !== "0");
  revalidatePath("/review");
}

/** Marks every report that was on the page reviewed (not ones that arrived since). */
export async function markAllReviewed(formData: FormData) {
  if (!(await signedIn())) return;
  await setManyReviewed(String(formData.get("ids") ?? "").split(","), true);
  revalidatePath("/review");
}
