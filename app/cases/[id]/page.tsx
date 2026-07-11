import { notFound } from "next/navigation";
import publicCases from "@/data/cases_public.json";
import ClinicalTrainingClient from "@/src/components/ClinicalTrainingClient";

export function generateStaticParams() {
  return publicCases.map((caseData) => ({ id: caseData.id }));
}

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseData = publicCases.find((item) => item.id.toLowerCase() === id.toLowerCase());
  if (!caseData) notFound();
  const studentVisibleCase = {
    id: caseData.id,
    displayCaseId: caseData.displayCaseId,
    studentChiefComplaint: caseData.studentChiefComplaint,
    chiefComplaint: caseData.studentChiefComplaint,
    chiefComplaintEn: caseData.chiefComplaintEn,
    age: caseData.age,
    sex: caseData.sex,
    sexEn: caseData.sexEn,
    difficulty: caseData.difficulty
  };
  return <ClinicalTrainingClient caseData={studentVisibleCase} />;
}
