"use client";

import { useEffect } from "react";
import { countVisit } from "@/lib/feedback";

/** Counts the visit once the page has loaded in the browser (see countVisit). Draws nothing. */
export function VisitCounter() {
  useEffect(countVisit, []);
  return null;
}
