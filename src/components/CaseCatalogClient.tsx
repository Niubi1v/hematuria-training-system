"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Languages, Shuffle } from "lucide-react";
import casesEnJson from "@/data/cases_en.json";
import type { CaseData } from "@/src/lib/types";

type LanguageCode = "zh" | "en";
type EnglishCase = {
  id: string;
  title: string;
  age: string;
  sex: string;
  difficulty: string;
  diseaseCategory: string;
  chiefComplaint: string;
};

const englishCases = casesEnJson as EnglishCase[];

export default function CaseCatalogClient({ cases }: { cases: CaseData[] }) {
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [difficulty, setDifficulty] = useState("全部");
  const [category, setCategory] = useState("全部");

  useEffect(() => {
    const saved = localStorage.getItem("hematuria-language");
    if (saved === "zh" || saved === "en") setLang(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("hematuria-language", lang);
  }, [lang]);

  const rows = useMemo(() => cases.map((item) => {
    const en = englishCases.find((caseItem) => caseItem.id === item.id);
    return {
      id: item.id,
      age: lang === "en" ? en?.age || item.age : item.age,
      sex: lang === "en" ? en?.sex || item.sex : item.sex,
      difficulty: lang === "en" ? en?.difficulty || item.difficulty || "" : item.difficulty || "",
      category: lang === "en" ? en?.diseaseCategory || item.diseaseCategory || "" : item.diseaseCategory || "",
      complaint: lang === "en" ? en?.chiefComplaint || item.studentChiefComplaint || item.chiefComplaint : item.studentChiefComplaint || item.chiefComplaint,
      title: lang === "en" ? en?.title || item.title : item.title
    };
  }), [cases, lang]);

  const difficulties = useMemo(() => ["全部", ...Array.from(new Set(rows.map((item) => item.difficulty).filter(Boolean)))], [rows]);
  const categories = useMemo(() => ["全部", ...Array.from(new Set(rows.map((item) => item.category).filter(Boolean)))], [rows]);
  const filtered = rows.filter((item) => {
    const difficultyMatch = difficulty === "全部" || item.difficulty === difficulty;
    const categoryMatch = category === "全部" || item.category === category;
    return difficultyMatch && categoryMatch;
  });

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-sm font-medium text-clinic-blue">V2 bilingual · P001-P012</p>
          <h1 className="text-3xl font-semibold">{lang === "en" ? "Case Selection" : "病例选择"}</h1>
          <p className="mt-2 text-clinic-muted">
            {lang === "en"
              ? "Select a case and complete the 7-Agent clinical reasoning workflow in order."
              : "选择病例后，按 7-Agent 顺序完成完整临床思维训练。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border border-clinic-line bg-white p-1">
            <Languages size={16} className="ml-2 text-clinic-muted" />
            <button type="button" onClick={() => setLang("zh")} className={`rounded px-3 py-1 text-sm ${lang === "zh" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>中文</button>
            <button type="button" onClick={() => setLang("en")} className={`rounded px-3 py-1 text-sm ${lang === "en" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>English</button>
          </div>
          <Link className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal" href="/random">
            <Shuffle size={16} /> {lang === "en" ? "Random case" : "随机抽题"}
          </Link>
        </div>
      </div>

      <section className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-clinic-line bg-white p-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-clinic-muted"><Filter size={16} /> {lang === "en" ? "Filters" : "筛选"}</span>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2 text-sm">
          {difficulties.map((item) => <option key={item} value={item}>{item === "全部" && lang === "en" ? "All difficulty" : item}</option>)}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2 text-sm">
          {categories.map((item) => <option key={item} value={item}>{item === "全部" && lang === "en" ? "All categories" : item}</option>)}
        </select>
        <span className="text-sm text-clinic-muted">{lang === "en" ? "Showing" : "当前"} {filtered.length} / {rows.length}</span>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((caseItem) => (
          <Link key={caseItem.id} href={`/cases/${caseItem.id}`} className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-clinic-blue">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-clinic-blue">{caseItem.id}</span>
              <span className="rounded-full bg-clinic-paper px-3 py-1 text-sm text-clinic-muted">{caseItem.difficulty || (lang === "en" ? "Unrated" : "未分级")}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold leading-7">{caseItem.title || `${caseItem.age} / ${caseItem.sex}`}</h2>
            <p className="mt-1 text-sm text-clinic-muted">{caseItem.age || "-"} / {caseItem.sex || "-"}</p>
            {caseItem.category && <p className="mt-2 text-xs text-clinic-blue">{caseItem.category}</p>}
            <p className="mt-3 text-sm leading-6 text-clinic-muted">{caseItem.complaint || (lang === "en" ? "Hematuria-related chief complaint" : "血尿相关主诉")}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
