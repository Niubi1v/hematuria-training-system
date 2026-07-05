"use client";

import { useMemo, useState } from "react";
import rctProtocolJson from "@/data/rct_protocol.json";
import rctQuestionnairesJson from "@/data/rct_questionnaires.json";
import type { RctProtocolItem, RctQuestionnaireItem } from "@/src/lib/types";

type RctRecord = {
  participantId: string;
  grade: string;
  group: string;
  caseIds: string;
  preOsce: string;
  postOsce: string;
  preConfidence: string;
  postConfidence: string;
  satisfaction: string;
  notes: string;
  timestamp: string;
};

const emptyRecord: Omit<RctRecord, "timestamp"> = {
  participantId: "",
  grade: "",
  group: "多智能体训练组",
  caseIds: "",
  preOsce: "",
  postOsce: "",
  preConfidence: "",
  postConfidence: "",
  satisfaction: "",
  notes: ""
};

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toCsv(rows: RctRecord[]) {
  const headers = ["participantId", "grade", "group", "caseIds", "preOsce", "postOsce", "preConfidence", "postConfidence", "satisfaction", "notes", "timestamp"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key as keyof RctRecord])).join(","))].join("\n");
}

export default function RctResearchClient() {
  const [form, setForm] = useState(emptyRecord);
  const [records, setRecords] = useState<RctRecord[]>(() => {
    if (typeof window === "undefined") return [];
    return safeJson<RctRecord[]>(localStorage.getItem("hematuria-rct-records"), []);
  });
  const protocol = rctProtocolJson as RctProtocolItem[];
  const questionnaires = rctQuestionnairesJson as RctQuestionnaireItem[];

  const summary = useMemo(() => {
    const total = records.length;
    const train = records.filter((item) => item.group.includes("多智能体")).length;
    const control = records.filter((item) => item.group.includes("对照")).length;
    return { total, train, control };
  }, [records]);

  function update<K extends keyof typeof emptyRecord>(key: K, value: (typeof emptyRecord)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function saveRecord() {
    const next: RctRecord = { ...form, timestamp: new Date().toISOString() };
    const rows = [...records, next];
    setRecords(rows);
    localStorage.setItem("hematuria-rct-records", JSON.stringify(rows));
    setForm(emptyRecord);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hematuria-rct-records.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const blob = new Blob([`\uFEFF${toCsv(records)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hematuria-rct-records.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">RCT研究模块</h1>
          <p className="mt-2 text-clinic-muted">用于记录30人小样本教学研究数据，数据仅保存在本机浏览器 localStorage。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportJson} className="rounded-md border border-clinic-line bg-white px-4 py-2 font-medium hover:border-clinic-blue">导出JSON</button>
          <button onClick={exportCsv} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">导出CSV</button>
        </div>
      </div>

      <section className="grid gap-4 rounded-lg border border-clinic-line bg-white p-5 md:grid-cols-3">
        <div><p className="text-sm text-clinic-muted">总记录</p><p className="mt-1 text-2xl font-semibold text-clinic-blue">{summary.total}</p></div>
        <div><p className="text-sm text-clinic-muted">训练组</p><p className="mt-1 text-2xl font-semibold text-clinic-blue">{summary.train}</p></div>
        <div><p className="text-sm text-clinic-muted">对照组</p><p className="mt-1 text-2xl font-semibold text-clinic-blue">{summary.control}</p></div>
      </section>

      <section className="mt-5 rounded-lg border border-clinic-line bg-white p-5">
        <h2 className="text-xl font-semibold">新增受试者记录</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block"><span className="font-medium">受试者编号</span><input value={form.participantId} onChange={(event) => update("participantId", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">年级/层次</span><input value={form.grade} onChange={(event) => update("grade", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">分组</span><select value={form.group} onChange={(event) => update("group", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2"><option>多智能体训练组</option><option>传统教学对照组</option></select></label>
          <label className="block"><span className="font-medium">训练病例ID</span><input value={form.caseIds} onChange={(event) => update("caseIds", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">训练前OSCE分</span><input value={form.preOsce} onChange={(event) => update("preOsce", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">训练后OSCE分</span><input value={form.postOsce} onChange={(event) => update("postOsce", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">训练前自信度</span><input value={form.preConfidence} onChange={(event) => update("preConfidence", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">训练后自信度</span><input value={form.postConfidence} onChange={(event) => update("postConfidence", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block"><span className="font-medium">满意度</span><input value={form.satisfaction} onChange={(event) => update("satisfaction", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
          <label className="block md:col-span-2"><span className="font-medium">备注</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2" /></label>
        </div>
        <button onClick={saveRecord} className="mt-4 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">保存记录</button>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-clinic-line bg-white p-5">
          <h2 className="text-xl font-semibold">研究方案摘要</h2>
          <div className="mt-4 space-y-3">
            {protocol.map((item) => (
              <div key={item.module} className="rounded-md bg-clinic-paper p-3 text-sm leading-6">
                <p className="font-medium text-clinic-blue">{item.module}</p>
                <p>{item.design}</p>
                <p className="text-clinic-muted">{item.implementation}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-clinic-line bg-white p-5">
          <h2 className="text-xl font-semibold">OSCE/问卷条目</h2>
          <div className="mt-4 space-y-3">
            {questionnaires.map((item, index) => (
              <div key={`${item.scale}-${index}`} className="rounded-md bg-clinic-paper p-3 text-sm leading-6">
                <p className="font-medium text-clinic-blue">{item.scale}</p>
                <p>{item.item}</p>
                <p className="text-clinic-muted">{item.scoring}；{item.anchor}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
