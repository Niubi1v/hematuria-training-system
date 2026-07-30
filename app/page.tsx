import publicCases from "@/data/cases_public.json";
import HomeWorkspaceClient, { type BlindCaseSummary } from "@/src/components/HomeWorkspaceClient";

function blindCaseSummary(value: (typeof publicCases)[number]): BlindCaseSummary {
  return {
    id: String(value.id || ""),
    displayCaseId: String(value.displayCaseId || value.id || ""),
    age: String(value.age || ""),
    sex: String(value.sex || ""),
    sexEn: String(value.sexEn || "")
  };
}

export default function HomePage() {
  return <HomeWorkspaceClient cases={publicCases.map(blindCaseSummary)} />;
}
