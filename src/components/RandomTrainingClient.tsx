"use client";

import { useEffect, useState } from "react";
import { publicCaseHref } from "@/src/lib/publicRoutes";

type BlindRandomCase = {
  id: string;
  displayCaseId: string;
};

export default function RandomTrainingClient({ cases }: { cases: BlindRandomCase[] }) {
  const [message, setMessage] = useState("正在随机抽取病例……");

  useEffect(() => {
    if (!cases.length) {
      setMessage("当前没有可用病例，请稍后重试。");
      return;
    }
    const selected = cases[Math.floor(Math.random() * cases.length)];
    setMessage("已抽取病例，正在进入七阶段训练……");
    window.location.replace(publicCaseHref(selected.displayCaseId || selected.id, { mode: "random" }));
  }, [cases]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-5 py-10">
      <div className="rounded-lg border border-clinic-line bg-white p-8 text-center shadow-soft">
        <h1 className="text-2xl font-semibold">随机抽取病例</h1>
        <p className="mt-3 text-clinic-muted">{message}</p>
      </div>
    </main>
  );
}
