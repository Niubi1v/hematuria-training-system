import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/src/components/AppHeader";
import BuildMetaFooter from "@/src/components/BuildMetaFooter";

export const metadata: Metadata = {
  title: "血尿临床问诊训练系统",
  description: "用于医学教学的七阶段血尿临床问诊与临床思维训练系统"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppHeader />
        {children}
        <BuildMetaFooter />
      </body>
    </html>
  );
}
