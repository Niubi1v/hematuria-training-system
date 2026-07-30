import publicCases from "@/data/cases_public.json";
import CaseCatalogClient, { type PublicCase } from "@/src/components/CaseCatalogClient";

export default function CaseListPage() {
  const blindCases: PublicCase[] = publicCases.map((value) => ({
    id: String(value.id || ""),
    displayCaseId: String(value.displayCaseId || value.id || ""),
    age: String(value.age || ""),
    sex: String(value.sex || ""),
    sexEn: String(value.sexEn || "")
  }));
  return <CaseCatalogClient cases={blindCases} />;
}
