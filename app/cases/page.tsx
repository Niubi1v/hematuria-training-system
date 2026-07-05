import { allCases } from "@/src/lib/cases";
import CaseCatalogClient from "@/src/components/CaseCatalogClient";

export default function CaseListPage() {
  return <CaseCatalogClient cases={allCases} />;
}
