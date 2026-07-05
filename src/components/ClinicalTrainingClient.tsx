"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import consultCatalogJson from "@/data/consult_catalog.json";
import casesJson from "@/data/cases.json";
import interviewSlotsJson from "@/data/interview_slots.json";
import orderCatalogImagingJson from "@/data/order_catalog_imaging.json";
import orderCatalogLabsJson from "@/data/order_catalog_labs.json";
import orderPackagesJson from "@/data/order_packages.json";
import orderCatalogPerioperativeJson from "@/data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "@/data/order_catalog_procedures.json";
import physicalExamItemsJson from "@/data/physical_exam_items.json";
import { evaluateStage, type FullProcessAnswers, type StageEvaluation } from "@/src/lib/fullProcessScoring";
import { askPatient, createEmptyCollected, mergeCollected } from "@/src/lib/patientEngine";
import {
  generateMdtOpinions,
  generatePhysicalExamResult,
  matchOrderResults,
  score360,
  type Evaluator360Report,
  type ExamResultLog,
  type MdtOpinion,
  type OrderResultLog
} from "@/src/lib/multiAgents";
import type { CaseData, ChatMessage, CollectedMap, ConsultCatalogItem, InterviewSlot, OrderCatalogItem, OrderPackage, PhysicalExamItem, StageKey } from "@/src/lib/types";
import FormattedText from "./FormattedText";

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type TrainingMode = "free" | "osce" | "demo" | "rct" | "random";
type StudentVisibleCase = Pick<CaseData, "id" | "studentChiefComplaint" | "chiefComplaint" | "age" | "sex" | "difficulty">;
type TimelineEvent = {
  id: string;
  stage: StageKey;
  type: "ask" | "answer" | "exam" | "order" | "result" | "diagnosis" | "mdt" | "treatment" | "submit";
  label: string;
  detail: string;
  at: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const stages: Array<{ key: StageKey; label: string }> = [
  { key: "history", label: "接诊与问诊" },
  { key: "exam", label: "查体" },
  { key: "orders", label: "开单检查" },
  { key: "diagnosis", label: "诊断与鉴别" },
  { key: "consult", label: "会诊/MDT" },
  { key: "treatment", label: "治疗决策" },
  { key: "followup", label: "随访与教育" },
  { key: "debrief", label: "复盘反馈" }
];

const interviewSlots = interviewSlotsJson as InterviewSlot[];
const keyInterviewSlotIds = ["HX002", "HX005", "HX006", "HX011", "HX012", "HX014", "HX021", "HX022", "HX024", "HX025", "HX026", "HX029", "HX032", "HX034", "HX035", "HX039", "HX040"];
const orderCatalog = [
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
];
const consultCatalog = consultCatalogJson as ConsultCatalogItem[];
const allClientCases = casesJson as CaseData[];
const orderPackages = orderPackagesJson as OrderPackage[];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const orderPrimaryTabs = ["检验", "检查", "病理/操作", "围术期评估"];
const labSecondaryOrder = ["尿液基础", "尿液感染", "尿液肿瘤", "尿液蛋白/肾小球线索", "血液基础", "炎症感染", "凝血/输血", "肾内免疫", "结石代谢", "大便/全身鉴别"];
const imagingSecondaryOrder = ["超声", "X线", "CT", "MRI", "内镜", "核医学", "功能检查"];
const consultGroupOrder = ["外科", "内科", "辅助/平台", "急诊/危重"];

const emptyAnswers: FullProcessAnswers = {
  historySummary: "",
  physicalExam: "",
  diagnosis: "",
  differentials: "",
  differentialAnalysis: "",
  diagnosticEvidence: "",
  confirmatoryTests: "",
  selectedOrders: [],
  customOrders: "",
  consultNeeded: "需要会诊",
  consultDepartments: [],
  consultPurpose: "",
  consultQuestions: "",
  consultSummary: "",
  immediateTreatment: "",
  admissionTreatment: "",
  definitiveTreatment: "",
  perioperativePreparation: "",
  mdtRevisedPlan: "",
  followUp: "",
  patientEducation: "",
  debriefReflection: ""
};

function sessionKey(caseId: string) {
  return `hematuria-v2-only-session-${caseId}`;
}

function clearLegacyTrainingCache() {
  const versionKey = "hematuria-case-library-version";
  if (localStorage.getItem(versionKey) === "V2-only") return;
  Object.keys(localStorage).forEach((key) => {
    if (
      key.startsWith("hematuria-full-process") ||
      key.startsWith("hematuria-v2-only-session") ||
      key.startsWith("hematuria-case-draft") ||
      key.startsWith("hematuria-manual-score") ||
      key === "hematuria-new-case-drafts" ||
      key === "hematuria-full-process-results"
    ) {
      localStorage.removeItem(key);
    }
  });
  localStorage.setItem(versionKey, "V2-only");
}

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function splitOptions(text: string) {
  return (text || "").split(/[；;、/\n]/).map((item) => item.trim()).filter(Boolean);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function slotLabel(slotId: string) {
  return interviewSlots.find((slot) => slot.slotId === slotId)?.label ?? slotId;
}

function hasAsked(askedSlots: string[], slotId: string) {
  return askedSlots.includes(slotId);
}

function genericHistoryCoverage(askedSlots: string[]) {
  const groups = [
    { label: "现病史", slots: ["HX001", "HX002", "HX003", "HX004", "HX005", "HX006", "HX007", "HX008"] },
    { label: "伴随症状", slots: ["HX009", "HX010", "HX011"] },
    { label: "既往史", slots: ["HX013"] },
    { label: "用药史", slots: ["HX014"] },
    { label: "个人史", slots: ["HX012", "HX015"] },
    { label: "家族史/系统回顾", slots: ["HX011", "HX015", "HX018"] }
  ];
  return groups.map((group) => ({ label: group.label, covered: group.slots.some((slot) => askedSlots.includes(slot)) }));
}

function patientOpening(caseData: CaseData) {
  const complaint = caseData.studentChiefComplaint || caseData.chiefComplaint || "小便颜色不太对";
  return `医生您好，我是因为${complaint}来看的。`;
}

function omissionWarnings(caseData: CaseData, askedSlots: string[]) {
  const text = `${caseData.diagnosis}。${caseData.diseaseCategory}。${caseData.clinical?.redFlags ?? ""}。${caseData.medication}`;
  const warnings: string[] = [];
  const tumorLike = /肿瘤|癌|尿路上皮/.test(text);
  const infectionLike = /感染|肾盂肾炎|膀胱炎|系统性UTI|结核/.test(text);
  const glomerularLike = /肾小球|肾炎|IgA|蛋白尿|管型|狼疮|Alport|薄基底膜/.test(text);
  const anticoagulantLike = /阿司匹林|氯吡格雷|华法林|利伐沙班|抗凝|抗血小板/.test(text);

  if (tumorLike) {
    if (!hasAsked(askedSlots, "HX034")) warnings.push("肿瘤高危血尿未问吸烟史。");
    if (!hasAsked(askedSlots, "HX035")) warnings.push("肿瘤高危血尿未问职业暴露。");
    if (!hasAsked(askedSlots, "HX012")) warnings.push("无痛性肉眼血尿场景未问血块。");
    if (!hasAsked(askedSlots, "HX005") && !hasAsked(askedSlots, "HX006")) warnings.push("未追问血尿时相，影响血尿定位。");
  }
  if (infectionLike) {
    ["HX015", "HX016", "HX017", "HX022", "HX021"].forEach((slotId) => {
      if (!hasAsked(askedSlots, slotId)) warnings.push(`感染相关血尿未问${slotLabel(slotId)}。`);
    });
    if (caseData.sex === "女" && !hasAsked(askedSlots, "HX030")) warnings.push("女性感染相关病例未问妊娠或复杂因素。");
  }
  if (glomerularLike) {
    ["HX024", "HX025", "HX026", "HX039"].forEach((slotId) => {
      if (!hasAsked(askedSlots, slotId)) warnings.push(`肾小球性血尿线索未问${slotLabel(slotId)}。`);
    });
  }
  if (caseData.sex === "女" && !hasAsked(askedSlots, "HX029")) warnings.push("女性病例未排除月经或阴道污染。");
  if (anticoagulantLike && !hasAsked(askedSlots, "HX032")) warnings.push("存在抗凝/抗血小板用药线索，未主动追问相关用药。");
  return unique(warnings).slice(0, 8);
}

function stageAnswerText(stageKey: StageKey, answers: FullProcessAnswers, messages: ChatMessage[], examLogs: ExamResultLog[], orderLogs: OrderResultLog[], mdtOpinions: MdtOpinion[]) {
  if (stageKey === "history") return `${messages.map((item) => item.text).join("；")}；${answers.historySummary}`;
  if (stageKey === "exam") return `${answers.physicalExam}；${examLogs.map((item) => `${item.input}:${item.result}`).join("；")}`;
  if (stageKey === "diagnosis") return `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`;
  if (stageKey === "orders") return `${answers.selectedOrders.join("；")}；${answers.customOrders}；${orderLogs.map((log) => log.input).join("；")}`;
  if (stageKey === "consult") return `${answers.consultNeeded}；${answers.consultDepartments.join("；")}；${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}；${mdtOpinions.map((item) => `${item.department}:${item.opinion}`).join("；")}`;
  if (stageKey === "treatment") return `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.perioperativePreparation}；${answers.mdtRevisedPlan}`;
  if (stageKey === "debrief") return answers.debriefReflection;
  return `${answers.followUp}；${answers.patientEducation}`;
}

function saveTrainingRecord(caseId: string, stage: string, studentAnswer: unknown, score: number, feedback: string) {
  const key = "hematuria-full-process-results";
  const rows = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(key), []);
  rows.push({ case_id: caseId, stage, student_answer: studentAnswer, score, feedback, timestamp: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(rows));
}

function nowEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
  const minute = Math.floor(seconds / 60).toString().padStart(2, "0");
  const second = (seconds % 60).toString().padStart(2, "0");
  return `${minute}:${second}`;
}

function groupPhysicalExamItems() {
  const grouped = new Map<string, PhysicalExamItem[]>();
  physicalExamItems.forEach((item) => {
    grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
  });
  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
}

function splitPackageOrders(pkg: OrderPackage) {
  return unique([
    ...splitOptions(pkg.basicLabs),
    ...splitOptions(pkg.specialTests),
    ...splitOptions(pkg.imagingAndProcedures)
  ]);
}

function matchCatalogByName(name: string) {
  const normalized = name.replace(/\s+/g, "");
  return orderCatalog.find((item) => {
    const names = [item.displayName, ...item.synonyms];
    return names.some((candidate) => {
      const value = candidate.replace(/\s+/g, "");
      return value && (value.includes(normalized) || normalized.includes(value));
    });
  });
}

function formatReportLines(text: string) {
  return (text || "")
    .split(/\n|；|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ReportCard({ item }: { item: OrderResultLog["results"][number] }) {
  const lines = formatReportLines(item.result);
  return (
    <article className="mt-3 rounded-md border border-clinic-line bg-white p-4 text-sm leading-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-clinic-blue">{item.orderCategory}</p>
        <span className="rounded-full bg-clinic-paper px-2 py-1 text-xs text-clinic-muted">{item.abnormalLevel || "模拟报告"}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {(lines.length ? lines : [item.result]).map((line) => (
          <p key={line} className="rounded-md bg-clinic-paper px-3 py-2">{line}</p>
        ))}
      </div>
      {item.teachingExplanation && (
        <p className="mt-3 text-xs leading-5 text-clinic-muted">解释：{item.teachingExplanation}</p>
      )}
    </article>
  );
}

function StudentHistoryProgress({ askedSlots, questionCount }: { askedSlots: string[]; questionCount: number }) {
  const coverage = genericHistoryCoverage(askedSlots);
  const covered = coverage.filter((item) => item.covered).length;
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5">
      <h2 className="font-semibold">问诊进度</h2>
      <div className="mt-4 rounded-md bg-clinic-paper p-3">
        <p className="text-sm text-clinic-muted">已问问题数</p>
        <p className="mt-1 text-2xl font-semibold text-clinic-blue">{questionCount}</p>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-clinic-blue">通用框架覆盖</span>
          <span className="text-clinic-muted">{covered} / {coverage.length}</span>
        </div>
        <div className="mt-2 grid gap-2">
          {coverage.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border border-clinic-line px-3 py-2 text-sm">
              <span>{item.label}</span>
              <span className={item.covered ? "text-emerald-700" : "text-clinic-muted"}>{item.covered ? "已覆盖" : "未覆盖"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InterviewCoverageDashboard({ caseData, askedSlots }: { caseData: CaseData; askedSlots: string[] }) {
  const keySlots = interviewSlots.filter((slot) => keyInterviewSlotIds.includes(slot.slotId));
  const askedKeySlots = keySlots.filter((slot) => askedSlots.includes(slot.slotId));
  const missingKeySlots = keySlots.filter((slot) => !askedSlots.includes(slot.slotId));
  const completeness = keySlots.length ? Math.round((askedKeySlots.length / keySlots.length) * 100) : 0;
  const warnings = omissionWarnings(caseData, askedSlots);

  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">问诊覆盖度仪表盘</h2>
        <span className="rounded-full bg-clinic-paper px-3 py-1 text-sm text-clinic-blue">{completeness}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-clinic-paper">
        <div className="h-2 rounded-full bg-clinic-blue" style={{ width: `${completeness}%` }} />
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-clinic-blue">已问槽位</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(askedSlots.length ? askedSlots : ["暂无"]).map((slotId) => (
            <span key={slotId} className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{slotLabel(slotId)}</span>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-clinic-blue">未问关键槽位</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(missingKeySlots.length ? missingKeySlots.slice(0, 10).map((slot) => slot.label) : ["无明显漏项"]).map((label) => (
            <span key={label} className="rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-700">{label}</span>
          ))}
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </section>
  );
}

function FeedbackBox({ evaluation }: { evaluation: StageEvaluation }) {
  return (
    <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">本阶段反馈</h3>
        <span className="rounded-full bg-white px-3 py-1 text-sm text-clinic-blue">{evaluation.score} / {evaluation.max} 分</span>
      </div>
      <p className="mt-2 text-sm text-clinic-muted">{evaluation.comment}</p>
      {evaluation.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {evaluation.warnings.map((warning) => (
            <p key={warning} className="flex gap-2"><AlertTriangle size={16} className="mt-1 shrink-0" /> {warning}</p>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md bg-white p-3">
          <p className="mb-2 text-sm font-medium text-clinic-blue">已命中</p>
          <div className="flex flex-wrap gap-2">
            {(evaluation.hits.length ? evaluation.hits : ["暂无明显命中"]).map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{item}</span>)}
          </div>
        </div>
        <div className="rounded-md bg-white p-3">
          <p className="mb-2 text-sm font-medium text-clinic-blue">建议补充</p>
          <div className="flex flex-wrap gap-2">
            {(evaluation.misses.length ? evaluation.misses : ["无明显漏项"]).map((item) => <span key={item} className="rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-700">{item}</span>)}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-md bg-white p-3">
        <p className="mb-2 text-sm font-medium text-clinic-blue">提交后解锁的标准答案/评分要点</p>
        <FormattedText text={evaluation.standardAnswer} highlight={evaluation.hits} />
      </div>
    </section>
  );
}

function FinalReport({ report }: { report: Evaluator360Report }) {
  return (
    <section className="mt-5 rounded-lg border border-clinic-line bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">最终360分评价</h3>
          <p className="mt-1 text-sm text-clinic-muted">Evaluator Agent 根据问诊槽位、查体、开单、会诊、治疗和随访记录自动评分，教师端可再人工修正。</p>
        </div>
        <div className="text-3xl font-semibold text-clinic-blue">{report.total}<span className="text-base text-clinic-muted"> / {report.max}</span></div>
      </div>
      {report.redFlags.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {report.redFlags.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report.items.map((item) => (
          <div key={item.label} className="rounded-md border border-clinic-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{item.label}</p>
              <span className="text-sm text-clinic-blue">{item.score}/{item.max}</span>
            </div>
            <p className="mt-2 text-sm text-clinic-muted">{item.comment}</p>
            <p className="mt-2 text-xs text-clinic-muted">证据：{item.evidence.join("；") || "暂无"}</p>
            <p className="mt-1 text-xs text-clinic-muted">漏项：{item.misses.slice(0, 5).join("；") || "无明显漏项"}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md bg-clinic-paper p-4">
        <p className="font-medium text-clinic-blue">RAG路径护栏</p>
        <FormattedText text={report.ragGuardrails.join("\n")} />
      </div>
    </section>
  );
}

export default function ClinicalTrainingClient({ caseData: initialCaseData, mode = "free" }: { caseData: StudentVisibleCase; mode?: TrainingMode }) {
  const [caseData] = useState<CaseData | null>(() => allClientCases.find((item) => item.id === initialCaseData.id) ?? null);
  const [runtimeMode, setRuntimeMode] = useState<TrainingMode>(mode);
  const isOsce = runtimeMode === "osce";
  const [activeStage, setActiveStage] = useState<StageKey>("history");
  const [answers, setAnswers] = useState<FullProcessAnswers>(emptyAnswers);
  const [submitted, setSubmitted] = useState<Partial<Record<StageKey, StageEvaluation>>>({});
  const [finalReport, setFinalReport] = useState<Evaluator360Report | null>(null);
  const [question, setQuestion] = useState("");
  const [examInput, setExamInput] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [activeOrderTab, setActiveOrderTab] = useState("检验");
  const [examLogs, setExamLogs] = useState<ExamResultLog[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderResultLog[]>([]);
  const [mdtOpinions, setMdtOpinions] = useState<MdtOpinion[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [osceTimeLeft, setOsceTimeLeft] = useState(20 * 60);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "patient", text: patientOpening(initialCaseData as CaseData) }]);
  const [collected, setCollected] = useState<CollectedMap>(createEmptyCollected());
  const [askedSlots, setAskedSlots] = useState<string[]>([]);
  const [speechInputSupported, setSpeechInputSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const physicalGroups = useMemo(() => groupPhysicalExamItems(), []);

  const orderGroups = useMemo(() => {
    const keyword = orderSearch.trim().toLowerCase();
    const visible = orderCatalog.filter((item) => {
      if (item.primaryCategory !== activeOrderTab) return false;
      if (!keyword) return true;
      return [item.displayName, item.secondaryCategory, item.priority, item.studentDisplayHint, ...item.synonyms].join(" ").toLowerCase().includes(keyword);
    });
    const categoryOrder = activeOrderTab === "检验" ? labSecondaryOrder : activeOrderTab === "检查" ? imagingSecondaryOrder : [];
    const grouped = new Map<string, OrderCatalogItem[]>();
    visible.forEach((item) => {
      const key = item.secondaryCategory || activeOrderTab;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });
    const categories = unique([...categoryOrder, ...Array.from(grouped.keys())]).filter((key) => grouped.has(key));
    return categories.map((category) => ({ category, items: grouped.get(category) ?? [] }));
  }, [activeOrderTab, orderSearch]);
  const consultGroups = useMemo(() => consultGroupOrder.map((group) => ({
    group,
    items: consultCatalog.filter((item) => item.group === group)
  })).filter((group) => group.items.length > 0), []);

  useEffect(() => {
    clearLegacyTrainingCache();
    const urlMode = new URLSearchParams(window.location.search).get("mode");
    if (urlMode === "osce") setRuntimeMode("osce");
    else if (urlMode === "demo") setRuntimeMode("demo");
    else if (urlMode === "rct") setRuntimeMode("rct");
    else setRuntimeMode(mode);
    setSpeechInputSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    setSpeechOutputSupported("speechSynthesis" in window);
    const saved = safeJson<{
      activeStage?: StageKey;
      answers?: FullProcessAnswers;
      submitted?: Partial<Record<StageKey, StageEvaluation>>;
      finalReport?: Evaluator360Report | null;
      messages?: ChatMessage[];
      collected?: CollectedMap;
      askedSlots?: string[];
      examLogs?: ExamResultLog[];
      orderLogs?: OrderResultLog[];
      mdtOpinions?: MdtOpinion[];
      timeline?: TimelineEvent[];
      osceTimeLeft?: number;
    }>(localStorage.getItem(sessionKey(initialCaseData.id)), {});
    if (saved.activeStage) setActiveStage(saved.activeStage);
    if (saved.answers) setAnswers({ ...emptyAnswers, ...saved.answers });
    if (saved.submitted) setSubmitted(saved.submitted);
    if (saved.finalReport) setFinalReport(saved.finalReport);
    if (saved.messages) setMessages(saved.messages);
    if (saved.collected) setCollected(saved.collected);
    if (saved.askedSlots) setAskedSlots(saved.askedSlots);
    if (saved.examLogs) setExamLogs(saved.examLogs);
    if (saved.orderLogs) setOrderLogs(saved.orderLogs);
    if (saved.mdtOpinions) setMdtOpinions(saved.mdtOpinions);
    if (saved.timeline) setTimeline(saved.timeline);
    if (typeof saved.osceTimeLeft === "number") setOsceTimeLeft(saved.osceTimeLeft);
  }, [initialCaseData.id]);

  useEffect(() => {
    localStorage.setItem(sessionKey(initialCaseData.id), JSON.stringify({ activeStage, answers, submitted, finalReport, messages, collected, askedSlots, examLogs, orderLogs, mdtOpinions, timeline, osceTimeLeft }));
  }, [activeStage, answers, askedSlots, initialCaseData.id, collected, examLogs, finalReport, mdtOpinions, messages, orderLogs, osceTimeLeft, submitted, timeline]);

  useEffect(() => {
    if (!isOsce || activeStage === "debrief" || finalReport) return;
    const timer = window.setInterval(() => setOsceTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [activeStage, finalReport, isOsce]);

  useEffect(() => {
    if (activeStage !== "history") return;
    const panel = chatScrollRef.current;
    if (!panel) return;
    panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, [activeStage, messages.length]);

  function speak(text: string) {
    if (!speechOutputSupported || !autoSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function submitQuestion(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? question).trim();
    if (!text) return;
    const result = askPatient(caseData, text);
    const nextCollected = mergeCollected(collected, result.matchedKeys);
    const nextAskedSlots = unique([...askedSlots, ...(result.matchedSlots ?? [])]);
    const nextMessages: ChatMessage[] = [...messages, { role: "student", text }, { role: "patient", text: result.answer, matchedKeys: result.matchedKeys, matchedSlots: result.matchedSlots }];
    setMessages(nextMessages);
    setCollected(nextCollected);
    setAskedSlots(nextAskedSlots);
    setQuestion("");
    setVoiceNotice("");
    addTimeline("ask", "学生提问", text, "history");
    addTimeline("answer", "患者回答", result.answer, "history");
    speak(result.answer);
  }

  function startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("当前浏览器不支持语音识别，建议使用最新版 Chrome 或 Edge。");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setListening(true);
      setVoiceNotice("正在听，请直接说出你的问诊问题。");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setVoiceNotice("没有识别清楚，可以再试一次或改用键盘输入。");
    };
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        setQuestion(text);
        submitQuestion(text);
      }
    };
    recognition.start();
  }

  function updateAnswer<K extends keyof FullProcessAnswers>(key: K, value: FullProcessAnswers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function addTimeline(type: TimelineEvent["type"], label: string, detail: string, stage: StageKey = activeStage) {
    setTimeline((current) => [...current, { id: nowEventId(), stage, type, label, detail, at: new Date().toISOString() }]);
  }

  function toggleOrder(item: string) {
    setAnswers((current) => ({
      ...current,
      selectedOrders: current.selectedOrders.includes(item) ? current.selectedOrders.filter((value) => value !== item) : [...current.selectedOrders, item]
    }));
  }

  function applyOrderPackage(pkg: OrderPackage) {
    const matched = splitPackageOrders(pkg).map((name) => matchCatalogByName(name)?.displayName ?? name);
    setAnswers((current) => ({ ...current, selectedOrders: unique([...current.selectedOrders, ...matched]) }));
    addTimeline("order", "选择医嘱套餐", `${pkg.name || pkg.scenario}：${matched.join("；")}`, "orders");
  }

  function toggleDepartment(item: string) {
    setAnswers((current) => ({
      ...current,
      consultDepartments: current.consultDepartments.includes(item) ? current.consultDepartments.filter((value) => value !== item) : [...current.consultDepartments, item]
    }));
  }

  function submitExam(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? examInput).trim();
    if (!text) return;
    const log = generatePhysicalExamResult(caseData, text);
    setExamLogs((current) => [...current, log]);
    updateAnswer("physicalExam", `${answers.physicalExam}\n${text}：${log.result}`.trim());
    addTimeline("exam", "查体", `${text}：${log.result}`, "exam");
    setExamInput("");
  }

  function submitOrder(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? orderInput).trim();
    if (!text) return;
    const log = matchOrderResults(caseData, text);
    setOrderLogs((current) => [...current, log]);
    addTimeline("order", "开立医嘱", text, "orders");
    if (log.results.length) addTimeline("result", "返回检查结果", log.results.map((item) => `${item.orderCategory}：${item.result}`).join("\n"), "orders");
    setOrderInput("");
  }

  function submitSelectedOrders() {
    const text = unique([...answers.selectedOrders, answers.customOrders]).join("；");
    if (text) submitOrder(text);
  }

  function startMdt() {
    if (!caseData) return;
    if (answers.consultNeeded === "需要会诊" && answers.consultPurpose.trim().length < 8) {
      alert("请先填写会诊目的和需要解决的问题，不能只勾选科室。");
      return;
    }
    const purpose = [answers.consultPurpose, answers.consultQuestions, answers.consultSummary].filter(Boolean).join("；");
    const opinions = generateMdtOpinions(caseData, answers.consultDepartments, purpose);
    setMdtOpinions(opinions);
    addTimeline("mdt", "发起MDT/会诊", `${answers.consultDepartments.join("；") || "未选择科室"}｜${purpose}`, "consult");
  }

  function submitStage() {
    if (!caseData) return;
    if (activeStage === "consult" && answers.consultNeeded === "需要会诊" && answers.consultPurpose.trim().length < 8) {
      alert("请填写会诊目的和要解决的问题后再提交本阶段。");
      return;
    }
    if (activeStage === "debrief" && !answers.debriefReflection.trim()) {
      alert("请先填写本次训练复盘，再提交。");
      return;
    }
    const answerText = [
      stageAnswerText(activeStage, answers, messages, examLogs, orderLogs, mdtOpinions),
      activeStage === "history" ? askedSlots.map(slotLabel).join("；") : ""
    ].filter(Boolean).join("；");
    const evaluation = evaluateStage(caseData, activeStage, answerText);
    setSubmitted((current) => ({ ...current, [activeStage]: evaluation }));
    saveTrainingRecord(caseData.id, activeStage, answerText, evaluation.score, evaluation.comment);
    addTimeline("submit", "提交阶段", `${stages.find((item) => item.key === activeStage)?.label ?? activeStage}：${evaluation.score}/${evaluation.max}`, activeStage);

    if (activeStage === "followup") {
      const report = score360(caseData, {
        askedSlots,
        examTexts: examLogs.map((item) => `${item.input}：${item.result}`),
        orderTexts: [...answers.selectedOrders, answers.customOrders, ...orderLogs.map((item) => item.input)],
        diagnosisText: `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`,
        mdtDepartments: answers.consultDepartments,
        mdtPurpose: `${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}`,
        mdtStarted: mdtOpinions.length > 0 || answers.consultNeeded === "需要会诊",
        treatmentText: `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.perioperativePreparation}；${answers.mdtRevisedPlan}`,
        followUpText: `${answers.followUp}；${answers.patientEducation}`
      });
      setFinalReport(report);
      saveTrainingRecord(caseData.id, "final-360", answers, report.total, `总分 ${report.total}/${report.max}`);
    }
  }

  function goNextStage() {
    const index = stages.findIndex((item) => item.key === activeStage);
    const next = stages[index + 1];
    if (next) setActiveStage(next.key);
  }

  function canOpenStage(key: StageKey) {
    const targetIndex = stages.findIndex((item) => item.key === key);
    const firstUnsubmitted = stages.findIndex((item) => !submitted[item.key]);
    if (isOsce && submitted[key] && key !== "debrief" && activeStage !== key) return false;
    return targetIndex <= (firstUnsubmitted === -1 ? stages.length - 1 : firstUnsubmitted);
  }

  const activeEvaluation = submitted[activeStage];
  const showStageFeedback = Boolean(activeEvaluation && (!isOsce || activeStage === "debrief"));
  const activeTask = caseData?.stageTasks?.find((item) => item.stageKey === activeStage);
  const studentVisibleState = {
    chiefComplaint: initialCaseData.studentChiefComplaint || initialCaseData.chiefComplaint,
    askedQuestionCount: messages.filter((item) => item.role === "student").length,
    genericHistoryCoverage: genericHistoryCoverage(askedSlots)
  };
  const teacherEvaluatorState = activeEvaluation ? { askedSlots, activeEvaluation } : null;
  const visibleTaskText = activeStage === "history" && !teacherEvaluatorState
    ? "围绕主诉完成规范问诊。提交前系统只显示通用进度，不提供病例特异提示。"
    : activeTask?.studentTask || (isOsce ? "OSCE考核模式：完成本阶段任务并提交，所有反馈将在终末复盘显示。" : "完成本阶段临床思维任务，提交后查看反馈。");

  if (!caseData) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <section className="rounded-lg border border-clinic-line bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-semibold text-clinic-ink">病例数据加载失败</h1>
          <p className="mt-3 text-clinic-muted">未在本地病例库中找到 {initialCaseData.id}。请返回病例列表重新选择，或重新运行 npm run convert:excel。</p>
          <a href="/cases/" className="mt-5 inline-flex rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">返回病例列表</a>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-clinic-blue">{initialCaseData.id}</p>
          <h1 className="mt-1 text-2xl font-semibold">血尿多智能体临床思维训练</h1>
          <p className="mt-1 text-sm text-clinic-muted">按阶段提交后才解锁标准答案；患者、查体、检查结果、MDT和评分均为教学模拟。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm ${isOsce ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{isOsce ? `OSCE ${formatDuration(osceTimeLeft)}` : "自由训练"}</span>
          <a href="/cases" className="rounded-md border border-clinic-line bg-white px-4 py-2 text-sm hover:border-clinic-blue">返回病例库</a>
        </div>
      </div>

      <div className="mb-5 grid gap-2 md:grid-cols-8">
        {stages.map((stage, index) => {
          const isSubmitted = Boolean(submitted[stage.key]);
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              disabled={!canOpenStage(stage.key)}
              onClick={() => setActiveStage(stage.key)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${isActive ? "border-clinic-blue bg-clinic-blue text-white" : isSubmitted ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-clinic-line bg-white text-clinic-muted disabled:cursor-not-allowed disabled:opacity-50"}`}
            >
              <span className="block text-xs">{index + 1}</span>
              {stage.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr_280px]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">当前可见信息</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="text-clinic-muted">年龄/性别</dt><dd className="leading-6">{initialCaseData.age || "未提供"} / {initialCaseData.sex || "未提供"}</dd></div>
              <div><dt className="text-clinic-muted">主诉</dt><dd className="leading-6">{studentVisibleState.chiefComplaint}</dd></div>
            </dl>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">当前任务</h2>
            <p className="mt-3 text-sm leading-6 text-clinic-muted">{visibleTaskText}</p>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">已获得资料</h2>
            <div className="mt-3 space-y-3 text-sm text-clinic-muted">
              <p>患者回答：{messages.filter((item) => item.role === "patient").length - 1} 条</p>
              <p>已查体：{examLogs.length} 项</p>
              <p>已开医嘱：{unique([...answers.selectedOrders, ...orderLogs.flatMap((log) => log.matchedOrders.map((item) => item.displayName))]).length} 项</p>
              <p>已返回结果：{orderLogs.reduce((sum, log) => sum + log.results.length, 0)} 项</p>
            </div>
          </section>
        </aside>

        <section className="rounded-lg border border-clinic-line bg-white p-5">
          {activeStage === "history" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Patient Agent：模拟问诊</h2>
                <button type="button" onClick={() => setAutoSpeak((value) => !value)} disabled={!speechOutputSupported} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:border-clinic-blue disabled:cursor-not-allowed disabled:opacity-50">
                  {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  {autoSpeak ? "患者朗读已开" : "患者朗读"}
                </button>
              </div>
              <div ref={chatScrollRef} className="mt-4 h-[360px] space-y-4 overflow-y-auto rounded-md border border-clinic-line bg-clinic-paper p-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "student" ? "bg-clinic-blue text-white" : "bg-white text-clinic-ink"}`}>{message.text}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                {voiceNotice && <p className="mb-2 text-sm text-clinic-muted">{voiceNotice}</p>}
                <div className="flex flex-wrap gap-2">
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitQuestion(); }} className="min-w-[220px] flex-1 rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="输入问诊问题" />
                  <button type="button" onClick={startVoiceInput} disabled={!speechInputSupported || listening} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue disabled:opacity-50">
                    {listening ? <MicOff size={16} /> : <Mic size={16} />} {listening ? "聆听中" : "语音提问"}
                  </button>
                  <button onClick={() => submitQuestion()} className="inline-flex items-center gap-2 rounded-md bg-clinic-teal px-4 py-2 font-medium text-white hover:bg-clinic-blue">
                    <Send size={16} /> 发送
                  </button>
                </div>
              </div>
              <label className="mt-5 block">
                <span className="font-medium">提交病史小结</span>
                <textarea value={answers.historySummary} onChange={(event) => updateAnswer("historySummary", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
            </div>
          )}

          {activeStage === "exam" && (
            <div>
              <h2 className="text-xl font-semibold">Exam Agent：体格检查</h2>
              <p className="mt-1 text-sm text-clinic-muted">请输入你想查的体征，系统只返回被明确要求的查体信息。</p>
              <div className="mt-4 space-y-4">
                {physicalGroups.map((group) => (
                  <section key={group.category} className="rounded-md border border-clinic-line p-4">
                    <h3 className="font-medium text-clinic-blue">{group.category}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <button key={item.examId} type="button" onClick={() => submitExam(item.displayName)} className="rounded-md border border-clinic-line px-3 py-2 text-sm hover:border-clinic-blue">
                          {item.displayName}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <input value={examInput} onChange={(event) => setExamInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitExam(); }} className="flex-1 rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="例如：查肾区叩击痛" />
                <button onClick={() => submitExam()} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">查询查体</button>
              </div>
              <div className="mt-4 space-y-3">
                {examLogs.map((log) => (
                  <div key={`${log.at}-${log.input}`} className="rounded-md bg-clinic-paper p-3 text-sm leading-6"><span className="font-medium text-clinic-blue">{log.input}：</span>{log.result}</div>
                ))}
              </div>
              <label className="mt-5 block"><span className="font-medium">体格检查总结</span><textarea value={answers.physicalExam} onChange={(event) => updateAnswer("physicalExam", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStage === "diagnosis" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">诊断与鉴别</h2>
              <label className="block"><span className="font-medium">最可能诊断</span><input value={answers.diagnosis} onChange={(event) => updateAnswer("diagnosis", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">诊断依据与定位思路</span><textarea value={answers.diagnosticEvidence} onChange={(event) => updateAnswer("diagnosticEvidence", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">至少 3 个鉴别诊断</span><textarea value={answers.differentials} onChange={(event) => updateAnswer("differentials", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="例如：1. 诊断A；2. 诊断B；3. 诊断C" /></label>
              <label className="block"><span className="font-medium">每个鉴别诊断的支持点与反对点</span><textarea value={answers.differentialAnalysis} onChange={(event) => updateAnswer("differentialAnalysis", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">用于确认诊断的下一步检查</span><textarea value={answers.confirmatoryTests} onChange={(event) => updateAnswer("confirmatoryTests", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStage === "orders" && (
            <div>
              <h2 className="text-xl font-semibold">Order Agent：开单并返回结果</h2>
              <p className="mt-1 text-sm text-clinic-muted">选择或输入医嘱后，点击“开立并返回结果”。系统只返回你已开项目的模拟结果。</p>
              <div className="mt-4 flex flex-wrap gap-2 border-b border-clinic-line pb-3">
                {orderPrimaryTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveOrderTab(tab)}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${activeOrderTab === tab ? "bg-clinic-blue text-white" : "border border-clinic-line bg-white text-clinic-muted hover:border-clinic-blue"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {!isOsce && orderPackages.length > 0 && (
                <section className="mt-4 rounded-md border border-clinic-line bg-clinic-paper p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-medium text-clinic-blue">常用医嘱套餐</h3>
                    <span className="text-xs text-clinic-muted">仅用于快速勾选，不代表本病例正确答案</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {orderPackages.map((pkg) => (
                      <button key={pkg.packageId} type="button" onClick={() => applyOrderPackage(pkg)} className="rounded-md border border-clinic-line bg-white px-3 py-2 text-sm hover:border-clinic-blue">
                        {pkg.name || pkg.scenario}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} className="mt-4 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="搜索医嘱名称或同义词，例如 CTU、尿培养、膀胱镜" />
              <div className="mt-4 space-y-5">
                {orderGroups.map((group) => (
                  <section key={group.category} className="rounded-md border border-clinic-line p-4">
                    <h3 className="font-medium text-clinic-blue">{group.category}</h3>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {group.items.map((item) => (
                        <label key={item.orderId} className="flex min-h-[72px] items-start justify-between gap-3 rounded-md border border-clinic-line px-3 py-2 text-sm">
                          <span className="flex items-start gap-2">
                            <input className="mt-1" type="checkbox" checked={answers.selectedOrders.includes(item.displayName)} onChange={() => toggleOrder(item.displayName)} />
                            <span>
                              <span className="block font-medium">{item.displayName}</span>
                              {item.studentDisplayHint && <span className="mt-1 block text-xs leading-5 text-clinic-muted">{item.studentDisplayHint}</span>}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-clinic-paper px-2 py-1 text-xs text-clinic-muted">{item.priority || "按需"}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <label className="mt-4 block"><span className="font-medium">其他检查或开单理由</span><textarea value={answers.customOrders} onChange={(event) => updateAnswer("customOrders", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <div className="mt-4 flex flex-wrap gap-2">
                <input value={orderInput} onChange={(event) => setOrderInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitOrder(); }} className="min-w-[240px] flex-1 rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="例如：尿常规+尿沉渣，CTU，膀胱镜" />
                <button onClick={() => submitOrder()} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">开立并返回结果</button>
                <button onClick={submitSelectedOrders} className="rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue">返回已选项目结果</button>
              </div>
              <div className="mt-4 space-y-3">
                {orderLogs.map((log) => (
                  <div key={log.id} className="rounded-md border border-clinic-line p-3">
                    <p className="text-sm font-medium text-clinic-blue">{log.input}</p>
                    {log.matchedOrders.length > 0 && <p className="mt-1 text-xs text-clinic-muted">已识别医嘱：{log.matchedOrders.map((item) => item.displayName).join("；")}</p>}
                    <p className="mt-1 text-sm text-clinic-muted">{log.message}</p>
                    {log.results.map((item, index) => <ReportCard key={`${log.id}-${index}`} item={item} />)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStage === "consult" && (
            <div>
              <h2 className="text-xl font-semibold">MDT / 会诊训练</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {["需要会诊", "暂不需要会诊"].map((item) => (
                  <label key={item} className="flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2">
                    <input type="radio" name="consultNeeded" checked={answers.consultNeeded === item} onChange={() => updateAnswer("consultNeeded", item)} />
                    {item}
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {consultGroups.map((group) => (
                  <section key={group.group} className="rounded-md border border-clinic-line p-4">
                    <h3 className="font-medium text-clinic-blue">{group.group}</h3>
                    <div className="mt-3 grid gap-2">
                      {group.items.map((item) => (
                        <label key={item.consultId} className="flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm">
                          <input type="checkbox" checked={answers.consultDepartments.includes(item.department)} onChange={() => toggleDepartment(item.department)} />
                          <span>{item.department}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <label className="mt-4 block"><span className="font-medium">会诊目的和要解决的问题</span><textarea value={answers.consultPurpose} onChange={(event) => updateAnswer("consultPurpose", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="mt-4 block"><span className="font-medium">希望专家回答的具体问题</span><textarea value={answers.consultQuestions} onChange={(event) => updateAnswer("consultQuestions", event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="mt-4 block"><span className="font-medium">会诊交接摘要</span><textarea value={answers.consultSummary} onChange={(event) => updateAnswer("consultSummary", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder="患者信息、主诉、已采集病史、查体、关键结果、当前诊断、当前问题、希望会诊解决的问题" /></label>
              <button onClick={startMdt} className="mt-4 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">发起MDT并获取专家意见</button>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {mdtOpinions.map((item) => (
                  <div key={item.department} className="rounded-md border border-clinic-line p-3 text-sm leading-6">
                    <p className="font-medium text-clinic-blue">{item.department}</p>
                    <p className="mt-1">{item.opinion}</p>
                    {item.expertJudgment && <p className="mt-2"><span className="font-medium">专家判断：</span>{item.expertJudgment}</p>}
                    {item.neededInfo && <p><span className="font-medium">还需信息：</span>{item.neededInfo}</p>}
                    {item.suggestedHandling && <p><span className="font-medium">处理建议：</span>{item.suggestedHandling}</p>}
                    {item.riskReminder && <p className="text-amber-800"><span className="font-medium">风险提醒：</span>{item.riskReminder}</p>}
                    {item.residentQuestion && <p className="text-clinic-muted"><span className="font-medium">追问住院医：</span>{item.residentQuestion}</p>}
                    <p className="mt-2 text-clinic-muted">核心问题：{item.questions.join("；") || "需学生补充明确。"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStage === "treatment" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">治疗决策</h2>
              <label className="block"><span className="font-medium">急诊或入院后的即时处理</span><textarea value={answers.immediateTreatment} onChange={(event) => updateAnswer("immediateTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">入院初始处理</span><textarea value={answers.admissionTreatment} onChange={(event) => updateAnswer("admissionTreatment", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">确定性治疗 / 后续治疗</span><textarea value={answers.definitiveTreatment} onChange={(event) => updateAnswer("definitiveTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">围术期准备</span><textarea value={answers.perioperativePreparation} onChange={(event) => updateAnswer("perioperativePreparation", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">MDT后修订方案</span><textarea value={answers.mdtRevisedPlan} onChange={(event) => updateAnswer("mdtRevisedPlan", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStage === "followup" && (
            <div>
              <h2 className="text-xl font-semibold">随访与患者教育</h2>
              <label className="mt-4 block"><span className="font-medium">随访复查计划</span><textarea value={answers.followUp} onChange={(event) => updateAnswer("followUp", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="mt-4 block"><span className="font-medium">患者教育</span><textarea value={answers.patientEducation} onChange={(event) => updateAnswer("patientEducation", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStage === "debrief" && (
            <div>
              <h2 className="text-xl font-semibold">复盘反馈</h2>
              {!finalReport && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  请先完成“随访与教育”阶段并提交，系统会生成终末360分评价。
                </div>
              )}
              {finalReport && <FinalReport report={finalReport} />}
              <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
                <h3 className="font-semibold">训练时间线</h3>
                <div className="mt-3 max-h-[420px] space-y-3 overflow-auto">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-md bg-white p-3 text-sm leading-6">
                      <p className="font-medium text-clinic-blue">{shortTime(item.at)} · {stages.find((stage) => stage.key === item.stage)?.label} · {item.label}</p>
                      <p className="mt-1 text-clinic-muted">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h3 className="font-semibold text-clinic-blue">学生本次记录</h3>
                  <FormattedText text={[
                    `病史小结：${answers.historySummary}`,
                    `查体：${answers.physicalExam}`,
                    `医嘱：${answers.selectedOrders.join("；")}；${answers.customOrders}`,
                    `诊断：${answers.diagnosis}`,
                    `鉴别：${answers.differentials}`,
                    `会诊：${answers.consultDepartments.join("；")}；${answers.consultPurpose}`,
                    `治疗：${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}`,
                    `随访：${answers.followUp}；${answers.patientEducation}`
                  ].join("\n")} />
                </div>
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h3 className="font-semibold text-clinic-blue">标准路径摘要</h3>
                  <FormattedText text={[
                    `诊断思路：${caseData.clinical?.diagnosticReasoning ?? caseData.diagnosis}`,
                    `必开检验：${caseData.clinical?.requiredLabs ?? ""}`,
                    `影像/内镜/功能：${caseData.clinical?.imagingAndProcedures ?? ""}`,
                    `会诊：${caseData.clinical?.consultDepartments ?? ""}；${caseData.clinical?.consultQuestions ?? ""}`,
                    `即时处理：${caseData.clinical?.immediateTreatment ?? ""}`,
                    `后续治疗：${caseData.clinical?.definitiveTreatment ?? ""}`,
                    `随访：${caseData.clinical?.followUp ?? ""}`
                  ].join("\n")} />
                </div>
              </section>
              <label className="mt-5 block">
                <span className="font-medium">学习反思/教师点评记录</span>
                <textarea value={answers.debriefReflection} onChange={(event) => updateAnswer("debriefReflection", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-clinic-line pt-4">
            <button onClick={submitStage} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal">
              <CheckCircle2 size={16} /> 提交本阶段
            </button>
            {activeEvaluation && activeStage !== "debrief" && (
              <button onClick={goNextStage} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue">
                <ClipboardList size={16} /> 进入下一阶段
              </button>
            )}
          </div>

          {showStageFeedback && activeEvaluation && <FeedbackBox evaluation={activeEvaluation} />}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">学习记录</h2>
            <div className="mt-3 space-y-2 text-sm text-clinic-muted">
              <p>当前模式：{isOsce ? "OSCE考核" : "自由训练"}</p>
              {isOsce && <p>剩余时间：{formatDuration(osceTimeLeft)}</p>}
              <p>当前阶段：{stages.find((item) => item.key === activeStage)?.label}</p>
              <p>已提交阶段：{Object.keys(submitted).length} / {stages.length}</p>
            </div>
          </section>

          {activeStage === "history" && !isOsce && (
            submitted.history
              ? <InterviewCoverageDashboard caseData={caseData} askedSlots={askedSlots} />
              : <StudentHistoryProgress askedSlots={askedSlots} questionCount={studentVisibleState.askedQuestionCount} />
          )}

          {activeEvaluation && isOsce && activeStage !== "debrief" && (
            <section className="rounded-lg border border-clinic-line bg-white p-5 text-sm leading-6 text-clinic-muted">
              本阶段已提交。OSCE模式不会即时显示得分、漏项或标准答案，请继续下一阶段，终末复盘统一查看。
            </section>
          )}

          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">最近时间线</h2>
            <div className="mt-3 space-y-3">
              {(timeline.length ? timeline.slice(-6).reverse() : []).map((item) => (
                <div key={item.id} className="rounded-md bg-clinic-paper p-3 text-xs leading-5">
                  <p className="font-medium text-clinic-blue">{shortTime(item.at)} · {item.label}</p>
                  <p className="mt-1 line-clamp-3 text-clinic-muted">{item.detail}</p>
                </div>
              ))}
              {!timeline.length && <p className="text-sm text-clinic-muted">尚无操作记录。</p>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
