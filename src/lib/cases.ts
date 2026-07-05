import cases from "@/data/cases.json";
import type { CaseData } from "./types";

export const allCases = cases as CaseData[];

export function getCaseById(id: string): CaseData | undefined {
  return allCases.find((item) => item.id.toLowerCase() === id.toLowerCase());
}
