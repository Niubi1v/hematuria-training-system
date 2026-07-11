import Link from "next/link";
import { BookOpen, ShieldAlert, Shuffle, Stethoscope } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      <section className="medical-band border-b border-clinic-line">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-clinic-blue"><Stethoscope size={16} /> 七阶段临床思维训练</p>
            <h1 className="text-4xl font-semibold tracking-normal text-clinic-ink md:text-5xl">血尿临床思维训练系统</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-clinic-muted">医学教学与临床思维训练平台。完成病史采集、检查决策、诊断推理、MDT、治疗、围术期管理和终末复盘。</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-md bg-clinic-blue px-5 py-3 font-medium text-white shadow-soft hover:bg-clinic-teal" href="/random">开始练习</Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="/cases">选择病例</Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="#guide">查看说明</Link>
            </div>
          </div>
          <div className="border-y border-clinic-line py-6">
            <p className="text-sm font-medium text-clinic-blue">公开练习部署</p>
            <p className="mt-2 leading-7 text-clinic-muted">GitHub Pages 仅用于练习，不可用于正式 OSCE、教师阅卷或研究数据采集。正式模式需要带身份验证的后端。</p>
          </div>
        </div>
      </section>

      <section id="guide" className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-3">
        <article><Shuffle className="text-clinic-blue" /><h2 className="mt-3 text-xl font-semibold">顺序训练</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">七阶段按顺序解锁，每阶段提交后才显示相应反馈。</p></article>
        <article><BookOpen className="text-clinic-teal" /><h2 className="mt-3 text-xl font-semibold">360分复盘</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">终末评分依据结构化操作事件，并给出证据、漏项和改进建议。</p></article>
        <article><ShieldAlert className="text-clinic-green" /><h2 className="mt-3 text-xl font-semibold">教学边界</h2><p className="mt-2 text-sm leading-6 text-clinic-muted">仅用于医学教学，不用于真实诊疗。病例资料不得包含可识别患者身份的信息。</p></article>
      </section>
    </main>
  );
}
