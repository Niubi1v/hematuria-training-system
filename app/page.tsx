import Link from "next/link";
import { BookOpen, GraduationCap, ShieldAlert, Shuffle, Stethoscope } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      <section className="medical-band border-b border-clinic-line">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-clinic-line bg-white px-3 py-1 text-sm text-clinic-muted">
              <Stethoscope size={16} /> OSCE 风格全流程训练
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-clinic-ink md:text-5xl">
              血尿临床思维训练系统
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-clinic-muted">
              本系统用于训练临床医学本科生围绕血尿完成病史采集、鉴别诊断、开单检查、会诊判断、治疗决策和随访教育。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-md bg-clinic-blue px-5 py-3 font-medium text-white shadow-soft hover:bg-clinic-teal" href="/random">
                自由训练
              </Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="/random?mode=osce">
                OSCE考核
              </Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="/cases">
                选择病例
              </Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="/teacher">
                教师演示
              </Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="/rct">
                RCT研究
              </Link>
              <Link className="rounded-md border border-clinic-line bg-white px-5 py-3 font-medium text-clinic-ink hover:border-clinic-blue" href="#guide">
                查看说明
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-clinic-line bg-white p-6 shadow-soft">
            <div className="grid gap-4">
              {[
                ["自由训练", "逐阶段提交并即时反馈，适合课堂练习和课后自学。"],
                ["OSCE考核", "倒计时、无提示、无中途反馈，终末统一评分复盘。"],
                ["教师演示/RCT", "支持教师查看病例卡、导出记录，并保留研究数据采集入口。"]
              ].map(([label, text]) => (
                <div key={label} className="border-b border-clinic-line pb-4 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium text-clinic-blue">{label}</p>
                  <p className="mt-1 text-clinic-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="guide" className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-3">
        <article className="rounded-lg border border-clinic-line bg-white p-5">
          <Shuffle className="text-clinic-blue" />
          <h2 className="mt-3 text-xl font-semibold">自由训练</h2>
          <p className="mt-2 text-sm leading-6 text-clinic-muted">适合正式训练或考核前练习，学生可以选择病例或随机抽题。</p>
        </article>
        <article className="rounded-lg border border-clinic-line bg-white p-5">
          <GraduationCap className="text-clinic-teal" />
          <h2 className="mt-3 text-xl font-semibold">OSCE考核</h2>
          <p className="mt-2 text-sm leading-6 text-clinic-muted">隐藏中途提示和即时反馈，按虚拟标准化病人流程完成终末评价。</p>
        </article>
        <article className="rounded-lg border border-clinic-line bg-white p-5">
          <BookOpen className="text-clinic-green" />
          <h2 className="mt-3 text-xl font-semibold">360 分反馈</h2>
          <p className="mt-2 text-sm leading-6 text-clinic-muted">评分覆盖问诊定位、危险因素、查体、鉴别、开单、会诊、治疗和随访教育。</p>
        </article>
        <article className="rounded-lg border border-clinic-line bg-white p-5 md:col-span-3">
          <ShieldAlert className="text-clinic-blue" />
          <h2 className="mt-3 text-xl font-semibold">教学与隐私说明</h2>
          <p className="mt-2 text-sm leading-6 text-clinic-muted">
            本系统仅用于医学教学训练，不用于真实诊疗。导入真实病例前请完成脱敏，不要包含姓名、住院号、电话、身份证号等个人身份信息。
          </p>
        </article>
      </section>
    </main>
  );
}
