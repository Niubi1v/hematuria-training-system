import { DatabaseZap } from "lucide-react";

export default function RctPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <section className="border-y border-clinic-line py-8">
        <DatabaseZap className="text-clinic-blue" />
        <h1 className="mt-4 text-2xl font-semibold">正式研究采集未在公开站启用</h1>
        <p className="mt-3 leading-7 text-clinic-muted">localStorage 不能作为研究数据库。正式 RCT 需要知情同意、伪匿名参与者编码、后端数据库、审计日志与版本化评分。本页面不采集研究数据。</p>
        <p className="mt-3 text-sm text-clinic-muted">Formal research data collection requires an authenticated backend and audit trail.</p>
      </section>
    </main>
  );
}
