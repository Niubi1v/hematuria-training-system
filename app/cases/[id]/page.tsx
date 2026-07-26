import { notFound } from "next/navigation";
import publicCases from "@/data/cases_public.json";
import ClinicalTrainingClient from "@/src/components/ClinicalTrainingClient";

export const dynamicParams = false;

export function generateStaticParams() {
  const routeIds = new Set<string>();
  for (const caseData of publicCases) {
    routeIds.add(caseData.id);
    if (caseData.displayCaseId) routeIds.add(caseData.displayCaseId);
  }
  return [...routeIds].map((id) => ({ id }));
}

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const normalizedId = id.toLowerCase();
  const caseData = publicCases.find((item) => item.id.toLowerCase() === normalizedId
    || item.displayCaseId?.toLowerCase() === normalizedId);
  if (!caseData) notFound();
  const studentVisibleCase = {
    id: caseData.id,
    displayCaseId: caseData.displayCaseId,
    age: caseData.age,
    sex: caseData.sex,
    sexEn: caseData.sexEn
  };
  return <ClinicalTrainingClient caseData={studentVisibleCase} />;
}
