import type { Metadata } from "next";
import { HolidayGallery } from "@/app/holiday-gallery";
import { HOLIDAYS } from "@/lib/holidays";

export const metadata: Metadata = {
  title: "Christmas Pages · Color by Number",
  description: "Fifteen merry Christmas color-by-number pages to print on Letter paper.",
};

export default function ChristmasPage() {
  return <HolidayGallery holiday={HOLIDAYS.christmas} />;
}
