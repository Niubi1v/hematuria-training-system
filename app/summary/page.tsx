import SummaryClient from "@/src/components/SummaryClient";
import { Suspense } from "react";

export default function SummaryPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-5 py-10">正在加载总结页...</main>}>
      <SummaryClient />
    </Suspense>
  );
}
