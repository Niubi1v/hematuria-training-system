"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  FileText,
  FlaskConical,
  Languages,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Settings2,
  Pause,
  Play,
  Square,
  Stethoscope,
  UsersRound,
  Volume2
} from "lucide-react";
import agentsJson from "@/data/agents.json";
import casesJson from "@/data/cases.json";
import casesEnJson from "@/data/cases_en.json";
import consultCatalogJson from "@/data/consult_catalog.json";
import i18nEnJson from "@/data/i18n/en.json";
import i18nZhJson from "@/data/i18n/zh.json";
import orderCatalogImagingJson from "@/data/order_catalog_imaging.json";
import orderCatalogLabsJson from "@/data/order_catalog_labs.json";
import orderCatalogPerioperativeJson from "@/data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "@/data/order_catalog_procedures.json";
import orderPackagesJson from "@/data/order_packages.json";
import physicalExamItemsJson from "@/data/physical_exam_items.json";
import { evaluateStage, type FullProcessAnswers, type StageEvaluation } from "@/src/lib/fullProcessScoring";
import { simplifiedChiefComplaint } from "@/src/lib/chiefComplaint";
import { initializeStorageVersion, readJsonStorage, writeJsonStorage } from "@/src/lib/safeStorage";
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
import type {
  CaseData,
  ChatMessage,
  CollectedMap,
  ConsultCatalogItem,
  OrderCatalogItem,
  OrderPackage,
  PhysicalExamItem,
  StageKey
} from "@/src/lib/types";
import FormattedText from "./FormattedText";

type TrainingMode = "free" | "osce" | "demo" | "rct" | "random";
type LanguageCode = "zh" | "en";
type AiMode = "deepseek" | "rule" | "debug";
type AiStatus = "unknown" | "checking" | "connected" | "fallback" | "error";
type SpeechState = "off" | "speaking" | "paused";
type SpeechProvider = "browser" | "azure" | "disabled";
type AgentStageNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type StudentVisibleCase = Pick<CaseData, "id" | "studentChiefComplaint" | "chiefComplaint" | "age" | "sex" | "difficulty">;
type TimelineEvent = {
  id: string;
  stageNo: AgentStageNo;
  type: "ask" | "answer" | "exam" | "order" | "result" | "diagnosis" | "mdt" | "treatment" | "perioperative" | "submit";
  label: string;
  detail: string;
  at: string;
};

type AgentConfig = {
  stageNo: AgentStageNo;
  key: string;
  agentName: Record<LanguageCode, string>;
  leftNavLabel: Record<LanguageCode, string>;
  competency: Record<LanguageCode, string>;
  mainWindowFunction: Record<LanguageCode, string>;
  keyRule: string;
};

type EnglishCase = {
  id: string;
  title: string;
  age: string;
  sex: string;
  difficulty: string;
  diseaseCategory: string;
  chiefComplaint: string;
  initialDiagnosis: string;
  admissionLabs: string;
  admissionImaging: string;
  initialTreatmentPlan: string;
  definitiveTreatment: string;
  perioperativePoints: string;
  mdtDepartments: string;
  mdtQuestion: string;
  evaluatorKeyPoints: string;
  nextManagement: string;
};

type PatientReplyApiResponse = {
  agentId?: string;
  replyText: string;
  matchedSlotIds: string[];
  revealedFields?: string[];
  revealedDataKeys?: string[];
  blockedFields?: string[];
  blockedDataKeys?: string[];
  safetyFlags?: string[];
  provider: string;
  model?: string;
  usedModel?: string;
  isFallback: boolean;
  matchedFacts?: string[];
  answerSource?: string;
  confidence?: number;
  fallbackReason?: string;
  debug?: Record<string, unknown>;
};

type SessionInitResponse = {
  sessionId: string;
  patientOpeningStatement: string;
  completedPatientFacingProfile: Record<string, unknown>;
  aiStatus: "connected" | "fallback";
  cacheHit: boolean;
  debug?: Record<string, unknown>;
};

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
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const allClientCases = casesJson as CaseData[];
const allEnglishCases = casesEnJson as EnglishCase[];
const agents = (agentsJson as AgentConfig[]).sort((a, b) => a.stageNo - b.stageNo);
const i18n = { zh: i18nZhJson as Record<string, string>, en: i18nEnJson as Record<string, string> };
const orderCatalog = [
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
];
const orderPackages = orderPackagesJson as OrderPackage[];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const consultCatalog = consultCatalogJson as ConsultCatalogItem[];
const orderPrimaryTabs = ["检验", "检查", "病理/操作", "围术期评估"];
const labSecondaryOrder = ["尿液基础", "尿液感染", "尿液肿瘤", "尿液蛋白/肾小球线索", "血液基础", "炎症感染", "凝血/输血", "肾内免疫", "结石代谢", "大便/全身鉴别"];
const imagingSecondaryOrder = ["超声", "X线", "CT", "MRI", "内镜", "核医学", "功能检查"];
const consultGroupOrder = ["外科", "内科", "辅助/平台", "急诊/危重"];
const defaultAgentApiUrl = "https://hematuria-training-system.vercel.app/api/agent-chat/";
const defaultSessionInitApiUrl = "https://hematuria-training-system.vercel.app/api/session/init/";
const buildTimeAgentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL || process.env.NEXT_PUBLIC_PATIENT_AGENT_API_URL || defaultAgentApiUrl;
const buildTimeSessionInitApiUrl = process.env.NEXT_PUBLIC_SESSION_INIT_API_URL || defaultSessionInitApiUrl;
const PATIENT_REPLY_TIMEOUT_MS = 12000;
const isDevelopment = process.env.NODE_ENV !== "production";

const patientReplyForbiddenTerms = [
  "根据原始病史",
  "根据病例资料",
  "未主动诉",
  "需追问",
  "需警惕",
  "评分点",
  "教师提示",
  "原始既往史",
  "CT提示",
  "CTU提示",
  "膀胱镜",
  "病理",
  "占位",
  "肿瘤",
  "膀胱癌",
  "癌栓",
  "淋巴结",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗"
];

function isUnsafePatientReply(question: string, reply: string) {
  const compactQuestion = question.replace(/\s+/g, "");
  const compactReply = reply.replace(/\s+/g, "");
  if (!reply.trim()) return true;
  if (patientReplyForbiddenTerms.some((term) => reply.includes(term))) return true;
  if (compactReply.length > 180) return true;

  const askedSmoking = /吸烟|抽烟|烟龄|几包|包年/.test(compactQuestion);
  const askedAlcohol = /喝酒|饮酒|白酒|酒量/.test(compactQuestion);
  const askedHypertension = /高血压/.test(compactQuestion);
  const askedColor = /颜色|鲜红|暗红|洗肉水|茶色|酱油|红色/.test(compactQuestion);
  const askedClot = /血块|血凝块|凝血块/.test(compactQuestion);

  if (askedSmoking && /饮酒|喝酒|糖尿病|乙肝|肝炎|结核|输血|子女|父母|高血压|血尿|血块|肉眼|无痛|阿司匹林|肿瘤|膀胱癌|高龄/.test(compactReply)) return true;
  if (askedAlcohol && /吸烟|抽烟|包年|糖尿病|乙肝|肝炎|结核|输血|子女|父母|高血压|血尿|血块|肉眼|无痛|阿司匹林|肿瘤|膀胱癌|高龄/.test(compactReply)) return true;
  if (askedHypertension && /吸烟|抽烟|饮酒|喝酒|糖尿病|乙肝|肝炎|结核|输血|子女|父母/.test(compactReply)) return true;
  if (askedColor && /CT|影像|血块|无痛|全程|终末|诊断/.test(compactReply)) return true;
  if (askedClot && /鲜红|暗红|洗肉水|茶色|全程|终末|无痛|诊断/.test(compactReply)) return true;

  return false;
}

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

function t(lang: LanguageCode, key: string) {
  return i18n[lang][key] || i18n.zh[key] || key;
}

function sessionKey(caseId: string) {
  return `hematuria-7agent-bilingual-session-${caseId}`;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

function getSpeechRecognition() {
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

function stageScoreKey(stageNo: AgentStageNo): StageKey {
  if (stageNo === 1) return "history";
  if (stageNo === 2) return "orders";
  if (stageNo === 3) return "diagnosis";
  if (stageNo === 4) return "consult";
  if (stageNo === 5) return "treatment";
  if (stageNo === 6) return "perioperative";
  return "debrief";
}

function nextStage(stageNo: AgentStageNo): AgentStageNo | null {
  return stageNo < 7 ? ((stageNo + 1) as AgentStageNo) : null;
}

function patientOpening(caseData: CaseData, lang: LanguageCode, enCase?: EnglishCase) {
  const complaint = simplifiedChiefComplaint(caseData.studentChiefComplaint || caseData.chiefComplaint, lang, enCase?.chiefComplaint);
  if (lang === "en") return `Hello doctor. I came because of ${complaint || "abnormal urine color"}.`;
  return `医生您好，我是因为${complaint || "小便颜色异常"}来看病的。`;
}

function caseDisplay(caseData: CaseData, lang: LanguageCode, enCase?: EnglishCase) {
  if (lang === "en" && enCase) {
    return {
      title: enCase.title,
      age: enCase.age,
      sex: enCase.sex,
      difficulty: enCase.difficulty,
      diseaseCategory: enCase.diseaseCategory,
      chiefComplaint: simplifiedChiefComplaint(caseData.studentChiefComplaint || caseData.chiefComplaint, "en", enCase.chiefComplaint),
      standardPath: [
        `Diagnosis: ${enCase.initialDiagnosis}`,
        `Essential labs: ${enCase.admissionLabs}`,
        `Imaging/procedures: ${enCase.admissionImaging}`,
        `MDT: ${enCase.mdtDepartments} ${enCase.mdtQuestion}`,
        `Treatment: ${enCase.initialTreatmentPlan} ${enCase.definitiveTreatment}`,
        `Perioperative: ${enCase.perioperativePoints}`,
        `Follow-up: ${enCase.nextManagement}`
      ].join("\n")
    };
  }
  return {
    title: caseData.title || caseData.id,
    age: caseData.age,
    sex: caseData.sex,
    difficulty: caseData.difficulty || "",
    diseaseCategory: caseData.diseaseCategory || "",
    chiefComplaint: simplifiedChiefComplaint(caseData.studentChiefComplaint || caseData.chiefComplaint, "zh"),
    standardPath: [
      `诊断思路：${caseData.clinical?.diagnosticReasoning ?? caseData.diagnosis}`,
      `基础检验：${caseData.clinical?.requiredLabs ?? ""}`,
      `影像/内镜/功能：${caseData.clinical?.imagingAndProcedures ?? ""}`,
      `会诊：${caseData.clinical?.consultDepartments ?? ""}；${caseData.clinical?.consultQuestions ?? ""}`,
      `即时处理：${caseData.clinical?.immediateTreatment ?? ""}`,
      `后续治疗：${caseData.clinical?.definitiveTreatment ?? ""}`,
      `随访：${caseData.clinical?.followUp ?? ""}`
    ].join("\n")
  };
}

function groupPhysicalExamItems() {
  const grouped = new Map<string, PhysicalExamItem[]>();
  physicalExamItems.forEach((item) => grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]));
  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
}

function splitPackageOrders(pkg: OrderPackage) {
  return unique([pkg.basicLabs, pkg.specialTests, pkg.imagingAndProcedures].flatMap((text) => (text || "").split(/[；;、\n]/)));
}

function matchCatalogByName(name: string) {
  const normalized = name.replace(/\s+/g, "");
  return orderCatalog.find((item) => [item.displayName, ...item.synonyms].some((candidate) => {
    const value = candidate.replace(/\s+/g, "");
    return value && (value.includes(normalized) || normalized.includes(value));
  }));
}

function stageAnswerText(stageNo: AgentStageNo, answers: FullProcessAnswers, messages: ChatMessage[], examLogs: ExamResultLog[], orderLogs: OrderResultLog[], mdtOpinions: MdtOpinion[]) {
  if (stageNo === 1) return `${messages.map((item) => item.text).join("；")}；${answers.historySummary}`;
  if (stageNo === 2) return `${answers.physicalExam}；${answers.selectedOrders.join("；")}；${answers.customOrders}；${examLogs.map((item) => `${item.input}:${item.result}`).join("；")}；${orderLogs.map((log) => log.input).join("；")}`;
  if (stageNo === 3) return `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`;
  if (stageNo === 4) return `${answers.consultNeeded}；${answers.consultDepartments.join("；")}；${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}；${mdtOpinions.map((item) => `${item.department}:${item.opinion}`).join("；")}`;
  if (stageNo === 5) return `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.mdtRevisedPlan}；${answers.followUp}；${answers.patientEducation}`;
  if (stageNo === 6) return answers.perioperativePreparation;
  return answers.debriefReflection;
}

function aiSessionCacheKey(caseId: string, language: LanguageCode, mode: TrainingMode) {
  return `hematuria-ai-patient-session-${caseId}-${language}-${mode}`;
}

async function requestSessionInit({ apiUrl, caseId, runtimeMode, language, debug }: {
  apiUrl: string;
  caseId: string;
  runtimeMode: TrainingMode;
  language: LanguageCode;
  debug: boolean;
}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), PATIENT_REPLY_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        caseId,
        mode: runtimeMode,
        language,
        debug
      })
    });
    if (!response.ok) throw new Error(`Session init API ${response.status}`);
    return response.json() as Promise<SessionInitResponse>;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function requestAiPatientReply({ apiUrl, sessionId, completedPatientFacingProfile, caseId, question, messages, askedSlots, aiMode, language }: {
  apiUrl: string;
  sessionId?: string;
  completedPatientFacingProfile?: Record<string, unknown> | null;
  caseId: string;
  question: string;
  messages: ChatMessage[];
  askedSlots: string[];
  aiMode: AiMode;
  language: LanguageCode;
}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), PATIENT_REPLY_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        caseId,
        agentId: "standardized_patient",
        sessionId,
        stage: "history",
        mode: aiMode === "rule" ? "rule" : aiMode === "debug" ? "debug" : "training",
        language,
        studentInput: question,
        completedPatientFacingProfile,
        conversationHistory: messages.slice(-6).map((message) => ({ role: message.role, text: message.text })),
        askedSlotIds: askedSlots,
        askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text)
      })
    });
    if (!response.ok) throw new Error(`Patient Agent API ${response.status}`);
    return response.json() as Promise<PatientReplyApiResponse>;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function formatReportLines(text: string) {
  return (text || "").split(/\n|；/).map((line) => line.trim()).filter(Boolean);
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
      {item.teachingExplanation && <p className="mt-3 text-xs leading-5 text-clinic-muted">释放规则：{item.teachingExplanation}</p>}
    </article>
  );
}

function FeedbackBox({ evaluation, lang }: { evaluation: StageEvaluation; lang: LanguageCode }) {
  return (
    <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-clinic-blue">{t(lang, "stageFeedback")}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-clinic-blue">{evaluation.score}/{evaluation.max}</span>
      </div>
      <p className="mt-3 text-sm leading-6">{evaluation.comment}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-white p-3 text-sm">
          <p className="font-medium">命中项</p>
          <p className="mt-2 text-clinic-muted">{evaluation.hits.join("；") || "暂无"}</p>
        </div>
        <div className="rounded-md bg-white p-3 text-sm">
          <p className="font-medium">漏项/危险点</p>
          <p className="mt-2 text-clinic-muted">{[...evaluation.misses, ...evaluation.warnings].join("；") || "暂无"}</p>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-clinic-blue">提交后标准参考</summary>
        <FormattedText text={evaluation.standardAnswer} />
      </details>
    </section>
  );
}

function FinalReport({ report }: { report: Evaluator360Report }) {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-clinic-blue">能力画像 / Competency Profile</h3>
          <p className="text-sm text-clinic-muted">基于 7-Agent 全流程记录生成。</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => window.print()} className="no-print rounded-md border border-clinic-line px-3 py-2 text-sm font-medium hover:border-clinic-blue">打印报告</button>
          <div className="text-3xl font-semibold text-clinic-blue">{report.total}<span className="text-base text-clinic-muted"> / {report.max}</span></div>
        </div>
      </div>
      {report.redFlags.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {report.redFlags.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report.items.map((item) => {
          const pct = Math.round((item.score / item.max) * 100);
          return (
            <div key={item.label} className="rounded-md border border-clinic-line p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.label}</p>
                <span className="text-sm text-clinic-blue">{item.score}/{item.max}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-clinic-paper">
                <div className="h-full rounded-full bg-clinic-teal" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-clinic-muted">{item.comment}</p>
              <div className="mt-3 space-y-1 text-xs leading-5 text-clinic-muted">
                <p><span className="font-medium text-clinic-ink">做对证据：</span>{item.evidence.join("；") || "暂无可核验证据"}</p>
                <p><span className="font-medium text-clinic-ink">漏项：</span>{item.misses.slice(0, 5).join("；") || "暂无明显漏项"}</p>
                {item.sequenceIssues.length > 0 && <p><span className="font-medium text-amber-800">顺序问题：</span>{item.sequenceIssues.join("；")}</p>}
                {item.overuse.length > 0 && <p><span className="font-medium text-amber-800">重复/过度：</span>{item.overuse.join("；")}</p>}
                {item.criticalErrors.length > 0 && <p><span className="font-medium text-rose-700">严重错误：</span>{item.criticalErrors.join("；")}</p>}
                <p><span className="font-medium text-clinic-ink">下次改进：</span>{item.improvements.join("；") || "保持当前操作并进一步提高表达效率。"}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-md bg-clinic-paper p-4">
        <p className="font-medium text-clinic-blue">Guardrails</p>
        <FormattedText text={report.ragGuardrails.join("\n")} />
      </div>
    </section>
  );
}

function AgentIcon({ stageNo }: { stageNo: AgentStageNo }) {
  const className = "h-4 w-4";
  if (stageNo === 1) return <MessageSquareText className={className} />;
  if (stageNo === 2) return <FlaskConical className={className} />;
  if (stageNo === 3) return <FileText className={className} />;
  if (stageNo === 4) return <UsersRound className={className} />;
  if (stageNo === 5) return <Stethoscope className={className} />;
  if (stageNo === 6) return <Activity className={className} />;
  return <ClipboardList className={className} />;
}

export default function ClinicalTrainingClient({ caseData: initialCaseData, mode = "free" }: { caseData: StudentVisibleCase; mode?: TrainingMode }) {
  const [caseData] = useState<CaseData | null>(() => allClientCases.find((item) => item.id === initialCaseData.id) ?? null);
  const [runtimeMode, setRuntimeMode] = useState<TrainingMode>(mode);
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [activeStageNo, setActiveStageNo] = useState<AgentStageNo>(1);
  const [answers, setAnswers] = useState<FullProcessAnswers>(emptyAnswers);
  const [submitted, setSubmitted] = useState<Partial<Record<AgentStageNo, StageEvaluation>>>({});
  const [finalReport, setFinalReport] = useState<Evaluator360Report | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [askedSlots, setAskedSlots] = useState<string[]>([]);
  const [collected, setCollected] = useState<CollectedMap>(createEmptyCollected());
  const [patientReplyLoading, setPatientReplyLoading] = useState(false);
  const [examInput, setExamInput] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [activeOrderTab, setActiveOrderTab] = useState("检验");
  const [examLogs, setExamLogs] = useState<ExamResultLog[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderResultLog[]>([]);
  const [mdtOpinions, setMdtOpinions] = useState<MdtOpinion[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [osceTimeLeft, setOsceTimeLeft] = useState(20 * 60);
  const [speechInputSupported, setSpeechInputSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speechSettingsOpen, setSpeechSettingsOpen] = useState(false);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechVoiceName, setSpeechVoiceName] = useState("");
  const [speechRate, setSpeechRate] = useState(0.92);
  const [speechPitch, setSpeechPitch] = useState(1);
  const [speechState, setSpeechState] = useState<SpeechState>("off");
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("browser");
  const [lastSpokenText, setLastSpokenText] = useState("");
  const [aiMode, setAiMode] = useState<AiMode>("deepseek");
  const [aiStatus, setAiStatus] = useState<AiStatus>("unknown");
  const [aiSessionId, setAiSessionId] = useState("");
  const [completedPatientFacingProfile, setCompletedPatientFacingProfile] = useState<Record<string, unknown> | null>(null);
  const [sessionInitLoading, setSessionInitLoading] = useState(false);
  const [sessionInitError, setSessionInitError] = useState("");
  const [lastTechnicalFailure, setLastTechnicalFailure] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [storageWarning, setStorageWarning] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const allowNavigationRef = useRef(false);
  const isOsce = runtimeMode === "osce";
  const enCase = useMemo(() => allEnglishCases.find((item) => item.id === initialCaseData.id), [initialCaseData.id]);
  const display = caseData ? caseDisplay(caseData, lang, enCase) : null;
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
    const storageInit = initializeStorageVersion("2.2.0");
    if (storageInit.error) setStorageWarning("浏览器存储不可用，本次训练可能无法断点续训。");
    let savedLang: LanguageCode | null = null;
    let savedAiMode: AiMode | null = null;
    try {
      savedLang = localStorage.getItem("hematuria-language") as LanguageCode | null;
      savedAiMode = localStorage.getItem("hematuria-ai-mode") as AiMode | null;
    } catch {
      setStorageWarning("浏览器存储不可用，本次训练可能无法断点续训。");
    }
    if (savedLang === "zh" || savedLang === "en") setLang(savedLang);
    if (savedAiMode === "deepseek" || savedAiMode === "rule" || savedAiMode === "debug") setAiMode(savedAiMode);
    const urlMode = new URLSearchParams(window.location.search).get("mode");
    if (urlMode === "osce") setRuntimeMode("osce");
    else if (urlMode === "demo") setRuntimeMode("demo");
    else if (urlMode === "rct") setRuntimeMode("rct");
    else if (urlMode === "random") setRuntimeMode("random");
    else setRuntimeMode(mode);
    setSpeechInputSupported(Boolean(getSpeechRecognition()));
    setSpeechOutputSupported("speechSynthesis" in window);
    const savedSpeech = readJsonStorage("hematuria-speech-preferences", { enabled: false, provider: "browser" as SpeechProvider, voiceName: "", rate: 0.92, pitch: 1 }).value;
    setAutoSpeak(Boolean(savedSpeech.enabled));
    setSpeechVoiceName(String(savedSpeech.voiceName || ""));
    setSpeechRate(Math.min(1.15, Math.max(0.8, Number(savedSpeech.rate) || 0.92)));
    setSpeechPitch(Math.min(1.1, Math.max(0.85, Number(savedSpeech.pitch) || 1)));
    setSpeechProvider(savedSpeech.provider === "disabled" || savedSpeech.provider === "azure" ? savedSpeech.provider : "browser");

    const savedResult = readJsonStorage<{
      activeStageNo?: AgentStageNo;
      answers?: FullProcessAnswers;
      submitted?: Partial<Record<AgentStageNo, StageEvaluation>>;
      finalReport?: Evaluator360Report | null;
      messages?: ChatMessage[];
      askedSlots?: string[];
      collected?: CollectedMap;
      examLogs?: ExamResultLog[];
      orderLogs?: OrderResultLog[];
      mdtOpinions?: MdtOpinion[];
      timeline?: TimelineEvent[];
      osceTimeLeft?: number;
    }>(sessionKey(initialCaseData.id), {});
    const saved = savedResult.value;
    if (savedResult.recovered) setStorageWarning("检测到损坏的训练缓存，已安全恢复为空白会话。");
    if (saved.activeStageNo) setActiveStageNo(saved.activeStageNo);
    if (saved.answers) setAnswers({ ...emptyAnswers, ...saved.answers });
    if (saved.submitted) setSubmitted(saved.submitted);
    if (saved.finalReport) setFinalReport(saved.finalReport);
    if (saved.messages) setMessages(saved.messages);
    if (saved.askedSlots) setAskedSlots(saved.askedSlots);
    if (saved.collected) setCollected(saved.collected);
    if (saved.examLogs) setExamLogs(saved.examLogs);
    if (saved.orderLogs) setOrderLogs(saved.orderLogs);
    if (saved.mdtOpinions) setMdtOpinions(saved.mdtOpinions);
    if (saved.timeline) setTimeline(saved.timeline);
    if (typeof saved.osceTimeLeft === "number") setOsceTimeLeft(saved.osceTimeLeft);
  }, [initialCaseData.id, mode]);

  useEffect(() => {
    if (!caseData) return;
    setMessages((current) => current.length ? current : [{ role: "patient", text: patientOpening(caseData, lang, enCase) }]);
  }, [caseData, enCase, lang]);

  useEffect(() => {
    if (!caseData || aiMode === "rule") return;
    let cancelled = false;
    const cacheKey = aiSessionCacheKey(caseData.id, lang, runtimeMode);
    const cached = readJsonStorage<SessionInitResponse | null>(cacheKey, null).value;
    if (cached?.sessionId && cached.completedPatientFacingProfile) {
      setAiSessionId(cached.sessionId);
      setCompletedPatientFacingProfile(cached.completedPatientFacingProfile);
      setAiStatus(cached.aiStatus === "connected" ? "connected" : "fallback");
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: cached.patientOpeningStatement || patientOpening(caseData, lang, enCase) }];
      });
      return;
    }
    setSessionInitLoading(true);
    setSessionInitError("");
    setAiStatus("checking");
    void requestSessionInit({
      apiUrl: buildTimeSessionInitApiUrl,
      caseId: caseData.id,
      runtimeMode,
      language: lang,
      debug: aiMode === "debug"
    }).then((result) => {
      if (cancelled) return;
      setAiSessionId(result.sessionId);
      setCompletedPatientFacingProfile(result.completedPatientFacingProfile);
      setAiStatus(result.aiStatus === "connected" ? "connected" : "fallback");
      writeJsonStorage(cacheKey, result);
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: result.patientOpeningStatement || patientOpening(caseData, lang, enCase) }];
      });
    }).catch((error) => {
      if (cancelled) return;
      setSessionInitError(error instanceof Error ? error.message : "AI患者初始化失败");
      setAiStatus("error");
    }).finally(() => {
      if (!cancelled) setSessionInitLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [aiMode, caseData, enCase, lang, runtimeMode]);

  useEffect(() => {
    try { localStorage.setItem("hematuria-language", lang); } catch { setStorageWarning("语言偏好无法保存。 "); }
  }, [lang]);

  useEffect(() => {
    try { localStorage.setItem("hematuria-ai-mode", aiMode); } catch { setStorageWarning("回答来源偏好无法保存。 "); }
    setAiStatus(aiMode === "rule" ? "fallback" : "unknown");
  }, [aiMode]);

  useEffect(() => {
    setSaveStatus("saving");
    const result = writeJsonStorage(sessionKey(initialCaseData.id), {
      activeStageNo,
      answers,
      submitted,
      finalReport,
      messages,
      askedSlots,
      collected,
      examLogs,
      orderLogs,
      mdtOpinions,
      timeline,
      osceTimeLeft
    });
    setSaveStatus(result.ok ? "saved" : "error");
    if (!result.ok) setStorageWarning("自动保存失败，请勿关闭页面；可在浏览器释放存储空间后重试。 ");
  }, [activeStageNo, answers, askedSlots, collected, examLogs, finalReport, initialCaseData.id, mdtOpinions, messages, orderLogs, osceTimeLeft, submitted, timeline]);

  useEffect(() => {
    if (!isOsce || activeStageNo === 7 || finalReport) return;
    const timer = window.setInterval(() => setOsceTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [activeStageNo, finalReport, isOsce]);

  useEffect(() => {
    if (!timeline.length || finalReport) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [finalReport, timeline.length]);

  useEffect(() => {
    if (activeStageNo !== 1) return;
    const panel = chatScrollRef.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, [activeStageNo, messages.length, patientReplyLoading]);

  useEffect(() => {
    if (!speechOutputSupported) return;
    const loadVoices = () => {
      const locale = lang === "en" ? /en-(US|GB)/i : /zh-(CN|Hans)|Mandarin/i;
      const available = window.speechSynthesis.getVoices().filter((voice) => locale.test(`${voice.lang} ${voice.name}`));
      setSpeechVoices(available);
      if (!speechVoiceName && available.length) {
        const isFemale = caseData?.sex === "女";
        const preferred = available.find((voice) => isFemale ? /Xiaoxiao|Xiaoyi|Tingting|female/i.test(voice.name) : /Yunxi|Yunjian|male/i.test(voice.name))
          || available.find((voice) => /Microsoft|Google/i.test(voice.name))
          || available[0];
        setSpeechVoiceName(preferred.name);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [caseData?.sex, lang, speechOutputSupported, speechVoiceName]);

  useEffect(() => {
    writeJsonStorage("hematuria-speech-preferences", { enabled: autoSpeak, provider: speechProvider, voiceName: speechVoiceName, rate: speechRate, pitch: speechPitch });
  }, [autoSpeak, speechPitch, speechProvider, speechRate, speechVoiceName]);

  function addTimeline(type: TimelineEvent["type"], label: string, detail: string, stageNo: AgentStageNo = activeStageNo) {
    setTimeline((current) => [...current, { id: nowEventId(), stageNo, type, label, detail, at: new Date().toISOString() }]);
  }

  function setLanguage(next: LanguageCode) {
    setLang(next);
    if (caseData && messages.length <= 1) setMessages([{ role: "patient", text: patientOpening(caseData, next, enCase) }]);
  }

  function updateAnswer<K extends keyof FullProcessAnswers>(key: K, value: FullProcessAnswers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function speak(text: string, force = false) {
    if (!speechOutputSupported || speechProvider !== "browser" || (!autoSpeak && !force)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/^患者[:：]\s*/i, "").replace(/^[-•*#]\s*/gm, "").replace(/\s+/g, " ").trim();
    const segments = clean.split(/(?<=[。！？!?])/).map((item) => item.trim()).filter(Boolean);
    const voice = speechVoices.find((item) => item.name === speechVoiceName);
    setLastSpokenText(clean);
    setSpeechState("speaking");
    segments.forEach((segment, index) => {
      const utterance = new SpeechSynthesisUtterance(segment);
      utterance.lang = lang === "en" ? "en-US" : "zh-CN";
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;
      if (voice) utterance.voice = voice;
      if (index === segments.length - 1) utterance.onend = () => setSpeechState("off");
      utterance.onerror = () => setSpeechState("off");
      window.speechSynthesis.speak(utterance);
    });
  }

  function pauseSpeech() { window.speechSynthesis.pause(); setSpeechState("paused"); }
  function resumeSpeech() { window.speechSynthesis.resume(); setSpeechState("speaking"); }
  function stopSpeech() { window.speechSynthesis.cancel(); setSpeechState("off"); }

  async function submitQuestion(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? question).trim();
    if (!text || patientReplyLoading) return;
    setPatientReplyLoading(true);
    const ruleResult = askPatient(caseData, text);
    let answerText = ruleResult.answer;
    let matchedSlots = ruleResult.matchedSlots;
    let matchedKeys = ruleResult.matchedKeys;
    try {
      if (aiMode === "rule") {
        setAiStatus("fallback");
      } else {
        setAiStatus("checking");
        const aiResult = await requestAiPatientReply({
          apiUrl: buildTimeAgentApiUrl,
          sessionId: aiSessionId,
          completedPatientFacingProfile,
          caseId: caseData.id,
          question: text,
          messages,
          askedSlots,
          aiMode,
          language: lang
        });
        const safeAiReply = aiResult.replyText && !isUnsafePatientReply(text, aiResult.replyText);
        answerText = safeAiReply ? aiResult.replyText : ruleResult.answer;
        matchedSlots = aiResult.matchedSlotIds?.length ? aiResult.matchedSlotIds : ruleResult.matchedSlots;
        setAiStatus(safeAiReply && !aiResult.isFallback ? "connected" : "fallback");
        if (safeAiReply && !aiResult.isFallback) setLastTechnicalFailure("");
      }
    } catch {
      answerText = ruleResult.answer;
      matchedSlots = ruleResult.matchedSlots;
      matchedKeys = ruleResult.matchedKeys;
      setAiStatus("error");
      setLastTechnicalFailure(text);
    } finally {
      setPatientReplyLoading(false);
    }
    const nextCollected = mergeCollected(collected, matchedKeys);
    const nextAskedSlots = unique([...askedSlots, ...(matchedSlots ?? [])]);
    const nextMessages: ChatMessage[] = [...messages, { role: "student", text }, { role: "patient", text: answerText, matchedKeys, matchedSlots }];
    setMessages(nextMessages);
    setCollected(nextCollected);
    setAskedSlots(nextAskedSlots);
    setQuestion("");
    addTimeline("ask", lang === "en" ? "Student question" : "学生提问", text, 1);
    addTimeline("answer", lang === "en" ? "Patient answer" : "患者回答", answerText, 1);
    speak(answerText);
  }

  async function retryTechnicalReply() {
    if (!caseData || !lastTechnicalFailure || patientReplyLoading) return;
    setPatientReplyLoading(true);
    try {
      const aiResult = await requestAiPatientReply({
        apiUrl: buildTimeAgentApiUrl,
        sessionId: aiSessionId,
        completedPatientFacingProfile,
        caseId: caseData.id,
        question: lastTechnicalFailure,
        messages,
        askedSlots,
        aiMode: "deepseek",
        language: lang
      });
      if (!aiResult.replyText || aiResult.isFallback || isUnsafePatientReply(lastTechnicalFailure, aiResult.replyText)) throw new Error("unsafe-or-fallback");
      setMessages((current) => current.map((message, index) => index === current.length - 1 && message.role === "patient" ? { ...message, text: aiResult.replyText } : message));
      setAiStatus("connected");
      setLastTechnicalFailure("");
      addTimeline("answer", lang === "en" ? "Technical retry succeeded" : "技术重试成功", aiResult.replyText, 1);
    } catch {
      setAiStatus("error");
    } finally {
      setPatientReplyLoading(false);
    }
  }

  function startVoiceInput() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = lang === "en" ? "en-US" : "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        setQuestion(text);
        void submitQuestion(text);
      }
    };
    recognition.start();
  }

  function submitExam(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? examInput).trim();
    if (!text) return;
    const log = generatePhysicalExamResult(caseData, text);
    setExamLogs((current) => [...current, log]);
    updateAnswer("physicalExam", `${answers.physicalExam}\n${text}：${log.result}`.trim());
    addTimeline("exam", lang === "en" ? "Physical examination" : "查体", `${text}：${log.result}`, 2);
    setExamInput("");
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
    addTimeline("order", lang === "en" ? "Order package" : "选择医嘱套餐", `${pkg.name || pkg.scenario}：${matched.join("；")}`, 2);
  }

  function submitOrder(textOverride?: string) {
    if (!caseData) return;
    const text = (textOverride ?? orderInput).trim();
    if (!text) return;
    const previousOrderIds = orderLogs.flatMap((item) => item.matchedOrders.map((order) => order.orderId));
    const matchedLog = matchOrderResults(caseData, text, { previousOrderIds, stageNo: 2 });
    const hasReport = matchedLog.results.length > 0;
    const log: OrderResultLog = hasReport
      ? { ...matchedLog, pendingResults: matchedLog.results, results: [], returnedAt: undefined, status: "ordered", message: lang === "en" ? "Order placed. The simulated report is pending." : "医嘱已开具，模拟报告返回中。" }
      : matchedLog;
    setOrderLogs((current) => [...current, log]);
    addTimeline("order", lang === "en" ? "Order placed" : "开立医嘱", text, 2);
    if (hasReport) {
      window.setTimeout(() => {
        const returnedAt = new Date().toISOString();
        setOrderLogs((current) => current.map((item) => item.id === log.id
          ? { ...item, results: item.pendingResults ?? [], pendingResults: undefined, returnedAt, at: returnedAt, status: "reported", message: matchedLog.message }
          : item));
        addTimeline("result", lang === "en" ? "Report returned" : "返回检查结果", matchedLog.results.map((item) => `${item.orderCategory}：${item.result}`).join("\n"), 2);
      }, 500);
    }
    setOrderInput("");
  }

  function submitSelectedOrders() {
    const text = unique([...answers.selectedOrders, answers.customOrders]).join("；");
    if (text) submitOrder(text);
  }

  function toggleDepartment(item: string) {
    setAnswers((current) => ({
      ...current,
      consultDepartments: current.consultDepartments.includes(item) ? current.consultDepartments.filter((value) => value !== item) : [...current.consultDepartments, item]
    }));
  }

  function startMdt() {
    if (!caseData) return;
    if (answers.consultNeeded === "需要会诊" && (answers.consultDepartments.length === 0 || answers.consultPurpose.trim().length < 6 || answers.consultQuestions.trim().length < 6 || answers.consultSummary.trim().length < 6)) {
      alert(t(lang, "purposeRequired"));
      return;
    }
    const purpose = [answers.consultPurpose, answers.consultQuestions, answers.consultSummary].filter(Boolean).join("；");
    const opinions = generateMdtOpinions(caseData, answers.consultDepartments, purpose);
    setMdtOpinions(opinions);
    addTimeline("mdt", "MDT", `${answers.consultDepartments.join("；") || "未选择科室"} - ${purpose}`, 4);
  }

  function generateReport() {
    if (!caseData) return null;
    return score360(caseData, {
      askedSlots,
      examTexts: examLogs.map((item) => `${item.input}：${item.result}`),
      orderTexts: [...answers.selectedOrders, answers.customOrders, ...orderLogs.map((item) => item.input)],
      diagnosisText: `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`,
      mdtDepartments: answers.consultDepartments,
      mdtPurpose: `${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}`,
      mdtStarted: mdtOpinions.length > 0 || answers.consultNeeded === "需要会诊",
      treatmentText: `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.perioperativePreparation}；${answers.mdtRevisedPlan}`,
      followUpText: `${answers.followUp}；${answers.patientEducation}`,
      orderLogs,
      timeline
    });
  }

  function submitStage() {
    if (!caseData) return;
    if (submitted[activeStageNo]) return;
    if (activeStageNo === 4 && answers.consultNeeded === "需要会诊" && (answers.consultDepartments.length === 0 || answers.consultPurpose.trim().length < 6 || answers.consultQuestions.trim().length < 6 || answers.consultSummary.trim().length < 6)) {
      alert(t(lang, "purposeRequired"));
      return;
    }
    if (activeStageNo === 3) {
      const differentialCount = answers.differentials.split(/[；;、,，\n]/).map((item) => item.trim()).filter(Boolean).length;
      if (!answers.diagnosis.trim() || answers.diagnosticEvidence.trim().length < 8 || differentialCount < 3 || answers.differentialAnalysis.trim().length < 12) {
        alert(lang === "en" ? "Enter the most likely diagnosis, evidence, at least three ranked differentials, and support/opposition analysis." : "请填写最可能诊断、诊断依据、至少3个有优先级的鉴别诊断及各自支持/反对点。");
        return;
      }
    }
    const answerText = [
      stageAnswerText(activeStageNo, answers, messages, examLogs, orderLogs, mdtOpinions),
      activeStageNo === 1 ? askedSlots.join("；") : ""
    ].filter(Boolean).join("；");
    const evaluation = evaluateStage(caseData, stageScoreKey(activeStageNo), answerText);
    setSubmitted((current) => ({ ...current, [activeStageNo]: evaluation }));
    addTimeline("submit", lang === "en" ? "Stage submitted" : "提交阶段", `${agents.find((item) => item.stageNo === activeStageNo)?.agentName[lang] ?? activeStageNo}：${evaluation.score}/${evaluation.max}`, activeStageNo);
  }

  function completeTraining() {
    if (!caseData || finalReport) return;
    for (let stage = 1 as AgentStageNo; stage <= 6; stage = (stage + 1) as AgentStageNo) {
      if (!submitted[stage]) { alert(lang === "en" ? "Complete stages 1-6 first." : "请先完成并提交第1至第6阶段。"); return; }
    }
    const evaluation = evaluateStage(caseData, "debrief", answers.debriefReflection);
    const report = generateReport();
    if (!report) return;
    setSubmitted((current) => ({ ...current, 7: evaluation }));
    setFinalReport(report);
    addTimeline("submit", lang === "en" ? "Final report generated" : "完成训练并生成最终报告", `${report.total}/${report.max}`, 7);
  }

  function canOpenStage(stageNo: AgentStageNo) {
    if (stageNo === 1) return true;
    for (let current = 1 as AgentStageNo; current < stageNo; current = (current + 1) as AgentStageNo) {
      if (!submitted[current]) return false;
    }
    return true;
  }

  function openStage(stageNo: AgentStageNo) {
    if (!canOpenStage(stageNo)) return;
    if (stageNo === 7 && !finalReport) setFinalReport(generateReport());
    setActiveStageNo(stageNo);
    setMobileNavOpen(false);
  }

  function confirmExit() {
    const allowed = !timeline.length || Boolean(finalReport) || window.confirm(lang === "en" ? "Your progress is saved. Leave this case?" : "当前进度已自动保存，确定离开本病例吗？");
    if (allowed) allowNavigationRef.current = true;
    return allowed;
  }

  function restartTraining() {
    if (!window.confirm(lang === "en" ? "Restart this case and clear the saved attempt?" : "确定重新开始并清除本病例当前训练记录吗？")) return;
    allowNavigationRef.current = true;
    try { localStorage.removeItem(sessionKey(initialCaseData.id)); } catch { /* Reload still resets the in-memory attempt. */ }
    window.location.reload();
  }

  const activeAgent = agents.find((item) => item.stageNo === activeStageNo) ?? agents[0];
  const activeEvaluation = submitted[activeStageNo];
  const showStageFeedback = Boolean(activeEvaluation && (!isOsce || activeStageNo === 7));
  const acquiredStats = {
    questions: messages.filter((item) => item.role === "student").length,
    patientAnswers: Math.max(0, messages.filter((item) => item.role === "patient").length - 1),
    exams: examLogs.length,
    orders: unique([...answers.selectedOrders, ...orderLogs.flatMap((log) => log.matchedOrders.map((item) => item.displayName))]).length,
    reports: orderLogs.reduce((sum, log) => sum + log.results.length, 0)
  };

  if (!caseData || !display) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <section className="rounded-lg border border-clinic-line bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-semibold text-clinic-ink">病例数据加载失败</h1>
          <p className="mt-3 text-clinic-muted">未在本地病例库中找到 {initialCaseData.id}。</p>
          <Link href="/cases/" className="mt-5 inline-flex rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">病例库</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-clinic-blue">{caseData.id}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t(lang, "appTitle")}</h1>
          <p className="mt-1 text-sm text-clinic-muted">{t(lang, "appSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm ${isOsce ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
            {isOsce ? `${t(lang, "osceMode")} ${formatDuration(osceTimeLeft)}` : t(lang, "freeTraining")}
          </span>
          <div className="inline-flex rounded-md border border-clinic-line bg-white p-1">
            <button type="button" onClick={() => setLanguage("zh")} className={`rounded px-3 py-1 text-sm ${lang === "zh" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>{t(lang, "zh")}</button>
            <button type="button" onClick={() => setLanguage("en")} className={`rounded px-3 py-1 text-sm ${lang === "en" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>{t(lang, "en")}</button>
          </div>
          {isDevelopment && (
            <div className="inline-flex rounded-md border border-clinic-line bg-white p-1">
              <button type="button" onClick={() => setAiMode("deepseek")} className={`rounded px-3 py-1 text-sm ${aiMode === "deepseek" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>AI</button>
              <button type="button" onClick={() => setAiMode("rule")} className={`rounded px-3 py-1 text-sm ${aiMode === "rule" ? "bg-clinic-blue text-white" : "text-clinic-muted"}`}>{lang === "en" ? "Rules" : "规则库"}</button>
            </div>
          )}
          <span className={`rounded-full px-3 py-1 text-xs ${aiStatus === "connected" ? "bg-emerald-50 text-emerald-700" : aiStatus === "checking" || aiStatus === "unknown" ? "bg-slate-50 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
            {lang === "en" ? "Response source: " : "回答来源："}
            {aiStatus === "connected"
              ? (lang === "en" ? "AI" : "AI")
              : aiStatus === "checking"
                ? (lang === "en" ? "connecting" : "连接中")
                : aiStatus === "unknown"
                  ? (lang === "en" ? "AI" : "AI")
                  : aiMode === "rule"
                    ? (lang === "en" ? "rules" : "规则库")
                    : (lang === "en" ? "fallback rules" : "降级模式")}
          </span>
          <button type="button" onClick={restartTraining} className="inline-flex items-center gap-2 rounded-md border border-clinic-line bg-white px-3 py-2 text-sm hover:border-clinic-blue"><RotateCcw size={15} />{lang === "en" ? "Restart" : "重新开始"}</button>
          <Link onClick={(event) => { if (!confirmExit()) event.preventDefault(); }} href="/cases" className="rounded-md border border-clinic-line bg-white px-4 py-2 text-sm hover:border-clinic-blue">{t(lang, "backToCases")}</Link>
        </div>
      </div>
      {storageWarning && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{storageWarning}</span>
          <button type="button" onClick={() => setStorageWarning("")} className="font-medium underline">{lang === "en" ? "Dismiss" : "知道了"}</button>
        </div>
      )}

      <button type="button" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)} className="mb-3 inline-flex w-full items-center justify-between rounded-md border border-clinic-line bg-white px-4 py-3 font-medium lg:hidden">
        <span className="inline-flex items-center gap-2"><Menu size={18} />{lang === "en" ? "Stages and case info" : "阶段导航与病例信息"}</span>
        <span>{activeStageNo}/7</span>
      </button>
      <div className="grid gap-5 lg:grid-cols-[300px_1fr_300px]">
        <aside className={`${mobileNavOpen ? "block" : "hidden"} space-y-3 lg:block`}>
          <section className="rounded-lg border border-clinic-line bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-clinic-blue"><Languages size={16} /> 7-Agent</div>
            <div className="space-y-2">
              {agents.map((agent) => {
                const locked = !canOpenStage(agent.stageNo);
                const completed = Boolean(submitted[agent.stageNo]);
                const active = activeStageNo === agent.stageNo;
                return (
                  <button
                    key={agent.stageNo}
                    type="button"
                    disabled={locked}
                    onClick={() => openStage(agent.stageNo)}
                    className={`w-full rounded-md border p-3 text-left transition ${active ? "border-clinic-blue bg-clinic-blue text-white" : completed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : locked ? "cursor-not-allowed border-clinic-line bg-slate-50 text-clinic-muted opacity-60" : "border-clinic-line bg-white hover:border-clinic-blue"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? "bg-white/20" : "bg-clinic-paper"}`}>
                        {locked ? <LockKeyhole size={14} /> : completed ? <CheckCircle2 size={14} /> : <AgentIcon stageNo={agent.stageNo} />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold leading-5">{agent.leftNavLabel[lang]}</span>
                        <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/80" : "text-clinic-muted"}`}>{agent.competency[lang]}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-4">
            <h2 className="font-semibold">{t(lang, "visibleInfo")}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="text-clinic-muted">{t(lang, "ageSex")}</dt><dd className="leading-6">{display.age || "-"} / {display.sex || "-"}</dd></div>
              <div><dt className="text-clinic-muted">{t(lang, "chiefComplaint")}</dt><dd className="leading-6">{display.chiefComplaint}</dd></div>
            </dl>
          </section>
        </aside>

        <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-clinic-line pb-4">
            <p className="text-sm font-medium text-clinic-blue">{activeAgent.agentName[lang]}</p>
            <h2 className="mt-1 text-xl font-semibold">{activeAgent.mainWindowFunction[lang]}</h2>
            <p className="mt-2 text-sm text-clinic-muted">{t(lang, "noFeedbackBeforeSubmit")}</p>
          </div>

          {activeStageNo === 1 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Standardized Patient Agent</h3>
                <button type="button" onClick={() => setSpeechSettingsOpen(true)} disabled={!speechOutputSupported} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:border-clinic-blue disabled:opacity-50">
                  <Settings2 size={16} /> {lang === "en" ? "Voice settings" : "语音设置"}
                  <span className="sr-only">{autoSpeak ? "on" : "off"}</span>
                </button>
              </div>
              {speechSettingsOpen && (
                <div role="dialog" aria-modal="true" aria-label={lang === "en" ? "Voice settings" : "语音设置"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                  <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-clinic-blue">{lang === "en" ? "Voice settings" : "语音设置"}</h4>
                      <button type="button" onClick={() => setSpeechSettingsOpen(false)} className="rounded-md px-2 py-1 text-sm hover:bg-clinic-paper" aria-label={lang === "en" ? "Close" : "关闭"}>×</button>
                    </div>
                    <label className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{lang === "en" ? "Read patient replies" : "自动朗读患者回答"}</span><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /></label>
                    <label className="mt-4 block text-sm"><span>{lang === "en" ? "Provider" : "语音来源"}</span><select value={speechProvider} onChange={(event) => setSpeechProvider(event.target.value as SpeechProvider)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2"><option value="browser">{lang === "en" ? "Browser / system voice" : "浏览器/系统语音"}</option><option value="disabled">{lang === "en" ? "Disabled" : "关闭"}</option><option value="azure" disabled>{lang === "en" ? "Azure Speech (not configured)" : "Azure Speech（未配置）"}</option></select></label>
                    <label className="mt-4 block text-sm"><span>{lang === "en" ? "Voice" : "音色"}</span><select value={speechVoiceName} onChange={(event) => setSpeechVoiceName(event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2">{speechVoices.map((voice) => <option key={voice.voiceURI} value={voice.name}>{voice.name}</option>)}</select></label>
                    {!speechVoices.length && <p className="mt-2 text-xs text-amber-700">{lang === "en" ? "No matching system voice was found. Install a Chinese or English voice in system settings." : "未找到匹配的系统音色，请在系统设置中安装中文语音。"}</p>}
                    <label className="mt-4 block text-sm"><span>{lang === "en" ? "Rate" : "语速"} {speechRate.toFixed(2)}</span><input className="mt-2 w-full" type="range" min="0.8" max="1.15" step="0.01" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} /></label>
                    <label className="mt-4 block text-sm"><span>{lang === "en" ? "Pitch" : "音调"} {speechPitch.toFixed(2)}</span><input className="mt-2 w-full" type="range" min="0.85" max="1.1" step="0.01" value={speechPitch} onChange={(event) => setSpeechPitch(Number(event.target.value))} /></label>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => speak(lang === "en" ? "Hello doctor, I can hear you clearly." : "医生您好，我能听清您的问题。", true)} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-3 py-2 text-sm text-white"><Volume2 size={15} />{lang === "en" ? "Test" : "试听"}</button>
                      {speechState === "speaking" ? <button type="button" onClick={pauseSpeech} className="rounded-md border border-clinic-line p-2" title={lang === "en" ? "Pause" : "暂停"}><Pause size={16} /></button> : <button type="button" onClick={resumeSpeech} disabled={speechState !== "paused"} className="rounded-md border border-clinic-line p-2 disabled:opacity-50" title={lang === "en" ? "Resume" : "继续"}><Play size={16} /></button>}
                      <button type="button" onClick={stopSpeech} className="rounded-md border border-clinic-line p-2" title={lang === "en" ? "Stop" : "停止"}><Square size={16} /></button>
                      <button type="button" onClick={() => lastSpokenText && speak(lastSpokenText, true)} disabled={!lastSpokenText} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm"><RotateCcw size={15} />{lang === "en" ? "Replay" : "重播"}</button>
                    </div>
                    <p className="mt-3 text-xs text-clinic-muted">{lang === "en" ? `Status: ${speechState}` : `状态：${speechState === "speaking" ? "朗读中" : speechState === "paused" ? "已暂停" : "已关闭"}`}</p>
                  </section>
                </div>
              )}
              {(sessionInitLoading || sessionInitError) && (
                <div className={`mt-3 rounded-md px-3 py-2 text-sm ${sessionInitError ? "bg-amber-50 text-amber-800" : "bg-clinic-paper text-clinic-muted"}`}>
                  {sessionInitLoading
                    ? (lang === "en" ? "AI patient is preparing..." : "AI患者正在准备中……")
                    : (lang === "en" ? "AI is temporarily unavailable. Answers are currently provided by the rule library." : "AI暂时不可用，当前为规则库回答。")}
                </div>
              )}
              <div ref={chatScrollRef} className="mt-4 h-[390px] space-y-4 overflow-y-auto rounded-md border border-clinic-line bg-clinic-paper p-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] whitespace-pre-line rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "student" ? "bg-clinic-blue text-white" : "bg-white text-clinic-ink"}`}>{message.text}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitQuestion(); }} className="min-w-[220px] flex-1 rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder={t(lang, "inputQuestion")} />
                <button type="button" onClick={startVoiceInput} disabled={!speechInputSupported || listening} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue disabled:opacity-50">
                  {listening ? <MicOff size={16} /> : <Mic size={16} />} {t(lang, "voiceAsk")}
                </button>
                <button onClick={() => void submitQuestion()} disabled={patientReplyLoading || sessionInitLoading} className="inline-flex items-center gap-2 rounded-md bg-clinic-teal px-4 py-2 font-medium text-white hover:bg-clinic-blue disabled:cursor-not-allowed disabled:opacity-60">
                  <Send size={16} /> {patientReplyLoading ? t(lang, "generating") : t(lang, "send")}
                </button>
              </div>
              {lastTechnicalFailure && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span>{lang === "en" ? "The last AI request failed; the displayed reply came from fallback rules." : "上次AI调用失败，当前显示的是规则库回答。"}</span>
                  <button type="button" onClick={() => void retryTechnicalReply()} disabled={patientReplyLoading} className="shrink-0 font-medium underline disabled:opacity-50">{lang === "en" ? "Retry technical request" : "重新生成回答"}</button>
                </div>
              )}
              <label className="mt-5 block">
                <span className="font-medium">{t(lang, "historySummary")}</span>
                <textarea value={answers.historySummary} onChange={(event) => updateAnswer("historySummary", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
            </div>
          )}

          {activeStageNo === 2 && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold">Investigation Agent: physical examination</h3>
                <div className="mt-4 space-y-4">
                  {physicalGroups.map((group) => (
                    <section key={group.category} className="rounded-md border border-clinic-line p-4">
                      <h4 className="font-medium text-clinic-blue">{group.category}</h4>
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
              </section>

              <section className="border-t border-clinic-line pt-5">
                <h3 className="text-lg font-semibold">Investigation Agent: orders and reports</h3>
                <div className="mt-4 flex flex-wrap gap-2 border-b border-clinic-line pb-3">
                  {orderPrimaryTabs.map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveOrderTab(tab)} className={`rounded-md px-4 py-2 text-sm font-medium ${activeOrderTab === tab ? "bg-clinic-blue text-white" : "border border-clinic-line bg-white text-clinic-muted hover:border-clinic-blue"}`}>
                      {tab === "检验" ? t(lang, "labs") : tab === "检查" ? t(lang, "imaging") : tab === "病理/操作" ? t(lang, "procedures") : t(lang, "perioperativeOrders")}
                    </button>
                  ))}
                </div>
                {!isOsce && orderPackages.length > 0 && (
                  <section className="mt-4 rounded-md border border-clinic-line bg-clinic-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="font-medium text-clinic-blue">常用医嘱套餐</h4>
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
                <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} className="mt-4 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" placeholder={t(lang, "orderSearch")} />
                <div className="mt-4 space-y-5">
                  {orderGroups.map((group) => (
                    <section key={group.category} className="rounded-md border border-clinic-line p-4">
                      <h4 className="font-medium text-clinic-blue">{group.category}</h4>
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
                  <button onClick={() => submitOrder()} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">{t(lang, "orderAndReturn")}</button>
                  <button onClick={submitSelectedOrders} className="rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue">{t(lang, "selectedOrderResults")}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {orderLogs.map((log) => (
                    <div key={log.id} className="rounded-md border border-clinic-line p-3">
                      <p className="text-sm font-medium text-clinic-blue">{log.input}</p>
                      <p className="mt-1 text-xs text-clinic-muted">
                        {lang === "en" ? "Placed" : "开具时间"}：{shortTime(log.placedAt || log.at)}
                        {log.returnedAt ? ` · ${lang === "en" ? "Returned" : "返回时间"}：${shortTime(log.returnedAt)}` : ""}
                        {` · Agent ${log.stageNo || 2}`}
                      </p>
                      {log.matchedOrders.length > 0 && <p className="mt-1 text-xs text-clinic-muted">已识别医嘱：{log.matchedOrders.map((item) => item.displayName).join("；")}</p>}
                      {log.duplicateOrderIds && log.duplicateOrderIds.length > 0 && <p className="mt-1 text-xs text-amber-800">重复医嘱不会重复计入效率得分。</p>}
                      <p className="mt-1 text-sm text-clinic-muted">{log.message}</p>
                      {log.status === "ordered" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-clinic-paper"><div className="h-full w-1/2 animate-pulse rounded-full bg-clinic-teal" /></div>}
                      {log.results.map((item, index) => <ReportCard key={`${log.id}-${index}`} item={item} />)}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeStageNo === 3 && (
            <div className="space-y-4">
              <label className="block"><span className="font-medium">{t(lang, "diagnosis")}</span><input value={answers.diagnosis} onChange={(event) => updateAnswer("diagnosis", event.target.value)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "diagnosticEvidence")}</span><textarea value={answers.diagnosticEvidence} onChange={(event) => updateAnswer("diagnosticEvidence", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "differentials")}</span><textarea value={answers.differentials} onChange={(event) => updateAnswer("differentials", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "differentialAnalysis")}</span><textarea value={answers.differentialAnalysis} onChange={(event) => updateAnswer("differentialAnalysis", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "confirmatoryTests")}</span><textarea value={answers.confirmatoryTests} onChange={(event) => updateAnswer("confirmatoryTests", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStageNo === 4 && (
            <div>
              <div className="mt-2 flex flex-wrap gap-3">
                {["需要会诊", "暂不需要会诊"].map((item) => (
                  <label key={item} className="flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2">
                    <input type="radio" name="consultNeeded" checked={answers.consultNeeded === item} onChange={() => updateAnswer("consultNeeded", item)} />
                    {lang === "en" ? (item === "需要会诊" ? "Consultation needed" : "No consultation for now") : item}
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
              <label className="mt-4 block"><span className="font-medium">{t(lang, "consultPurpose")}</span><textarea value={answers.consultPurpose} onChange={(event) => updateAnswer("consultPurpose", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="mt-4 block"><span className="font-medium">{t(lang, "consultQuestions")}</span><textarea value={answers.consultQuestions} onChange={(event) => updateAnswer("consultQuestions", event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="mt-4 block"><span className="font-medium">{t(lang, "consultSummary")}</span><textarea value={answers.consultSummary} onChange={(event) => updateAnswer("consultSummary", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <button onClick={startMdt} className="mt-4 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">{t(lang, "startMdt")}</button>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {mdtOpinions.map((item) => (
                  <div key={item.department} className="rounded-md border border-clinic-line p-3 text-sm leading-6">
                    <p className="font-medium text-clinic-blue">{item.department}</p>
                    <p className="mt-1">{item.opinion}</p>
                    {item.neededInfo && <p className="mt-2"><span className="font-medium">还需信息：</span>{item.neededInfo}</p>}
                    {item.suggestedHandling && <p><span className="font-medium">处理建议：</span>{item.suggestedHandling}</p>}
                    {item.riskReminder && <p className="text-amber-800"><span className="font-medium">风险提醒：</span>{item.riskReminder}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStageNo === 5 && (
            <div className="space-y-4">
              <label className="block"><span className="font-medium">{t(lang, "treatmentImmediate")}</span><textarea value={answers.immediateTreatment} onChange={(event) => updateAnswer("immediateTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">入院初始处理</span><textarea value={answers.admissionTreatment} onChange={(event) => updateAnswer("admissionTreatment", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "treatmentDefinitive")}</span><textarea value={answers.definitiveTreatment} onChange={(event) => updateAnswer("definitiveTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "mdtRevisedPlan")}</span><textarea value={answers.mdtRevisedPlan} onChange={(event) => updateAnswer("mdtRevisedPlan", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">随访复查与患者教育</span><textarea value={`${answers.followUp}\n${answers.patientEducation}`.trim()} onChange={(event) => {
                const [followUp, ...education] = event.target.value.split("\n");
                updateAnswer("followUp", followUp ?? "");
                updateAnswer("patientEducation", education.join("\n"));
              }} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
            </div>
          )}

          {activeStageNo === 6 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t(lang, "perioperativeTitle")}</h3>
              <p className="text-sm leading-6 text-clinic-muted">{t(lang, "perioperativeFields")}</p>
              <textarea value={answers.perioperativePreparation} onChange={(event) => updateAnswer("perioperativePreparation", event.target.value)} rows={12} className="w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
            </div>
          )}

          {activeStageNo === 7 && (
            <div>
              <h3 className="text-lg font-semibold">{t(lang, "debriefTitle")}</h3>
              <label className="mt-4 block">
                <span className="font-medium">学习反思 / Reflection</span>
                <textarea value={answers.debriefReflection} onChange={(event) => updateAnswer("debriefReflection", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
              <div className="mt-5">{finalReport && <FinalReport report={finalReport} />}</div>
              <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
                <h4 className="font-semibold">{t(lang, "timeline")}</h4>
                <div className="mt-3 max-h-[360px] space-y-3 overflow-auto">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-md bg-white p-3 text-sm leading-6">
                      <p className="font-medium text-clinic-blue">{shortTime(item.at)} · Agent {item.stageNo} · {item.label}</p>
                      <p className="mt-1 text-clinic-muted">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h4 className="font-semibold text-clinic-blue">{t(lang, "studentRecords")}</h4>
                  <FormattedText text={[
                    `History: ${answers.historySummary}`,
                    `Exam: ${answers.physicalExam}`,
                    `Orders: ${answers.selectedOrders.join("；")}；${answers.customOrders}`,
                    `Diagnosis: ${answers.diagnosis}`,
                    `Differentials: ${answers.differentials}`,
                    `MDT: ${answers.consultDepartments.join("；")}；${answers.consultPurpose}`,
                    `Treatment: ${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}`,
                    `Perioperative: ${answers.perioperativePreparation}`,
                    `Follow-up: ${answers.followUp}；${answers.patientEducation}`
                  ].join("\n")} />
                </div>
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h4 className="font-semibold text-clinic-blue">{t(lang, "standardPath")}</h4>
                  <FormattedText text={display.standardPath} />
                </div>
              </section>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-clinic-line pt-4">
            {activeStageNo === 7 ? (
              <button disabled={Boolean(finalReport)} onClick={completeTraining} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle2 size={16} /> {lang === "en" ? "Finish training and generate final report" : "完成训练并生成最终报告"}
              </button>
            ) : (
              <button disabled={Boolean(activeEvaluation)} onClick={submitStage} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle2 size={16} /> {t(lang, "submitStage")}
              </button>
            )}
            {activeEvaluation && activeStageNo !== 7 && (
              <button onClick={() => {
                const next = nextStage(activeStageNo);
                if (next) openStage(next);
              }} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-4 py-2 font-medium hover:border-clinic-blue">
                <ClipboardList size={16} /> {t(lang, "nextStage")}
              </button>
            )}
          </div>

          {showStageFeedback && activeEvaluation && <FeedbackBox evaluation={activeEvaluation} lang={lang} />}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "trainingState")}</h2>
            <div className="mt-3 space-y-2 text-sm text-clinic-muted">
              <p>{isOsce ? t(lang, "osceMode") : t(lang, "freeTraining")}</p>
              {isOsce && <p>{formatDuration(osceTimeLeft)}</p>}
              <p>Agent {activeStageNo}: {activeAgent.agentName[lang]}</p>
              <p>{Object.keys(submitted).length} / 7 {t(lang, "completed")}</p>
              <p>{lang === "en" ? "Save status" : "保存状态"}：{saveStatus === "saved" ? (lang === "en" ? "Saved" : "已自动保存") : saveStatus === "saving" ? (lang === "en" ? "Saving" : "保存中") : (lang === "en" ? "Save failed" : "保存失败")}</p>
              <p className="pt-2 text-xs leading-5">{t(lang, "teachingOnly")}</p>
            </div>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "obtainedData")}</h2>
            <div className="mt-3 space-y-3 text-sm text-clinic-muted">
              <p>{lang === "en" ? "Questions" : "已问问题"}: {acquiredStats.questions}</p>
              <p>{lang === "en" ? "Patient replies" : "患者回答"}: {acquiredStats.patientAnswers}</p>
              <p>{lang === "en" ? "Physical exams" : "已查体项目"}: {acquiredStats.exams}</p>
              <p>{lang === "en" ? "Orders" : "已开医嘱"}: {acquiredStats.orders}</p>
              <p>{lang === "en" ? "Reports returned" : "已返回报告"}: {acquiredStats.reports}</p>
            </div>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "timeline")}</h2>
            <div className="mt-3 space-y-3">
              {(timeline.length ? timeline.slice(-6).reverse() : []).map((item) => (
                <div key={item.id} className="rounded-md bg-clinic-paper p-3 text-xs leading-5">
                  <p className="font-medium text-clinic-blue">{shortTime(item.at)} · Agent {item.stageNo} · {item.label}</p>
                  <p className="mt-1 line-clamp-3 text-clinic-muted">{item.detail}</p>
                </div>
              ))}
              {!timeline.length && <p className="text-sm text-clinic-muted">暂无操作记录。</p>}
            </div>
          </section>
          {isOsce && activeEvaluation && activeStageNo !== 7 && (
            <section className="rounded-lg border border-clinic-line bg-white p-5 text-sm leading-6 text-clinic-muted">
              OSCE 模式下阶段反馈将在最终复盘统一显示。
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
