"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", zh: "首页", en: "Home", exact: true },
  { href: "/random", zh: "自由训练", en: "Free training" },
  { href: "/random?mode=osce", zh: "OSCE考核", en: "OSCE" },
  { href: "/cases", zh: "病例库", en: "Cases" },
  { href: "/rct", zh: "RCT研究", en: "RCT study" },
  { href: "/teacher", zh: "教师演示", en: "Teacher demo" }
];

export default function AppHeader() {
  const pathname = usePathname();
  const [lang, setLang] = useState<"zh" | "en">("zh");
  useEffect(() => {
    if (localStorage.getItem("hematuria-language") === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);
  return (
    <header className="border-b border-clinic-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Link href="/" className="text-base font-semibold text-clinic-ink sm:text-lg">{lang === "en" ? "Hematuria Clinical Reasoning Platform" : "血尿临床思维训练平台"}</Link>
        <nav aria-label={lang === "en" ? "Main navigation" : "主导航"} className="flex max-w-full gap-1 overflow-x-auto text-sm text-clinic-muted">
          {links.map((item) => {
            const active = item.exact ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]) && item.zh !== "OSCE考核";
            return <Link aria-current={active ? "page" : undefined} key={`${item.href}-${item.zh}`} href={item.href} className={`shrink-0 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-clinic-blue ${active ? "bg-clinic-paper font-medium text-clinic-blue" : "hover:text-clinic-blue"}`}>{lang === "en" ? item.en : item.zh}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
