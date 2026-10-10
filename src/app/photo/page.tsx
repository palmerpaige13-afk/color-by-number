import type { Metadata } from "next";
import ColorByNumber from "../color-by-number";

export const metadata: Metadata = {
  title: "Your Photo · Color by Number",
  description: "Turn your own photo into a printable color-by-number page.",
};

export default function PhotoPage() {
  return <ColorByNumber />;
}
