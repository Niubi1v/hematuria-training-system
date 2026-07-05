"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { allCases } from "@/src/lib/cases";
import type { StudentSummary } from "@/src/lib/types";

const fields: Array<{ key: keyof StudentSummary; label: string; rows: number }> = [
  { key: "presentIllnessSummary", label: "现病史总结", rows: 5 },
  { key: "positiveSymptoms", label: "重要阳性症状", rows: 3 },
  { key: "negativeSymptoms", label: "重要阴性症状", rows: 3 },
  { key: "preliminaryDiagnosis", label: "初步诊断", rows: 2 },
  { key: "differentialDiagnosis", label: "鉴别诊断", rows: 3 },
  { key: "nextTests", label: "下一步检查建议", rows: 3 }
];

const emptySummary: StudentSummary = {
  presentIllnessSummary: "",
  positiveSymptoms: "",
  negativeSymptoms: "",
  preliminaryDiagnosis: "",
  differentialDiagnosis: "",
  nextTests: ""
};

export default function SummaryClient() {
  const params = useSearchParams();
  const router = useRouter();
  const caseId = params.get("case") ?? "";
  const caseData = allCases.find((item) => item.id === caseId);
  const [summary, setSummary] = useState<StudentSummary>(emptySummary);

  if (!caseData) {
    return <main className="mx-auto max-w-3xl px-5 py-10">未找到病例，请返回病例列表重新选择。</main>;
  }

  function submit() {
    localStorage.setItem(`hematuria-summary-${caseId}`, JSON.stringify(summary));
    localStorage.setItem("hematuria-current-case", caseId);
    router.push(`/feedback?case=${caseId}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-3xl font-semibold">病史总结</h1>
      <p className="mt-2 text-clinic-muted">病例 {caseData.id.toUpperCase()}：请完成病史小结、初步诊断和下一步检查建议。</p>
      <div className="mt-6 grid gap-4">
        {fields.map((field) => (
          <label key={field.key} className="block rounded-lg border border-clinic-line bg-white p-4">
            <span className="font-medium">{field.label}</span>
            <textarea
              value={summary[field.key]}
              onChange={(event) => setSummary((current) => ({ ...current, [field.key]: event.target.value }))}
              rows={field.rows}
              className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue"
              placeholder={`请填写${field.label}`}
            />
          </label>
        ))}
      </div>
      <button onClick={submit} className="mt-6 rounded-md bg-clinic-blue px-5 py-3 font-medium text-white hover:bg-clinic-teal">
        提交并查看评分反馈
      </button>
    </main>
  );
}
