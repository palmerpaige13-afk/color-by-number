import type { Metadata } from "next";
import { HalloweenGallery } from "./gallery";

export const metadata: Metadata = {
  title: "Free Halloween Pages · Color by Number",
  description: "Fifteen cute, easy Halloween color-by-number pages, free to print.",
};

export default function HalloweenPage() {
  return <HalloweenGallery />;
}
