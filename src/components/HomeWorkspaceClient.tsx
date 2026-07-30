"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  FolderOpen,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Play,
  ShieldCheck,
  Shuffle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { publicCaseHref } from "@/src/lib/publicRoutes";
import { loadCatalogProgress } from "@/src/lib/catalogProgress";
import { publicApiConfig } from "@/src/lib/apiConfig";
import { readStringStorage } from "@/src/lib/safeStorage";

type LanguageCode = "zh" | "en";
type ProgressState = "completed" | "in-progress";

export type BlindCaseSummary = {
  id: string;
  displayCaseId: string;
  age: string;
  sex: string;
  sexEn: string;
};

export default function HomeWorkspaceClient({ cases }: { cases: BlindCaseSummary[] }) {
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});

  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const loaded = loadCatalogProgress(publicApiConfig.baseUrl, window.location.origin);
    setProgress(loaded.progress);
    const listener = (event: Event) => setLang((event as CustomEvent<LanguageCode>).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);

  const recent = useMemo(() => cases
    .filter((item) => progress[item.id])
    .slice(0, 3), [cases, progress]);
  const completed = Object.values(progress).filter((state) => state === "completed").length;
  const inProgress = Object.values(progress).filter((state) => state === "in-progress").length;

  return (
    <main className="home-shell">
      <aside className="home-sidebar" aria-label={lang === "en" ? "Workspace navigation" : "工作区导航"}>
        <div>
          <p className="home-eyebrow">{lang === "en" ? "OFFLINE TRAINING" : "离线训练工作区"}</p>
          <h1 className="mt-2 text-lg font-semibold tracking-tight">{lang === "en" ? "Hematuria Clinic" : "血尿临床问诊"}</h1>
        </div>
        <nav className="mt-8 space-y-1 text-sm">
          <Link className="home-nav-item home-nav-item-active" href="/"><LayoutDashboard size={17} />{lang === "en" ? "Workspace" : "训练首页"}</Link>
          <Link className="home-nav-item" href="/cases"><Library size={17} />{lang === "en" ? "Case library" : "病例库"}</Link>
          <Link className="home-nav-item" href="/random"><Shuffle size={17} />{lang === "en" ? "Random case" : "随机训练"}</Link>
        </nav>
        <div className="mt-auto rounded-lg border border-clinic-line bg-white/70 p-3 text-xs leading-5 text-clinic-muted">
          <ShieldCheck size={16} className="mb-2 text-clinic-blue" />
          {lang === "en"
            ? "Practice only. The patient reveals facts only after an appropriate question."
            : "仅用于教学训练。患者信息只会在恰当问诊后逐步释放。"}
        </div>
      </aside>

      <div className="home-content">
        <section className="home-command">
          <div className="min-w-0">
            <p className="home-eyebrow">{lang === "en" ? "SEVEN-STAGE WORKFLOW" : "七阶段临床路径"}</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {lang === "en" ? "Practice the consultation, not the answer key." : "从真实问诊开始，而不是从答案开始。"}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-clinic-muted sm:text-base">
              {lang === "en"
                ? "Case P001 opens with only the case number, age, and sex. History, evidence, and reports are released progressively through your actions."
                : "P001 初始仅显示病例编号、年龄和性别。病史、证据与报告会随你的问诊和操作逐步释放。"}
            </p>
          </div>
          <Link className="ui-button-primary shrink-0 px-5" href={publicCaseHref("P001")}>
            <Play size={17} />{lang === "en" ? "Start P001" : "开始 P001"}
          </Link>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <Link className="home-action" href="/cases">
            <span className="home-action-icon"><FolderOpen size={19} /></span>
            <span><strong>{lang === "en" ? "Open case library" : "打开病例库"}</strong><small>{lang === "en" ? "Blind cards with ID, age, and sex" : "盲卡仅显示编号、年龄和性别"}</small></span>
            <ArrowRight size={17} />
          </Link>
          <Link className="home-action" href="/random">
            <span className="home-action-icon"><Shuffle size={19} /></span>
            <span><strong>{lang === "en" ? "Draw a random case" : "随机抽取病例"}</strong><small>{lang === "en" ? "Begin a new seven-stage attempt" : "开始一次新的七阶段训练"}</small></span>
            <ArrowRight size={17} />
          </Link>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="ui-card overflow-hidden shadow-none">
            <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
              <div>
                <p className="font-semibold">{lang === "en" ? "Recent training" : "最近训练"}</p>
                <p className="mt-1 text-xs text-clinic-muted">{lang === "en" ? "Only real local attempts are shown." : "仅显示本机真实训练记录。"}</p>
              </div>
              <Link className="text-sm font-semibold text-clinic-blue" href="/cases">{lang === "en" ? "All cases" : "全部病例"}</Link>
            </div>
            {recent.length ? (
              <div className="divide-y divide-clinic-line">
                {recent.map((item) => (
                  <Link key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-clinic-paper" href={publicCaseHref(item.displayCaseId || item.id)}>
                    <span className="home-action-icon"><MessageSquareText size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{item.displayCaseId || item.id}</strong>
                      <small className="mt-1 block text-clinic-muted">{item.age || "-"} / {lang === "en" ? item.sexEn : item.sex}</small>
                    </span>
                    <span className="text-xs font-medium text-clinic-blue">{progress[item.id] === "completed" ? (lang === "en" ? "Completed" : "已完成") : (lang === "en" ? "Continue" : "继续")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <Clock3 size={24} className="mx-auto text-clinic-muted" />
                <p className="mt-3 text-sm font-medium">{lang === "en" ? "No training records yet" : "尚无训练记录"}</p>
                <p className="mt-1 text-xs text-clinic-muted">{lang === "en" ? "Start P001 or select a blind case." : "可从 P001 开始，或前往病例库盲选病例。"}</p>
              </div>
            )}
          </div>

          <aside className="ui-card p-5 shadow-none">
            <div className="flex items-center gap-2"><BookOpenCheck size={18} className="text-clinic-blue" /><h3 className="font-semibold">{lang === "en" ? "Local progress" : "本机进度"}</h3></div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-clinic-paper p-3"><dt className="text-xs text-clinic-muted">{lang === "en" ? "In progress" : "进行中"}</dt><dd className="mt-1 text-2xl font-semibold">{inProgress}</dd></div>
              <div className="rounded-lg bg-clinic-paper p-3"><dt className="text-xs text-clinic-muted">{lang === "en" ? "Completed" : "已完成"}</dt><dd className="mt-1 text-2xl font-semibold">{completed}</dd></div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-clinic-muted">
              {lang === "en" ? "Scores remain governed by the existing 360-point contract." : "评分仍严格沿用现有 360 分合同。"}
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
