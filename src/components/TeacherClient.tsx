"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Save, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { allCases } from "@/src/lib/cases";
import scoringTemplate from "@/data/scoring_template.json";
import orderPackages from "@/data/order_packages.json";
import consultRules from "@/data/consult_rules.json";
import treatmentPathways from "@/data/treatment_pathways.json";
import orderResults from "@/data/order_results.json";
import agentConfigs from "@/data/agent_configs.json";
import ragRules from "@/data/rag_rules.json";
import mdtTriggers from "@/data/mdt_triggers.json";
import evaluatorRubric from "@/data/evaluator_rubric.json";
import rctProtocol from "@/data/rct_protocol.json";
import type { AgentConfig, CaseData, EvaluatorRubricItem, MdtTrigger, OrderResultItem } from "@/src/lib/types";
import FormattedText from "./FormattedText";

type WorkbookPreview = {
  sheetName: string;
  rowCount: number;
  headers: string[];
  firstRow: Record<string, unknown>;
};

function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))
  ];
  return lines.join("\n");
}

export default function TeacherClient() {
  const [preview, setPreview] = useState<WorkbookPreview[]>([]);
  const [warnings, setWarnings] = useState<string[]>(["未上传新 Excel 时，页面显示当前已转换的内置病例库。"]);
  const [selectedCaseId, setSelectedCaseId] = useState(allCases[0]?.id ?? "");
  const [caseDraftText, setCaseDraftText] = useState("");
  const [newCaseText, setNewCaseText] = useState("{\n  \"id\": \"HM-NEW-001\",\n  \"title\": \"新建教学病例\",\n  \"age\": \"\",\n  \"sex\": \"\",\n  \"chiefComplaint\": \"\"\n}");
  const [manualScore, setManualScore] = useState("");
  const [manualComment, setManualComment] = useState("");
  const [studentLogs, setStudentLogs] = useState<Array<Record<string, unknown>>>([]);

  const selectedCase = useMemo(() => allCases.find((item) => item.id === selectedCaseId), [selectedCaseId]);
  const selectedOrderResults = useMemo(() => (orderResults as OrderResultItem[]).filter((item) => item.caseId === selectedCaseId), [selectedCaseId]);
  const selectedMdtTrigger = useMemo(() => (mdtTriggers as MdtTrigger[]).find((item) => item.caseId === selectedCaseId), [selectedCaseId]);
  const logStats = useMemo(() => {
    const scores = studentLogs.map((row) => Number(row.score)).filter((score) => Number.isFinite(score));
    const cases = new Set(studentLogs.map((row) => String(row.case_id ?? "")).filter(Boolean));
    const finalRows = studentLogs.filter((row) => String(row.stage ?? "").includes("final"));
    return {
      totalLogs: studentLogs.length,
      caseCount: cases.size,
      finalCount: finalRows.length,
      avgScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
    };
  }, [studentLogs]);

  useEffect(() => {
    if (selectedCase) {
      setCaseDraftText(JSON.stringify(selectedCase, null, 2));
      const saved = safeJson<{ score?: string; comment?: string }>(localStorage.getItem(`hematuria-manual-score-${selectedCase.id}`), {});
      setManualScore(saved.score ?? "");
      setManualComment(saved.comment ?? "");
    }
  }, [selectedCase]);

  useEffect(() => {
    setStudentLogs(safeJson<Array<Record<string, unknown>>>(localStorage.getItem("hematuria-full-process-results"), []));
  }, []);

  async function handleUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const privacyWords = ["姓名", "住院号", "门诊号", "登记号", "电话", "身份证", "地址", "手机", "检查日期"];
    const nextWarnings: string[] = [];
    const sheets = workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
      const headers = Object.keys(rows[0] ?? {});
      headers.forEach((header) => {
        if (privacyWords.some((word) => header.includes(word))) nextWarnings.push(`${sheetName} 中发现疑似隐私字段：${header}`);
      });
      return { sheetName, rowCount: rows.length, headers, firstRow: rows[0] ?? {} };
    });
    setPreview(sheets);
    setWarnings(nextWarnings.length ? nextWarnings : ["未发现姓名、住院号、门诊号、电话、身份证、地址等常见隐私字段。"]);
  }

  function exportResults(format: "json" | "csv") {
    const results = safeJson<Array<Record<string, unknown>>>(localStorage.getItem("hematuria-full-process-results"), []);
    if (format === "json") {
      downloadText("hematuria-full-process-results.json", JSON.stringify(results, null, 2));
      return;
    }
    downloadText("hematuria-full-process-results.csv", toCsv(results), "text/csv");
  }

  function saveEditedDraft() {
    if (!selectedCase) return;
    localStorage.setItem(`hematuria-case-draft-${selectedCase.id}`, caseDraftText);
    alert("已保存到浏览器本地草稿。若要永久进入项目，请把修改同步到 Excel 后重新运行 npm run convert:excel。");
  }

  function saveNewCaseDraft() {
    const drafts = safeJson<string[]>(localStorage.getItem("hematuria-new-case-drafts"), []);
    localStorage.setItem("hematuria-new-case-drafts", JSON.stringify([...drafts, newCaseText]));
    alert("新病例草稿已保存到浏览器本地。");
  }

  function saveManualScore() {
    if (!selectedCase) return;
    localStorage.setItem(`hematuria-manual-score-${selectedCase.id}`, JSON.stringify({
      score: manualScore,
      comment: manualComment,
      timestamp: new Date().toISOString()
    }));
    alert("人工修正分数已保存。");
  }

  function clearTrainingCache() {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("hematuria-")) localStorage.removeItem(key);
    });
    localStorage.setItem("hematuria-case-library-version", "V2-only");
    setStudentLogs([]);
    alert("已清空本机浏览器中的旧训练缓存。");
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-3xl font-semibold">教师模式</h1>
      <p className="mt-2 text-clinic-muted">用于本地预览新版 Excel、查看全流程隐藏答案、编辑病例草稿、人工修正评分和导出训练记录。</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={18} /> 上传或替换 Excel</h2>
            <input
              className="mt-4 w-full rounded-md border border-clinic-line p-2 text-sm"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <div className="mt-4 rounded-md bg-clinic-paper p-3 text-sm leading-6 text-clinic-muted">
              上传仅在浏览器本地解析，不会传输到网络。要永久替换病例库，请把 Excel 放到 work/source/v2_only_cases.xlsx 后运行 npm run convert:excel。
            </div>
          </section>

          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">隐私与导入提示</h2>
            <ul className="mt-3 space-y-2 text-sm text-clinic-muted">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>

          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">导出学生训练结果</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-clinic-paper p-3"><p className="text-clinic-muted">记录数</p><p className="mt-1 text-xl font-semibold text-clinic-blue">{logStats.totalLogs}</p></div>
              <div className="rounded-md bg-clinic-paper p-3"><p className="text-clinic-muted">病例数</p><p className="mt-1 text-xl font-semibold text-clinic-blue">{logStats.caseCount}</p></div>
              <div className="rounded-md bg-clinic-paper p-3"><p className="text-clinic-muted">终末评价</p><p className="mt-1 text-xl font-semibold text-clinic-blue">{logStats.finalCount}</p></div>
              <div className="rounded-md bg-clinic-paper p-3"><p className="text-clinic-muted">平均分</p><p className="mt-1 text-xl font-semibold text-clinic-blue">{logStats.avgScore}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => exportResults("json")} className="inline-flex items-center justify-center gap-2 rounded-md border border-clinic-line px-3 py-2 hover:border-clinic-blue">
                <Download size={16} /> JSON
              </button>
              <button onClick={() => exportResults("csv")} className="inline-flex items-center justify-center gap-2 rounded-md border border-clinic-line px-3 py-2 hover:border-clinic-blue">
                <Download size={16} /> CSV
              </button>
            </div>
            <button onClick={clearTrainingCache} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-rose-700 hover:bg-rose-50">
              <Trash2 size={16} /> 清空本地训练缓存
            </button>
            <div className="mt-4 max-h-[220px] overflow-auto rounded-md bg-clinic-paper p-3 text-xs leading-5 text-clinic-muted">
              {studentLogs.length ? studentLogs.slice(-8).reverse().map((row, index) => (
                <p key={`${row.case_id}-${row.stage}-${index}`}>{String(row.timestamp ?? "").slice(0, 19)} · {String(row.case_id ?? "")} · {String(row.stage ?? "")} · {String(row.score ?? "")}</p>
              )) : "暂无本机训练记录。"}
            </div>
          </section>
        </aside>

        <section className="space-y-5">
          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">新版 Excel 预览</h2>
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {JSON.stringify(preview.length ? preview : {
                cases: allCases.length,
                agentConfigs,
                orderPackages,
                orderResults: (orderResults as OrderResultItem[]).length,
                consultRules,
                mdtTriggers: (mdtTriggers as MdtTrigger[]).length,
                treatmentPathways,
                scoringTemplate,
                evaluatorRubric,
                rctProtocol
              }, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">查看隐藏答案字段</h2>
              <select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)} className="max-w-full rounded-md border border-clinic-line px-3 py-2">
                {allCases.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
              </select>
            </div>
            {selectedCase && (
              <div className="mt-4 grid gap-4">
                <p><span className="font-medium text-clinic-ink">最终诊断：</span>{selectedCase.diagnosis}</p>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">初步诊断思路</p>
                  <FormattedText text={selectedCase.clinical?.diagnosticReasoning ?? ""} />
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">完整病例卡长表</p>
                  <div className="max-h-[360px] overflow-auto rounded-md bg-white">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-clinic-line">
                          <th className="p-2">分区</th>
                          <th className="p-2">字段</th>
                          <th className="p-2">内容</th>
                          <th className="p-2">释放条件</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCase.caseCard ?? []).map((item, index) => (
                          <tr key={`${item.caseId}-${item.agent}-${index}`} className="border-b border-clinic-line align-top">
                            <td className="p-2 font-medium text-clinic-blue">{item.category}</td>
                            <td className="p-2">{item.fieldName}</td>
                            <td className="p-2">{item.value}</td>
                            <td className="p-2 text-clinic-muted">{item.releaseCondition}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">标准化问诊槽位答案</p>
                  <div className="max-h-[360px] overflow-auto rounded-md bg-white">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-clinic-line">
                          <th className="p-2">槽位</th>
                          <th className="p-2">患者标准回答</th>
                          <th className="p-2">临床意义/教师提示</th>
                          <th className="p-2">评分关键词</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(selectedCase.interviewAnswers ?? {}).map((answer) => (
                          <tr key={answer.slotId} className="border-b border-clinic-line align-top">
                            <td className="p-2 font-medium text-clinic-blue">{answer.slotId}<br />{answer.label}</td>
                            <td className="p-2">{answer.patientAnswer}</td>
                            <td className="p-2 text-clinic-muted">{answer.clinicalMeaning}</td>
                            <td className="p-2 text-clinic-muted">{answer.scoringKeywords}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">开单、会诊、治疗、随访标准答案</p>
                  <FormattedText text={[
                    `基础检验：${selectedCase.clinical?.requiredLabs}`,
                    `专项检验：${selectedCase.clinical?.specialTests}`,
                    `影像/内镜/功能检查：${selectedCase.clinical?.imagingAndProcedures}`,
                    `会诊：${selectedCase.clinical?.consultDepartments}；${selectedCase.clinical?.consultQuestions}`,
                    `即时处理：${selectedCase.clinical?.immediateTreatment}`,
                    `确定性治疗：${selectedCase.clinical?.definitiveTreatment}`,
                    `随访：${selectedCase.clinical?.followUp}`
                  ].join("\n")} />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-md bg-clinic-paper p-3">
                    <p className="mb-2 font-medium text-clinic-blue">Agent病例策略</p>
                    <FormattedText text={[
                      `Patient Agent：${selectedCase.agentProfile?.patientPersona}`,
                      `信息分层：${selectedCase.agentProfile?.layeredReleaseRule}`,
                      `路径护栏：${selectedCase.agentProfile?.pathwayGuardrail}`,
                      `Evaluator扣分点：${selectedCase.agentProfile?.evaluatorDeductions}`
                    ].join("\n")} />
                  </div>
                  <div className="rounded-md bg-clinic-paper p-3">
                    <p className="mb-2 font-medium text-clinic-blue">病例级MDT触发</p>
                    <FormattedText text={selectedMdtTrigger ? [
                      `是否必须MDT：${selectedMdtTrigger.required ? "是" : "否"}`,
                      `理想时机：${selectedMdtTrigger.idealTiming}`,
                      `应邀科室：${selectedMdtTrigger.departments}`,
                      `核心问题：${selectedMdtTrigger.purpose}`,
                      `漏项扣分：${selectedMdtTrigger.missedPenalty}`,
                      `专家质询：${selectedMdtTrigger.expertChallenge}`
                    ].join("\n") : "暂无MDT触发规则。"} />
                  </div>
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">本病例开单返回结果库</p>
                  <div className="max-h-[300px] overflow-auto rounded-md bg-white">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-clinic-line">
                          <th className="p-2">类别</th>
                          <th className="p-2">同义词</th>
                          <th className="p-2">系统返回结果</th>
                          <th className="p-2">教学解释</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrderResults.map((item, index) => (
                          <tr key={`${item.caseId}-${index}`} className="border-b border-clinic-line align-top">
                            <td className="p-2 font-medium text-clinic-blue">{item.orderCategory}</td>
                            <td className="p-2">{item.synonyms.join("；")}</td>
                            <td className="p-2">{item.result}</td>
                            <td className="p-2 text-clinic-muted">{item.teachingExplanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">360分Rubric与RAG护栏</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(evaluatorRubric as EvaluatorRubricItem[]).map((item) => (
                      <div key={item.dimension} className="rounded-md bg-white p-3 text-sm leading-6">
                        <p className="font-medium text-clinic-blue">{item.dimension} · {item.max}分</p>
                        <p>{item.observation}</p>
                        <p className="text-clinic-muted">{item.redFlags}</p>
                      </div>
                    ))}
                  </div>
                  <pre className="mt-3 max-h-[220px] overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(ragRules, null, 2)}</pre>
                </div>
                <div className="rounded-md bg-clinic-paper p-3">
                  <p className="mb-2 font-medium text-clinic-blue">Agent设计总览</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(agentConfigs as AgentConfig[]).map((item) => (
                      <div key={item.name} className="rounded-md bg-white p-3 text-sm leading-6">
                        <p className="font-medium text-clinic-blue">{item.name}</p>
                        <p>{item.responsibility}</p>
                        <p className="text-clinic-muted">{item.boundaries}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">编辑病例草稿</h2>
              <button onClick={saveEditedDraft} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-3 py-2 text-sm text-white hover:bg-clinic-teal">
                <Save size={16} /> 保存草稿
              </button>
            </div>
            <textarea value={caseDraftText} onChange={(event) => setCaseDraftText(event.target.value)} rows={14} className="mt-3 w-full rounded-md border border-clinic-line px-3 py-2 font-mono text-xs outline-none focus:border-clinic-blue" />
          </div>

          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">新增病例草稿</h2>
              <button onClick={saveNewCaseDraft} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm hover:border-clinic-blue">
                <Plus size={16} /> 保存新增草稿
              </button>
            </div>
            <textarea value={newCaseText} onChange={(event) => setNewCaseText(event.target.value)} rows={7} className="mt-3 w-full rounded-md border border-clinic-line px-3 py-2 font-mono text-xs outline-none focus:border-clinic-blue" />
          </div>

          <div className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">教师端人工修正分数</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_auto]">
              <input value={manualScore} onChange={(event) => setManualScore(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2" placeholder="修正分数" />
              <input value={manualComment} onChange={(event) => setManualComment(event.target.value)} className="rounded-md border border-clinic-line px-3 py-2" placeholder="教师点评" />
              <button onClick={saveManualScore} className="rounded-md bg-clinic-blue px-4 py-2 text-white hover:bg-clinic-teal">保存</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
