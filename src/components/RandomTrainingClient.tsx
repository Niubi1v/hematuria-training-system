"use client";

import { useEffect, useState } from "react";
import publicCases from "@/data/cases_public.json";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function RandomTrainingClient() {
  const [message, setMessage] = useState("正在随机抽取练习病例...");

  useEffect(() => {
    if (!publicCases.length) {
      setMessage("病例库为空，请先导入病例。");
      return;
    }
    const selected = publicCases[Math.floor(Math.random() * publicCases.length)];
    setMessage("已抽取病例，正在进入七阶段训练...");
    window.location.replace(`${basePath}/cases/${selected.id}/index.html?mode=random`);
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-5 py-10">
      <div className="rounded-lg border border-clinic-line bg-white p-8 text-center shadow-soft">
        <h1 className="text-2xl font-semibold">随机训练</h1>
        <p className="mt-3 text-clinic-muted">{message}</p>
      </div>
    </main>
  );
}
