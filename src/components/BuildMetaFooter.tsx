"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readStringStorage } from "@/src/lib/safeStorage";

export default function BuildMetaFooter() {
  const pathname = usePathname();
  const [lang, setLang] = useState<"zh" | "en">("zh");
  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);
  if (/^\/cases\/[^/]+\/?$/.test(pathname)) return null;
  return (
    <footer className="border-t border-clinic-line bg-white px-5 py-4 text-xs text-clinic-muted">
      <div className="mx-auto max-w-7xl" data-testid="teaching-disclaimer">
        <span>
          {lang === "en"
            ? "For medical education and simulated training only. Not for real-patient diagnosis or treatment decisions."
            : "仅用于医学教学与模拟训练，不用于真实患者的诊断或治疗决策。"}
        </span>
      </div>
    </footer>
  );
}
