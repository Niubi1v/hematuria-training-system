import Link from "next/link";

export default function SummaryPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12"><h1 className="text-2xl font-semibold">旧版总结页已停用</h1><p className="mt-3 text-clinic-muted">病史小结已整合到七阶段训练流程，不再使用独立的旧版页面。</p><Link href="/cases" className="mt-5 inline-flex rounded-md bg-clinic-blue px-4 py-2 text-white">返回病例库</Link></main>;
}
