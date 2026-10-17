// The holiday bubbles: ready-made pages (Halloween, Thanksgiving, Christmas), each with its own
// gallery page, designs, prices and colors. The gallery itself (app/holiday-gallery.tsx) is
// the same for every holiday.

import { DESIGNS as HALLOWEEN, type HalloweenDesign } from "@/lib/halloween/designs";
import { THANKSGIVING } from "@/lib/holidays/thanksgiving";
import { CHRISTMAS } from "@/lib/holidays/christmas";
import { CHRISTMAS_OLDER, HALLOWEEN_OLDER, THANKSGIVING_OLDER } from "@/lib/holidays/older";
import type { Product } from "@/lib/price";

/** Tailwind classes for a holiday's colors (written out in full so Tailwind keeps them). */
export interface HolidayTheme {
  /** The bundle banner. */
  banner: string;
  bannerTitle: string;
  bannerText: string;
  /** Solid buttons (buy, download). */
  button: string;
  /** The chosen side of a switch. */
  on: string;
  /** Text of a switch side as the pointer is over it. */
  hoverText: string;
  /** Border of the chosen picture, and of pictures and buttons as the pointer is over them. */
  chosen: string;
  hoverBorder: string;
  hoverBorderStrong: string;
  spinner: string;
}

export interface Holiday {
  id: "halloween" | "thanksgiving" | "christmas";
  title: string;
  emoji: string;
  /** One line under the title. */
  intro: string;
  designs: HalloweenDesign[];
  /** One page, and all of them in one PDF. */
  product: Product;
  bundle: Product;
  /** Harder pages for ages 7–9, with multiplication problems. */
  older: { designs: HalloweenDesign[]; product: Product; bundle: Product };
  theme: HolidayTheme;
}

export const HOLIDAYS: Record<Holiday["id"], Holiday> = {
  halloween: {
    id: "halloween",
    title: "Halloween Color by Number",
    emoji: "🎃",
    intro: "Fifteen cute Halloween pages full of colors and shapes. Pick one to see it, then download it to print on Letter paper.",
    designs: HALLOWEEN,
    product: "halloween",
    bundle: "halloween-all",
    older: { designs: HALLOWEEN_OLDER, product: "halloween-older", bundle: "halloween-older-all" },
    theme: {
      banner: "bg-orange-100 dark:bg-orange-950",
      bannerTitle: "text-orange-950 dark:text-orange-100",
      bannerText: "text-orange-900 dark:text-orange-200",
      button: "bg-orange-500 hover:bg-orange-600",
      on: "bg-orange-500 text-white",
      hoverText: "hover:text-orange-600",
      chosen: "border-orange-500",
      hoverBorder: "hover:border-orange-300",
      hoverBorderStrong: "hover:border-orange-400",
      spinner: "border-orange-200 border-t-orange-500",
    },
  },
  thanksgiving: {
    id: "thanksgiving",
    title: "Thanksgiving Color by Number",
    emoji: "🦃",
    intro: "Fifteen cozy Thanksgiving pages: turkeys, pies, autumn leaves and more. Pick one to see it, then download it to print on Letter paper.",
    designs: THANKSGIVING,
    product: "thanksgiving",
    bundle: "thanksgiving-all",
    older: { designs: THANKSGIVING_OLDER, product: "thanksgiving-older", bundle: "thanksgiving-older-all" },
    theme: {
      banner: "bg-amber-100 dark:bg-amber-950",
      bannerTitle: "text-amber-950 dark:text-amber-100",
      bannerText: "text-amber-900 dark:text-amber-200",
      button: "bg-amber-700 hover:bg-amber-800",
      on: "bg-amber-700 text-white",
      hoverText: "hover:text-amber-700",
      chosen: "border-amber-700",
      hoverBorder: "hover:border-amber-400",
      hoverBorderStrong: "hover:border-amber-500",
      spinner: "border-amber-200 border-t-amber-700",
    },
  },
  christmas: {
    id: "christmas",
    title: "Christmas Color by Number",
    emoji: "🎄",
    intro: "Fifteen merry Christmas pages: Santa, snowmen, trees, presents and more. Pick one to see it, then download it to print on Letter paper.",
    designs: CHRISTMAS,
    product: "christmas",
    bundle: "christmas-all",
    older: { designs: CHRISTMAS_OLDER, product: "christmas-older", bundle: "christmas-older-all" },
    theme: {
      banner: "bg-emerald-100 dark:bg-emerald-950",
      bannerTitle: "text-emerald-950 dark:text-emerald-100",
      bannerText: "text-emerald-900 dark:text-emerald-200",
      button: "bg-red-600 hover:bg-red-700",
      on: "bg-red-600 text-white",
      hoverText: "hover:text-red-600",
      chosen: "border-red-600",
      hoverBorder: "hover:border-red-300",
      hoverBorderStrong: "hover:border-red-400",
      spinner: "border-red-200 border-t-red-600",
    },
  },
};
