"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Languages, Shuffle } from "lucide-react";

export type PublicCase = {
  id: string;
  displayCaseId?: string;
  age: string;
  sex: string;
  sexEn: string;
  difficulty: string;
  difficultyEn: string;
  studentChiefComplaint: string;
  chiefComplaintEn: string;
  caseVersion: string;
  medicalReviewStatus: string;
  sourceGroup: "v2-core" | "supplementary";
};

type LanguageCode = "zh" | "en";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function caseHref(caseId: string) {
  return `${basePath}/cases/${caseId}/index.html`;
}

export default function CaseCatalogClient({ cases }: { cases: PublicCase[] }) {
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [difficulty, setDifficulty] = useState("all");
  const [source, setSource] = useState("all");

  useEffect(() => {
    const saved = localStorage.getItem("hematuria-language");
    if (saved === "zh" || saved === "en") setLang(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("hematuria-language", lang);
    window.dispatchEvent(new CustomEvent("hematuria-language-change", { detail: lang }));
  }, [lang]);

  const rows = useMemo(() => cases.map((item) => ({
    ...item,
    ageLabel: item.age,
    sexLabel: lang === "en" ? item.sexEn : item.sex,
    difficultyLabel: lang === "en" ? item.difficultyEn || item.difficulty : item.difficulty,
    complaint: lang === "en" ? item.chiefComplaintEn : item.studentChiefComplaint,
    sourceLabel: item.sourceGroup === "supplementary"
      ? (lang === "en" ? "Supplementary" : "补充病例")
      : (lang === "en" ? "V2 core" : "V2核心")
  })), [cases, lang]);

  const difficulties = useMemo(() => [...new Set(rows.map((item) => item.difficultyLabel).filter(Boolean))], [rows]);
  const filtered = rows.filter((item) => (difficulty === "all" || item.difficultyLabel === difficulty)
    && (source === "all" || item.sourceGroup === source));

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-sm font-medium text-clinic-blue">{cases.length} {lang === "en" ? "practice cases" : "个练习病例"}</p>
          <h1 className="text-3xl font-semibold">{lang === "en" ? "Case selection" : "病例选择"}</h1>
          <p className="mt-2 text-clinic-muted">{lang === "en" ? "Public case cards omit disease labels and hidden answers." : "公开病例卡不显示疾病标签与隐藏答案。"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border border-clinic-line bg-white p-1">
            <Languages size={16} className="ml-2 text-clinic-muted" />
            <button type="button" onClick={() => setLang("zh")} className={`rounded px-3 py-1 text-sm ${lang === "zh" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>中文</button>
            <button type="button" onClick={() => setLang("en")} className={`rounded px-3 py-1 text-sm ${lang === "en" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>English</button>
          </div>
          <a className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal" href={`${basePath}/random/index.html`}>
            <Shuffle size={16} /> {lang === "en" ? "Random case" : "随机抽题"}
          </a>
        </div>
      </div>

      <section className="mb-5 flex flex-wrap items-center gap-3 border-y border-clinic-line py-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-clinic-muted"><Filter size={16} /> {lang === "en" ? "Filters" : "筛选"}</span>
        <select aria-label={lang === "en" ? "Difficulty" : "难度"} value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2 text-sm">
          <option value="all">{lang === "en" ? "All difficulty" : "全部难度"}</option>
          {difficulties.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label={lang === "en" ? "Source" : "来源"} value={source} onChange={(event) => setSource(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2 text-sm">
          <option value="all">{lang === "en" ? "All sources" : "全部来源"}</option>
          <option value="v2-core">{lang === "en" ? "V2 core" : "V2核心"}</option>
          <option value="supplementary">{lang === "en" ? "Supplementary" : "补充病例"}</option>
        </select>
        <span className="text-sm text-clinic-muted">{lang === "en" ? "Showing" : "当前"} {filtered.length} / {rows.length}</span>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <a key={item.id} href={caseHref(item.id)} className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-clinic-blue">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-clinic-blue">{item.displayCaseId || item.id}</span>
              <span className="rounded-full bg-clinic-paper px-3 py-1 text-sm text-clinic-muted">{item.difficultyLabel || (lang === "en" ? "Unrated" : "未分级")}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{lang === "en" ? `Training case ${item.displayCaseId || item.id}` : `训练病例 ${item.displayCaseId || item.id}`}</h2>
            <p className="mt-1 text-sm text-clinic-muted">{item.ageLabel || "-"} / {item.sexLabel || "-"}</p>
            <p className="mt-3 text-sm leading-6 text-clinic-muted">{item.complaint || (lang === "en" ? "Hematuria" : "血尿")}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
