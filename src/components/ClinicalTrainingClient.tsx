"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
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
import consultCatalogJson from "@/data/consult_catalog.json";
import i18nEnJson from "@/data/i18n/en.json";
import i18nZhJson from "@/data/i18n/zh.json";
import orderCatalogImagingJson from "@/data/order_catalog_imaging.json";
import orderCatalogLabsJson from "@/data/order_catalog_labs.json";
import orderCatalogPerioperativeJson from "@/data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "@/data/order_catalog_procedures.json";
import physicalExamItemsJson from "@/data/physical_exam_items.json";
import { simplifiedChiefComplaint } from "@/src/lib/chiefComplaint";
import { ApiRequestError, createIdempotencyKey, createRequestId, fetchWithRecovery, requestJson, studentFacingApiMessage } from "@/src/lib/apiClient";
import { publicApiConfig } from "@/src/lib/apiConfig";
import { isConnectionFailureFallback, isSafetyFallback, mergeRecoveredCoverage, recordConnectionTransition, validCachedSession, type AiConnectionStatus, type CachedPatientSession, type ConnectionTransition } from "@/src/lib/aiRecovery";
import { initializeStorageVersion, readJsonStorage, writeJsonStorage } from "@/src/lib/safeStorage";
import { attemptPointerKey, attemptStorageKey, createAttempt, legacyTrainingStateStorageKey, trainingStateStorageKey, type AttemptIdentity, type AttemptMode } from "@/src/lib/attemptState";
import {
  AZURE_VOICE_BY_PROFILE,
  cleanSpeechText,
  detectReplyLocale,
  profileForCase,
  selectBestVoice,
  voicePreferenceKey,
  type ManualVoiceOverride,
  type TtsPlaybackState,
  type TtsProviderPreference
} from "@/src/lib/tts";
import type { Evaluator360Report, ExamResultLog, FullProcessAnswers, MdtOpinion, OrderResultLog, StageEvaluation } from "@/src/lib/trainingContracts";
import type {
  ChatMessage,
  CollectedMap,
  ConsultCatalogItem,
  KeyPointId,
  OrderCatalogItem,
  PhysicalExamItem
} from "@/src/lib/types";
import FormattedText from "./FormattedText";

type TrainingMode = "free" | "osce" | "demo" | "rct" | "random";
type LanguageCode = "zh" | "en";
type AiMode = "deepseek" | "rule" | "debug";
type AiStatus = AiConnectionStatus;
type AgentStageNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type StudentVisibleCase = {
  id: string;
  displayCaseId?: string;
  studentChiefComplaint: string;
  chiefComplaint: string;
  chiefComplaintEn?: string;
  age: string;
  sex: string;
  sexEn?: string;
  difficulty?: string;
};
type TimelineEvent = {
  id: string;
  stageNo: AgentStageNo;
  type: "ask" | "answer" | "technical" | "exam" | "order" | "result" | "diagnosis" | "mdt" | "treatment" | "perioperative" | "submit" | "timeout";
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
  generationSource?: "live_ai" | "ai_cache" | "rule_fallback" | "safety_boundary" | "mock";
  factSource?: string;
  matchedFacts?: string[];
  answerSource?: string;
  confidence?: number;
  fallbackReason?: string;
  debug?: Record<string, unknown>;
};

type SessionInitResponse = CachedPatientSession & {
  cacheHit: boolean;
  debug?: Record<string, unknown>;
};
type ServiceHealth = {
  status: string;
  deploymentTier: string;
  gitSha: string;
  deploymentSha?: string;
  patientServiceConfigured: boolean;
  trainingStateConfigured: boolean;
  durableAttemptStoreConfigured?: boolean;
  cloudTtsConfigured: boolean;
  allowedOriginConfigured: boolean;
  apiVersion: string;
};

type TrainingFailureReason = "session_initializing" | "attempt_not_found" | "token_expired" | "token_missing" | "stage_mismatch" | "network_error" | "configuration_error" | "origin_mismatch" | "rate_limit" | "state_mismatch" | "request_error";

function trainingFailureReason(error: unknown): TrainingFailureReason {
  const code = error instanceof ApiRequestError ? error.code : "";
  const kind = error instanceof ApiRequestError ? error.kind : "request";
  if (/attempt_not_found/.test(code)) return "attempt_not_found";
  if (/expired_attempt_token/.test(code)) return "token_expired";
  if (/training_state_token_missing/.test(code)) return "token_missing";
  if (/invalid_stage|stage_not_unlocked/.test(code)) return "stage_mismatch";
  if (/training_attempt_store_unavailable|training_state_secret_(?:missing|weak|placeholder|reused)/.test(code)) return "configuration_error";
  if (/origin_not_allowed/.test(code)) return "origin_mismatch";
  if (/rate_limited/.test(code) || kind === "rate-limited") return "rate_limit";
  if (/invalid_attempt_token|invalid_attempt_token_claims|unsupported_attempt_token_version|stale_attempt_token|attempt_already_(?:completed|exists)|idempotency_key_reused|attempt_(?:state|language|mode|case|id)_mismatch/.test(code)) return "state_mismatch";
  if (/network_error/.test(code) || ["network", "offline", "timeout"].includes(kind)) return "network_error";
  return "request_error";
}

function stageSubmissionFailureMessage(error: unknown, language: LanguageCode) {
  const reason = trainingFailureReason(error);
  if (reason === "configuration_error") {
    return language === "en"
      ? "The training record service is not configured, so this stage cannot be submitted. Ask an administrator to configure the Preview attempt store and retry."
      : "训练记录服务未配置，当前无法提交阶段。请管理员完成 Preview 持久存储配置后重试。";
  }
  if (reason === "attempt_not_found") {
    return language === "en"
      ? "The training session record is no longer available. Reinitialize the training session before submitting."
      : "训练会话记录已失效，请重新初始化训练会话后再提交。";
  }
  if (reason === "token_expired") {
    return language === "en"
      ? "This training attempt has expired. Start a new attempt before submitting."
      : "本次训练凭据已过期，请重新开始训练后再提交。";
  }
  if (reason === "token_missing") {
    return language === "en"
      ? "The training session response did not include a valid credential. Reinitialize the training session before submitting."
      : "训练会话响应缺少有效凭据，请重新初始化训练会话后再提交。";
  }
  if (reason === "stage_mismatch") {
    return language === "en"
      ? "The submitted stage does not match the server stage. Refresh to restore the current stage."
      : "提交阶段与服务端当前阶段不一致，请刷新页面恢复后重试。";
  }
  if (reason === "network_error") {
    return language === "en"
      ? "Network connection failed while initializing the training session. Check the network and retry initialization."
      : "初始化训练会话时网络连接失败，请检查网络后重新初始化。";
  }
  if (reason === "origin_mismatch") {
    return language === "en"
      ? "This Preview is connected to a mismatched training API. Refresh after the Preview redeploys."
      : "当前 Preview 连接了不匹配的训练API，请在 Preview 重新部署后刷新页面。";
  }
  if (reason === "rate_limit") {
    return language === "en" ? "Training requests are temporarily rate-limited. Wait briefly and retry." : "训练请求暂时受限，请稍候再试。";
  }
  if (reason === "state_mismatch") {
    return language === "en"
      ? "The training state changed. Refresh the page to restore the latest valid stage, then retry."
      : "训练状态已变化，请刷新页面恢复最新有效阶段后重试。";
  }
  return language === "en" ? "Stage submission failed. Please retry." : "阶段提交失败，请重试。";
}
type PendingFailedQuestion = {
  question: string;
  patientMessageIndex: number;
  fallbackReason: string;
};
type PendingHistoryLog = {
  question: string;
  requestId: string;
  attempts: number;
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

const agents = (agentsJson as AgentConfig[]).sort((a, b) => a.stageNo - b.stageNo);
const i18n = { zh: i18nZhJson as Record<string, string>, en: i18nEnJson as Record<string, string> };
const orderCatalog = [
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const consultCatalog = consultCatalogJson as ConsultCatalogItem[];
const orderPrimaryTabs = ["检验", "检查", "病理/操作", "围术期评估"];
const labSecondaryOrder = ["尿液基础", "尿液感染", "尿液肿瘤", "尿液蛋白/肾小球线索", "血液基础", "炎症感染", "凝血/输血", "肾内免疫", "结石代谢", "大便/全身鉴别"];
const imagingSecondaryOrder = ["超声", "X线", "CT", "MRI", "内镜", "核医学", "功能检查"];
const consultGroupOrder = ["外科", "内科", "辅助/平台", "急诊/危重"];
const PATIENT_REPLY_TIMEOUT_MS = 12000;
const EXPECTED_API_VERSION = "2.6.0";
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
  "癌栓",
  "淋巴结",
  "化疗",
  "放疗",
  "the diagnosis is",
  "you have cancer",
  "ct shows",
  "pathology shows",
  "the treatment is",
  "you need surgery"
];

function isUnsafePatientReply(question: string, reply: string, language: LanguageCode) {
  const compactQuestion = question.replace(/\s+/g, "");
  const compactReply = reply.replace(/\s+/g, "");
  if (!reply.trim()) return true;
  if (patientReplyForbiddenTerms.some((term) => reply.includes(term))) return true;
  if (language === "en" && /[\u3400-\u9fff]/.test(reply)) return true;
  if (compactReply.length > 600) return true;

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

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

const collectedKeys: KeyPointId[] = ["onset", "hematuriaType", "hematuriaPhase", "colorClots", "irritativeSymptoms", "flankPain", "fever", "voidingDifficulty", "smoking", "occupation", "stoneHistory", "infectionHistory", "trauma", "anticoagulants", "tumorFamilyHistory", "historyBundle"];
const canonicalToCollected: Record<string, KeyPointId> = {
  hematuria_onset: "onset", hematuria_visibility: "hematuriaType", hematuria_phase: "hematuriaPhase",
  urine_color: "colorClots", clots: "colorClots", dysuria: "irritativeSymptoms", urinary_frequency: "irritativeSymptoms",
  urinary_urgency: "irritativeSymptoms", flank_pain: "flankPain", renal_colic: "flankPain", fever_chills: "fever",
  voiding_difficulty: "voidingDifficulty", retention: "voidingDifficulty", smoking: "smoking", occupation_exposure: "occupation",
  stone_history: "stoneHistory", uti_history: "infectionHistory", triggers: "trauma", anticoagulant: "anticoagulants",
  antiplatelet: "anticoagulants", family_history: "tumorFamilyHistory", past_history: "historyBundle",
  medications: "historyBundle", general_condition: "historyBundle", gynecologic_contamination: "historyBundle",
  glomerular_features: "historyBundle", recent_uri: "historyBundle", bleeding_tendency: "historyBundle"
};

function createEmptyCollected(): CollectedMap {
  return Object.fromEntries(collectedKeys.map((key) => [key, false])) as CollectedMap;
}

function collectedFromSlots(current: CollectedMap, slots: string[]) {
  const next = { ...current };
  slots.forEach((slot) => { const key = canonicalToCollected[slot]; if (key) next[key] = true; });
  return next;
}

function nowEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortTime(iso: string, lang: LanguageCode) {
  return new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" });
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

function stageScoreKey(stageNo: AgentStageNo) {
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

function patientOpening(caseData: StudentVisibleCase, lang: LanguageCode) {
  const complaint = simplifiedChiefComplaint(caseData.studentChiefComplaint || caseData.chiefComplaint, lang, caseData.chiefComplaintEn);
  if (lang === "en") return `Hello doctor. I came because of ${complaint || "abnormal urine color"}.`;
  return `医生您好，我是因为${complaint || "小便颜色异常"}来看病的。`;
}

function caseDisplay(caseData: StudentVisibleCase, lang: LanguageCode) {
  return {
    title: lang === "en" ? `Training case ${caseData.displayCaseId || caseData.id}` : `训练病例 ${caseData.displayCaseId || caseData.id}`,
    age: caseData.age,
    sex: lang === "en" ? caseData.sexEn || (caseData.sex === "女" ? "Female" : "Male") : caseData.sex,
    difficulty: caseData.difficulty || "",
    chiefComplaint: simplifiedChiefComplaint(caseData.studentChiefComplaint || caseData.chiefComplaint, lang, caseData.chiefComplaintEn)
  };
}

function groupPhysicalExamItems() {
  const grouped = new Map<string, PhysicalExamItem[]>();
  physicalExamItems.forEach((item) => grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]));
  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
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

function aiSessionCacheKey(attemptId: string, caseId: string, language: LanguageCode, mode: TrainingMode) {
  return `hematuria-ai-patient-session-${attemptId}-${caseId}-${language}-${mode}`;
}

async function requestSessionInit({ caseId, runtimeMode, language, debug, attemptId, trainingStateToken, forceRefresh = false, signal }: {
  caseId: string;
  runtimeMode: TrainingMode;
  language: LanguageCode;
  debug: boolean;
  attemptId: string;
  trainingStateToken: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}) {
  return requestJson<SessionInitResponse>(publicApiConfig.sessionInit, { caseId, attemptId, mode: runtimeMode, language, debug, forceRefresh }, {
    timeoutMs: PATIENT_REPLY_TIMEOUT_MS, retries: 2, signal,
    idempotencyKey: `${attemptId}:session-init:${forceRefresh ? Date.now() : "default"}`,
    endpointName: "session-init",
    headers: { "X-Training-State": trainingStateToken }
  });
}

async function requestAiPatientReply({ sessionId, caseId, question, messages, askedSlots, aiMode, runtimeMode, language, attemptId, signal, recoveryCycle = "default" }: {
  sessionId?: string;
  caseId: string;
  question: string;
  messages: ChatMessage[];
  askedSlots: string[];
  aiMode: AiMode;
  runtimeMode: TrainingMode;
  language: LanguageCode;
  attemptId: string;
  signal?: AbortSignal;
  recoveryCycle?: string;
}) {
  return requestJson<PatientReplyApiResponse>(publicApiConfig.patientAgent, {
        caseId,
        agentId: "standardized_patient",
        sessionId,
        attemptId,
        sessionMode: runtimeMode,
        stage: "history",
        mode: aiMode === "rule" ? "rule" : aiMode === "debug" ? "debug" : "training",
        language,
        studentInput: question,
        conversationHistory: messages.slice(-6).map((message) => ({ role: message.role, text: message.text })),
        askedSlotIds: askedSlots,
        askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text)
      }, { timeoutMs: PATIENT_REPLY_TIMEOUT_MS, retries: 2, signal, endpointName: "patient-reply", idempotencyKey: createIdempotencyKey(attemptId, "patient", recoveryCycle, question.trim().toLowerCase()) });
}

async function probeAiPatient({ caseId, sessionId, attemptId, mode, language, signal }: { caseId: string; sessionId: string; attemptId: string; mode: TrainingMode; language: LanguageCode; signal?: AbortSignal }) {
  return requestJson<PatientReplyApiResponse>(publicApiConfig.patientAgent, {
    caseId, sessionId, attemptId, mode, language, agentId: "standardized_patient", probe: true
  }, { timeoutMs: 8000, retries: 1, signal, endpointName: "patient-probe", idempotencyKey: createIdempotencyKey(attemptId, "patient-probe") });
}

async function requestTrainingAction<T>(body: Record<string, unknown>, stateToken = "", idempotencyKey = "", retries = 2): Promise<{ payload: T; stateToken: string }> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), PATIENT_REPLY_TIMEOUT_MS);
  try {
    const response = await fetchWithRecovery(publicApiConfig.trainingAction, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(stateToken ? { "X-Training-State": stateToken } : {}), ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}) },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(body),
      timeoutMs: PATIENT_REPLY_TIMEOUT_MS,
      retries
    });
    const nextStateToken = String(response.headers.get("X-Training-State") || "").trim();
    if (!nextStateToken) throw new ApiRequestError("request", 502, "training_state_token_missing", idempotencyKey);
    return { payload: await response.json() as T, stateToken: nextStateToken };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function formatReportLines(text: string) {
  return (text || "").split(/\n|；/).map((line) => line.trim()).filter(Boolean);
}

function ReportCard({ item, lang }: { item: OrderResultLog["results"][number]; lang: LanguageCode }) {
  const lines = formatReportLines(item.result);
  const rawStatus = item.status || item.abnormalLevel || "";
  const statusKey = rawStatus.toLowerCase();
  const needsReview = /待审核|需审核|needs.review|review/.test(statusKey);
  const abnormal = /异常|阳性|升高|降低|abnormal|positive|high|low|critical/.test(statusKey);
  const normal = /正常|阴性|normal|negative/.test(statusKey);
  const statusLabel = rawStatus || t(lang, "simulatedReport");
  const statusClass = needsReview ? "ui-status-warning" : abnormal ? "ui-status-danger" : normal ? "ui-status-success" : "ui-status-info";
  return (
    <article data-testid="report-card" data-status={needsReview ? "needs-review" : abnormal ? "abnormal" : normal ? "normal" : "reported"} className="mt-3 rounded-xl border border-clinic-line bg-white p-4 text-sm leading-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-clinic-blue">{item.orderCategory}</p>
        <span className={`ui-status ${statusClass}`}>
          {needsReview ? <AlertTriangle size={14} aria-hidden="true" /> : abnormal ? <CircleAlert size={14} aria-hidden="true" /> : normal ? <CircleCheck size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
          {statusLabel}
        </span>
      </div>
      {(item.value || item.unit || item.referenceRange) && (
        <dl className="mt-3 grid gap-2 rounded-lg bg-clinic-paper p-3 sm:grid-cols-3">
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Value" : "结果"}</dt><dd className="mt-0.5 font-semibold text-clinic-ink">{item.value || "—"}</dd></div>
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Unit" : "单位"}</dt><dd className="mt-0.5 text-clinic-ink">{item.unit || "—"}</dd></div>
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Reference range" : "参考范围"}</dt><dd className="mt-0.5 text-clinic-ink">{item.referenceRange || "—"}</dd></div>
        </dl>
      )}
      <div className="mt-3 grid gap-2">
        {(lines.length ? lines : [item.result]).map((line) => (
          <p key={line} className="rounded-lg bg-clinic-paper px-3 py-2">{line}</p>
        ))}
      </div>
      {item.impression && <p className="mt-3 border-l-2 border-clinic-blue pl-3"><span className="font-semibold">{lang === "en" ? "Impression" : "印象"}：</span>{item.impression}</p>}
      {item.teachingExplanation && <p className="mt-3 text-xs leading-5 text-clinic-muted">{t(lang, "releaseRule")}：{item.teachingExplanation}</p>}
    </article>
  );
}

function FeedbackBox({ evaluation, lang }: { evaluation: StageEvaluation; lang: LanguageCode }) {
  return (
    <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-clinic-blue">{t(lang, "stageFeedback")}</h3>
        <div className="flex items-center gap-2">
          {evaluation.practiceOnly && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{lang === "en" ? "Practice-only feedback" : "仅练习反馈"}</span>}
          <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-clinic-blue">{evaluation.score}/{evaluation.max}</span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6">{evaluation.comment}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-emerald-800"><CircleCheck size={16} aria-hidden="true" />{t(lang, "hitItems")}</p>
          <p className="mt-2 text-clinic-muted">{evaluation.hits.join("；") || t(lang, "none")}</p>
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} aria-hidden="true" />{t(lang, "missingRiskItems")}</p>
          <p className="mt-2 text-clinic-muted">{[...evaluation.misses, ...evaluation.warnings].join("；") || t(lang, "none")}</p>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-clinic-blue">{t(lang, "standardReference")}</summary>
        <FormattedText text={evaluation.standardAnswer} />
      </details>
    </section>
  );
}

function FinalReport({ report, lang }: { report: Evaluator360Report; lang: LanguageCode }) {
  const strengths = report.items.filter((item) => item.max > 0 && item.score / item.max >= 0.8).map((item) => item.label);
  const priorities = report.items.filter((item) => item.criticalErrors.length || item.misses.length || item.improvements.length).map((item) => item.label);
  return (
    <section data-testid="final-report" className="rounded-xl border border-clinic-line bg-white p-5 print:border-0 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-clinic-blue">{t(lang, "competencyProfile")}</h3>
          <p className="text-sm text-clinic-muted">{t(lang, "reportBasis")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => window.print()} className="no-print rounded-md border border-clinic-line px-3 py-2 text-sm font-medium hover:border-clinic-blue">{t(lang, "printReport")}</button>
          <div className="text-3xl font-semibold text-clinic-blue">{report.total}<span className="text-base text-clinic-muted"> / {report.max}</span></div>
        </div>
      </div>
      {report.redFlags.length > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p className="mb-1 inline-flex items-center gap-2 font-semibold"><CircleAlert size={16} aria-hidden="true" />{lang === "en" ? "Safety-critical omissions" : "危险遗漏与安全提醒"}</p>
          {report.redFlags.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
          <h4 className="inline-flex items-center gap-2 font-semibold text-emerald-900"><CircleCheck size={17} aria-hidden="true" />{lang === "en" ? "Relative strengths" : "相对强项"}</h4>
          <p className="mt-2 text-sm leading-6 text-emerald-950">{strengths.join(lang === "en" ? ", " : "、") || (lang === "en" ? "No domain has reached the strong-performance threshold yet." : "目前尚无分项达到强项阈值。")}</p>
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <h4 className="inline-flex items-center gap-2 font-semibold text-amber-950"><AlertTriangle size={17} aria-hidden="true" />{lang === "en" ? "Priority improvements" : "优先改进"}</h4>
          <p className="mt-2 text-sm leading-6 text-amber-950">{priorities.slice(0, 4).join(lang === "en" ? ", " : "、") || (lang === "en" ? "Maintain the current approach." : "保持当前操作方法。")}</p>
        </section>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report.items.map((item) => {
          const pct = Math.round((item.score / item.max) * 100);
          return (
            <div key={item.label} className="break-inside-avoid rounded-lg border border-clinic-line p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.label}</p>
                <span className="text-sm text-clinic-blue">{item.score}/{item.max}</span>
              </div>
              <div role="progressbar" aria-label={`${item.label} ${item.score}/${item.max}`} aria-valuemin={0} aria-valuemax={item.max} aria-valuenow={item.score} className="mt-3 h-2 overflow-hidden rounded-full bg-clinic-paper">
                <div className="h-full rounded-full bg-clinic-teal" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-clinic-muted">{item.comment}</p>
              <div className="mt-3 space-y-1 text-xs leading-5 text-clinic-muted">
                <p><span className="font-medium text-clinic-ink">{t(lang, "didWell")}：</span>{item.evidence.join("；") || t(lang, "noEvidence")}</p>
                <p><span className="font-medium text-clinic-ink">{t(lang, "needsMore")}：</span>{item.misses.slice(0, 5).join("；") || t(lang, "noMissing")}</p>
                {item.sequenceIssues.length > 0 && <p><span className="font-medium text-amber-800">{t(lang, "sequenceIssues")}：</span>{item.sequenceIssues.join("；")}</p>}
                {item.overuse.length > 0 && <p><span className="font-medium text-amber-800">{t(lang, "overuse")}：</span>{item.overuse.join("；")}</p>}
                {item.criticalErrors.length > 0 && <p className="rounded-md bg-rose-50 px-2 py-1 text-rose-900"><span className="font-semibold">{t(lang, "criticalErrors")}：</span>{item.criticalErrors.join("；")}</p>}
                <p><span className="font-medium text-clinic-ink">{t(lang, "nextAdvice")}：</span>{item.improvements.join("；") || (lang === "en" ? "Maintain the current approach and improve communication efficiency." : "保持当前操作并进一步提高表达效率。")}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-md bg-clinic-paper p-4">
        <p className="font-medium text-clinic-blue">{t(lang, "clinicalSafetyAlerts")}</p>
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
  const [caseData] = useState<StudentVisibleCase>(initialCaseData);
  const [runtimeMode, setRuntimeMode] = useState<TrainingMode>(mode);
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [attempt, setAttempt] = useState<AttemptIdentity>(() => createAttempt(initialCaseData.id, "free", "zh"));
  const [attemptReady, setAttemptReady] = useState(false);
  const [activeStageNo, setActiveStageNo] = useState<AgentStageNo>(1);
  const [answers, setAnswers] = useState<FullProcessAnswers>(emptyAnswers);
  const [submitted, setSubmitted] = useState<Partial<Record<AgentStageNo, StageEvaluation>>>({});
  const [finalReport, setFinalReport] = useState<Evaluator360Report | null>(null);
  const [previousAttemptScore, setPreviousAttemptScore] = useState<number | null>(null);
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
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speechSettingsOpen, setSpeechSettingsOpen] = useState(false);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [manualVoiceOverrides, setManualVoiceOverrides] = useState<Record<string, ManualVoiceOverride>>({});
  const [speechRate, setSpeechRate] = useState(0.92);
  const [speechPitch, setSpeechPitch] = useState(1);
  const [speechState, setSpeechState] = useState<TtsPlaybackState>("idle");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechProvider, setSpeechProvider] = useState<TtsProviderPreference>("auto");
  const [speechPreferencesReady, setSpeechPreferencesReady] = useState(false);
  const [speechNeedsGesture, setSpeechNeedsGesture] = useState(false);
  const [speechGestureDismissed, setSpeechGestureDismissed] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState("");
  const [aiMode, setAiMode] = useState<AiMode>("deepseek");
  const [aiStatus, setAiStatus] = useState<AiStatus>("unknown");
  const previousAiStatusRef = useRef<AiStatus>("unknown");
  const connectionTransitionsRef = useRef<ConnectionTransition[]>([]);
  const [aiSessionId, setAiSessionId] = useState("");
  const [sessionInitLoading, setSessionInitLoading] = useState(false);
  const [sessionInitError, setSessionInitError] = useState("");
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null);
  const [healthResolved, setHealthResolved] = useState(false);
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [pendingFailedQuestion, setPendingFailedQuestion] = useState<PendingFailedQuestion | null>(null);
  const [reconnectNotice, setReconnectNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [storageWarning, setStorageWarning] = useState("");
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [trainingAttemptStatus, setTrainingAttemptStatus] = useState<"initializing" | "ready" | "failed">("initializing");
  const [trainingAttemptError, setTrainingAttemptError] = useState("");
  const [pendingHistoryLogs, setPendingHistoryLogs] = useState<PendingHistoryLog[]>([]);
  const [logSyncStatus, setLogSyncStatus] = useState<"idle" | "pending" | "verified" | "failed">("idle");
  const [logRetryNonce, setLogRetryNonce] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatComposerRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedToBottomRef = useRef(true);
  const [chatHasNewMessage, setChatHasNewMessage] = useState(false);
  const [chatComposerReserve, setChatComposerReserve] = useState(148);
  const ensureMobileComposerVisible = useCallback(() => {
    if (window.innerWidth >= 640) return;
    const composer = chatComposerRef.current;
    if (!composer) return;
    const rect = composer.getBoundingClientRect();
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
    if (rect.bottom > viewportBottom - 8) window.scrollBy(0, rect.bottom - viewportBottom + 8);
    else if (rect.top < viewportTop + 8) window.scrollBy(0, rect.top - viewportTop - 8);
  }, []);
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudAudioUrlRef = useRef("");
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speechGenerationRef = useRef(0);
  const ttsFallbackNotifiedRef = useRef(false);
  const timeoutHandledRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const trainingStateTokenRef = useRef<{ attemptId: string; token: string } | null>(null);
  const trainingInitPromiseRef = useRef<{ attemptId: string; promise: Promise<string> } | null>(null);
  const trainingInitFailureRef = useRef<{ attemptId: string; error: unknown } | null>(null);
  const stageProgressRef = useRef({ activeStageNo, hasSubmittedStages: Object.keys(submitted).length > 0 });
  stageProgressRef.current = { activeStageNo, hasSubmittedStages: Object.keys(submitted).length > 0 };
  const trainingActionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionInitAbortRef = useRef<AbortController | null>(null);
  const autoSessionInitRef = useRef<{ key: string; promise: Promise<SessionInitResponse>; controller: AbortController } | null>(null);
  const patientReplyAbortRef = useRef<AbortController | null>(null);
  const patientSubmitLockRef = useRef(false);
  const stageSubmitLockRef = useRef(false);
  const historyLogSyncRef = useRef(false);
  const historyLogRetryTimerRef = useRef(0);
  const historyLogRetryWaitingRef = useRef(false);
  const aiGenerationRef = useRef(0);
  const reconnectPromiseRef = useRef<Promise<boolean> | null>(null);
  const practiceDeployment = process.env.NEXT_PUBLIC_DEPLOYMENT_TIER !== "formal";

  useEffect(() => {
    const previous = previousAiStatusRef.current;
    const next = aiStatus;
    if (previous === next) return;
    connectionTransitionsRef.current = recordConnectionTransition(connectionTransitionsRef.current, previous, next);
    const event = connectionTransitionsRef.current.at(-1);
    if (event) console.info("ai_connection_transition", event);
    previousAiStatusRef.current = next;
  }, [aiStatus]);
  const isOsce = !practiceDeployment && runtimeMode === "osce";
  const osceLocked = isOsce && osceTimeLeft === 0;
  const display = caseDisplay(caseData, lang);
  const voiceProfile = useMemo(() => profileForCase(lang, caseData?.sex || initialCaseData.sex, caseData?.age || initialCaseData.age), [caseData?.age, caseData?.sex, initialCaseData.age, initialCaseData.sex, lang]);
  const voiceKey = voicePreferenceKey(voiceProfile);
  const selectedBrowserVoice = useMemo(
    () => selectBestVoice(speechVoices, { ...voiceProfile, manualOverride: manualVoiceOverrides[voiceKey] }),
    [manualVoiceOverrides, speechVoices, voiceKey, voiceProfile]
  );
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

  const ensureTrainingStateToken = useCallback(async (forceRetry = false) => {
    const attemptId = attempt.attemptId;
    if (trainingStateTokenRef.current?.attemptId === attemptId) {
      setTrainingAttemptStatus("ready");
      setTrainingAttemptError("");
      return trainingStateTokenRef.current.token;
    }
    if (trainingInitPromiseRef.current?.attemptId === attemptId) return trainingInitPromiseRef.current.promise;
    if (!forceRetry && trainingInitFailureRef.current?.attemptId === attemptId) throw trainingInitFailureRef.current.error;
    if (forceRetry && trainingInitFailureRef.current?.attemptId === attemptId) trainingInitFailureRef.current = null;
    setTrainingAttemptStatus("initializing");
    setTrainingAttemptError("");
    const promise = (async () => {
      const storageKey = trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin);
      const legacyStorageKey = legacyTrainingStateStorageKey(attempt.attemptId);
      let saved = "";
      try { saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem(legacyStorageKey) || ""; } catch { /* Continue with a fresh in-memory token. */ }
      if (saved) {
        try {
          const validationId = createIdempotencyKey(attemptId, "training-validate", caseData.id, runtimeMode, lang);
          const validated = await requestTrainingAction<{ currentStage: number; status: string }>({
            action: "validate-attempt", caseId: caseData.id, attemptId,
            language: lang, mode: runtimeMode, requestId: validationId
          }, saved, validationId, 0);
          trainingStateTokenRef.current = { attemptId, token: validated.stateToken };
          trainingInitFailureRef.current = null;
          try {
            sessionStorage.setItem(storageKey, validated.stateToken);
            sessionStorage.removeItem(legacyStorageKey);
          } catch { /* The validated token can continue in memory. */ }
          setTrainingAttemptStatus("ready");
          return validated.stateToken;
        } catch (error) {
          const reason = trainingFailureReason(error);
          const safeStageOneRecovery = stageProgressRef.current.activeStageNo === 1 && !stageProgressRef.current.hasSubmittedStages
            && ["attempt_not_found", "token_expired", "state_mismatch"].includes(reason);
          if (!safeStageOneRecovery) throw error;
          try {
            sessionStorage.removeItem(storageKey);
            sessionStorage.removeItem(legacyStorageKey);
          } catch { /* Recovery can continue in memory. */ }
        }
      }
      const initRequestId = createIdempotencyKey(attempt.attemptId, "training-init", caseData.id, runtimeMode, lang);
      const initialized = await requestTrainingAction<{ attemptId: string }>({
        action: "init-attempt", caseId: caseData.id, attemptId: attempt.attemptId,
        language: lang, mode: runtimeMode, requestId: initRequestId
      }, "", initRequestId, 0);
      trainingStateTokenRef.current = { attemptId, token: initialized.stateToken };
      trainingInitFailureRef.current = null;
      setTrainingAttemptStatus("ready");
      try {
        sessionStorage.setItem(storageKey, initialized.stateToken);
        sessionStorage.removeItem(legacyStorageKey);
      } catch { /* Memory fallback. */ }
      return initialized.stateToken;
    })().catch((error) => {
      const reason = trainingFailureReason(error);
      console.warn("training_attempt_initialization_failed", { reason });
      trainingInitFailureRef.current = { attemptId, error };
      setTrainingAttemptStatus("failed");
      setTrainingAttemptError(stageSubmissionFailureMessage(error, lang));
      throw error;
    });
    const pending = { attemptId, promise };
    trainingInitPromiseRef.current = pending;
    promise.finally(() => {
      if (trainingInitPromiseRef.current === pending) trainingInitPromiseRef.current = null;
    }).catch(() => undefined);
    return promise;
  }, [attempt.attemptId, caseData.id, lang, runtimeMode]);

  useEffect(() => {
    if (!attemptReady) return;
    void ensureTrainingStateToken().catch(() => undefined);
  }, [attemptReady, ensureTrainingStateToken]);

  async function trainingAction<T>(body: Record<string, unknown>): Promise<T> {
    const run = trainingActionQueueRef.current.then(async () => {
      const requestId = String(body.requestId || createRequestId(String(body.action || "training")));
      const requestBody = { ...body, requestId, caseId: caseData.id, attemptId: attempt.attemptId, language: lang, mode: runtimeMode };
      let token = await ensureTrainingStateToken();
      let result: { payload: T; stateToken: string };
      try {
        result = await requestTrainingAction<T>(requestBody, token, requestId, body.action === "history-log" ? 0 : 2);
      } catch (error) {
        const recoverableMissingAttempt = error instanceof ApiRequestError
          && error.code === "attempt_not_found"
          && body.action === "stage-feedback"
          && body.stageKey === "history";
        if (!recoverableMissingAttempt) throw error;
        trainingStateTokenRef.current = null;
        trainingInitPromiseRef.current = null;
        setTrainingAttemptStatus("initializing");
        setTrainingAttemptError("");
        try {
          sessionStorage.removeItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin));
          sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
        } catch { /* Recovery can continue in memory. */ }
        token = await ensureTrainingStateToken(true);
        result = await requestTrainingAction<T>(requestBody, token, requestId, 0);
      }
      trainingStateTokenRef.current = { attemptId: attempt.attemptId, token: result.stateToken };
      try {
        sessionStorage.setItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin), result.stateToken);
        sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
      } catch { /* Memory fallback. */ }
      return result.payload;
    });
    trainingActionQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }

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
    const targetLang: LanguageCode = savedLang === "en" ? "en" : "zh";
    setLang(targetLang);
    if (savedAiMode === "deepseek" || savedAiMode === "rule" || savedAiMode === "debug") setAiMode(savedAiMode);
    const urlMode = new URLSearchParams(window.location.search).get("mode");
    const requestedMode: TrainingMode = urlMode === "random" ? "random" : urlMode === "osce" ? "osce" : urlMode === "rct" ? "rct" : mode;
    const targetMode: TrainingMode = practiceDeployment && (requestedMode === "osce" || requestedMode === "rct") ? "free" : requestedMode;
    setRuntimeMode(targetMode);
    const attemptMode: AttemptMode = targetMode === "osce" ? "osce" : targetMode === "rct" ? "rct" : "free";
    const pointer = attemptPointerKey(initialCaseData.id, attemptMode, targetLang);
    const savedAttempt = readJsonStorage<AttemptIdentity | null>(pointer, null).value;
    const activeAttempt = savedAttempt?.schemaVersion === "attempt-v3"
      ? savedAttempt
      : createAttempt(initialCaseData.id, attemptMode, targetLang);
    setAttempt(activeAttempt);
    writeJsonStorage(pointer, activeAttempt);
    setSpeechInputSupported(Boolean(getSpeechRecognition()));
    setSpeechOutputSupported("Audio" in window || "speechSynthesis" in window);
    const savedSpeech = readJsonStorage<{
      enabled?: boolean;
      provider?: TtsProviderPreference;
      manualOverrides?: Record<string, ManualVoiceOverride>;
      rate?: number;
      pitch?: number;
    }>("hematuria-speech-preferences", { enabled: true, provider: "auto", manualOverrides: {}, rate: 0.92, pitch: 1 }).value;
    setAutoSpeak(savedSpeech.enabled !== false);
    setManualVoiceOverrides(savedSpeech.manualOverrides || {});
    setSpeechRate(Math.min(1.15, Math.max(0.8, Number(savedSpeech.rate) || 0.92)));
    setSpeechPitch(Math.min(1.1, Math.max(0.85, Number(savedSpeech.pitch) || 1)));
    setSpeechProvider(savedSpeech.provider === "disabled" || savedSpeech.provider === "browser" ? savedSpeech.provider : "auto");
    setSpeechPreferencesReady(true);

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
      pendingHistoryLogs?: PendingHistoryLog[];
      osceTimeLeft?: number;
    }>(attemptStorageKey(activeAttempt), {});
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
    if (saved.pendingHistoryLogs) setPendingHistoryLogs(saved.pendingHistoryLogs);
    if (typeof saved.osceTimeLeft === "number") setOsceTimeLeft(saved.osceTimeLeft);
    setAttemptReady(true);
  }, [initialCaseData.id, mode, practiceDeployment]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void requestJson<ServiceHealth>(publicApiConfig.health, undefined, { method: "GET", timeoutMs: 7000, retries: 1, signal: controller.signal, endpointName: "health" })
      .then((health) => { if (!cancelled) { setServiceHealth(health); setHealthCheckFailed(false); } })
      .catch(() => { if (!cancelled) setHealthCheckFailed(true); })
      .finally(() => { if (!cancelled) setHealthResolved(true); });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    const handleOffline = () => { setAiStatus("offline"); setReconnectNotice(lang === "en" ? "You are offline. Existing training records are preserved." : "当前处于离线状态，既有训练记录已保留。"); };
    const handleOnline = () => { setAiStatus((current) => current === "offline" ? "unknown" : current); setReconnectNotice(lang === "en" ? "Network restored. You can reconnect AI." : "网络已恢复，可以重新连接AI。"); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (!navigator.onLine) handleOffline();
    return () => { window.removeEventListener("offline", handleOffline); window.removeEventListener("online", handleOnline); };
  }, [lang]);

  useEffect(() => {
    if (!attemptReady) return;
    setMessages((current) => current.length ? current : [{ role: "patient", text: patientOpening(caseData, lang) }]);
  }, [attemptReady, caseData, lang]);

  useEffect(() => {
    if (!attemptReady || !healthResolved) return;
    let cancelled = false;
    const generation = ++aiGenerationRef.current;
    const cacheKey = aiSessionCacheKey(attempt.attemptId, caseData.id, lang, runtimeMode);
    const cached = readJsonStorage<SessionInitResponse | null>(cacheKey, null).value;
    const expectedDeploymentSha = serviceHealth?.deploymentSha || serviceHealth?.gitSha;
    if (validCachedSession(cached, { attemptId: attempt.attemptId, caseId: caseData.id, language: lang, mode: runtimeMode, deploymentSha: expectedDeploymentSha && expectedDeploymentSha !== "unknown" ? expectedDeploymentSha : undefined, apiVersion: EXPECTED_API_VERSION })) {
      setAiSessionId(cached.sessionId);
      setAiStatus(cached.aiStatus === "degraded" ? "degraded" : "unknown");
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: cached.patientOpeningStatement || patientOpening(caseData, lang) }];
      });
      return;
    }
    try { localStorage.removeItem(cacheKey); } catch { /* Session continues in memory. */ }
    if (!navigator.onLine) { setAiStatus("offline"); return; }
    setSessionInitLoading(true);
    setSessionInitError("");
    setAiStatus("checking");
    const requestKey = `${attempt.attemptId}:${caseData.id}:${lang}:${runtimeMode}:${aiMode}`;
    let request = autoSessionInitRef.current;
    if (!request || request.key !== requestKey) {
      request?.controller.abort();
      const controller = new AbortController();
      request = {
        key: requestKey,
        controller,
        promise: ensureTrainingStateToken().then((trainingStateToken) => requestSessionInit({
          caseId: caseData.id,
          runtimeMode,
          language: lang,
          debug: aiMode === "debug",
          attemptId: attempt.attemptId,
          trainingStateToken,
          signal: controller.signal
        }))
      };
      autoSessionInitRef.current = request;
      request.promise.finally(() => {
        if (autoSessionInitRef.current === request) autoSessionInitRef.current = null;
      }).catch(() => undefined);
    }
    void request.promise.then((result) => {
      if (cancelled || generation !== aiGenerationRef.current) return;
      setAiSessionId(result.sessionId);
      setAiStatus(result.aiStatus === "degraded" ? "degraded" : "unknown");
      writeJsonStorage(cacheKey, result);
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: result.patientOpeningStatement || patientOpening(caseData, lang) }];
      });
    }).catch((error) => {
      if (cancelled || request.controller.signal.aborted || generation !== aiGenerationRef.current) return;
      const kind = error instanceof ApiRequestError ? error.kind : "patient-service";
      setSessionInitError(studentFacingApiMessage(kind, lang));
      setAiStatus(kind === "offline" ? "offline" : "error");
    }).finally(() => {
      if (!cancelled) setSessionInitLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [aiMode, attempt.attemptId, attemptReady, caseData, ensureTrainingStateToken, healthResolved, lang, runtimeMode, serviceHealth?.apiVersion, serviceHealth?.deploymentSha, serviceHealth?.gitSha]);

  useEffect(() => {
    try { localStorage.setItem("hematuria-language", lang); } catch { setStorageWarning("语言偏好无法保存。 "); }
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);

  useEffect(() => {
    if (trainingStateTokenRef.current?.attemptId !== attempt.attemptId) trainingStateTokenRef.current = null;
    if (trainingInitPromiseRef.current?.attemptId !== attempt.attemptId) trainingInitPromiseRef.current = null;
    if (trainingInitFailureRef.current?.attemptId !== attempt.attemptId) trainingInitFailureRef.current = null;
    setTrainingAttemptStatus("initializing");
    setTrainingAttemptError("");
    trainingActionQueueRef.current = Promise.resolve();
  }, [attempt.attemptId]);

  useEffect(() => {
    if (!attemptReady || !pendingHistoryLogs.length || historyLogSyncRef.current || historyLogRetryWaitingRef.current) return;
    const pending = pendingHistoryLogs[0];
    if (pending.attempts >= 3) {
      setLogSyncStatus("failed");
      return;
    }
    let cancelled = false;
    historyLogSyncRef.current = true;
    setLogSyncStatus("pending");
    void trainingAction<{ recorded: boolean }>({ action: "history-log", question: pending.question, requestId: pending.requestId })
      .then(() => {
        if (cancelled) return;
        setPendingHistoryLogs((current) => current.filter((item) => item.requestId !== pending.requestId));
        setLogSyncStatus("verified");
        globalThis.setTimeout(() => setLogSyncStatus((current) => current === "verified" ? "idle" : current), 1600);
      })
      .catch(() => {
        if (cancelled) return;
        const attempts = pending.attempts + 1;
        setPendingHistoryLogs((current) => current.map((item) => item.requestId === pending.requestId ? { ...item, attempts } : item));
        if (attempts < 3) {
          historyLogRetryWaitingRef.current = true;
          historyLogRetryTimerRef.current = window.setTimeout(() => {
            historyLogRetryWaitingRef.current = false;
            setLogRetryNonce((value) => value + 1);
          }, [500, 1200, 2500][attempts - 1]);
        } else {
          setLogSyncStatus("failed");
        }
      })
      .finally(() => { historyLogSyncRef.current = false; });
    return () => {
      cancelled = true;
      historyLogSyncRef.current = false;
    };
  // trainingAction is serialized internally; retries are keyed by the persisted requestId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptReady, logRetryNonce, pendingHistoryLogs]);

  useEffect(() => {
    try { localStorage.setItem("hematuria-ai-mode", aiMode); } catch { setStorageWarning("回答来源偏好无法保存。 "); }
    setAiStatus(aiMode === "rule" ? "degraded" : "unknown");
  }, [aiMode]);

  useEffect(() => {
    if (!attemptReady) return;
    setSaveStatus("saving");
    const result = writeJsonStorage(attemptStorageKey(attempt), {
      attempt,
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
      pendingHistoryLogs,
      osceTimeLeft
    });
    setSaveStatus(result.ok ? "saved" : "error");
    if (!result.ok) setStorageWarning("自动保存失败，请勿关闭页面；可在浏览器释放存储空间后重试。 ");
  }, [activeStageNo, answers, askedSlots, attempt, attemptReady, collected, examLogs, finalReport, mdtOpinions, messages, orderLogs, osceTimeLeft, pendingHistoryLogs, submitted, timeline]);

  useEffect(() => {
    if (!isOsce || activeStageNo === 7 || finalReport) return;
    const timer = window.setInterval(() => setOsceTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [activeStageNo, finalReport, isOsce]);

  useEffect(() => {
    if (!osceLocked || timeoutHandledRef.current || finalReport) return;
    timeoutHandledRef.current = true;
    const at = new Date().toISOString();
    const timeoutEvent = { eventId: `${attempt.attemptId}-timeout`, type: "timeout" as const, stageNo: activeStageNo, at, text: "OSCE timer reached 00:00" };
    setTimeline((current) => current.some((item) => item.type === "timeout") ? current : [...current, { id: timeoutEvent.eventId, stageNo: activeStageNo, type: "timeout", label: "OSCE timeout", detail: timeoutEvent.text || "timeout", at }]);
    void trainingAction<Evaluator360Report>({ action: "score" })
      .then((report) => { setFinalReport(report); setActiveStageNo(7); })
      .catch(() => setStorageWarning(lang === "en" ? "Automatic timeout submission failed; responses remain locked." : "超时自动交卷失败，作答仍保持锁定。"));
  // The timeout transition is deliberately keyed only to identity/timer state and runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageNo, attempt.attemptId, caseData.id, finalReport, lang, osceLocked]);

  useEffect(() => {
    if (!timeline.length || finalReport) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [finalReport, timeline.length]);

  useLayoutEffect(() => {
    if (activeStageNo !== 1) return;
    const panel = chatScrollRef.current;
    if (!panel) return;
    const openingOnly = messages.length === 1 && messages[0]?.role === "patient";
    if (openingOnly) chatPinnedToBottomRef.current = true;
    if (chatPinnedToBottomRef.current) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollTo({ top: panel.scrollHeight, behavior: reduceMotion || openingOnly ? "auto" : "smooth" });
      setChatHasNewMessage(false);
    } else if (messages.length > 1) {
      setChatHasNewMessage(true);
    }
  }, [activeStageNo, chatComposerReserve, ensureMobileComposerVisible, messages, patientReplyLoading]);

  useEffect(() => {
    if (activeStageNo !== 1) return;
    const composer = chatComposerRef.current;
    if (!composer) return;
    const updateReserve = () => {
      const next = Math.ceil(composer.getBoundingClientRect().height);
      setChatComposerReserve((current) => current === next ? current : next);
    };
    updateReserve();
    const observer = new ResizeObserver(updateReserve);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [activeStageNo, lang]);

  useEffect(() => {
    if (activeStageNo !== 1 || messages.length !== 1 || messages[0]?.role !== "patient") return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(ensureMobileComposerVisible);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeStageNo, chatComposerReserve, ensureMobileComposerVisible, lang, messages]);

  useEffect(() => {
    const handleViewportResize = () => {
      if (!chatComposerRef.current?.contains(document.activeElement)) return;
      window.requestAnimationFrame(ensureMobileComposerVisible);
    };
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    window.addEventListener("resize", handleViewportResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [ensureMobileComposerVisible]);

  useEffect(() => {
    if (!speechSettingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpeechSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [speechSettingsOpen]);

  useEffect(() => {
    if (!speechOutputSupported) return;
    const loadVoices = () => {
      setSpeechVoices("speechSynthesis" in window ? window.speechSynthesis.getVoices() : []);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [caseData?.id, caseData?.sex, lang, speechOutputSupported]);

  useEffect(() => {
    if (!speechPreferencesReady) return;
    writeJsonStorage("hematuria-speech-preferences", { enabled: autoSpeak, provider: speechProvider, manualOverrides: manualVoiceOverrides, rate: speechRate, pitch: speechPitch });
  }, [autoSpeak, manualVoiceOverrides, speechPitch, speechPreferencesReady, speechProvider, speechRate]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    ttsAbortRef.current?.abort();
    sessionInitAbortRef.current?.abort();
    autoSessionInitRef.current?.controller.abort();
    if (historyLogRetryTimerRef.current) window.clearTimeout(historyLogRetryTimerRef.current);
    historyLogRetryWaitingRef.current = false;
    patientReplyAbortRef.current?.abort();
    aiGenerationRef.current += 1;
    cloudAudioRef.current?.pause();
    if (cloudAudioUrlRef.current) URL.revokeObjectURL(cloudAudioUrlRef.current);
  }, []);

  function addTimeline(type: TimelineEvent["type"], label: string, detail: string, stageNo: AgentStageNo = activeStageNo) {
    setTimeline((current) => [...current, { id: nowEventId(), stageNo, type, label, detail, at: new Date().toISOString() }]);
  }

  function setLanguage(next: LanguageCode) {
    if (next === lang) return;
    if (timeline.length > 0 && !window.confirm(next === "en" ? "Switching language starts a separate attempt. Continue?" : "切换语言将开始独立训练记录，是否继续？")) return;
    const attemptMode: AttemptMode = runtimeMode === "osce" ? "osce" : runtimeMode === "rct" ? "rct" : "free";
    const nextAttempt = createAttempt(caseData.id, attemptMode, next);
    autoSessionInitRef.current?.controller.abort();
    autoSessionInitRef.current = null;
    sessionInitAbortRef.current?.abort();
    patientReplyAbortRef.current?.abort();
    aiGenerationRef.current += 1;
    trainingStateTokenRef.current = null;
    trainingInitPromiseRef.current = null;
    trainingActionQueueRef.current = Promise.resolve();
    setAttempt(nextAttempt);
    writeJsonStorage(attemptPointerKey(caseData.id, attemptMode, next), nextAttempt);
    setLang(next);
    setActiveStageNo(1);
    setAnswers(emptyAnswers);
    setSubmitted({});
    setFinalReport(null);
    setAskedSlots([]);
    setCollected(createEmptyCollected());
    setExamLogs([]);
    setOrderLogs([]);
    setMdtOpinions([]);
    setTimeline([]);
    setOsceTimeLeft(20 * 60);
    setAiSessionId("");
    setPendingFailedQuestion(null);
    setReconnectNotice("");
    window.dispatchEvent(new CustomEvent("hematuria-language-change", { detail: next }));
    setMessages([{ role: "patient", text: patientOpening(caseData, next) }]);
  }

  function updateAnswer<K extends keyof FullProcessAnswers>(key: K, value: FullProcessAnswers[K]) {
    if (osceLocked) return;
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function stopSpeech(nextState: TtsPlaybackState = "idle") {
    speechGenerationRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (cloudAudioRef.current) {
      cloudAudioRef.current.pause();
      cloudAudioRef.current.src = "";
      cloudAudioRef.current = null;
    }
    if (cloudAudioUrlRef.current) {
      URL.revokeObjectURL(cloudAudioUrlRef.current);
      cloudAudioUrlRef.current = "";
    }
    setSpeechState(nextState);
  }

  function speechStateLabel() {
    const labels: Record<TtsPlaybackState, { zh: string; en: string }> = {
      idle: { zh: "空闲", en: "Idle" }, loading: { zh: "正在准备语音", en: "Preparing audio" },
      playing: { zh: "朗读中", en: "Speaking" }, paused: { zh: "已暂停", en: "Paused" },
      "fallback-browser": { zh: "云语音失败，使用浏览器语音", en: "Cloud failed; using browser voice" },
      "fallback-text": { zh: "仅文字模式", en: "Text only" }, failed: { zh: "语音失败", en: "Audio failed" }
    };
    return labels[speechState][lang];
  }

  function speakWithBrowser(clean: string, locale: "zh-CN" | "en-US", generation: number) {
    if (!("speechSynthesis" in window)) {
      setSpeechState("fallback-text");
      return false;
    }
    const profile = { ...voiceProfile, locale };
    const key = voicePreferenceKey(profile);
    const voice = selectBestVoice(speechVoices, { ...profile, manualOverride: manualVoiceOverrides[key] });
    if (!voice) {
      setSpeechState("fallback-text");
      return false;
    }
    const segments = clean.split(/(?<=[。！？!?])/).map((item) => item.trim()).filter(Boolean);
    setSpeechState("loading");
    segments.forEach((segment, index) => {
      const utterance = new SpeechSynthesisUtterance(segment);
      utterance.lang = locale;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;
      utterance.voice = voice;
      if (index === 0) utterance.onstart = () => {
        if (speechGenerationRef.current === generation) setSpeechState("fallback-browser");
      };
      if (index === segments.length - 1) utterance.onend = () => {
        if (speechGenerationRef.current === generation) setSpeechState("idle");
      };
      utterance.onerror = () => {
        if (speechGenerationRef.current === generation) {
          setSpeechState("fallback-text");
          setSpeechNeedsGesture(true);
        }
      };
      window.speechSynthesis.speak(utterance);
    });
    return true;
  }

  async function speak(text: string, force = false) {
    stopSpeech();
    if (!speechOutputSupported || speechProvider === "disabled" || (!autoSpeak && !force)) return;
    const clean = cleanSpeechText(text);
    if (!clean) return;
    const locale = detectReplyLocale(clean, voiceProfile.locale);
    setLastSpokenText(clean);
    const generation = speechGenerationRef.current;

    if (speechProvider === "auto") {
      setSpeechNotice("");
      setSpeechState("loading");
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      try {
        const response = await fetchWithRecovery(publicApiConfig.tts, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text: clean,
            voiceName: AZURE_VOICE_BY_PROFILE[voicePreferenceKey({ ...voiceProfile, locale })],
            rate: speechRate,
            pitch: speechPitch,
            sessionId: aiSessionId,
            attemptId: attempt.attemptId,
            caseId: caseData.id,
            language: lang,
            mode: runtimeMode
          }),
          timeoutMs: 10_000,
          retries: 2
        });
        const blob = await response.blob();
        if (speechGenerationRef.current !== generation) return;
        const url = URL.createObjectURL(blob);
        cloudAudioUrlRef.current = url;
        const audio = new Audio(url);
        cloudAudioRef.current = audio;
        audio.onplay = () => speechGenerationRef.current === generation && setSpeechState("playing");
        audio.onpause = () => speechGenerationRef.current === generation && !audio.ended && setSpeechState("paused");
        audio.onended = () => speechGenerationRef.current === generation && stopSpeech();
        audio.onerror = () => speechGenerationRef.current === generation && speakWithBrowser(clean, locale, generation);
        await audio.play();
        return;
      } catch (error) {
        if (controller.signal.aborted || speechGenerationRef.current !== generation) return;
        const browserFallback = speakWithBrowser(clean, locale, generation);
        if (!ttsFallbackNotifiedRef.current) {
          setSpeechNotice(browserFallback
            ? (lang === "en" ? "Cloud audio is unavailable; browser voice is being used." : "云语音暂时不可用，已切换为浏览器语音。")
            : (lang === "en" ? "Audio is unavailable; continuing in text-only mode." : "语音暂时不可用，已切换为仅文字模式。"));
          ttsFallbackNotifiedRef.current = true;
        }
        if (!browserFallback && error instanceof DOMException && error.name === "NotAllowedError") setSpeechNeedsGesture(true);
        return;
      }
    }
    speakWithBrowser(clean, locale, generation);
  }

  function pauseSpeech() { cloudAudioRef.current?.pause(); if ("speechSynthesis" in window) window.speechSynthesis.pause(); setSpeechState("paused"); }
  function resumeSpeech() { if (cloudAudioRef.current) void cloudAudioRef.current.play(); else if ("speechSynthesis" in window) window.speechSynthesis.resume(); setSpeechState("playing"); }

  async function submitQuestion(textOverride?: string) {
    if (osceLocked) return;
    const text = (textOverride ?? question).trim();
    if (!text || patientReplyLoading || patientSubmitLockRef.current) return;
    if (!aiSessionId) {
      setReconnectNotice(t(lang, "aiPreparing"));
      return;
    }
    patientSubmitLockRef.current = true;
    stopSpeech();
    setPatientReplyLoading(true);
    patientReplyAbortRef.current?.abort();
    const controller = new AbortController();
    patientReplyAbortRef.current = controller;
    const generation = ++aiGenerationRef.current;
    const ruleSafeFallback = lang === "en"
      ? "Doctor, could you ask that more specifically? I am not quite sure what you mean."
      : "医生，您能问得再具体一点吗？我不太明白您的意思。";
    let answerText = ruleSafeFallback;
    let matchedSlots: string[] = [];
    let matchedKeys: KeyPointId[] = [];
    let matchedFacts: string[] = [];
    let pendingReason = "";
    try {
      const aiResult = await requestAiPatientReply({
        sessionId: aiSessionId,
        caseId: caseData.id,
        question: text,
        messages,
        askedSlots,
        aiMode,
        runtimeMode,
        language: lang,
        attemptId: attempt.attemptId,
        signal: controller.signal
      });
      if (generation !== aiGenerationRef.current) return;
      const safeAiReply = aiResult.replyText && !isUnsafePatientReply(text, aiResult.replyText, lang);
      answerText = safeAiReply ? aiResult.replyText : ruleSafeFallback;
      matchedSlots = safeAiReply ? aiResult.matchedSlotIds || [] : [];
      matchedFacts = safeAiReply ? aiResult.matchedFacts || [] : [];
      matchedKeys = unique(matchedSlots.map((slot) => canonicalToCollected[slot]).filter(Boolean)) as KeyPointId[];
      if (safeAiReply && !aiResult.isFallback) {
        setAiStatus("connected");
        setPendingFailedQuestion(null);
        setReconnectNotice("");
      } else if (isConnectionFailureFallback(aiResult.fallbackReason)) {
        pendingReason = aiResult.fallbackReason || "provider_unavailable";
        setAiStatus("degraded");
        setReconnectNotice(lang === "en" ? "Current answer came from the rule fallback." : "当前由规则库回答，可随时重新连接AI。");
      } else if (isSafetyFallback(aiResult.fallbackReason)) {
        setAiStatus((current) => current === "connected" ? current : "unknown");
      } else {
        setAiStatus((current) => current === "connected" ? current : "degraded");
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== aiGenerationRef.current) return;
      const kind = error instanceof ApiRequestError ? error.kind : "patient-service";
      pendingReason = kind;
      setAiStatus(kind === "offline" ? "offline" : "error");
      setReconnectNotice(studentFacingApiMessage(kind, lang));
    } finally {
      patientSubmitLockRef.current = false;
      if (generation === aiGenerationRef.current) setPatientReplyLoading(false);
    }
    if (generation !== aiGenerationRef.current) return;
    const nextCollected = collectedFromSlots(collected, matchedSlots);
    const nextAskedSlots = unique([...askedSlots, ...(matchedSlots ?? [])]);
    const patientMessageIndex = messages.length + 1;
    const nextMessages: ChatMessage[] = [...messages, { role: "student", text }, { role: "patient", text: answerText, matchedKeys, matchedSlots, matchedFacts }];
    if (pendingReason) {
      setPendingFailedQuestion({ question: text, patientMessageIndex, fallbackReason: pendingReason });
    }
    setMessages(nextMessages);
    setCollected(nextCollected);
    setAskedSlots(nextAskedSlots);
    setQuestion("");
    addTimeline("ask", lang === "en" ? "Student question" : "学生提问", text, 1);
    addTimeline("answer", lang === "en" ? "Patient answer" : "患者回答", answerText, 1);
    void speak(answerText);
    const requestId = createRequestId("history-log");
    setPendingHistoryLogs((current) => current.some((item) => item.requestId === requestId)
      ? current
      : [...current, { question: text, requestId, attempts: 0 }]);
    setLogSyncStatus("pending");
  }

  function applyRecoveredReply(aiResult: PatientReplyApiResponse, pending: PendingFailedQuestion, eventLabel: string) {
    if (!aiResult.replyText || aiResult.isFallback || isUnsafePatientReply(pending.question, aiResult.replyText, lang)) return false;
    const matchedSlots = aiResult.matchedSlotIds || [];
    const matchedFacts = aiResult.matchedFacts || [];
    const matchedKeys = unique(matchedSlots.map((slot) => canonicalToCollected[slot]).filter(Boolean)) as KeyPointId[];
    setMessages((current) => current.map((message, index) => index === pending.patientMessageIndex && message.role === "patient"
      ? { ...message, text: aiResult.replyText, matchedKeys, matchedSlots, matchedFacts }
      : message));
    setAskedSlots((current) => mergeRecoveredCoverage(current, collected, matchedSlots, canonicalToCollected).askedSlots);
    setCollected((current) => mergeRecoveredCoverage(askedSlots, current, matchedSlots, canonicalToCollected).collected);
    setAiStatus("connected");
    setSessionInitError("");
    setPendingFailedQuestion(null);
    setReconnectNotice(lang === "en" ? "AI reconnected" : "已重新连接AI");
    globalThis.setTimeout(() => setReconnectNotice((current) => /AI reconnected|已重新连接AI/.test(current) ? "" : current), 1800);
    addTimeline("technical", eventLabel, lang === "en" ? "The failed patient reply was replaced without duplicating the question." : "已替换失败患者回答，未重复提问或计分。", 1);
    void speak(aiResult.replyText);
    return true;
  }

  function reconnectAiPatient() {
    if (reconnectPromiseRef.current) return reconnectPromiseRef.current;
    const promise = (async () => {
      if (!navigator.onLine) {
        setAiStatus("offline");
        setReconnectNotice(studentFacingApiMessage("offline", lang));
        return false;
      }
      sessionInitAbortRef.current?.abort();
      patientReplyAbortRef.current?.abort();
      const controller = new AbortController();
      sessionInitAbortRef.current = controller;
      const generation = ++aiGenerationRef.current;
      setAiStatus("reconnecting");
      setReconnectNotice(lang === "en" ? "Reconnecting..." : "正在连接……");
      try {
        const health = await requestJson<ServiceHealth>(publicApiConfig.health, undefined, { method: "GET", timeoutMs: 7000, retries: 2, signal: controller.signal, endpointName: "health" });
        if (generation !== aiGenerationRef.current) return false;
        setServiceHealth(health);
        setHealthCheckFailed(false);
        if (health.apiVersion !== EXPECTED_API_VERSION) throw new ApiRequestError("backend-outdated", 409, "version_mismatch");
        if (!health.patientServiceConfigured) throw new ApiRequestError("not-configured", 503, "provider_not_configured");
        const cacheKey = aiSessionCacheKey(attempt.attemptId, caseData.id, lang, runtimeMode);
        try { localStorage.removeItem(cacheKey); } catch { /* New session still works in memory. */ }
        const trainingStateToken = await ensureTrainingStateToken();
        const session = await requestSessionInit({
          caseId: caseData.id, runtimeMode, language: lang, debug: aiMode === "debug", attemptId: attempt.attemptId,
          trainingStateToken, forceRefresh: true, signal: controller.signal
        });
        if (generation !== aiGenerationRef.current) return false;
        setAiSessionId(session.sessionId);
        writeJsonStorage(cacheKey, session);
        const pending = pendingFailedQuestion;
        if (pending) {
          const aiResult = await requestAiPatientReply({
            sessionId: session.sessionId, caseId: caseData.id, question: pending.question, messages, askedSlots,
            aiMode: "deepseek", runtimeMode, language: lang, attemptId: attempt.attemptId, signal: controller.signal, recoveryCycle: `reconnect-${session.sessionId}`
          });
          if (generation !== aiGenerationRef.current) return false;
          if (!applyRecoveredReply(aiResult, pending, lang === "en" ? "AI reconnection restored patient reply" : "重新连接后回答成功")) {
            setAiStatus("degraded");
            setReconnectNotice(lang === "en" ? "Connection failed; using rule fallback" : "连接失败，使用规则库");
            return false;
          }
        } else {
          const probe = await probeAiPatient({ caseId: caseData.id, sessionId: session.sessionId, attemptId: attempt.attemptId, mode: runtimeMode, language: lang, signal: controller.signal });
          if (generation !== aiGenerationRef.current) return false;
          if (probe.isFallback) {
            setAiStatus("degraded");
            setReconnectNotice(lang === "en" ? "Connection failed; using rule fallback" : "连接失败，使用规则库");
            return false;
          }
          setAiStatus("connected");
          setSessionInitError("");
          setReconnectNotice(lang === "en" ? "AI reconnected" : "已重新连接AI");
          globalThis.setTimeout(() => setReconnectNotice((current) => /AI reconnected|已重新连接AI/.test(current) ? "" : current), 1800);
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted || generation !== aiGenerationRef.current) return false;
        const kind = error instanceof ApiRequestError ? error.kind : "patient-service";
        setAiStatus(kind === "offline" ? "offline" : "degraded");
        setReconnectNotice(studentFacingApiMessage(kind, lang));
        return false;
      }
    })().finally(() => { reconnectPromiseRef.current = null; });
    reconnectPromiseRef.current = promise;
    return promise;
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

  async function submitExam(textOverride?: string) {
    if (osceLocked) return;
    const text = (textOverride ?? examInput).trim();
    if (!text) return;
    try {
      const log = await trainingAction<ExamResultLog>({ action: "exam", input: text });
      setExamLogs((current) => [...current, log]);
      updateAnswer("physicalExam", `${answers.physicalExam}\n${text}：${log.result}`.trim());
      addTimeline("exam", lang === "en" ? "Physical examination" : "查体", `${text}：${log.result}`, 2);
      setExamInput("");
    } catch {
      setStorageWarning(lang === "en" ? "The examination service is unavailable. No result was released." : "查体服务暂时不可用，未释放结果。" );
    }
  }

  function toggleOrder(item: string) {
    setAnswers((current) => ({
      ...current,
      selectedOrders: current.selectedOrders.includes(item) ? current.selectedOrders.filter((value) => value !== item) : [...current.selectedOrders, item]
    }));
  }

  async function submitOrder(textOverride?: string) {
    if (osceLocked) return;
    const text = (textOverride ?? orderInput).trim();
    if (!text) return;
    try {
      const matchedLog = await trainingAction<OrderResultLog>({ action: "order", input: text });
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
    } catch {
      setStorageWarning(lang === "en" ? "The order service is unavailable. No report was released." : "开单服务暂时不可用，未释放报告。" );
    }
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

  async function startMdt() {
    if (osceLocked) return;
    if (answers.consultNeeded === "需要会诊" && (answers.consultDepartments.length === 0 || answers.consultPurpose.trim().length < 6 || answers.consultQuestions.trim().length < 6 || answers.consultSummary.trim().length < 6)) {
      alert(t(lang, "purposeRequired"));
      return;
    }
    const purpose = [answers.consultPurpose, answers.consultQuestions, answers.consultSummary].filter(Boolean).join("；");
    try {
      const opinions = await trainingAction<MdtOpinion[]>({ action: "mdt", departments: answers.consultDepartments, purpose });
      setMdtOpinions(opinions);
      addTimeline("mdt", "MDT", `${answers.consultDepartments.join("；") || "未选择科室"} - ${purpose}`, 4);
    } catch {
      setStorageWarning(lang === "en" ? "The MDT service is unavailable." : "MDT服务暂时不可用。" );
    }
  }

  async function generateReport() {
    return trainingAction<Evaluator360Report>({ action: "score" });
  }

  async function submitStage() {
    if (osceLocked || stageSubmitLockRef.current || trainingAttemptStatus !== "ready") return;
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
    stageSubmitLockRef.current = true;
    setStageSubmitting(true);
    try {
      const evaluation = await trainingAction<StageEvaluation>({
        action: "stage-feedback",
        stageKey: stageScoreKey(activeStageNo),
        submission: {
          ...answers,
          answerText,
          ...(activeStageNo === 1 ? { askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text) } : {})
        }
      });
      setSubmitted((current) => Object.fromEntries(
        Object.entries({ ...current, [activeStageNo]: evaluation }).filter(([stage]) => Number(stage) <= activeStageNo)
      ) as Partial<Record<AgentStageNo, StageEvaluation>>);
      setFinalReport(null);
      addTimeline("submit", lang === "en" ? "Stage submitted" : "提交阶段", `${agents.find((item) => item.stageNo === activeStageNo)?.agentName[lang] ?? activeStageNo}：${evaluation.score}/${evaluation.max}`, activeStageNo);
    } catch (error) {
      const message = stageSubmissionFailureMessage(error, lang);
      const reason = trainingFailureReason(error);
      if (["attempt_not_found", "token_expired", "token_missing", "configuration_error", "origin_mismatch", "state_mismatch"].includes(reason)) {
        trainingStateTokenRef.current = null;
        trainingInitFailureRef.current = { attemptId: attempt.attemptId, error };
        setTrainingAttemptStatus("failed");
        setTrainingAttemptError(message);
        try {
          sessionStorage.removeItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin));
          sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
        } catch { /* The UI still fails closed. */ }
      }
      setStorageWarning(message);
    } finally {
      stageSubmitLockRef.current = false;
      setStageSubmitting(false);
    }
  }

  async function completeTraining() {
    if (finalReport) return;
    for (let stage = 1 as AgentStageNo; stage <= 6; stage = (stage + 1) as AgentStageNo) {
      if (!submitted[stage]) { alert(lang === "en" ? "Complete stages 1-6 first." : "请先完成并提交第1至第6阶段。"); return; }
    }
    if (answers.debriefReflection.trim().length < 10) {
      alert(t(lang, "finalReflectionRequired"));
      return;
    }
    try {
      const evaluation = await trainingAction<StageEvaluation>({ action: "stage-feedback", stageKey: "debrief", submission: { ...answers } });
      const report = await generateReport();
      setSubmitted((current) => ({ ...current, 7: evaluation }));
      setFinalReport(report);
      const summaries = readJsonStorage<Array<{ attemptId: string; caseId: string; language: LanguageCode; total: number; completedAt: string }>>("hematuria-practice-attempt-summaries-v1", []).value;
      const previous = [...summaries].reverse().find((item) => item.caseId === caseData.id && item.language === lang && item.attemptId !== attempt.attemptId);
      setPreviousAttemptScore(previous?.total ?? null);
      if (!summaries.some((item) => item.attemptId === attempt.attemptId)) {
        writeJsonStorage("hematuria-practice-attempt-summaries-v1", [...summaries, { attemptId: attempt.attemptId, caseId: caseData.id, language: lang, total: report.total, completedAt: new Date().toISOString() }]);
      }
      addTimeline("submit", lang === "en" ? "Final report generated" : "完成训练并生成最终报告", `${report.total}/${report.max}`, 7);
    } catch {
      setStorageWarning(lang === "en" ? "Final scoring is temporarily unavailable." : "终末评分服务暂时不可用。" );
    }
  }

  function canOpenStage(stageNo: AgentStageNo) {
    if (finalReport && stageNo !== 7) return false;
    if (stageNo === 1) return true;
    for (let current = 1 as AgentStageNo; current < stageNo; current = (current + 1) as AgentStageNo) {
      if (!submitted[current]) return false;
    }
    return true;
  }

  function openStage(stageNo: AgentStageNo) {
    if (!canOpenStage(stageNo)) return;
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
    try {
      localStorage.removeItem(attemptStorageKey(attempt));
      localStorage.removeItem(attemptPointerKey(attempt.caseId, attempt.mode, attempt.language));
      sessionStorage.removeItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin));
      sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
    } catch { /* Reload still resets the in-memory attempt. */ }
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
  const healthNotice = healthCheckFailed
    ? (lang === "en" ? "Service status could not be confirmed. Text practice remains available." : "暂时无法确认服务状态，仍可继续文字练习。")
    : (serviceHealth?.patientServiceConfigured === false || serviceHealth?.trainingStateConfigured === false)
      ? (lang === "en" ? "Some online functions are unavailable. Text practice remains available." : "部分在线功能暂不可用，仍可继续文字练习。")
      : "";
  const connectionMessage = reconnectNotice || sessionInitError || ((sessionInitLoading || !aiSessionId) ? t(lang, "aiPreparing") : "") || healthNotice;
  const connectionIsBusy = sessionInitLoading || !aiSessionId || aiStatus === "reconnecting";
  const showReconnect = aiMode !== "rule" && (["degraded", "offline", "error", "reconnecting"].includes(aiStatus) || /reconnect|重新连接/i.test(reconnectNotice));

  function scrollChatToBottom() {
    const panel = chatScrollRef.current;
    if (!panel) return;
    chatPinnedToBottomRef.current = true;
    setChatHasNewMessage(false);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollTo({ top: panel.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

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
    <main className="mx-auto max-w-[1500px] px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-clinic-blue">
            <span>{caseData.displayCaseId || caseData.id}</span>
            <span className={`ui-status ${isOsce ? "ui-status-danger" : "ui-status-success"}`}>
              {isOsce ? `${t(lang, "osceMode")} ${formatDuration(osceTimeLeft)}` : t(lang, "freeTraining")}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{t(lang, "appTitle")}</h1>
          <p className="mt-1 hidden text-sm text-clinic-muted md:block">{t(lang, "appSubtitle")}</p>
          <p className="mt-1 line-clamp-2 text-sm text-clinic-muted lg:hidden">{display.age || "-"} / {display.sex || "-"} · {display.chiefComplaint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="ui-segmented">
            <button type="button" onClick={() => setLanguage("zh")} className={`ui-segment ${lang === "zh" ? "ui-segment-active" : ""}`}>{t(lang, "zh")}</button>
            <button type="button" onClick={() => setLanguage("en")} className={`ui-segment ${lang === "en" ? "ui-segment-active" : ""}`}>{t(lang, "en")}</button>
          </div>
          {isDevelopment && (
            <div className="ui-segmented">
              <button type="button" onClick={() => setAiMode("deepseek")} className={`ui-segment ${aiMode === "deepseek" ? "ui-segment-active" : ""}`}>AI</button>
              <button type="button" onClick={() => setAiMode("rule")} className={`ui-segment ${aiMode === "rule" ? "ui-segment-active" : ""}`}>{lang === "en" ? "Rules" : "规则库"}</button>
            </div>
          )}
          <span aria-live="polite" className={`ui-status ${aiStatus === "connected" ? "ui-status-success" : aiStatus === "checking" || aiStatus === "unknown" || aiStatus === "reconnecting" ? "bg-slate-100 text-slate-700" : "ui-status-warning"}`}>
            {t(lang, "responseSource")}：
            {aiStatus === "connected"
              ? t(lang, "aiConnected")
              : aiStatus === "reconnecting"
                ? (lang === "en" ? "Reconnecting..." : "正在连接……")
                : aiStatus === "checking"
                ? t(lang, "aiChecking")
                : aiStatus === "offline"
                  ? (lang === "en" ? "Offline" : "离线")
                : aiStatus === "unknown"
                  ? t(lang, "statusUnknown")
                  : aiMode === "rule"
                    ? t(lang, "ruleFallback")
                    : t(lang, "degradedMode")}
          </span>
          {logSyncStatus !== "idle" && <div role="status" aria-live="polite" className={`ui-status ${logSyncStatus === "failed" ? "ui-status-warning" : "ui-status-info"}`}>
            <span>{logSyncStatus === "verified"
              ? (lang === "en" ? "Scoring synced" : "评分已同步")
              : logSyncStatus === "failed"
                ? (lang === "en" ? "Scoring sync paused" : "评分同步已暂停")
                : (lang === "en" ? "Scoring sync pending" : "评分待同步")}</span>
            {logSyncStatus === "failed" && <button type="button" onClick={() => {
              historyLogRetryWaitingRef.current = false;
              setPendingHistoryLogs((current) => current.map((item, index) => index === 0 ? { ...item, attempts: 0 } : item));
              setLogSyncStatus("pending");
              setLogRetryNonce((value) => value + 1);
            }} className="font-semibold underline underline-offset-2">{lang === "en" ? "Retry sync" : "重新同步"}</button>}
          </div>}
          {showReconnect && !connectionMessage && <button
            type="button"
            onClick={() => void reconnectAiPatient()}
            disabled={aiStatus === "reconnecting"}
            className="ui-button-secondary"
          >
            {aiStatus === "reconnecting"
              ? (lang === "en" ? "Reconnecting..." : "正在连接……")
              : aiStatus === "connected"
                ? (lang === "en" ? "Check connection" : "检测连接")
                : (lang === "en" ? "Reconnect AI" : "重新连接AI")}
          </button>}
          <button type="button" aria-label={lang === "en" ? "Restart training" : "重新开始训练"} title={lang === "en" ? "Restart" : "重新开始"} onClick={restartTraining} className="ui-button-secondary px-3"><RotateCcw size={16} /><span className="hidden sm:inline">{lang === "en" ? "Restart" : "重新开始"}</span></button>
          <Link aria-label={t(lang, "backToCases")} title={t(lang, "backToCases")} onClick={(event) => { if (!confirmExit()) event.preventDefault(); }} href="/cases" className="ui-button-secondary px-3"><ClipboardList size={16} /><span className="hidden sm:inline">{t(lang, "backToCases")}</span></Link>
        </div>
      </div>
      {storageWarning && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{storageWarning}</span>
          <button type="button" onClick={() => setStorageWarning("")} className="font-medium underline">{t(lang, "dismiss")}</button>
        </div>
      )}
      {trainingAttemptStatus === "failed" && trainingAttemptError && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{trainingAttemptError}</span>
          <button type="button" onClick={() => void ensureTrainingStateToken(true).catch(() => undefined)} className="font-medium underline">
            {lang === "en" ? "Reinitialize training session" : "重新初始化训练会话"}
          </button>
        </div>
      )}
      <div className="mb-3 min-h-9" aria-live="polite">
        {connectionMessage && <div role="status" className={`flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${connectionIsBusy ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <span>{connectionMessage}</span>
          {showReconnect && aiStatus !== "reconnecting" && <button type="button" onClick={() => void reconnectAiPatient()} className="font-semibold underline underline-offset-2">{lang === "en" ? "Reconnect AI" : "重新连接AI"}</button>}
        </div>}
      </div>

      <button type="button" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)} className="mb-3 inline-flex w-full items-center justify-between rounded-md border border-clinic-line bg-white px-4 py-3 font-medium lg:hidden">
        <span className="inline-flex items-center gap-2"><Menu size={18} />{t(lang, "mobileNavigation")}</span>
        <span>{activeStageNo}/7</span>
      </button>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] min-[1380px]:grid-cols-[260px_minmax(0,1fr)_260px]">
        <aside className={`${mobileNavOpen ? "block" : "hidden"} space-y-3 lg:block`}>
          <section className="rounded-lg border border-clinic-line bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-clinic-blue"><Languages size={16} /> {t(lang, "stageNavigation")}</div>
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
                        <span className={`mt-1 block text-xs leading-5 ${active ? "text-white" : "text-clinic-muted"}`}>{agent.competency[lang]}</span>
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

        <section className="rounded-xl border border-clinic-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-3 border-b border-clinic-line pb-3">
            <p className="text-sm font-medium text-clinic-blue">{activeAgent.agentName[lang]}</p>
            <h2 className="mt-1 text-lg font-semibold sm:text-xl">{activeAgent.mainWindowFunction[lang]}</h2>
            <p className="mt-1 hidden text-sm text-clinic-muted sm:block">{t(lang, "noFeedbackBeforeSubmit")}</p>
          </div>

          <fieldset disabled={osceLocked && activeStageNo !== 7} className="min-w-0 border-0 p-0 disabled:opacity-75">
          {activeStageNo === 1 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{t(lang, "patientAgent")}</h3>
                <button type="button" onClick={() => setSpeechSettingsOpen(true)} disabled={!speechOutputSupported} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:border-clinic-blue disabled:opacity-50">
                  <Settings2 size={16} /> {t(lang, "voiceSettings")}
                  <span className="sr-only">{autoSpeak ? speechStateLabel() : t(lang, "speechOff")}</span>
                </button>
              </div>
              {speechSettingsOpen && (
                <div role="dialog" aria-modal="true" aria-label={t(lang, "voiceSettings")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                  <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-clinic-blue">{t(lang, "voiceSettings")}</h4>
                      <button type="button" onClick={() => setSpeechSettingsOpen(false)} className="rounded-md px-2 py-1 text-sm hover:bg-clinic-paper" aria-label={t(lang, "close")}>×</button>
                    </div>
                    <label className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{t(lang, "autoRead")}</span><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /></label>
                    <label className="mt-4 block text-sm"><span>{t(lang, "speechProvider")}</span><select value={speechProvider} onChange={(event) => setSpeechProvider(event.target.value as TtsProviderPreference)} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2"><option value="auto">{lang === "en" ? "Automatic (cloud with browser fallback)" : "自动（云语音，浏览器降级）"}</option><option value="browser">{t(lang, "browserVoice")}</option><option value="disabled">{t(lang, "disabled")}</option></select></label>
                    <label className="mt-4 block text-sm"><span>{t(lang, "voiceTone")}</span><select value={manualVoiceOverrides[voiceKey]?.voiceURI || ""} onChange={(event) => setManualVoiceOverrides((current) => {
                      const next = { ...current };
                      if (!event.target.value) delete next[voiceKey];
                      else {
                        const voice = speechVoices.find((item) => item.voiceURI === event.target.value);
                        next[voiceKey] = { voiceURI: event.target.value, name: voice?.name };
                      }
                      return next;
                    })} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2"><option value="">{lang === "en" ? "Automatic voice" : "自动匹配音色"}</option>{speechVoices.filter((voice) => voice.lang.toLowerCase().startsWith(voiceProfile.locale.slice(0, 2).toLowerCase())).map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}</select></label>
                    {!selectedBrowserVoice && <p className="mt-2 text-xs text-amber-700">{t(lang, "noVoice")}</p>}
                    <label className="mt-4 block text-sm"><span>{t(lang, "speechRate")} {speechRate.toFixed(2)}</span><input className="mt-2 w-full" type="range" min="0.8" max="1.15" step="0.01" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} /></label>
                    <label className="mt-4 block text-sm"><span>{t(lang, "speechPitch")} {speechPitch.toFixed(2)}</span><input className="mt-2 w-full" type="range" min="0.85" max="1.1" step="0.01" value={speechPitch} onChange={(event) => setSpeechPitch(Number(event.target.value))} /></label>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void speak(lang === "en" ? "Hello doctor, I can hear you clearly." : "医生您好，我能听清您的问题。", true)} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-3 py-2 text-sm text-white"><Volume2 size={15} />{t(lang, "testVoice")}</button>
                      {speechState === "playing" || speechState === "fallback-browser" ? <button type="button" onClick={pauseSpeech} className="rounded-md border border-clinic-line p-2" title={t(lang, "pause")}><Pause size={16} /></button> : <button type="button" onClick={resumeSpeech} disabled={speechState !== "paused"} className="rounded-md border border-clinic-line p-2 disabled:opacity-50" title={t(lang, "resume")}><Play size={16} /></button>}
                      <button type="button" onClick={() => stopSpeech()} className="rounded-md border border-clinic-line p-2" title={t(lang, "stop")}><Square size={16} /></button>
                      <button type="button" onClick={() => lastSpokenText && void speak(lastSpokenText, true)} disabled={!lastSpokenText} className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm"><RotateCcw size={15} />{t(lang, "replay")}</button>
                    </div>
                    <p
                      data-testid="voice-profile"
                      data-locale={voiceProfile.locale}
                      data-gender={voiceProfile.gender}
                      data-age-group={voiceProfile.ageGroup}
                      data-cloud-voice={AZURE_VOICE_BY_PROFILE[voicePreferenceKey(voiceProfile)]}
                      data-speech-state={speechState}
                      className="mt-3 text-xs text-clinic-muted"
                    >{t(lang, "speechStatus")}：{speechStateLabel()}</p>
                    {speechNotice && <p role="status" className="mt-2 text-xs text-amber-700">{speechNotice}</p>}
                  </section>
                </div>
              )}
              {speechNeedsGesture && !speechGestureDismissed && (
                <button type="button" onClick={() => { setSpeechGestureDismissed(true); setSpeechNeedsGesture(false); if (lastSpokenText) void speak(lastSpokenText, true); }} className="mt-3 rounded-md bg-clinic-blue px-4 py-2 text-sm font-medium text-white">
                  {lang === "en" ? "Start interview and enable audio" : "开始问诊并启用语音"}
                </button>
              )}
              <div className="relative">
              <div
                ref={chatScrollRef}
                role="log"
                aria-label={lang === "en" ? "Simulated patient conversation" : "模拟问诊对话"}
                aria-live="polite"
                onScroll={(event) => {
                  const panel = event.currentTarget;
                  const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 72;
                  chatPinnedToBottomRef.current = nearBottom;
                  if (nearBottom) setChatHasNewMessage(false);
                }}
                className="mt-3 h-[220px] overflow-y-auto rounded-lg border border-clinic-line bg-clinic-paper p-3 sm:h-[320px] sm:p-4 lg:h-[390px]"
              >
                <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] whitespace-pre-line rounded-xl px-3 py-2.5 text-sm leading-6 sm:max-w-[78%] sm:px-4 sm:py-3 ${message.role === "student" ? "bg-clinic-blue text-white" : "border border-clinic-line bg-white text-clinic-ink"}`}>
                      <span className={`mb-1 block text-[11px] font-semibold leading-4 ${message.role === "student" ? "text-white/80" : "text-clinic-muted"}`}>{message.role === "student" ? (lang === "en" ? "You · clinician" : "你 · 医生") : (lang === "en" ? "Standardized patient" : "标准化患者")}</span>
                      <span className="block">{message.text}</span>
                    </div>
                  </div>
                ))}
                <div
                  aria-hidden="true"
                  data-testid="chat-composer-spacer"
                  style={{ height: `calc(${chatComposerReserve}px + env(safe-area-inset-bottom, 0px))` }}
                  className="pointer-events-none hidden sm:block"
                />
                </div>
              </div>
              {chatHasNewMessage && <button type="button" onClick={scrollChatToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-clinic-line bg-white px-3 py-1.5 text-xs font-semibold text-clinic-blue shadow-soft">{lang === "en" ? "New message · go to latest" : "有新消息 · 回到底部"}</button>}
              </div>
              <div ref={chatComposerRef} data-testid="chat-composer" data-reserve={chatComposerReserve} className="relative z-30 mt-3 scroll-mb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] rounded-xl border border-clinic-line bg-white/95 p-2 shadow-raised backdrop-blur-sm sm:sticky sm:bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
                <textarea
                  value={question}
                  rows={2}
                  onFocus={ensureMobileComposerVisible}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    window.requestAnimationFrame(ensureMobileComposerVisible);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitQuestion();
                    }
                  }}
                  className="ui-input block min-h-[68px] w-full resize-none"
                  placeholder={t(lang, "inputQuestion")}
                  aria-label={t(lang, "inputQuestion")}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="hidden text-xs text-clinic-muted sm:block">{lang === "en" ? "Enter to send · Shift+Enter for a new line" : "Enter 发送 · Shift+Enter 换行"}</p>
                  <div className="ml-auto flex items-center gap-2">
                <button type="button" aria-label={t(lang, "voiceAsk")} title={t(lang, "voiceAsk")} onClick={startVoiceInput} disabled={!speechInputSupported || listening} className="ui-button-secondary px-3">
                  {listening ? <MicOff size={17} /> : <Mic size={17} />} <span className="hidden sm:inline">{t(lang, "voiceAsk")}</span>
                </button>
                <button onClick={() => void submitQuestion()} disabled={patientReplyLoading || sessionInitLoading || !aiSessionId || !question.trim()} className="ui-button-primary min-w-[88px]">
                  <Send size={16} /> {patientReplyLoading ? t(lang, "generating") : t(lang, "send")}
                </button>
                  </div>
                </div>
              </div>
              <label className="mt-5 block">
                <span className="font-medium">{t(lang, "historySummary")}</span>
                <textarea value={answers.historySummary} onChange={(event) => updateAnswer("historySummary", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
            </div>
          )}

          {activeStageNo === 2 && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold">{t(lang, "investigationExam")}</h3>
                <div className="mt-4 space-y-4">
                  {physicalGroups.map((group) => (
                    <section key={group.category} className="rounded-xl border border-clinic-line p-4">
                      <h4 className="font-semibold text-clinic-blue">{group.category}</h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.items.map((item) => (
                          <button key={item.examId} type="button" onClick={() => submitExam(item.displayName)} className="ui-button-secondary">
                            {item.displayName}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input value={examInput} onChange={(event) => setExamInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitExam(); }} className="ui-input min-w-0 flex-1" placeholder={t(lang, "examPlaceholder")} />
                  <button onClick={() => submitExam()} className="ui-button-primary">{t(lang, "queryExam")}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {examLogs.map((log) => (
                    <article key={`${log.at}-${log.input}`} className="rounded-lg border border-clinic-line bg-clinic-paper p-3 text-sm leading-6">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-clinic-blue">{log.input}</span><span className="ui-status-info"><FileText size={14} aria-hidden="true" />{lang === "en" ? "Returned" : "已返回"}</span></div>
                      <p>{log.result}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="border-t border-clinic-line pt-5">
                <h3 className="text-lg font-semibold">{t(lang, "investigationOrders")}</h3>
                <div className="mt-4 flex flex-wrap gap-2 border-b border-clinic-line pb-3">
                  {orderPrimaryTabs.map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveOrderTab(tab)} className={`ui-button ${activeOrderTab === tab ? "bg-clinic-blue text-white" : "border border-clinic-line bg-white text-clinic-muted hover:border-clinic-blue"}`}>
                      {tab === "检验" ? t(lang, "labs") : tab === "检查" ? t(lang, "imaging") : tab === "病理/操作" ? t(lang, "procedures") : t(lang, "perioperativeOrders")}
                    </button>
                  ))}
                </div>
                <input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} className="ui-input mt-4 w-full" placeholder={t(lang, "orderSearch")} />
                <div className="mt-4 space-y-5">
                  {orderGroups.map((group) => (
                    <section key={group.category} className="rounded-xl border border-clinic-line p-4">
                      <h4 className="font-semibold text-clinic-blue">{group.category}</h4>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {group.items.map((item) => (
                          <label key={item.orderId} className="flex min-h-[72px] items-start justify-between gap-3 rounded-lg border border-clinic-line px-3 py-2 text-sm transition-colors hover:border-clinic-blue">
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
                <label className="mt-4 block"><span className="font-medium">{t(lang, "otherOrders")}</span><textarea value={answers.customOrders} onChange={(event) => updateAnswer("customOrders", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input value={orderInput} onChange={(event) => setOrderInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitOrder(); }} className="ui-input min-w-[220px] flex-1" placeholder={t(lang, "orderPlaceholder")} />
                  <button onClick={() => submitOrder()} className="ui-button-primary">{t(lang, "orderAndReturn")}</button>
                  <button onClick={submitSelectedOrders} className="ui-button-secondary">{t(lang, "selectedOrderResults")}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {orderLogs.map((log) => (
                    <div key={log.id} className="rounded-md border border-clinic-line p-3">
                      <p className="text-sm font-medium text-clinic-blue">{log.input}</p>
                      <p className="mt-1 text-xs text-clinic-muted">
                        {t(lang, "placedAt")}：{shortTime(log.placedAt || log.at, lang)}
                        {log.returnedAt ? ` · ${t(lang, "returnedAt")}：${shortTime(log.returnedAt, lang)}` : ""}
                        {` · ${t(lang, "stageLabel").replace("{stage}", String(log.stageNo || 2))}`}
                      </p>
                      {log.matchedOrders.length > 0 && <p className="mt-1 text-xs text-clinic-muted">{t(lang, "recognizedOrders")}：{log.matchedOrders.map((item) => item.displayName).join("；")}</p>}
                      {log.duplicateOrderIds && log.duplicateOrderIds.length > 0 && <p className="mt-1 text-xs text-amber-800">{t(lang, "duplicateOrder")}</p>}
                      <p className="mt-1 text-sm text-clinic-muted">{log.message}</p>
                      {log.status === "ordered" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-clinic-paper"><div className="h-full w-1/2 animate-pulse rounded-full bg-clinic-teal" /></div>}
                      {log.results.map((item, index) => <ReportCard key={`${log.id}-${index}`} item={item} lang={lang} />)}
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
                    {item.neededInfo && <p className="mt-2"><span className="font-medium">{t(lang, "moreInformation")}：</span>{item.neededInfo}</p>}
                    {item.suggestedHandling && <p><span className="font-medium">{t(lang, "handlingAdvice")}：</span>{item.suggestedHandling}</p>}
                    {item.riskReminder && <p className="text-amber-800"><span className="font-medium">{t(lang, "riskReminder")}：</span>{item.riskReminder}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStageNo === 5 && (
            <div className="space-y-4">
              <label className="block"><span className="font-medium">{t(lang, "treatmentImmediate")}</span><textarea value={answers.immediateTreatment} onChange={(event) => updateAnswer("immediateTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "admissionInitialTreatment")}</span><textarea value={answers.admissionTreatment} onChange={(event) => updateAnswer("admissionTreatment", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "treatmentDefinitive")}</span><textarea value={answers.definitiveTreatment} onChange={(event) => updateAnswer("definitiveTreatment", event.target.value)} rows={5} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "mdtRevisedPlan")}</span><textarea value={answers.mdtRevisedPlan} onChange={(event) => updateAnswer("mdtRevisedPlan", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
              <label className="block"><span className="font-medium">{t(lang, "followupEducation")}</span><textarea value={`${answers.followUp}\n${answers.patientEducation}`.trim()} onChange={(event) => {
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
                <span className="font-medium">{t(lang, "reflection")}</span>
                <textarea disabled={Boolean(finalReport)} value={answers.debriefReflection} onChange={(event) => updateAnswer("debriefReflection", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue disabled:bg-clinic-paper" />
              </label>
              <div className="mt-5">{finalReport && <>
                <FinalReport report={finalReport} lang={lang} />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-clinic-line py-4">
                  <p className="text-sm text-clinic-muted">{previousAttemptScore === null
                    ? (lang === "en" ? "This is your first completed attempt for this case and language." : "这是本病例当前语言的首次完整训练。")
                    : (lang === "en" ? `Change from the previous attempt: ${finalReport.total - previousAttemptScore >= 0 ? "+" : ""}${finalReport.total - previousAttemptScore}` : `较上次训练：${finalReport.total - previousAttemptScore >= 0 ? "+" : ""}${finalReport.total - previousAttemptScore} 分`)}</p>
                  <button type="button" onClick={restartTraining} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white"><RotateCcw size={16} />{lang === "en" ? "Retrain this case" : "立即重练同病例"}</button>
                </div>
              </>}</div>
              <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
                <h4 className="font-semibold">{t(lang, "timeline")}</h4>
                <div className="mt-3 max-h-[360px] space-y-3 overflow-auto">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-md bg-white p-3 text-sm leading-6">
                      <p className="font-medium text-clinic-blue">{shortTime(item.at, lang)} · {t(lang, "stageLabel").replace("{stage}", String(item.stageNo))} · {item.label}</p>
                      <p className="mt-1 text-clinic-muted">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h4 className="font-semibold text-clinic-blue">{t(lang, "studentRecords")}</h4>
                  <FormattedText text={[
                    `${t(lang, "historyRecord")}：${answers.historySummary}`,
                    `${t(lang, "examRecord")}：${answers.physicalExam}`,
                    `${t(lang, "orderRecord")}：${answers.selectedOrders.join("；")}；${answers.customOrders}`,
                    `${t(lang, "diagnosisRecord")}：${answers.diagnosis}`,
                    `${t(lang, "differentialRecord")}：${answers.differentials}`,
                    `${t(lang, "mdtRecord")}：${answers.consultDepartments.join("；")}；${answers.consultPurpose}`,
                    `${t(lang, "treatmentRecord")}：${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}`,
                    `${t(lang, "perioperativeRecord")}：${answers.perioperativePreparation}`,
                    `${t(lang, "followupRecord")}：${answers.followUp}；${answers.patientEducation}`
                  ].join("\n")} />
                </div>
                <div className="rounded-lg border border-clinic-line bg-white p-4">
                  <h4 className="font-semibold text-clinic-blue">{t(lang, "standardPath")}</h4>
                  <FormattedText text={Object.values(submitted).map((item) => item?.standardAnswer || "").filter(Boolean).join("\n\n")} />
                </div>
              </section>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-clinic-line pt-4">
            {activeStageNo === 7 ? (
              <button disabled={Boolean(finalReport)} onClick={completeTraining} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle2 size={16} /> {t(lang, "finishTraining")}
              </button>
            ) : (
              <button disabled={osceLocked || stageSubmitting || trainingAttemptStatus !== "ready"} onClick={submitStage} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle2 size={16} /> {trainingAttemptStatus === "initializing"
                  ? (lang === "en" ? "Initializing training session..." : "正在初始化训练会话……")
                  : trainingAttemptStatus === "failed"
                    ? (lang === "en" ? "Training session unavailable" : "训练会话尚未就绪")
                    : stageSubmitting
                      ? (lang === "en" ? "Submitting..." : "正在提交……")
                      : activeEvaluation
                        ? (lang === "en" ? "Resubmit this stage" : "修改后重新提交")
                        : t(lang, "submitStage")}
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
          </fieldset>

          {showStageFeedback && activeEvaluation && <FeedbackBox evaluation={activeEvaluation} lang={lang} />}
        </section>

        <aside className="hidden space-y-4 min-[1380px]:block">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "trainingState")}</h2>
            <div className="mt-3 space-y-2 text-sm text-clinic-muted">
              <p>{isOsce ? t(lang, "osceMode") : t(lang, "freeTraining")}</p>
              {isOsce && <p>{formatDuration(osceTimeLeft)}</p>}
              <p>{t(lang, "stageLabel").replace("{stage}", String(activeStageNo))}：{activeAgent.agentName[lang]}</p>
              <p>{Object.keys(submitted).length} / 7 {t(lang, "completed")}</p>
              <p>{t(lang, "saveStatus")}：{saveStatus === "saved" ? t(lang, "saved") : saveStatus === "saving" ? t(lang, "saving") : t(lang, "saveFailed")}</p>
              <p className="pt-2 text-xs leading-5">{t(lang, "teachingOnly")}</p>
            </div>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "obtainedData")}</h2>
            <div className="mt-3 space-y-3 text-sm text-clinic-muted">
              <p>{t(lang, "questionsCount")}：{acquiredStats.questions}</p>
              <p>{t(lang, "repliesCount")}：{acquiredStats.patientAnswers}</p>
              <p>{t(lang, "examsCount")}：{acquiredStats.exams}</p>
              <p>{t(lang, "ordersCount")}：{acquiredStats.orders}</p>
              <p>{t(lang, "reportsCount")}：{acquiredStats.reports}</p>
            </div>
          </section>
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "timeline")}</h2>
            <div className="mt-3 space-y-3">
              {(timeline.length ? timeline.slice(-6).reverse() : []).map((item) => (
                <div key={item.id} className="rounded-md bg-clinic-paper p-3 text-xs leading-5">
                  <p className="font-medium text-clinic-blue">{shortTime(item.at, lang)} · {t(lang, "stageLabel").replace("{stage}", String(item.stageNo))} · {item.label}</p>
                  <p className="mt-1 line-clamp-3 text-clinic-muted">{item.detail}</p>
                </div>
              ))}
              {!timeline.length && <p className="text-sm text-clinic-muted">{t(lang, "noTimeline")}</p>}
            </div>
          </section>
          {isOsce && activeEvaluation && activeStageNo !== 7 && (
            <section className="rounded-lg border border-clinic-line bg-white p-5 text-sm leading-6 text-clinic-muted">
              {t(lang, "osceFeedbackNotice")}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
