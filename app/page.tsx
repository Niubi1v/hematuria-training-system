"use client";

import Link from "next/link";
import { BookOpen, ShieldAlert, Shuffle, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  useEffect(() => {
    if (localStorage.getItem("hematuria-language") === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);

  return (
    <main>
      <section className="medical-band border-b border-clinic-line">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-[1.2fr_0.8fr] md:items-center md:py-14">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-clinic-blue"><Stethoscope size={16} /> {lang === "en" ? "Seven-stage clinical reasoning" : "七阶段临床思维训练"}</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-clinic-ink sm:text-4xl md:text-5xl">{lang === "en" ? "Hematuria Clinical Reasoning Training" : "血尿临床思维训练系统"}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-clinic-muted sm:text-lg sm:leading-8">{lang === "en" ? "A medical education workspace for history taking, investigation decisions, diagnostic reasoning, MDT, treatment, perioperative management, and structured debriefing." : "医学教学与临床思维训练平台。完成病史采集、检查决策、诊断推理、MDT、治疗、围术期管理和终末复盘。"}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="ui-button-primary px-5" href="/random">{lang === "en" ? "Start practice" : "开始练习"}</Link>
              <Link className="ui-button-secondary px-5" href="/cases">{lang === "en" ? "Choose a case" : "选择病例"}</Link>
              <Link className="ui-button-quiet px-3" href="#guide">{lang === "en" ? "How it works" : "查看说明"}</Link>
            </div>
          </div>
          <div className="rounded-xl border border-clinic-line bg-white/70 p-5">
            <p className="text-sm font-semibold text-clinic-blue">{lang === "en" ? "Public practice environment" : "公开练习环境"}</p>
            <p className="mt-2 text-sm leading-7 text-clinic-muted">{lang === "en" ? "For practice only. Formal OSCE assessment, teacher grading, and research data collection require an authenticated backend." : "仅用于练习，不可用于正式 OSCE、教师阅卷或研究数据采集。正式模式需要带身份验证的后端。"}</p>
          </div>
        </div>
      </section>

      <section id="guide" className="mx-auto grid max-w-7xl gap-4 px-5 py-8 md:grid-cols-3 md:py-10">
        <article className="ui-card p-5"><Shuffle className="text-clinic-blue" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">{lang === "en" ? "Structured sequence" : "顺序训练"}</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">{lang === "en" ? "Seven stages unlock in order; feedback is released after each submission." : "七阶段按顺序解锁，每阶段提交后才显示相应反馈。"}</p></article>
        <article className="ui-card p-5"><BookOpen className="text-clinic-teal" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">{lang === "en" ? "360-point debrief" : "360分复盘"}</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">{lang === "en" ? "The final report uses structured events to show evidence, omissions, and practical next steps." : "终末评分依据结构化操作事件，并给出证据、漏项和改进建议。"}</p></article>
        <article className="ui-card p-5"><ShieldAlert className="text-clinic-green" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">{lang === "en" ? "Teaching boundary" : "教学边界"}</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">{lang === "en" ? "For medical education only, not patient care. Cases must not include identifiable patient information." : "仅用于医学教学，不用于真实诊疗。病例资料不得包含可识别患者身份的信息。"}</p></article>
      </section>
    </main>
  );
}
