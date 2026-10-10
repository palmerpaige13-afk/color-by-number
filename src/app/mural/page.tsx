import type { Metadata } from "next";
import ColorByNumber from "../color-by-number";

export const metadata: Metadata = {
  title: "Group Mural · Color by Number",
  description: "One picture split across several Letter sheets: everyone colors a piece, then put it together.",
};

export default function MuralPage() {
  return <ColorByNumber mode="mural" />;
}
