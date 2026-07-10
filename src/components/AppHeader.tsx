"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "首页", exact: true },
  { href: "/random", label: "自由训练" },
  { href: "/random?mode=osce", label: "OSCE" },
  { href: "/cases", label: "病例库" },
  { href: "/rct", label: "RCT" },
  { href: "/teacher", label: "教师演示" }
];

export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-clinic-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Link href="/" className="text-base font-semibold text-clinic-ink sm:text-lg">血尿临床思维训练平台</Link>
        <nav aria-label="主导航" className="flex max-w-full gap-1 overflow-x-auto text-sm text-clinic-muted">
          {links.map((item) => {
            const active = item.exact ? pathname === "/" : pathname.startsWith(item.href.split("?")[0]) && (item.label !== "OSCE" || false);
            return <Link aria-current={active ? "page" : undefined} key={`${item.href}-${item.label}`} href={item.href} className={`shrink-0 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-clinic-blue ${active ? "bg-clinic-paper font-medium text-clinic-blue" : "hover:text-clinic-blue"}`}>{item.label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
