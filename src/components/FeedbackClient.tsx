"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { allCases } from "@/src/lib/cases";
import { KEY_POINTS } from "@/src/lib/keyPoints";
import { keyPointLabel, scoreTraining } from "@/src/lib/scoring";
import { createEmptyCollected } from "@/src/lib/patientEngine";
import { publicCaseHref } from "@/src/lib/publicRoutes";
import type { CollectedMap, StudentSummary } from "@/src/lib/types";

const emptySummary: StudentSummary = {
  presentIllnessSummary: "",
  positiveSymptoms: "",
  negativeSymptoms: "",
  preliminaryDiagnosis: "",
  differentialDiagnosis: "",
  nextTests: ""
};

export default function FeedbackClient() {
  const params = useSearchParams();
  const caseId = params.get("case") ?? "";
  const caseData = allCases.find((item) => item.id === caseId);

  const payload = useMemo(() => {
    if (!caseData) return null;
    try {
      const sessionRaw = typeof window !== "undefined" ? localStorage.getItem(`hematuria-training-${caseId}`) : null;
      const summaryRaw = typeof window !== "undefined" ? localStorage.getItem(`hematuria-summary-${caseId}`) : null;
      const collected: CollectedMap = sessionRaw ? JSON.parse(sessionRaw).collected : createEmptyCollected();
      const summary: StudentSummary = summaryRaw ? JSON.parse(summaryRaw) : emptySummary;
      const report = scoreTraining(caseData, collected, summary);
      return { report, result: { caseId, total: report.total, summary, collected: report.collected, missing: report.missing, at: new Date().toISOString() } };
    } catch {
      const summary = emptySummary;
      const report = scoreTraining(caseData, createEmptyCollected(), summary);
      return { report, result: { caseId, total: report.total, summary, collected: report.collected, missing: report.missing, at: new Date().toISOString() } };
    }
  }, [caseData, caseId]);
  useEffect(() => {
    if (!payload) return;
    try {
      const old = JSON.parse(localStorage.getItem("hematuria-results") ?? "[]");
      const alreadySaved = old.some((item: { caseId: string; total: number }) => item.caseId === payload.result.caseId && item.total === payload.result.total);
      if (!alreadySaved) localStorage.setItem("hematuria-results", JSON.stringify([...old, payload.result]));
    } catch { /* Legacy stage result can still render when storage is unavailable. */ }
  }, [payload]);

  if (!caseData || !payload) {
    return <main className="mx-auto max-w-3xl px-5 py-10">未找到病例，请返回病例列表重新选择。</main>;
  }
  const { report } = payload;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-clinic-line bg-white p-5">
          <p className="text-sm text-clinic-muted">总分</p>
          <p className="mt-2 text-5xl font-semibold text-clinic-blue">{report.total}</p>
          <p className="mt-2 text-sm text-clinic-muted">病史采集阶段完成度；全流程终末总评统一为360分</p>
          <div className="mt-6 grid gap-2">
            <a className="rounded-md border border-clinic-line px-4 py-2 text-center hover:border-clinic-blue" href={publicCaseHref(caseId)}>重新问诊</a>
            <Link className="rounded-md bg-clinic-blue px-4 py-2 text-center text-white hover:bg-clinic-teal" href="/cases">选择其他病例</Link>
          </div>
        </aside>
        <section className="space-y-5">
          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <h1 className="text-2xl font-semibold">评分反馈</h1>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {report.items.map((item) => (
                <div key={item.id} className="rounded-md border border-clinic-line p-4">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-clinic-blue">{item.score}/{item.max}</p>
                  </div>
                  <p className="mt-2 text-sm text-clinic-muted">{item.comment}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-clinic-line bg-white p-5">
              <h2 className="font-semibold">已采集关键点</h2>
              <ul className="mt-3 space-y-1 text-sm text-clinic-muted">
                {report.collected.map((id) => <li key={id}>✓ {keyPointLabel(id)}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-clinic-line bg-white p-5">
              <h2 className="font-semibold">漏问关键点</h2>
              <ul className="mt-3 space-y-1 text-sm text-clinic-muted">
                {report.missing.map((id) => <li key={id}>· {keyPointLabel(id)}</li>)}
              </ul>
            </div>
          </div>
          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">学生病史总结评价</h2>
            <p className="mt-2 leading-7 text-clinic-muted">{report.summaryFeedback}</p>
            <h2 className="mt-5 font-semibold">推荐标准病史小结</h2>
            <p className="mt-2 leading-7 text-clinic-muted">{report.standardSummary}</p>
            <h2 className="mt-5 font-semibold">推荐鉴别诊断思路</h2>
            <p className="mt-2 leading-7 text-clinic-muted">{report.differentialThinking}</p>
            <h2 className="mt-5 font-semibold">教师点评</h2>
            <p className="mt-2 leading-7 text-clinic-muted">{report.teacherComment}</p>
            <div className="mt-5 border-t border-clinic-line pt-4 text-sm text-clinic-muted">
              本例诊断仅在反馈页展示：{caseData.diagnosis}
            </div>
          </div>
          <div className="hidden">{KEY_POINTS.length}</div>
        </section>
      </div>
    </main>
  );
}
