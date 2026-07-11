import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/src/components/AppHeader";
import BuildMetaFooter from "@/src/components/BuildMetaFooter";

export const metadata: Metadata = {
  title: "血尿多智能体临床思维训练平台",
  description: "用于医学教学与临床思维训练的血尿7阶段智能体教学平台"
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
