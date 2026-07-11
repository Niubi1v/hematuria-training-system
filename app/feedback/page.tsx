import Link from "next/link";

export default function FeedbackPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12"><h1 className="text-2xl font-semibold">旧版反馈页已停用</h1><p className="mt-3 text-clinic-muted">请在七阶段训练的第7阶段查看基于结构化事件的终末反馈。</p><Link href="/cases" className="mt-5 inline-flex rounded-md bg-clinic-blue px-4 py-2 text-white">返回病例库</Link></main>;
}
