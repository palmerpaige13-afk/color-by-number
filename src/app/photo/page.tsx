import type { Metadata } from "next";
import ColorByNumber from "../color-by-number";

export const metadata: Metadata = {
  title: "Your Photo · Color by Number",
  description: "Turn your own photo into a printable color-by-number page.",
};

/** `?mural=1` (the home page's mural bubble) starts with a mural picked instead of Letter. */
export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ mural?: string }> }) {
  return <ColorByNumber startMural={(await searchParams).mural === "1"} />;
}
