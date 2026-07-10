"use client";

import { useEffect, useState } from "react";

const steps = [
  { title: "选择训练模式", text: "自由训练按阶段反馈；OSCE考核只在最后统一复盘。" },
  { title: "按1→7完成", text: "先问诊和检查，再提交诊断、MDT、治疗、围术期方案。" },
  { title: "自动保存", text: "训练记录保存在当前浏览器，可断点续训；公开设备使用后请清理缓存。" }
];

export default function OnboardingGuide() {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    try {
      if (localStorage.getItem("hematuria-onboarding-v2") !== "done") setStep(0);
    } catch {
      setStep(0);
    }
  }, []);
  if (step < 0) return null;
  const close = () => {
    try { localStorage.setItem("hematuria-onboarding-v2", "done"); } catch { /* The guide can close without persistence. */ }
    setStep(-1);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <p className="text-sm font-medium text-clinic-blue">快速上手 {step + 1}/3</p>
        <h2 id="onboarding-title" className="mt-2 text-2xl font-semibold">{steps[step].title}</h2>
        <p className="mt-3 leading-7 text-clinic-muted">{steps[step].text}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={close} className="rounded-md px-3 py-2 text-sm text-clinic-muted hover:text-clinic-blue">跳过</button>
          <button type="button" autoFocus onClick={() => step === steps.length - 1 ? close() : setStep((value) => value + 1)} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">{step === steps.length - 1 ? "开始使用" : "下一步"}</button>
        </div>
      </section>
    </div>
  );
}
