"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, Filter, Languages, Search, Shuffle, X } from "lucide-react";

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
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<Record<string, "completed" | "in-progress">>({});

  useEffect(() => {
    const saved = localStorage.getItem("hematuria-language");
    if (saved === "zh" || saved === "en") setLang(saved);
    const nextProgress: Record<string, "completed" | "in-progress"> = {};
    try {
      const summaries = JSON.parse(localStorage.getItem("hematuria-practice-attempt-summaries-v1") || "[]") as Array<{ caseId?: string }>;
      summaries.forEach((item) => { if (item.caseId) nextProgress[item.caseId] = "completed"; });
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        const match = key.match(/^hematuria-attempt-pointer-v3:([^:]+):/);
        if (match?.[1] && !nextProgress[match[1]]) nextProgress[match[1]] = "in-progress";
      }
    } catch { /* Progress is optional when browser storage is unavailable. */ }
    setProgress(nextProgress);
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
  const normalizedSearch = search.trim().toLocaleLowerCase(lang === "en" ? "en" : "zh-CN");
  const filtered = rows.filter((item) => (difficulty === "all" || item.difficultyLabel === difficulty)
    && (source === "all" || item.sourceGroup === source)
    && (!normalizedSearch || [item.id, item.displayCaseId, item.complaint].some((value) => String(value || "").toLocaleLowerCase(lang === "en" ? "en" : "zh-CN").includes(normalizedSearch))));
  const hasActiveFilters = Boolean(search.trim()) || difficulty !== "all" || source !== "all";

  function resetFilters() {
    setSearch("");
    setDifficulty("all");
    setSource("all");
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-7 sm:py-9">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-sm font-medium text-clinic-blue">{cases.length} {lang === "en" ? "practice cases" : "个练习病例"}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{lang === "en" ? "Case selection" : "病例选择"}</h1>
          <p className="mt-2 text-clinic-muted">{lang === "en" ? "Public case cards omit disease labels and hidden answers." : "公开病例卡不显示疾病标签与隐藏答案。"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="ui-segmented">
            <Languages size={16} className="ml-2 text-clinic-muted" />
            <button type="button" onClick={() => setLang("zh")} className={`ui-segment ${lang === "zh" ? "ui-segment-active" : ""}`}>中文</button>
            <button type="button" onClick={() => setLang("en")} className={`ui-segment ${lang === "en" ? "ui-segment-active" : ""}`}>English</button>
          </div>
          <a className="ui-button-primary" href={`${basePath}/random/index.html`}>
            <Shuffle size={16} /> {lang === "en" ? "Random case" : "随机抽题"}
          </a>
        </div>
      </div>

      <section aria-label={lang === "en" ? "Search and filter cases" : "搜索和筛选病例"} className="ui-card mb-5 grid gap-3 p-3 sm:grid-cols-[minmax(240px,1fr)_auto] sm:items-center sm:p-4">
        <label className="relative block">
          <span className="sr-only">{lang === "en" ? "Search cases" : "搜索病例"}</span>
          <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3.5 text-clinic-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="ui-input w-full pl-10 pr-10" placeholder={lang === "en" ? "Search case ID or chief complaint" : "搜索病例编号或主诉"} />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={lang === "en" ? "Clear search" : "清除搜索"} className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-clinic-muted hover:bg-clinic-paper"><X size={16} /></button>}
        </label>
        <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-clinic-muted"><Filter size={16} /> {lang === "en" ? "Filters" : "筛选"}</span>
        <select aria-label={lang === "en" ? "Difficulty" : "难度"} value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="ui-input text-sm">
          <option value="all">{lang === "en" ? "All difficulty" : "全部难度"}</option>
          {difficulties.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label={lang === "en" ? "Source" : "来源"} value={source} onChange={(event) => setSource(event.target.value)} className="ui-input text-sm">
          <option value="all">{lang === "en" ? "All sources" : "全部来源"}</option>
          <option value="v2-core">{lang === "en" ? "V2 core" : "V2核心"}</option>
          <option value="supplementary">{lang === "en" ? "Supplementary" : "补充病例"}</option>
        </select>
        <span aria-live="polite" className="ml-auto text-sm text-clinic-muted">{lang === "en" ? "Showing" : "当前"} {filtered.length} / {rows.length}</span>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <a key={item.id} href={caseHref(item.id)} className="ui-card group p-5 transition-colors hover:border-clinic-blue focus-visible:border-clinic-blue">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold text-clinic-blue">{item.displayCaseId || item.id}</span>
              <span className="ui-status bg-clinic-paper text-clinic-muted">{item.difficultyLabel || (lang === "en" ? "Unrated" : "未分级")}</span>
            </div>
            <h2 className="mt-3 text-lg font-semibold group-hover:text-clinic-blue">{lang === "en" ? `Training case ${item.displayCaseId || item.id}` : `训练病例 ${item.displayCaseId || item.id}`}</h2>
            <p className="mt-1 text-sm text-clinic-muted">{item.ageLabel || "-"} / {item.sexLabel || "-"} · {item.sourceLabel}</p>
            <p className="mt-3 min-h-12 text-sm leading-6 text-clinic-muted">{item.complaint || (lang === "en" ? "Hematuria" : "血尿")}</p>
            <div className="mt-4 flex items-center justify-between border-t border-clinic-line pt-3 text-sm">
              {progress[item.id] === "completed" ? <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 size={16} />{lang === "en" ? "Completed" : "已完成"}</span>
                : progress[item.id] === "in-progress" ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-800"><Clock3 size={16} />{lang === "en" ? "In progress" : "进行中"}</span>
                  : <span className="inline-flex items-center gap-1.5 text-clinic-muted"><Circle size={16} />{lang === "en" ? "Not started" : "未开始"}</span>}
              <span className="font-semibold text-clinic-blue">{progress[item.id] === "in-progress" ? (lang === "en" ? "Continue" : "继续") : (lang === "en" ? "Open" : "进入")}</span>
            </div>
          </a>
        ))}
      </div>
      {!filtered.length && (
        <section className="ui-card px-5 py-12 text-center">
          <Search size={28} className="mx-auto text-clinic-muted" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">{lang === "en" ? "No matching cases" : "没有匹配的病例"}</h2>
          <p className="mt-2 text-sm text-clinic-muted">{lang === "en" ? "Try another case ID, chief complaint, or filter combination." : "请尝试其他病例编号、主诉关键词或筛选组合。"}</p>
          {hasActiveFilters && <button type="button" onClick={resetFilters} className="ui-button-secondary mt-5">{lang === "en" ? "Clear search and filters" : "清除搜索与筛选"}</button>}
        </section>
      )}
    </main>
  );
}
