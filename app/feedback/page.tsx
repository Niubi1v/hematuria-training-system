import FeedbackClient from "@/src/components/FeedbackClient";
import { Suspense } from "react";

export default function FeedbackPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-5 py-10">正在生成反馈...</main>}>
      <FeedbackClient />
    </Suspense>
  );
}
