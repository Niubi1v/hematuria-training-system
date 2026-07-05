import { notFound } from "next/navigation";
import { allCases, getCaseById } from "@/src/lib/cases";
import ClinicalTrainingClient from "@/src/components/ClinicalTrainingClient";

export function generateStaticParams() {
  return allCases.map((caseData) => ({ id: caseData.id }));
}

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseData = getCaseById(id);
  if (!caseData) notFound();
  const studentVisibleCase = {
    id: caseData.id,
    studentChiefComplaint: caseData.studentChiefComplaint,
    chiefComplaint: caseData.studentChiefComplaint,
    age: caseData.age,
    sex: caseData.sex,
    difficulty: caseData.difficulty
  };
  return <ClinicalTrainingClient caseData={studentVisibleCase} />;
}
