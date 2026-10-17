import type { Metadata } from "next";
import { HolidayGallery } from "@/app/holiday-gallery";
import { HOLIDAYS } from "@/lib/holidays";

export const metadata: Metadata = {
  title: "Thanksgiving Pages · Color by Number",
  description: "Fifteen cozy Thanksgiving color-by-number pages to print on Letter paper.",
};

export default function ThanksgivingPage() {
  return <HolidayGallery holiday={HOLIDAYS.thanksgiving} />;
}
