import activeCases from "../../data/cases.json";
import cases42 from "../../data/cases_42.json";
import casesV2 from "../../data/cases_v2.json";
import type { CaseData } from "./types";

const configuredCaseSet = process.env.NEXT_PUBLIC_CASE_SET || process.env.CASE_SET || "v2_plus_30";

export const allCases = (
  configuredCaseSet === "v2_only" ? casesV2 : configuredCaseSet === "v2_plus_30" ? cases42 : activeCases
) as CaseData[];

export function getCaseById(id: string): CaseData | undefined {
  return allCases.find((item) => item.id.toLowerCase() === id.toLowerCase());
}
