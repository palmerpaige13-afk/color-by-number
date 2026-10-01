import { notFound } from "next/navigation";
import { Bench } from "./bench";

// The test bench: only while developing, never on the live site.
export default function BenchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Bench />;
}
