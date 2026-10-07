import type { Metadata } from "next";
import { HalloweenGallery } from "./gallery";

export const metadata: Metadata = {
  title: "Halloween Pages · Color by Number",
  description: "Fifteen cute Halloween color-by-number pages to print on Letter paper.",
};

export default function HalloweenPage() {
  return <HalloweenGallery />;
}
