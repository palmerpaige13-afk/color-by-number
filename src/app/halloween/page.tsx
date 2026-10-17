import type { Metadata } from "next";
import { HolidayGallery } from "@/app/holiday-gallery";
import { HOLIDAYS } from "@/lib/holidays";

export const metadata: Metadata = {
  title: "Halloween Pages · Color by Number",
  description: "Fifteen cute Halloween color-by-number pages to print on Letter paper.",
};

export default function HalloweenPage() {
  return <HolidayGallery holiday={HOLIDAYS.halloween} />;
}
