"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, Languages, Search, Shuffle, X } from "lucide-react";
import { publicCaseHref, publicPageHref } from "@/src/lib/publicRoutes";
import { publicApiConfig } from "@/src/lib/apiConfig";
import { loadCatalogProgress } from "@/src/lib/catalogProgress";
import { readStringStorage, writeStringStorage } from "@/src/lib/safeStorage";

export type PublicCase = {
  id: string;
  displayCaseId: string;
  age: string;
  sex: string;
  sexEn: string;
};

type LanguageCode = "zh" | "en";

export default function CaseCatalogClient({ cases }: { cases: PublicCase[] }) {
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<Record<string, "completed" | "in-progress">>({});
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    const saved = readStringStorage("hematuria-language");
    if (saved.value === "zh" || saved.value === "en") setLang(saved.value);
    const loaded = loadCatalogProgress(publicApiConfig.baseUrl, window.location.origin);
    setProgress(loaded.progress);
    setStorageUnavailable(!saved.ok || !loaded.storageAvailable);
  }, []);

  useEffect(() => {
    const persisted = writeStringStorage("hematuria-language", lang);
    if (!persisted.ok) setStorageUnavailable(true);
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    window.dispatchEvent(new CustomEvent("hematuria-language-change", { detail: lang }));
  }, [lang]);

  const normalizedSearch = search.trim().toLocaleLowerCase("en");
  const filtered = useMemo(() => cases.filter((item) => !normalizedSearch
    || [item.id, item.displayCaseId].some((value) => String(value || "").toLocaleLowerCase("en").includes(normalizedSearch))), [cases, normalizedSearch]);

  return (
    <main className="mx-auto max-w-[1440px] px-5 py-7 sm:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="home-eyebrow">{lang === "en" ? "BLIND CASE LIBRARY" : "盲选病例库"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{lang === "en" ? "Choose a training case" : "选择训练病例"}</h1>
          <p className="mt-2 text-sm text-clinic-muted">
            {lang === "en" ? "Cards disclose only the case number, age, sex, and your local progress." : "病例卡仅显示编号、年龄、性别和本机训练进度。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="ui-segmented">
            <Languages size={16} className="ml-2 text-clinic-muted" />
            <button type="button" onClick={() => setLang("zh")} className={`ui-segment ${lang === "zh" ? "ui-segment-active" : ""}`}>中文</button>
            <button type="button" onClick={() => setLang("en")} className={`ui-segment ${lang === "en" ? "ui-segment-active" : ""}`}>English</button>
          </div>
          <a className="ui-button-primary" href={publicPageHref("random")}><Shuffle size={16} />{lang === "en" ? "Random case" : "随机抽题"}</a>
        </div>
      </div>

      {storageUnavailable && (
        <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lang === "en" ? "Local progress is temporarily unavailable; blind case selection still works." : "本机进度暂不可用，但仍可盲选病例。"}
        </div>
      )}

      <section aria-label={lang === "en" ? "Search cases" : "搜索病例"} className="ui-card mb-5 flex flex-wrap items-center gap-3 p-3 shadow-none sm:p-4">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">{lang === "en" ? "Search by case number" : "按病例编号搜索"}</span>
          <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3.5 text-clinic-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="ui-input w-full pl-10 pr-10" placeholder={lang === "en" ? "Search case number" : "搜索病例编号"} />
          {search && <button type="button" onClick={() => setSearch("")} aria-label={lang === "en" ? "Clear search" : "清除搜索"} className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-clinic-muted hover:bg-clinic-paper"><X size={16} /></button>}
        </label>
        <span aria-live="polite" className="text-sm text-clinic-muted">{filtered.length} / {cases.length}</span>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => {
          const state = progress[item.id];
          return (
            <a key={item.id} data-case-id={item.id} href={publicCaseHref(item.displayCaseId || item.id)} className="blind-case-card group">
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-semibold text-clinic-ink">{item.displayCaseId || item.id}</span>
                {state === "completed"
                  ? <CheckCircle2 size={17} className="text-emerald-700" aria-label={lang === "en" ? "Completed" : "已完成"} />
                  : state === "in-progress"
                    ? <Clock3 size={17} className="text-amber-700" aria-label={lang === "en" ? "In progress" : "进行中"} />
                    : <Circle size={17} className="text-clinic-muted" aria-label={lang === "en" ? "Not started" : "未开始"} />}
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Age" : "年龄"}</dt><dd className="mt-1 font-medium">{item.age || "-"}</dd></div>
                <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Sex" : "性别"}</dt><dd className="mt-1 font-medium">{lang === "en" ? item.sexEn : item.sex}</dd></div>
              </dl>
              <div className="mt-5 border-t border-clinic-line pt-3 text-sm font-semibold text-clinic-blue">
                {state === "in-progress" ? (lang === "en" ? "Continue training" : "继续训练") : (lang === "en" ? "Open training" : "进入训练")}
              </div>
            </a>
          );
        })}
      </div>

      {!filtered.length && (
        <section className="ui-card px-5 py-12 text-center shadow-none">
          <Search size={28} className="mx-auto text-clinic-muted" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">{lang === "en" ? "No matching case number" : "没有匹配的病例编号"}</h2>
          <button type="button" onClick={() => setSearch("")} className="ui-button-secondary mt-5">{lang === "en" ? "Clear search" : "清除搜索"}</button>
        </section>
      )}
    </main>
  );
}
