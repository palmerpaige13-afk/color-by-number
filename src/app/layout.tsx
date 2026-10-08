import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { VisitCounter } from "./visit-counter";
import { CONTACT_EMAIL } from "@/lib/contact";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Color by Number",
  description: "Turn a photo into a printable, shareable color-by-number",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <VisitCounter />
        <footer className="mt-auto border-t border-zinc-200 px-4 py-4 text-center text-sm text-zinc-500 print:hidden dark:border-zinc-800">
          Your photos stay on your device. ·{" "}
          <Link href="/privacy" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            Terms &amp; Refunds
          </Link>{" "}
          ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
            Contact
          </a>
        </footer>
      </body>
    </html>
  );
}
