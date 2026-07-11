import publicCases from "@/data/cases_public.json";
import CaseCatalogClient from "@/src/components/CaseCatalogClient";

export default function CaseListPage() {
  return <CaseCatalogClient cases={publicCases as Parameters<typeof CaseCatalogClient>[0]["cases"]} />;
}
