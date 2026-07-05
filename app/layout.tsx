import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "血尿病史采集训练系统",
  description: "用于临床医学本科生血尿病史采集训练的本地教学网页"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="border-b border-clinic-line bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
            <Link href="/" className="text-lg font-semibold text-clinic-ink">
              血尿病史采集训练系统
            </Link>
            <nav className="flex gap-4 text-sm text-clinic-muted">
              <Link className="hover:text-clinic-blue" href="/random">随机训练</Link>
              <Link className="hover:text-clinic-blue" href="/cases">病例列表</Link>
              <Link className="hover:text-clinic-blue" href="/teacher">教师模式</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
