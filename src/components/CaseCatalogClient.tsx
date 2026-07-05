"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Shuffle } from "lucide-react";
import type { CaseData } from "@/src/lib/types";

export default function CaseCatalogClient({ cases }: { cases: CaseData[] }) {
  const [difficulty, setDifficulty] = useState("全部");

  const difficulties = useMemo(() => ["全部", ...Array.from(new Set(cases.map((item) => item.difficulty).filter(Boolean)))], [cases]);
  const filtered = cases.filter((item) => {
    const difficultyMatch = difficulty === "全部" || item.difficulty === difficulty;
    return difficultyMatch;
  });

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">病例选择</h1>
          <p className="mt-2 text-clinic-muted">选择病例后按病史、诊断、开单、会诊、治疗、随访逐步训练。</p>
        </div>
        <Link className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal" href="/random">
          <Shuffle size={16} /> 随机抽题
        </Link>
      </div>

      <section className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-clinic-line bg-white p-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-clinic-muted"><Filter size={16} /> 筛选</span>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2 text-sm">
          {difficulties.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="text-sm text-clinic-muted">当前 {filtered.length} / {cases.length} 例</span>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((caseItem) => (
          <Link key={caseItem.id} href={`/cases/${caseItem.id}`} className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-clinic-blue">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-clinic-blue">{caseItem.id}</span>
              <span className="rounded-full bg-clinic-paper px-3 py-1 text-sm text-clinic-muted">{caseItem.difficulty || "未分级"}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold leading-7">{caseItem.age || "年龄未提供"} · {caseItem.sex || "性别未提供"}</h2>
            <p className="mt-2 text-sm leading-6 text-clinic-muted">{caseItem.studentChiefComplaint || caseItem.chiefComplaint || "血尿相关主诉"}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
