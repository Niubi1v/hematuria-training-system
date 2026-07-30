import publicCases from "@/data/cases_public.json";
import RandomTrainingClient from "@/src/components/RandomTrainingClient";

export default function RandomPage() {
  const blindCases = publicCases.map((value) => ({
    id: String(value.id || ""),
    displayCaseId: String(value.displayCaseId || value.id || "")
  }));
  return <RandomTrainingClient cases={blindCases} />;
}
