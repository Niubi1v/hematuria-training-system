import { LockKeyhole } from "lucide-react";

export default function TeacherPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <section className="border-y border-clinic-line py-8">
        <LockKeyhole className="text-clinic-blue" />
        <h1 className="mt-4 text-2xl font-semibold">教师端未在公开练习站发布</h1>
        <p className="mt-3 leading-7 text-clinic-muted">教师答案、评分规则和病例事实必须部署在带身份验证与角色权限的后端。本 GitHub Pages 站点仅用于练习，不提供教师答案。</p>
        <p className="mt-3 text-sm text-clinic-muted">The public practice deployment does not include teacher answers or formal assessment access.</p>
      </section>
    </main>
  );
}
