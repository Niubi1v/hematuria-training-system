"use client";

import { useEffect, useState } from "react";

const buildMeta = {
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "2.4.2-dev",
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || "local",
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "local development build",
  caseLibraryVersion: process.env.NEXT_PUBLIC_CASE_LIBRARY_VERSION || "42-case-2.4",
  scoringVersion: process.env.NEXT_PUBLIC_SCORING_VERSION || "360-event-v1"
};

export default function BuildMetaFooter() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  useEffect(() => {
    if (localStorage.getItem("hematuria-language") === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);
  const labels = lang === "en"
    ? ["App version", "Git commit", "Build time", "Case library", "Scoring rules"]
    : ["应用版本", "代码版本", "构建时间", "病例库版本", "评分规则版本"];
  return (
    <footer className="border-t border-clinic-line bg-white px-5 py-4 text-xs text-clinic-muted">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-x-5 gap-y-1" data-testid="build-metadata">
        <span>{labels[0]}：{buildMeta.appVersion}</span>
        <span>{labels[1]}：{buildMeta.gitSha}</span>
        <span>{labels[2]}：{buildMeta.buildTime}</span>
        <span>{labels[3]}：{buildMeta.caseLibraryVersion}</span>
        <span>{labels[4]}：{buildMeta.scoringVersion}</span>
      </div>
    </footer>
  );
}
