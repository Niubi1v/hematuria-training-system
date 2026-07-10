"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileUp, Save, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { readJsonStorage, writeJsonStorage } from "@/src/lib/safeStorage";

export type RctRecord = {
  studyId: string;
  participantId: string;
  consentStatus: "已同意" | "未同意";
  consentDate: string;
  eligibilityStatus: "纳入" | "排除" | "待定";
  exclusionReason: string;
  grade: string;
  baselineInfo: string;
  randomizationStratum: string;
  sequenceNumber: string;
  group: "多智能体训练组" | "传统教学对照组";
  trainingCases: string;
  trainingDose: string;
  preTest: string;
  postTest: string;
  osceDimensions: string;
  selfEfficacy: string;
  susScore: string;
  completionMinutes: string;
  dropout: "否" | "是";
  protocolDeviation: string;
  missingReason: string;
  raterCode: string;
  blinded: "是" | "否" | "不适用";
  dataVersion: string;
  createdAt: string;
  updatedAt: string;
};

const storageKey = "hematuria-rct-records-v2";
export const emptyRctRecord: Omit<RctRecord, "createdAt" | "updatedAt"> = {
  studyId: "HEMATURIA-EDU-RCT",
  participantId: "",
  consentStatus: "未同意",
  consentDate: "",
  eligibilityStatus: "待定",
  exclusionReason: "",
  grade: "",
  baselineInfo: "",
  randomizationStratum: "",
  sequenceNumber: "",
  group: "多智能体训练组",
  trainingCases: "",
  trainingDose: "",
  preTest: "",
  postTest: "",
  osceDimensions: "",
  selfEfficacy: "",
  susScore: "",
  completionMinutes: "",
  dropout: "否",
  protocolDeviation: "",
  missingReason: "",
  raterCode: "",
  blinded: "是",
  dataVersion: "RCT-prototype-2.1",
};

const fields: Array<{ key: keyof typeof emptyRctRecord; label: string; required?: boolean; type?: "date" | "number" | "select" | "textarea"; options?: string[] }> = [
  { key: "studyId", label: "研究编号 study_id", required: true },
  { key: "participantId", label: "参与者研究编码 participant_id", required: true },
  { key: "consentStatus", label: "知情同意状态", required: true, type: "select", options: ["已同意", "未同意"] },
  { key: "consentDate", label: "知情同意日期", required: true, type: "date" },
  { key: "eligibilityStatus", label: "纳入/排除状态", required: true, type: "select", options: ["纳入", "排除", "待定"] },
  { key: "exclusionReason", label: "排除原因" },
  { key: "grade", label: "年级/层次", required: true },
  { key: "baselineInfo", label: "基线信息（不得录入身份信息）", type: "textarea" },
  { key: "randomizationStratum", label: "随机分层", required: true },
  { key: "sequenceNumber", label: "随机序列编号", required: true },
  { key: "group", label: "分组", required: true, type: "select", options: ["多智能体训练组", "传统教学对照组"] },
  { key: "trainingCases", label: "训练病例ID" },
  { key: "trainingDose", label: "训练剂量（次数/分钟）" },
  { key: "preTest", label: "前测总分（0-360）", type: "number" },
  { key: "postTest", label: "后测总分（0-360）", type: "number" },
  { key: "osceDimensions", label: "OSCE八维分数（JSON或分号分隔）", type: "textarea" },
  { key: "selfEfficacy", label: "自我效能（0-100）", type: "number" },
  { key: "susScore", label: "满意度/SUS（0-100）", type: "number" },
  { key: "completionMinutes", label: "完成时间（分钟）", type: "number" },
  { key: "dropout", label: "是否脱落", type: "select", options: ["否", "是"] },
  { key: "protocolDeviation", label: "方案偏离", type: "textarea" },
  { key: "missingReason", label: "缺失值原因", type: "textarea" },
  { key: "raterCode", label: "评分者编码", required: true },
  { key: "blinded", label: "盲态状态", type: "select", options: ["是", "否", "不适用"] },
  { key: "dataVersion", label: "数据版本", required: true }
];

const dataDictionary = [
  ["participant_id", "仅使用研究编码；全表唯一；不得使用姓名、学号、住院号或手机号。"],
  ["group", "1=多智能体训练组；0=传统教学对照组。"],
  ["preTest/postTest", "统一360分制，允许0-360。"],
  ["selfEfficacy/SUS", "0-100；空值必须填写missingReason。"],
  ["dropout", "是/否；脱落时记录原因和最后完成时间。"],
  ["blinded", "评分者是否保持分组盲态。"]
];

export function validateRctRecord(record: Omit<RctRecord, "createdAt" | "updatedAt">, rows: RctRecord[], editingId: string | null) {
  const errors: string[] = [];
  fields.filter((item) => item.required).forEach((item) => {
    if (!String(record[item.key] || "").trim()) errors.push(`${item.label}为必填项。`);
  });
  if (record.consentStatus !== "已同意") errors.push("未取得知情同意，不得保存为正式纳入记录。 ");
  if (record.eligibilityStatus === "排除" && !record.exclusionReason.trim()) errors.push("排除记录必须填写排除原因。 ");
  if (rows.some((item) => item.participantId === record.participantId && item.participantId !== editingId)) errors.push("participant_id重复。 ");
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(record.participantId)) errors.push("participant_id仅允许3-40位字母、数字、下划线或短横线。 ");
  const ranges: Array<[keyof typeof emptyRctRecord, number, number, string]> = [
    ["preTest", 0, 360, "前测"], ["postTest", 0, 360, "后测"], ["selfEfficacy", 0, 100, "自我效能"], ["susScore", 0, 100, "SUS"], ["completionMinutes", 0, 1440, "完成时间"]
  ];
  ranges.forEach(([key, min, max, label]) => {
    const value = record[key];
    if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max)) errors.push(`${label}必须在${min}-${max}范围内。`);
  });
  const privacyText = `${record.baselineInfo} ${record.protocolDeviation} ${record.missingReason}`;
  if (/\b1\d{10}\b|\b\d{17}[\dXx]\b|住院号|身份证|手机号|姓名[:：]/.test(privacyText)) errors.push("检测到可能的身份信息，请删除姓名、住院号、手机号或身份证号。 ");
  return errors;
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RctResearchClient() {
  const initial = readJsonStorage<RctRecord[]>(storageKey, []);
  const [records, setRecords] = useState<RctRecord[]>(initial.value);
  const [form, setForm] = useState(emptyRctRecord);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>(initial.recovered ? ["检测到损坏的本地RCT数据，已恢复为空数据集。"] : []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const summary = useMemo(() => ({ total: records.length, included: records.filter((item) => item.eligibilityStatus === "纳入").length, complete: records.filter((item) => item.postTest !== "" && item.dropout === "否").length }), [records]);

  function update(key: keyof typeof emptyRctRecord, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function persist(rows: RctRecord[]) {
    const result = writeJsonStorage(storageKey, rows);
    if (!result.ok) setErrors(["保存失败：浏览器存储不可用或容量不足。请立即导出备份。"]);
    else setRecords(rows);
  }

  function save() {
    const nextErrors = validateRctRecord(form, records, editingId);
    if (nextErrors.length) { setErrors(nextErrors); return; }
    const now = new Date().toISOString();
    if (editingId) {
      if (!window.confirm("确定保存对该研究记录的修改吗？")) return;
      const original = records.find((item) => item.participantId === editingId);
      persist(records.map((item) => item.participantId === editingId ? { ...form, createdAt: original?.createdAt || now, updatedAt: now } : item));
    } else {
      persist([...records, { ...form, createdAt: now, updatedAt: now }]);
    }
    setForm(emptyRctRecord);
    setEditingId(null);
    setErrors([]);
  }

  function edit(item: RctRecord) {
    setForm(Object.fromEntries(Object.keys(emptyRctRecord).map((key) => [key, item[key as keyof RctRecord] ?? ""])) as typeof emptyRctRecord);
    setEditingId(item.participantId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(participantId: string) {
    if (!window.confirm(`确定删除研究记录 ${participantId} 吗？此操作不能撤销。`)) return;
    persist(records.filter((item) => item.participantId !== participantId));
  }

  function clearAll() {
    if (!window.confirm("第一次确认：确定清空全部离线研究记录吗？")) return;
    if (!window.confirm("第二次确认：清空后只能通过导入备份恢复，仍要继续吗？")) return;
    persist([]);
  }

  function integrityErrors() {
    return records.flatMap((record) => validateRctRecord(record, records.filter((item) => item.participantId !== record.participantId), record.participantId).map((message) => `${record.participantId}: ${message}`));
  }

  function exportData(format: "json" | "csv") {
    const problems = integrityErrors();
    if (problems.length) { setErrors(["导出前完整性检查未通过：", ...problems.slice(0, 12)]); return; }
    if (format === "json") download("hematuria-rct-prototype.json", JSON.stringify(records, null, 2), "application/json;charset=utf-8");
    else {
      const sheet = XLSX.utils.json_to_sheet(records);
      download("hematuria-rct-prototype.csv", `\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`, "text/csv;charset=utf-8");
    }
  }

  async function importData(file: File) {
    try {
      let rows: RctRecord[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(await file.text()) as unknown;
        if (!Array.isArray(parsed)) throw new Error("JSON根节点必须是记录数组。 ");
        rows = parsed as RctRecord[];
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        rows = XLSX.utils.sheet_to_json<RctRecord>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      }
      const duplicates = rows.map((item) => item.participantId).filter((id, index, ids) => id && ids.indexOf(id) !== index);
      if (duplicates.length) throw new Error(`导入文件包含重复participant_id：${[...new Set(duplicates)].join("、")}`);
      const problems = rows.flatMap((row) => validateRctRecord(row, rows.filter((item) => item !== row), row.participantId).map((message) => `${row.participantId}: ${message}`));
      if (problems.length) throw new Error(problems.slice(0, 8).join("；"));
      if (!window.confirm(`将导入${rows.length}条记录并替换当前离线数据，是否继续？`)) return;
      persist(rows);
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "导入失败"]);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-clinic-blue">离线原型数据采集</p>
          <h1 className="mt-1 text-3xl font-semibold">RCT研究模块</h1>
          <p className="mt-2 max-w-3xl text-clinic-muted">localStorage 仅适合原型验证，清理浏览器缓存可能永久丢失数据，不具备研究级权限、审计追踪、集中备份或多中心协作能力。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportData("json")} className="inline-flex items-center gap-2 rounded-md border border-clinic-line bg-white px-3 py-2"><Download size={16} />JSON</button>
          <button onClick={() => exportData("csv")} className="inline-flex items-center gap-2 rounded-md border border-clinic-line bg-white px-3 py-2"><Download size={16} />CSV</button>
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-clinic-line bg-white px-3 py-2"><FileUp size={16} />导入</button>
          <input ref={fileRef} hidden type="file" accept=".json,.csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ""; }} />
        </div>
      </div>

      <section className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <div className="flex gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p>不得录入姓名、学号、住院号、手机号、身份证号等身份信息。请定期导出加密备份。样本量不能预设为“30人即可”，正式研究需基于主要终点、预期效应量、α、检验效能和脱落率进行估算。</p></div>
      </section>

      {errors.length > 0 && <section role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{errors.map((item) => <p key={item}>{item}</p>)}</section>}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="border-b border-clinic-line pb-3"><p className="text-sm text-clinic-muted">总记录</p><p className="text-2xl font-semibold">{summary.total}</p></div>
        <div className="border-b border-clinic-line pb-3"><p className="text-sm text-clinic-muted">已纳入</p><p className="text-2xl font-semibold">{summary.included}</p></div>
        <div className="border-b border-clinic-line pb-3"><p className="text-sm text-clinic-muted">已完成</p><p className="text-2xl font-semibold">{summary.complete}</p></div>
      </section>

      <section className="mt-6 border-t border-clinic-line pt-5">
        <h2 className="text-xl font-semibold">{editingId ? `修改 ${editingId}` : "新增研究记录"}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
              <span className="font-medium">{field.label}{field.required ? " *" : ""}</span>
              {field.type === "select" ? (
                <select value={form[field.key]} onChange={(event) => update(field.key, event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 focus:border-clinic-blue focus:outline-none">{field.options?.map((option) => <option key={option}>{option}</option>)}</select>
              ) : field.type === "textarea" ? (
                <textarea value={form[field.key]} onChange={(event) => update(field.key, event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 focus:border-clinic-blue focus:outline-none" />
              ) : (
                <input type={field.type || "text"} value={form[field.key]} onChange={(event) => update(field.key, event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 focus:border-clinic-blue focus:outline-none" />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white"><Save size={16} />{editingId ? "保存修改" : "保存记录"}</button>
          {editingId && <button onClick={() => { setEditingId(null); setForm(emptyRctRecord); setErrors([]); }} className="rounded-md border border-clinic-line px-4 py-2">取消</button>}
        </div>
      </section>

      <section className="mt-8 border-t border-clinic-line pt-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">离线记录</h2><button onClick={clearAll} disabled={!records.length} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-40"><Trash2 size={16} />清空全部</button></div>
        {records.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-clinic-line"><th className="p-3">participant_id</th><th className="p-3">状态</th><th className="p-3">分组</th><th className="p-3">前/后测</th><th className="p-3">更新时间</th><th className="p-3">操作</th></tr></thead><tbody>{records.map((item) => <tr key={item.participantId} className="border-b border-clinic-line"><td className="p-3 font-medium">{item.participantId}</td><td className="p-3">{item.eligibilityStatus}{item.dropout === "是" ? " / 脱落" : ""}</td><td className="p-3">{item.group}</td><td className="p-3">{item.preTest || "-"} / {item.postTest || "-"}</td><td className="p-3">{item.updatedAt.slice(0, 10)}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => edit(item)} className="text-clinic-blue underline">修改</button><button onClick={() => remove(item.participantId)} className="text-rose-700 underline">删除</button></div></td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-md bg-clinic-paper p-4 text-sm text-clinic-muted">暂无记录。完成知情同意和纳排确认后再录入研究编码。</p>}
      </section>

      <section className="mt-8 border-t border-clinic-line pt-5"><h2 className="text-xl font-semibold">数据字典</h2><dl className="mt-4 grid gap-3 md:grid-cols-2">{dataDictionary.map(([name, description]) => <div key={name} className="border-b border-clinic-line pb-3"><dt className="font-mono text-sm font-medium text-clinic-blue">{name}</dt><dd className="mt-1 text-sm leading-6 text-clinic-muted">{description}</dd></div>)}</dl></section>
    </main>
  );
}
