"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readStringStorage } from "@/src/lib/safeStorage";
import DesktopModelSettings from "./DesktopModelSettings";

const links = [
  { href: "/", zh: "首页", en: "Home", exact: true },
  { href: "/random", zh: "自由训练", en: "Practice" },
  { href: "/cases", zh: "病例库", en: "Cases" }
];

export default function AppHeader() {
  const pathname = usePathname();
  const [lang, setLang] = useState<"zh" | "en">("zh");
  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);
  if (/^\/cases\/[^/]+\/?$/.test(pathname)) return null;
  return (
    <header className="app-toolbar sticky top-0 z-40 border-b border-clinic-line bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[55px] max-w-[1440px] items-center justify-between gap-x-3 px-5">
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-clinic-ink sm:text-base">{lang === "en" ? "Hematuria Clinical Training" : "血尿临床问诊训练"}</Link>
        <div className="flex min-w-0 items-center gap-2">
          <nav aria-label={lang === "en" ? "Main navigation" : "主导航"} className="flex w-full gap-1 overflow-x-auto pt-1 text-sm text-clinic-muted sm:w-auto sm:pt-0">
            {links.map((item) => {
              const active = item.exact ? pathname === "/" : pathname.startsWith(item.href);
              return <Link aria-current={active ? "page" : undefined} key={item.href} href={item.href} className={`min-h-10 shrink-0 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-clinic-blue ${active ? "bg-clinic-paper text-clinic-blue" : "hover:bg-clinic-paper hover:text-clinic-blue"}`}>{lang === "en" ? item.en : item.zh}</Link>;
            })}
          </nav>
          <DesktopModelSettings />
        </div>
      </div>
    </header>
  );
}
