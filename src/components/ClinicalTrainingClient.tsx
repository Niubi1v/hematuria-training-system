"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
import {
  ENGLISH_CATEGORY_PLACEHOLDER,
  ENGLISH_EXAM_PLACEHOLDER,
  ENGLISH_METADATA_PLACEHOLDER,
  ENGLISH_ORDER_PLACEHOLDER,
  ENGLISH_RESULT_PLACEHOLDER,
  buildStudentOrderCatalog,
  orderApplicableForSex,
  presentOrderCatalogItem,
  presentPhysicalExamItem,
  reportStatusPresentation,
  safeStudentFacingText
} from "@/shared/dataAgentPresentation.js";
import { clinicalResultFingerprint } from "@/shared/clinicalResultSemantics.js";
import { ApiRequestError, createIdempotencyKey, createRequestId, fetchWithRecovery, requestJson, studentFacingApiMessage } from "@/src/lib/apiClient";
import { desktopRuntimeConfig, publicApiConfig } from "@/src/lib/apiConfig";
import { desktopRuntimeFailureMessage, desktopShellAvailable, isDesktopRuntimeFailureCode, restartDesktopRuntime } from "@/src/lib/desktopDiagnostics";
import { ATTEMPT_SUMMARY_KEY, createAttemptSummary, isAttemptSummary, type AttemptSummary } from "@/src/lib/catalogProgress";
import { canonicalSlotDefinitions } from "@/src/lib/canonicalSlots";
import { isConnectionFailureFallback, isSafetyFallback, mergeRecoveredCoverage, recordConnectionTransition, validCachedSession, type AiConnectionStatus, type CachedPatientSession, type ConnectionTransition } from "@/src/lib/aiRecovery";
import { initializeStorageVersion, readJsonStorage, removeBrowserStorageEntries, writeJsonStorage } from "@/src/lib/safeStorage";
import { attemptModeForTrainingMode, attemptPointerKey, attemptStorageKey, createAttempt, isAttemptCompatible, isStoredAttemptStateCompatible, legacyTrainingStateStorageKey, trainingStateStorageKey, type AttemptIdentity, type AttemptMode, type StoredAttemptState } from "@/src/lib/attemptState";
import { projectStudentScoreText } from "@/src/lib/studentScoreProjection";
import { canOpenTrainingStage, nextTrainingStage, submittedTrainingStages, type TrainingStageNo } from "@/src/lib/trainingStageState";
import { bootstrapDesktopStateAuthority, desktopAuthoritiesCompatible, isDesktopStateAuthority, type DesktopStateAuthority } from "@/src/lib/desktopStateAuthority";
import { publicTrajectoryActionLabel } from "@/src/lib/publicClinicalTrajectory";
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
import type { Evaluator360Report, ExamResultLog, FullProcessAnswers, MdtOpinion, OrderResultLog, StageEvaluation, StudentEvidenceOption } from "@/src/lib/trainingContracts";
import type {
  ChatMessage,
  CollectedMap,
  ConsultCatalogItem,
  KeyPointId,
  OrderCatalogItem,
  PhysicalExamItem
} from "@/src/lib/types";
import FormattedText from "./FormattedText";
import DesktopModelSettings from "./DesktopModelSettings";

type TrainingMode = "free" | "osce" | "demo" | "rct" | "random";
type LanguageCode = "zh" | "en";
type AiMode = "deepseek" | "rule" | "debug";
type AiStatus = AiConnectionStatus;
type AgentStageNo = TrainingStageNo;
type StudentVisibleCase = {
  id: string;
  displayCaseId?: string;
  age: string;
  sex: string;
  sexEn?: string;
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
  generationSource?: "deepseek_live_ai" | "live_ai" | "ai_cache" | "governed_planner" | "rule_fallback" | "safety_boundary" | "mock" | "none";
  classificationSource?: "deepseek_live_ai" | "live_ai" | "local_ai" | "deterministic" | "none";
  classifierStatus?: "accepted" | "rejected" | "timeout" | "not_invoked";
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

type TrainingFailureReason = "session_initializing" | "attempt_not_found" | "token_expired" | "token_missing" | "stage_mismatch" | "network_error" | "desktop_runtime" | "configuration_error" | "origin_mismatch" | "rate_limit" | "state_mismatch" | "request_error";

function trainingFailureReason(error: unknown): TrainingFailureReason {
  const code = error instanceof ApiRequestError ? error.code : "";
  const kind = error instanceof ApiRequestError ? error.kind : "request";
  if (isDesktopRuntimeFailureCode(code) || (desktopShellAvailable() && ["network", "offline", "timeout"].includes(kind))) return "desktop_runtime";
  if (/attempt_not_found/.test(code)) return "attempt_not_found";
  if (/expired_attempt_token/.test(code)) return "token_expired";
  if (/training_state_token_missing/.test(code)) return "token_missing";
  if (/invalid_stage|stage_not_unlocked/.test(code)) return "stage_mismatch";
  if (/training_attempt_store_unavailable|training_state_secret_(?:missing|weak|placeholder|reused)/.test(code)) return "configuration_error";
  if (/origin_not_allowed/.test(code)) return "origin_mismatch";
  if (/rate_limited/.test(code) || kind === "rate-limited") return "rate_limit";
  if (/invalid_attempt_token|invalid_attempt_token_claims|unsupported_attempt_token_version|stale_attempt_token|attempt_already_(?:completed|exists)|idempotency_key_reused|attempt_(?:state|language|mode|case|id)_mismatch/.test(code)) return "state_mismatch";
  if (/network_error|training_attempt_store_temporarily_unavailable/.test(code) || ["network", "offline", "timeout"].includes(kind)) return "network_error";
  return "request_error";
}

function stageSubmissionFailureMessage(error: unknown, language: LanguageCode) {
  const reason = trainingFailureReason(error);
  if (reason === "configuration_error") {
    return language === "en"
      ? "Training records are temporarily unavailable, so this stage cannot be submitted. Please retry later."
      : "训练记录暂时不可用，当前无法提交阶段，请稍后重试。";
  }
  if (reason === "desktop_runtime") {
    return desktopRuntimeFailureMessage(error instanceof ApiRequestError ? error.code : "unknown_runtime_failure", language);
  }
  if (reason === "attempt_not_found") {
    return language === "en"
      ? "The training session record is no longer available. Reinitialize the training session before submitting."
      : "训练会话记录已失效，请重新初始化训练会话后再提交。";
  }
  if (reason === "token_expired") {
    return language === "en"
      ? "This training attempt has expired. Start a new attempt before submitting."
      : "本次训练已过期，请重新开始训练后再提交。";
  }
  if (reason === "token_missing") {
    return language === "en"
      ? "This training session is not ready. Prepare it again before submitting."
      : "本次训练尚未准备完成，请重新准备后再提交。";
  }
  if (reason === "stage_mismatch") {
    return language === "en"
      ? "The submitted stage no longer matches the current training stage. Refresh and retry."
      : "提交阶段与当前训练阶段不一致，请刷新后重试。";
  }
  if (reason === "network_error") {
    return language === "en"
      ? "Network connection failed while initializing the training session. Check the network and retry initialization."
      : "初始化训练会话时网络连接失败，请检查网络后重新初始化。";
  }
  if (reason === "origin_mismatch") {
    return language === "en"
      ? "This application version cannot submit training records. Update the application and retry."
      : "当前应用版本无法提交训练记录，请更新应用后重试。";
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

function orderSubmissionFailureMessage(error: unknown, language: LanguageCode) {
  const reason = trainingFailureReason(error);
  if (reason === "desktop_runtime") {
    return desktopRuntimeFailureMessage(error instanceof ApiRequestError ? error.code : "unknown_runtime_failure", language);
  }
  if (reason === "configuration_error") {
    return language === "en"
      ? "Training records are temporarily unavailable, so this order cannot be saved. Please retry later."
      : "训练记录暂时不可用，医嘱无法保存，请稍后重试。";
  }
  if (reason === "attempt_not_found" || reason === "token_expired" || reason === "token_missing") {
    return language === "en"
      ? "The training session has expired. Reinitialize the training session, then place the order again."
      : "训练会话已失效，请重新初始化训练会话后再次开单。";
  }
  if (reason === "stage_mismatch" || reason === "state_mismatch") {
    return language === "en"
      ? "The training stage changed. Refresh to restore the latest stage, then place the order again."
      : "训练阶段已变化，请刷新恢复最新阶段后再次开单。";
  }
  if (reason === "origin_mismatch") {
    return language === "en"
      ? "This application version cannot save orders. Update the application and retry."
      : "当前应用版本无法保存医嘱，请更新应用后重试。";
  }
  if (reason === "rate_limit") {
    return language === "en" ? "Orders are being submitted too quickly. Wait briefly and retry." : "开单请求过于频繁，请稍候重试。";
  }
  if (reason === "network_error") {
    return language === "en" ? "The network request failed. Check the connection and place the order again." : "开单请求网络连接失败，请检查连接后重试。";
  }
  return language === "en" ? "The order was not accepted. Keep the page open and retry." : "开单请求未被服务接受，请保持页面打开并重试。";
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

type PersistedAttemptState = {
  attempt?: AttemptIdentity;
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
  serverEvidenceOptions?: StudentEvidenceOption[];
  pendingHistoryLogs?: PendingHistoryLog[];
  osceTimeLeft?: number;
} & StoredAttemptState;

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
type StudentOrderCatalogItem = OrderCatalogItem & {
  catalogId?: string;
  sourceOrderId?: string;
  applicableSex?: string[];
};

const orderCatalog = buildStudentOrderCatalog([
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
]) as StudentOrderCatalogItem[];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const consultCatalog = consultCatalogJson as ConsultCatalogItem[];
const orderPrimaryTabs = ["检验", "检查", "病理/操作", "围术期评估"];
const labSecondaryOrder = ["尿液基础", "尿液感染", "尿液肿瘤", "尿液蛋白/肾小球线索", "血液基础", "炎症感染", "凝血/输血", "肾内免疫", "结石代谢", "大便/全身鉴别"];
const imagingSecondaryOrder = ["超声", "X线", "CT", "MRI", "内镜", "核医学", "功能检查"];
const consultGroupOrder = ["外科", "内科", "辅助/平台", "急诊/危重"];
const PATIENT_REPLY_TIMEOUT_MS = Math.max(
  30000,
  Math.min(Number(process.env.NEXT_PUBLIC_PATIENT_REPLY_TIMEOUT_MS) || 30000, 90000)
);
const EXPECTED_API_VERSION = "2.6.0";
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

function safeText(value: unknown, fallback = "") {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return fallback;
  const text = String(value)
    .replace(/\b(?:undefined|null)\b/gi, "")
    .replace(/\[object Object\]/gi, "")
    .replace(/\{\s*"?(?:type|metadata|debug|internal)[\s\S]*\}/gi, "")
    .trim();
  return text || fallback;
}

function sanitizeAnswers(value: unknown): FullProcessAnswers {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<Record<keyof FullProcessAnswers, unknown>> : {};
  return {
    ...emptyAnswers,
    ...Object.fromEntries(Object.keys(emptyAnswers).map((key) => {
      const typedKey = key as keyof FullProcessAnswers;
      if (typedKey === "selectedOrders" || typedKey === "consultDepartments") {
        const items = Array.isArray(source[typedKey]) ? source[typedKey] as unknown[] : [];
        return [typedKey, unique(items.map((item) => safeText(item)).filter(Boolean))];
      }
      return [typedKey, safeText(source[typedKey])];
    }))
  } as FullProcessAnswers;
}

function sanitizeTimeline(value: unknown, lang: LanguageCode): TimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Partial<Record<keyof TimelineEvent, unknown>>;
    const stageNo = Number(item.stageNo);
    if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > 7) return [];
    const allowedTypes = new Set<TimelineEvent["type"]>(["ask", "answer", "technical", "exam", "order", "result", "diagnosis", "mdt", "treatment", "perioperative", "submit", "timeout"]);
    const type = allowedTypes.has(item.type as TimelineEvent["type"]) ? item.type as TimelineEvent["type"] : "technical";
    const label = studentFacingClinicalText(item.label, lang, lang === "en" ? "Training record" : "训练记录");
    const rawDetail = studentFacingClinicalText(item.detail, lang);
    const detail = !rawDetail || /[:：]\s*$/u.test(rawDetail)
      ? (type === "result" ? (lang === "en" ? "Result temporarily unavailable" : "结果暂不可用") : rawDetail.replace(/[:：]\s*$/u, ""))
      : rawDetail;
    if (!detail) return [];
    const at = safeText(item.at);
    const parsedAt = Number.isFinite(Date.parse(at)) ? at : new Date().toISOString();
    return [{ id: safeText(item.id, `restored-${index}-${stageNo}`), stageNo: stageNo as AgentStageNo, type, label, detail, at: parsedAt }];
  });
}

const stageNames: Record<AgentStageNo, Record<LanguageCode, string>> = {
  1: { zh: "病史采集", en: "History taking" },
  2: { zh: "检查与开单", en: "Investigation and ordering" },
  3: { zh: "诊断构建", en: "Diagnosis builder" },
  4: { zh: "多学科协作", en: "Multidisciplinary consultation" },
  5: { zh: "治疗医嘱", en: "Treatment orders" },
  6: { zh: "围术期管理", en: "Perioperative management" },
  7: { zh: "总结与报告", en: "Summary and report" }
};

function stageName(stageNo: AgentStageNo, lang: LanguageCode) {
  return stageNames[stageNo][lang];
}

const englishDepartmentLabels: Record<string, string> = {
  "血管外科": "Vascular surgery", "普通外科/胃肠外科": "General / gastrointestinal surgery", "创伤外科/急诊外科": "Trauma / emergency surgery", "妇产科": "Obstetrics and gynaecology",
  "肾内科": "Nephrology", "感染科": "Infectious diseases", "肿瘤内科": "Oncology", "血液科": "Haematology", "心内科": "Cardiology", "神经内科": "Neurology", "内分泌科": "Endocrinology", "风湿免疫科": "Rheumatology", "呼吸内科": "Respiratory medicine",
  "影像科": "Radiology", "病理科": "Pathology", "麻醉科": "Anaesthesiology", "输血科": "Transfusion medicine", "临床药师": "Clinical pharmacy", "介入放射科": "Interventional radiology", "放疗科": "Radiation oncology", "核医学科": "Nuclear medicine",
  "急诊科": "Emergency medicine", "重症医学科/ICU": "Critical care / ICU"
};

function departmentLabel(department: string, lang: LanguageCode) {
  return lang === "en" ? englishDepartmentLabels[department] || "Specialty consultation" : department;
}

function consultGroupLabel(group: string, lang: LanguageCode) {
  if (lang === "zh") return group;
  return ({ "外科": "Surgical specialties", "内科": "Medical specialties", "辅助/平台": "Diagnostic and support specialties", "急诊/危重": "Emergency and critical care" } as Record<string, string>)[group] || "Other specialties";
}

type EvidenceOption = { id: string; label: string };
type DifferentialRow = { name: string; support: string[]; oppose: string[]; note: string };
type MedicationRow = { name: string; dose: string; route: string; frequency: string; duration: string; indication: string };

function compactLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").replace(/\|\|/g, "／").trim();
}

function extractStudentEvidenceOptions(value: unknown): StudentEvidenceOption[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as { evidenceOptions?: unknown }).evidenceOptions;
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Partial<StudentEvidenceOption>;
    const evidenceId = safeText(candidate.evidenceId);
    const label = safeText(candidate.label);
    const sourceStage = Number(candidate.sourceStage);
    if (!/^EV-[A-Za-z0-9-]{1,80}$/.test(evidenceId) || !label || !Number.isInteger(sourceStage) || sourceStage < 1 || sourceStage > 7) return [];
    return [{ evidenceId, label, sourceStage }];
  });
}

function normalizeEvidenceSelection(selected: string[], options: EvidenceOption[]) {
  const byId = new Map(options.map((option) => [option.id, option.id]));
  const byLabel = new Map(options.map((option) => [option.label, option.id]));
  return unique(selected.map((value) => byId.get(value) || byLabel.get(value) || ""));
}

function parseEvidenceAnswer(value: string) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const selected = lines
    .filter((line) => line.startsWith("【证据ID】") || line.startsWith("【证据】"))
    .map((line) => line.replace(/^【证据(?:ID)?】/, "").trim());
  const note = lines.find((line) => line.startsWith("【补充说明】"))?.slice(6).trim()
    || (selected.length ? "" : lines.join("\n"));
  return { selected: unique(selected), note };
}

function serializeEvidenceAnswer(selected: string[], note: string) {
  return [...unique(selected).map((item) => `【证据ID】${compactLine(item)}`), ...(note.trim() ? [`【补充说明】${compactLine(note)}`] : [])].join("\n");
}

function parseDifferentialRows(namesText: string, analysisText: string): DifferentialRow[] {
  const names = String(namesText || "").split(/[\r\n；;]/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const blocks = String(analysisText || "").split(/\n---\n/);
  return [0, 1, 2].map((index) => {
    const block = blocks.find((item) => item.startsWith(`【鉴别${index + 1}】`)) || "";
    const support = block.match(/【支持证据】([^\n]*)/)?.[1]?.split(" || ") || [];
    const oppose = block.match(/【不支持证据】([^\n]*)/)?.[1]?.split(" || ") || [];
    const note = block.match(/【补充说明】([^\n]*)/)?.[1] || "";
    return { name: names[index] || block.match(/^【鉴别\d】([^\n]*)/)?.[1]?.trim() || "", support: unique(support), oppose: unique(oppose), note: note.trim() };
  });
}

function serializeDifferentialRows(rows: DifferentialRow[]) {
  return rows.slice(0, 3).map((row, index) => [
    `【鉴别${index + 1}】${compactLine(row.name)}`,
    `【支持证据】${unique(row.support).map(compactLine).join(" || ")}`,
    `【不支持证据】${unique(row.oppose).map(compactLine).join(" || ")}`,
    ...(row.note.trim() ? [`【补充说明】${compactLine(row.note)}`] : [])
  ].join("\n")).join("\n---\n");
}

function parseTestPlans(value: string) {
  return String(value || "").split(/\r?\n/).map((line) => {
    const match = /^【检查】(.*?)【目的】(.*)$/.exec(line.trim());
    return match ? { name: match[1].trim(), purpose: match[2].trim() } : null;
  }).filter((item): item is { name: string; purpose: string } => Boolean(item?.name));
}

function serializeTestPlans(rows: Array<{ name: string; purpose: string }>) {
  return rows.filter((row) => row.name.trim()).map((row) => `【检查】${compactLine(row.name)}【目的】${compactLine(row.purpose)}`).join("\n");
}

function parseDepartmentField(value: string, departments: string[]) {
  const map: Record<string, string> = {};
  const lines = String(value || "").split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const match = /^【(.+?)】(.*)$/.exec(line.trim());
    if (match) map[match[1]] = match[2].trim();
  });
  if (!Object.keys(map).length && value.trim() && departments[0]) map[departments[0]] = value.trim();
  return map;
}

function serializeDepartmentField(map: Record<string, string>, departments: string[]) {
  return departments.filter((department) => map[department]?.trim()).map((department) => `【${department}】${compactLine(map[department])}`).join("\n");
}

function parseSection(value: string, section: string) {
  const pattern = new RegExp(`【${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}】([\\s\\S]*?)(?=\\n【[^】]+】|$)`);
  return pattern.exec(String(value || ""))?.[1]?.trim() || "";
}

function replaceSection(value: string, section: string, content: string) {
  const sections = new Map<string, string>();
  String(value || "").split(/\n(?=【[^】]+】)/).forEach((block) => {
    const match = /^【([^】]+)】([\s\S]*)$/.exec(block.trim());
    if (match) sections.set(match[1], match[2].trim());
  });
  if (!sections.size && value.trim()) sections.set(section, value.trim());
  if (content.trim()) sections.set(section, content.trim()); else sections.delete(section);
  return [...sections.entries()].map(([name, body]) => `【${name}】${body}`).join("\n");
}

function parseMedicationRows(value: string): MedicationRow[] {
  const empty = () => ({ name: "", dose: "", route: "", frequency: "", duration: "", indication: "" });
  const rows = String(value || "").split(/\r?\n/).map((line) => {
    const match = /^药物\/类别：([^｜]*)｜剂量：([^｜]*)｜途径：([^｜]*)｜频次：([^｜]*)｜疗程：([^｜]*)｜适应证：(.*)$/.exec(line.trim());
    return match ? { name: match[1].trim(), dose: match[2].trim(), route: match[3].trim(), frequency: match[4].trim(), duration: match[5].trim(), indication: match[6].trim() } : null;
  }).filter((row): row is MedicationRow => Boolean(row));
  return [...rows.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - rows.length) }, empty)];
}

function serializeMedicationRows(rows: MedicationRow[]) {
  return rows.filter((row) => Object.values(row).some((value) => value.trim())).map((row) => `药物/类别：${compactLine(row.name)}｜剂量：${compactLine(row.dose)}｜途径：${compactLine(row.route)}｜频次：${compactLine(row.frequency)}｜疗程：${compactLine(row.duration)}｜适应证：${compactLine(row.indication)}`).join("\n");
}

const perioperativeItems: Record<LanguageCode, string[]> = {
  zh: ["手术适应证确认", "麻醉评估", "心肺风险", "肾功能与液体管理", "抗菌药物与感染控制", "备血", "凝血与抗凝/抗血小板", "VTE预防", "导管、引流和支架", "术后监测", "并发症预防", "ERAS", "随访与患者教育"],
  en: ["Confirm surgical indication", "Anaesthetic assessment", "Cardiopulmonary risk", "Renal function and fluid management", "Antimicrobials and infection control", "Blood preparation", "Coagulation and antithrombotic management", "VTE prevention", "Catheters, drains and stents", "Postoperative monitoring", "Complication prevention", "ERAS", "Follow-up and patient education"]
};

function parsePerioperative(value: string) {
  const selected: string[] = [];
  const notes: Record<string, string> = {};
  String(value || "").split(/\r?\n/).forEach((line) => {
    const match = /^【清单】([^｜]+)(?:｜备注：(.*))?$/.exec(line.trim());
    if (!match) return;
    selected.push(match[1].trim());
    notes[match[1].trim()] = match[2]?.trim() || "";
  });
  return { selected: unique(selected), notes };
}

function serializePerioperative(selected: string[], notes: Record<string, string>) {
  return unique(selected).map((item) => `【清单】${compactLine(item)}${notes[item]?.trim() ? `｜备注：${compactLine(notes[item])}` : ""}`).join("\n");
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
  const parsed = Date.parse(String(iso || ""));
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleTimeString(lang === "en" ? "en-GB" : "zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
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

function patientOpening(lang: LanguageCode) {
  return lang === "en"
    ? "Hello doctor. I came in for a consultation."
    : "医生您好，我来看一下。";
}

function studentStageLabel(stageNo: number, lang: LanguageCode) {
  const safeStage = Math.max(1, Math.min(7, Number(stageNo) || 1)) as AgentStageNo;
  return lang === "en" ? `Stage ${safeStage} · ${stageName(safeStage, lang)}` : `第${safeStage}阶段 · ${stageName(safeStage, lang)}`;
}

function orderOutcomeLabel(status: string, lang: LanguageCode) {
  const labels: Record<string, [string, string]> = {
    reported: ["报告已返回", "Report returned"],
    no_indication: ["无明确适应证", "No clear indication"],
    not_performed: ["未实施", "Not performed"],
    no_specimen: ["未取材", "No specimen collected"],
    medical_review_pending: ["等待医学审核", "Awaiting medical review"],
    prerequisite_missing: ["前置条件未满足", "Prerequisite not met"],
    duplicate: ["已重复", "Duplicate order"],
    unrecognized: ["未识别", "Not recognized"],
    unavailable: ["暂不可用", "Unavailable"],
    not_provided: ["未实施", "Not performed"]
  };
  return (labels[status] || ["状态已更新", "Status updated"])[lang === "en" ? 1 : 0];
}

function percentageScore(rawScore: number) {
  return Math.round((rawScore / 360) * 1000) / 10;
}

function studentScoreText(value: unknown, lang: LanguageCode) {
  return projectStudentScoreText(studentFacingClinicalText(value, lang), lang);
}

const internalFieldNames = ["answerSource", "intent", "factState", "requestedSlot", "provider", "provenance"];
const internalActionLabels: Record<string, Record<LanguageCode, string>> = {
  slot_answered: { zh: "问诊信息", en: "History finding" },
  patient_interview: { zh: "问诊", en: "History" },
  physical_exam_performed: { zh: "查体", en: "Physical examination" },
  order_placed: { zh: "检查医嘱", en: "Investigation order" },
  result_returned: { zh: "检查结果", en: "Investigation result" },
  diagnosis_supported: { zh: "诊断依据", en: "Diagnostic rationale" },
  consultation_request: { zh: "会诊申请", en: "Consultation request" },
  consult_requested: { zh: "会诊申请", en: "Consultation request" },
  treatment_action: { zh: "治疗医嘱", en: "Treatment order" },
  perioperative_action: { zh: "围术期管理", en: "Perioperative management" },
  submission_recorded: { zh: "阶段提交", en: "Stage submission" },
  diagnosis_submission: { zh: "诊断阶段提交", en: "Diagnosis stage submission" },
  consult_submission: { zh: "会诊阶段提交", en: "Consultation stage submission" },
  treatment_submission: { zh: "治疗阶段提交", en: "Treatment stage submission" },
  perioperative_submission: { zh: "围术期阶段提交", en: "Perioperative stage submission" },
  debrief_submission: { zh: "复盘提交", en: "Review submission" }
};

function canonicalSlotLabel(value: unknown, lang: LanguageCode) {
  const raw = safeText(value).trim();
  const aliases: Record<string, string> = {
    smokingHistory: "smoking",
    smoking_history: "smoking",
    LIFE_SMOKING: "smoking",
    alcoholHistory: "alcohol",
    alcohol_history: "alcohol",
    LIFE_ALCOHOL: "alcohol"
  };
  const key = aliases[raw] || raw;
  const definition = canonicalSlotDefinitions.find((item) => String(item.id) === key);
  return definition ? (lang === "en" ? definition.labelEn : definition.labelZh) : "";
}

function publicCatalogLabel(value: string, lang: LanguageCode) {
  const token = value.trim();
  const order = orderCatalog.find((item) => [item.orderId, item.sourceOrderId, item.catalogId].some((id) => id === token));
  if (order) return (presentOrderCatalogItem(order, lang) as PresentedOrderCatalogItem).displayName;
  const exam = physicalExamItems.find((item) => item.examId === token);
  if (exam) return (presentPhysicalExamItem(exam, lang) as PresentedPhysicalExamItem).displayName;
  if (/^PE(?:-|\d)/i.test(token)) return lang === "en" ? "Physical examination finding" : "查体所见";
  if (/^(?:LAB|IMG|MED)(?:-|\d)/i.test(token)) return lang === "en" ? "Investigation finding" : "检查结果";
  if (/^EV-/i.test(token)) return lang === "en" ? "Collected clinical evidence" : "已采集临床证据";
  return "";
}

function jsonValuesWithoutInternalFields(value: string) {
  if (!/^[\[{]/.test(value.trim())) return "";
  try {
    const parsed = JSON.parse(value) as unknown;
    const values: string[] = [];
    const visit = (candidate: unknown, key = "") => {
      if (internalFieldNames.includes(key)) return;
      if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") values.push(String(candidate));
      else if (Array.isArray(candidate)) candidate.forEach((item) => visit(item));
      else if (candidate && typeof candidate === "object") Object.entries(candidate).forEach(([childKey, item]) => visit(item, childKey));
    };
    visit(parsed);
    return unique(values).join("；");
  } catch {
    return "";
  }
}

function studentFacingClinicalText(value: unknown, lang: LanguageCode, fallback = "") {
  const original = safeText(value);
  if (!original) return fallback;
  const jsonValues = jsonValuesWithoutInternalFields(original);
  let text = jsonValues || original;
  const canonicalMatches: string[] = canonicalSlotDefinitions
    .map((definition) => definition.id)
    .filter((key) => new RegExp(`(?:^|[^A-Za-z0-9_])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z0-9_])`).test(text));
  for (const alias of ["smokingHistory", "smoking_history", "LIFE_SMOKING", "alcoholHistory", "alcohol_history", "LIFE_ALCOHOL"]) {
    if (text.includes(alias)) canonicalMatches.push(alias);
  }
  const firstCanonicalLabel = canonicalMatches.map((key) => canonicalSlotLabel(key, lang)).find(Boolean) || "";
  if (firstCanonicalLabel && /slot_answered|patient[_ ]interview|evidence collected|Patient-reported evidence collected|已采集/u.test(text)) {
    return lang === "en" ? `History: ${firstCanonicalLabel} — obtained` : `问诊：${firstCanonicalLabel}——已采集`;
  }
  text = text.replace(/\b(?:EV-[A-Za-z0-9-]+|(?:LAB|IMG|MED)-[A-Za-z0-9-]+|PE(?:-[A-Za-z0-9-]+|\d+))\b/g, (token) => publicCatalogLabel(token, lang));
  for (const definition of canonicalSlotDefinitions) {
    const label = lang === "en" ? definition.labelEn : definition.labelZh;
    text = text.replace(new RegExp(`\\b${definition.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), label);
  }
  for (const [key, labels] of Object.entries(internalActionLabels)) {
    text = text.replace(new RegExp(`\\b${key}\\b`, "g"), labels[lang]);
  }
  for (const field of internalFieldNames) {
    text = text.replace(new RegExp(`\\b${field}\\b\\s*[:=：]\\s*[^,，;；}\\]\\s]+`, "gi"), "");
    text = text.replace(new RegExp(`\\b${field}\\b`, "gi"), "");
  }
  text = text.replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, lang === "en" ? "status recorded" : "状态已记录");
  return projectStudentScoreText(text
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\s*[:：]\s*[—–-]\s*/g, lang === "en" ? ": " : "：")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:[；;,，]\s*){2,}/g, lang === "en" ? "; " : "；")
    .trim() || fallback, lang);
}

function studentEvidenceLabel(value: unknown, lang: LanguageCode) {
  return studentFacingClinicalText(value, lang, lang === "en" ? "Collected clinical evidence" : "已采集临床证据");
}

function clinicalTrajectoryEntryText(entry: Evaluator360Report["clinicalTrajectory"] extends infer T ? T extends { questions: Array<infer E> } ? E : never : never, lang: LanguageCode) {
  const canonical = canonicalSlotLabel(entry.canonical, lang);
  if (entry.stage === 1 && canonical) return lang === "en" ? `History: ${canonical} — obtained` : `问诊：${canonical}——已采集`;
  const action = studentFacingClinicalText(canonical || publicTrajectoryActionLabel(entry.action, lang) || entry.canonical, lang, lang === "en" ? "Clinical action" : "临床操作");
  const result = studentFacingClinicalText(entry.result, lang);
  return `${action}${result && result !== action ? ` — ${result}` : ""}`;
}

function caseDisplay(caseData: StudentVisibleCase, lang: LanguageCode) {
  const publicIdentifier = caseData.displayCaseId || caseData.id;
  const publicCaseId = /^P(\d+)$/.exec(publicIdentifier);
  const caseNumber = publicCaseId
    ? String(Number(publicCaseId[1])).padStart(2, "0")
    : publicIdentifier;
  return {
    title: lang === "en" ? `Case ${caseNumber}` : `病例 ${caseNumber}`,
    age: caseData.age,
    sex: lang === "en" ? caseData.sexEn || (caseData.sex === "女" ? "Female" : "Male") : caseData.sex
  };
}

type PresentedPhysicalExamItem = PhysicalExamItem & { translationAvailable: boolean };
type PresentedOrderCatalogItem = StudentOrderCatalogItem & {
  primaryCategoryLabel?: string;
  secondaryCategoryLabel?: string;
  priorityLabel?: string;
  studentDisplayHintLabel?: string;
  translationAvailable: boolean;
};

function groupPhysicalExamItems(language: LanguageCode, sex: string) {
  const grouped = new Map<string, PhysicalExamItem[]>();
  physicalExamItems
    .filter((item) => !(item.examId.startsWith("PE2") && sex === "女"))
    .filter((item) => !(item.examId.startsWith("PE3") && sex === "男"))
    .forEach((item) => grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]));
  return Array.from(grouped.entries()).map(([category, items]) => {
    const presented = items.map((item) => presentPhysicalExamItem(item, language) as PresentedPhysicalExamItem);
    return {
      category: language === "en" ? safeStudentFacingText(category, language, "Physical examination") : category,
      items: presented
    };
  });
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
        ...(desktopRuntimeConfig()?.debugRuntime ? { debug: true } : {}),
        studentInput: question,
        conversationHistory: messages.slice(-6).map((message) => ({ role: message.role, text: message.text })),
        askedSlotIds: askedSlots,
        askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text)
      }, { timeoutMs: PATIENT_REPLY_TIMEOUT_MS, retries: 2, signal, endpointName: "patient-reply", idempotencyKey: createIdempotencyKey(attemptId, "patient", recoveryCycle, question.trim().toLowerCase()) });
}

async function probeAiPatient({ caseId, sessionId, attemptId, mode, language, signal }: { caseId: string; sessionId: string; attemptId: string; mode: TrainingMode; language: LanguageCode; signal?: AbortSignal }) {
  return requestJson<PatientReplyApiResponse>(publicApiConfig.patientAgent, {
    caseId, sessionId, attemptId, mode, language, agentId: "standardized_patient", probe: true
  }, { timeoutMs: PATIENT_REPLY_TIMEOUT_MS, retries: 1, signal, endpointName: "patient-probe", idempotencyKey: createIdempotencyKey(attemptId, "patient-probe") });
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
  const resultText = safeStudentFacingText(item.result, lang, ENGLISH_RESULT_PLACEHOLDER);
  const impression = safeStudentFacingText(item.impression, lang, ENGLISH_RESULT_PLACEHOLDER);
  const orderCategory = safeStudentFacingText(item.orderCategory, lang, ENGLISH_CATEGORY_PLACEHOLDER);
  const teachingExplanation = safeStudentFacingText(item.teachingExplanation, lang, ENGLISH_RESULT_PLACEHOLDER);
  const valueFingerprints = new Set(formatReportLines(safeStudentFacingText(item.value, lang, ENGLISH_RESULT_PLACEHOLDER)).map((line) => clinicalResultFingerprint(line)));
  const lines = formatReportLines(resultText).filter((line) => !valueFingerprints.has(clinicalResultFingerprint(line)));
  const status = reportStatusPresentation(item, lang);
  const statusClass = status.state === "needs-review" ? "ui-status-warning" : status.state === "abnormal" ? "ui-status-danger" : status.state === "normal" ? "ui-status-success" : "ui-status-info";
  const missingReviewedMetadata = item.metadataStatus === "awaiting_reviewed_metadata"
    || (item.status === "final" && /\d/.test(String(item.value || "")) && (!item.unit || !item.referenceRange));
  const unit = item.unit || (missingReviewedMetadata ? (lang === "en" ? ENGLISH_METADATA_PLACEHOLDER : "等待审核元数据") : "—");
  const referenceRange = item.referenceRange || (missingReviewedMetadata ? (lang === "en" ? ENGLISH_METADATA_PLACEHOLDER : "等待审核元数据") : "—");
  return (
    <article data-testid="report-card" data-status={status.state} className="mt-3 rounded-xl border border-clinic-line bg-white p-4 text-sm leading-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-clinic-blue">{orderCategory}</p>
        <span className={`ui-status ${statusClass}`}>
          {status.state === "needs-review" ? <AlertTriangle size={14} aria-hidden="true" /> : status.state === "abnormal" ? <CircleAlert size={14} aria-hidden="true" /> : status.state === "normal" ? <CircleCheck size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
          {status.label}
        </span>
      </div>
      {(item.value || item.unit || item.referenceRange) && (
        <dl className="mt-3 grid gap-2 rounded-lg bg-clinic-paper p-3 sm:grid-cols-3">
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Value" : "结果"}</dt><dd className="mt-0.5 whitespace-pre-line font-semibold text-clinic-ink">{safeStudentFacingText(item.value, lang, ENGLISH_RESULT_PLACEHOLDER) || "—"}</dd></div>
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Unit" : "单位"}</dt><dd className="mt-0.5 text-clinic-ink">{unit}</dd></div>
          <div><dt className="text-xs text-clinic-muted">{lang === "en" ? "Reference range" : "参考范围"}</dt><dd className="mt-0.5 text-clinic-ink">{referenceRange}</dd></div>
        </dl>
      )}
      {lines.length > 0 && <div className="mt-3 grid gap-2">
        {lines.map((line, lineIndex) => (
          <p data-testid="report-result-line" key={`${item.resultId || item.orderId}:result-line:${lineIndex}:${line}`} className="rounded-lg bg-clinic-paper px-3 py-2">{line}</p>
        ))}
      </div>}
      {item.impression && <p className="mt-3 border-l-2 border-clinic-blue pl-3"><span className="font-semibold">{lang === "en" ? "Impression" : "印象"}：</span>{impression}</p>}
      {item.teachingExplanation && <p className="mt-3 text-xs leading-5 text-clinic-muted">{t(lang, "releaseRule")}：{teachingExplanation}</p>}
    </article>
  );
}

function FeedbackBox({ evaluation, lang }: { evaluation: StageEvaluation; lang: LanguageCode }) {
  const feedbackCopy = evaluation.stageKey === "diagnosis"
    ? {
        hit: lang === "en" ? "Matched points" : "命中点",
        miss: lang === "en" ? "Missing evidence" : "缺失证据",
        warning: lang === "en" ? "Inappropriate evidence" : "不恰当证据"
      }
    : evaluation.stageKey === "treatment"
      ? {
          hit: lang === "en" ? "Appropriate orders" : "合理医嘱",
          miss: lang === "en" ? "Missing orders" : "遗漏医嘱",
          warning: lang === "en" ? "Unnecessary orders / risks" : "不必要医嘱、禁忌或风险"
        }
      : evaluation.stageKey === "perioperative"
        ? {
            hit: lang === "en" ? "Completed items" : "命中项目",
            miss: lang === "en" ? "Missing items" : "遗漏项目",
            warning: lang === "en" ? "Unsafe items" : "危险项目"
          }
        : {
            hit: t(lang, "hitItems"),
            miss: t(lang, "missingRiskItems"),
            warning: lang === "en" ? "Points to review" : "需复核项目"
          };
  const detailed = {
    hits: evaluation.feedbackEvidence?.hits || evaluation.hits.map((text) => ({ text, evidenceIds: [] })),
    misses: evaluation.feedbackEvidence?.misses || evaluation.misses.map((text) => ({ text, evidenceIds: [] })),
    warnings: evaluation.feedbackEvidence?.warnings || evaluation.warnings.map((text) => ({ text, evidenceIds: [] }))
  };
  const feedbackList = (items: typeof detailed.hits) => items.length
    ? <ul className="mt-2 space-y-2 text-clinic-muted">{items.map((item, index) => (
        <li key={`${item.text}-${index}`}>
          <span>{studentFacingClinicalText(item.text, lang, t(lang, "none"))}</span>
        </li>
      ))}</ul>
    : <p className="mt-2 text-clinic-muted">{t(lang, "none")}</p>;
  return (
    <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-clinic-blue">{t(lang, "stageFeedback")}</h3>
        <div className="flex items-center gap-2">
          {evaluation.practiceOnly && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{lang === "en" ? "Practice-only feedback" : "仅练习反馈"}</span>}
          <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-clinic-blue">{evaluation.max > 0 ? Math.round((evaluation.score / evaluation.max) * 100) : 0}%</span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6">{studentScoreText(evaluation.comment, lang)}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-emerald-800"><CircleCheck size={16} aria-hidden="true" />{feedbackCopy.hit}</p>
          {feedbackList(detailed.hits)}
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} aria-hidden="true" />{feedbackCopy.miss}</p>
          {feedbackList(detailed.misses)}
        </div>
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-rose-900"><CircleAlert size={16} aria-hidden="true" />{feedbackCopy.warning}</p>
          {feedbackList(detailed.warnings)}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-clinic-blue">{evaluation.stageKey === "perioperative"
          ? (lang === "en" ? "Reference answer / key points" : "参考答案 / 参考要点")
          : t(lang, "standardReference")}</summary>
        <FormattedText text={studentScoreText(evaluation.standardAnswer, lang)} />
      </details>
    </section>
  );
}

function FinalReport({ report, lang }: { report: Evaluator360Report; lang: LanguageCode }) {
  const strengths = report.items.filter((item) => item.max > 0 && item.score / item.max >= 0.8).map((item) => studentFacingClinicalText(item.label, lang));
  const priorities = report.items.filter((item) => item.criticalErrors.length || item.misses.length || item.improvements.length).map((item) => studentFacingClinicalText(item.label, lang));
  const trajectoryGroups = report.clinicalTrajectory ? [
    [lang === "en" ? "Questions asked" : "问过什么", report.clinicalTrajectory.questions],
    [lang === "en" ? "Evidence acquired" : "获得的证据", report.clinicalTrajectory.acquiredEvidence],
    [lang === "en" ? "Examinations and orders" : "检查与医嘱", report.clinicalTrajectory.examinationsAndOrders],
    [lang === "en" ? "Diagnosis formation" : "诊断形成", report.clinicalTrajectory.diagnosisFormation],
    [lang === "en" ? "Consultation decisions" : "会诊决策", report.clinicalTrajectory.consultations],
    [lang === "en" ? "Treatment orders" : "治疗医嘱", report.clinicalTrajectory.treatmentOrders],
    [lang === "en" ? "Perioperative management" : "围术期管理", report.clinicalTrajectory.perioperativeManagement]
  ] as const : [];
  return (
    <section id="final-report-details" data-testid="final-report" className="rounded-xl border border-clinic-line bg-white p-5 print:border-0 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "Full training report" : "完整训练报告"}</h3>
          <p className="text-sm text-clinic-muted">{t(lang, "reportBasis")}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="no-print rounded-md border border-clinic-line px-3 py-2 text-sm font-medium hover:border-clinic-blue">{t(lang, "printReport")}</button>
      </div>
      {report.redFlags.length > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p className="mb-1 inline-flex items-center gap-2 font-semibold"><CircleAlert size={16} aria-hidden="true" />{lang === "en" ? "Safety-critical omissions" : "危险遗漏与安全提醒"}</p>
          {report.redFlags.map((warning) => <p key={warning}>{studentFacingClinicalText(warning, lang)}</p>)}
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
      {report.clinicalTrajectory && <section data-testid="clinical-trajectory" className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
        <h4 className="font-semibold text-clinic-blue">{lang === "en" ? "Complete clinical trajectory" : "完整临床轨迹复盘"}</h4>
        <p className="mt-1 text-sm text-clinic-muted">{lang === "en" ? "Review the actions and results recorded during this attempt." : "按本次训练中实际记录的操作与结果进行复盘。"}</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {trajectoryGroups.map(([label, entries]) => <details key={label} className="rounded-lg bg-white p-3" open={entries.length > 0}>
            <summary className="cursor-pointer font-medium">{label}（{entries.length}）</summary>
            {entries.length > 0 ? <ol className="mt-2 space-y-2 text-sm leading-6">{entries.map((entry) => <li key={`${label}-${entry.evidenceId}`}>
              <p>{clinicalTrajectoryEntryText(entry, lang)}</p>
            </li>)}</ol> : <p className="mt-2 text-sm text-clinic-muted">{t(lang, "none")}</p>}
          </details>)}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg bg-white p-3 text-sm">
            <h5 className="font-medium">{lang === "en" ? "Decisions that advanced the pathway" : "改变后续流程的决策"}</h5>
            {report.clinicalTrajectory.decisionTransitions.length > 0 ? <ul className="mt-2 space-y-2">{report.clinicalTrajectory.decisionTransitions.map((item) => <li key={item.decisionEvidenceId}>{studentFacingClinicalText(item.reason, lang)}</li>)}</ul> : <p className="mt-2 text-clinic-muted">{t(lang, "none")}</p>}
          </section>
          <section className="rounded-lg bg-white p-3 text-sm">
            <h5 className="font-medium">{lang === "en" ? "Key omissions" : "关键步骤遗漏"}</h5>
            {report.clinicalTrajectory.omissions.length > 0 ? <ul className="mt-2 space-y-1">{report.clinicalTrajectory.omissions.slice(0, 24).map((item) => <li key={`${item.domain}-${item.rubricItemId}`}>{studentFacingClinicalText(item.domain, lang)} · {studentFacingClinicalText(item.label, lang)}</li>)}</ul> : <p className="mt-2 text-clinic-muted">{t(lang, "none")}</p>}
          </section>
          <section className="rounded-lg bg-white p-3 text-sm lg:col-span-2" data-testid="unnecessary-investigations">
            <h5 className="font-medium">{lang === "en" ? "Potentially unnecessary investigations" : "可能的不必要检查"}</h5>
            {(report.clinicalTrajectory.unnecessaryInvestigations || []).length > 0 ? <ul className="mt-2 space-y-2">{(report.clinicalTrajectory.unnecessaryInvestigations || []).map((item) => <li key={item.evidenceId}>{studentFacingClinicalText(item.result, lang)}</li>)}</ul> : <p className="mt-2 text-clinic-muted">{t(lang, "none")}</p>}
          </section>
        </div>
      </section>}
      <details data-testid="score-details" className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
        <summary className="cursor-pointer font-semibold text-clinic-blue">{lang === "en" ? "Domain performance details" : "分项表现详情"}</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {report.items.map((item) => {
            const pct = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
            return (
              <div key={item.label} className="break-inside-avoid rounded-lg border border-clinic-line bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{studentFacingClinicalText(item.label, lang)}</p>
                  <span className="text-sm font-medium text-clinic-blue">{pct}%</span>
                </div>
                <div role="progressbar" aria-label={`${studentFacingClinicalText(item.label, lang)} ${pct}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-3 h-2 overflow-hidden rounded-full bg-clinic-paper">
                  <div className="h-full rounded-full bg-clinic-teal" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-sm text-clinic-muted">{studentFacingClinicalText(item.comment, lang)}</p>
                <div className="mt-3 space-y-1 text-xs leading-5 text-clinic-muted">
                  <p><span className="font-medium text-clinic-ink">{t(lang, "didWell")}：</span>{item.evidence.map((value) => studentFacingClinicalText(value, lang)).join("；") || t(lang, "noEvidence")}</p>
                  <p><span className="font-medium text-clinic-ink">{t(lang, "needsMore")}：</span>{item.misses.slice(0, 5).map((value) => studentFacingClinicalText(value, lang)).join("；") || t(lang, "noMissing")}</p>
                  {item.sequenceIssues.length > 0 && <p><span className="font-medium text-amber-800">{t(lang, "sequenceIssues")}：</span>{item.sequenceIssues.map((value) => studentFacingClinicalText(value, lang)).join("；")}</p>}
                  {item.overuse.length > 0 && <p><span className="font-medium text-amber-800">{t(lang, "overuse")}：</span>{item.overuse.map((value) => studentFacingClinicalText(value, lang)).join("；")}</p>}
                  {item.criticalErrors.length > 0 && <p className="rounded-md bg-rose-50 px-2 py-1 text-rose-900"><span className="font-semibold">{t(lang, "criticalErrors")}：</span>{item.criticalErrors.map((value) => studentFacingClinicalText(value, lang)).join("；")}</p>}
                  <p><span className="font-medium text-clinic-ink">{t(lang, "nextAdvice")}：</span>{item.improvements.map((value) => studentFacingClinicalText(value, lang)).join("；") || (lang === "en" ? "Maintain the current approach and improve communication efficiency." : "保持当前操作并进一步提高表达效率。")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </details>
      <div className="mt-4 rounded-md bg-clinic-paper p-4">
        <p className="font-medium text-clinic-blue">{t(lang, "clinicalSafetyAlerts")}</p>
        <FormattedText text={report.ragGuardrails.map((value) => studentFacingClinicalText(value, lang)).join("\n")} />
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

async function requestDesktopAttemptResume(body: { attemptId: string; caseId: string; mode: AttemptMode; language: LanguageCode }) {
  const runtime = desktopRuntimeConfig();
  if (!runtime) throw new ApiRequestError("request", 400, "desktop_runtime_missing");
  const response = await fetchWithRecovery(`${runtime.apiBaseUrl}/api/desktop/attempt/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: PATIENT_REPLY_TIMEOUT_MS,
    retries: 0,
    endpointName: "desktop-attempt-resume",
    requestId: createIdempotencyKey(body.attemptId, "desktop-attempt-resume")
  });
  const stateToken = String(response.headers.get("X-Training-State") || "").trim();
  if (!stateToken) throw new ApiRequestError("request", 502, "training_state_token_missing");
  const payload = await response.json() as {
    attemptId: string;
    caseId: string;
    mode: string;
    language: LanguageCode;
    currentStage: number;
    status: string;
    evidenceOptions?: StudentEvidenceOption[];
  };
  const normalizedMode = body.mode === "osce" || body.mode === "rct" ? "formal-attempt" : "public-practice";
  if (payload.attemptId !== body.attemptId || payload.caseId !== body.caseId || ![body.mode, normalizedMode].includes(payload.mode) || payload.language !== body.language) {
    throw new ApiRequestError("request", 409, "attempt_state_mismatch");
  }
  return { payload, stateToken };
}

async function loadDesktopAttemptState(body: { caseId: string; mode: AttemptMode; language: LanguageCode }) {
  const runtime = desktopRuntimeConfig();
  if (!runtime) throw new ApiRequestError("request", 400, "desktop_runtime_missing");
  const result = await requestJson<DesktopStateAuthority & {
    attemptId: string;
    currentStage: number;
    status: string;
    stateToken: string;
    snapshot: PersistedAttemptState;
  }>(`${runtime.apiBaseUrl}/api/desktop/attempt/state`, { action: "load", ...body }, {
    method: "POST",
    timeoutMs: 10_000,
    retries: 0,
    endpointName: "desktop-attempt-state-load"
  });
  if (!isDesktopStateAuthority(result)) throw new Error("desktop_state_authority_invalid");
  return result;
}

async function saveDesktopAttemptState(attempt: AttemptIdentity, snapshot: PersistedAttemptState) {
  const runtime = desktopRuntimeConfig();
  if (!runtime) return;
  const result = await requestJson<DesktopStateAuthority & { saved: true }>(`${runtime.apiBaseUrl}/api/desktop/attempt/state`, {
    action: "save",
    attemptId: attempt.attemptId,
    caseId: attempt.caseId,
    mode: attempt.mode,
    language: attempt.language,
    snapshot
  }, {
    method: "POST",
    timeoutMs: 10_000,
    retries: 0,
    endpointName: "desktop-attempt-state-save"
  });
  if (!isDesktopStateAuthority(result)) throw new Error("desktop_state_authority_invalid");
}

function Disclosure({ summary, children, initiallyOpen = false, testId }: { summary: ReactNode; children: ReactNode; initiallyOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details data-testid={testId} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-xl border border-clinic-line p-4">
      <summary className="cursor-pointer font-semibold text-clinic-blue">{summary}</summary>
      {children}
    </details>
  );
}

function EvidenceChecklist({ options, selected, onChange, lang, ariaLabel, defaultOpen = false }: {
  options: EvidenceOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: LanguageCode;
  ariaLabel: string;
  defaultOpen?: boolean;
}) {
  return (
    <Disclosure testId="evidence-checklist" initiallyOpen={defaultOpen || selected.length > 0} summary={<span className="text-sm font-medium">{ariaLabel} · {selected.length}/{options.length}</span>}>
      <fieldset aria-label={ariaLabel} className="mt-3 border-0 p-0">
        <legend className="sr-only">{ariaLabel}</legend>
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option.id} className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-sm leading-5">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(option.id)}
                onChange={() => onChange(selected.includes(option.id) ? selected.filter((item) => item !== option.id) : [...selected, option.id])}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {!options.length && <p className="px-2 py-3 text-sm text-clinic-muted">{lang === "en" ? "No collected evidence is available yet." : "尚无已采集证据，请先完成病史、查体或检查。"}</p>}
        </div>
      </fieldset>
    </Disclosure>
  );
}

function OrderListEditor({ value, onChange, label, placeholder, testId }: { value: string; onChange: (next: string) => void; label: string; placeholder: string; testId: string }) {
  const rows = value === "" ? [""] : value.split(/\r?\n/).slice(0, 8);
  const updateRow = (index: number, next: string) => onChange(rows.map((row, rowIndex) => rowIndex === index ? next : row).join("\n"));
  return (
    <section data-testid={testId} className="rounded-xl border border-clinic-line bg-white p-4">
      <h4 className="font-semibold text-clinic-blue">{label}</h4>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div key={`${testId}-${index}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs text-clinic-muted">{index + 1}</span>
            <input aria-label={`${label} ${index + 1}`} value={row} onChange={(event) => updateRow(index, event.target.value)} className="ui-input min-w-0 flex-1" placeholder={placeholder} />
            {rows.length > 1 && <button type="button" aria-label={`${label} ${index + 1} remove`} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index).join("\n"))} className="ui-button-secondary px-3">×</button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange(`${value}${value ? "\n" : ""}`)} disabled={rows.length >= 8 || rows.at(-1) === ""} className="mt-3 ui-button-secondary disabled:opacity-50">+ {label}</button>
    </section>
  );
}

function MedicationOrderEditor({ value, onChange, lang }: { value: string; onChange: (next: string) => void; lang: LanguageCode }) {
  const rows = parseMedicationRows(value);
  const labels = lang === "en"
    ? ["Medication / class", "Dose", "Route", "Frequency", "Duration", "Indication"]
    : ["药物/类别", "剂量", "途径", "频次", "疗程", "适应证"];
  const keys: Array<keyof MedicationRow> = ["name", "dose", "route", "frequency", "duration", "indication"];
  const controlledOptions: Partial<Record<keyof MedicationRow, string[]>> = {
    route: lang === "en" ? ["Oral (PO)", "Intravenous (IV)", "Intramuscular (IM)", "Subcutaneous (SC)", "Topical", "Other"] : ["口服（PO）", "静脉（IV）", "肌内（IM）", "皮下（SC）", "局部", "其他"],
    frequency: lang === "en" ? ["Single dose", "Once daily", "Twice daily", "Three times daily", "Every 8 hours", "As needed", "Other"] : ["单次", "每日一次", "每日两次", "每日三次", "每8小时", "必要时", "其他"],
    duration: lang === "en" ? ["Single dose", "Until review", "Defined course", "Other"] : ["单次", "至复评", "按疗程", "其他"]
  };
  return (
    <section data-testid="treatment-medication-orders" className="rounded-xl border border-clinic-line bg-white p-4">
      <h4 className="font-semibold text-clinic-blue">{lang === "en" ? "Medication orders" : "药物医嘱"}</h4>
      <p className="mt-1 text-xs leading-5 text-clinic-muted">{lang === "en" ? "Enter your own order. The system does not generate or prefill prescription facts." : "请自行填写医嘱；系统不会生成或预填处方事实。"}</p>
      <div className="mt-3 space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={`medication-${rowIndex}`} className="rounded-lg bg-clinic-paper p-3">
            <p className="mb-2 text-sm font-medium">{lang === "en" ? `Medication ${rowIndex + 1}` : `药物医嘱 ${rowIndex + 1}`}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {keys.map((key, index) => (
                <label key={key} className="text-xs text-clinic-muted">
                  <span>{labels[index]}</span>
                  {controlledOptions[key] ? <select aria-label={`${labels[index]} ${rowIndex + 1}`} value={row[key]} onChange={(event) => {
                    const next = rows.map((item, indexValue) => indexValue === rowIndex ? { ...item, [key]: event.target.value } : item);
                    onChange(serializeMedicationRows(next));
                  }} className="ui-input mt-1 w-full bg-white text-sm text-clinic-ink">
                    <option value="">{lang === "en" ? "Select" : "请选择"}</option>
                    {row[key] && !controlledOptions[key]?.includes(row[key]) && <option value={row[key]}>{row[key]}</option>}
                    {controlledOptions[key]?.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select> : <input aria-label={`${labels[index]} ${rowIndex + 1}`} value={row[key]} onChange={(event) => {
                    const next = rows.map((item, indexValue) => indexValue === rowIndex ? { ...item, [key]: event.target.value } : item);
                    onChange(serializeMedicationRows(next));
                  }} className="ui-input mt-1 w-full bg-white text-sm text-clinic-ink" />}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ClinicalTrainingClient({ caseData: initialCaseData, mode = "free" }: { caseData: StudentVisibleCase; mode?: TrainingMode }) {
  const [caseData] = useState<StudentVisibleCase>(initialCaseData);
  const [runtimeMode, setRuntimeMode] = useState<TrainingMode>(mode);
  const [lang, setLang] = useState<LanguageCode>("zh");
  const [pendingLanguage, setPendingLanguage] = useState<LanguageCode | null>(null);
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
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [mdtOpinions, setMdtOpinions] = useState<MdtOpinion[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [serverEvidenceOptions, setServerEvidenceOptions] = useState<StudentEvidenceOption[]>([]);
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
  const [desktopRuntimeReady, setDesktopRuntimeReady] = useState(() => Boolean(desktopRuntimeConfig()));
  const [pendingHistoryLogs, setPendingHistoryLogs] = useState<PendingHistoryLog[]>([]);
  const [logSyncStatus, setLogSyncStatus] = useState<"idle" | "pending" | "verified" | "failed">("idle");
  const [logRetryNonce, setLogRetryNonce] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const workbenchMainRef = useRef<HTMLElement | null>(null);
  const stageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const languageDialogRef = useRef<HTMLDialogElement | null>(null);
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatComposerRef = useRef<HTMLDivElement | null>(null);
  const reportSummaryRef = useRef<HTMLHeadingElement | null>(null);
  const revealInitialComposerRef = useRef(true);
  const composerLanguageRef = useRef(lang);
  const chatPinnedToBottomRef = useRef(true);
  const [chatHasNewMessage, setChatHasNewMessage] = useState(false);
  const ensureMobileComposerVisible = useCallback(() => {
    const composer = chatComposerRef.current;
    if (!composer) return;
    const rect = composer.getBoundingClientRect();
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
    const actionTop = document.querySelector(".workbench-actions")?.getBoundingClientRect().top ?? viewportBottom;
    const visibleBottom = Math.min(viewportBottom, actionTop) - 8;
    const scrollOwner = window.innerWidth >= 1024 ? workbenchMainRef.current : null;
    if (rect.bottom > visibleBottom) (scrollOwner || window).scrollBy({ top: rect.bottom - visibleBottom, behavior: "auto" });
    else if (rect.top < viewportTop + 8) (scrollOwner || window).scrollBy({ top: rect.top - viewportTop - 8, behavior: "auto" });
  }, []);
  const ensureMobileStageControlVisible = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    if (window.innerWidth >= 640 || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    window.requestAnimationFrame(() => {
      const actionBar = target.closest(".workbench-stage-form")?.querySelector(".workbench-actions");
      if (!(actionBar instanceof HTMLElement)) return;
      const targetRect = target.getBoundingClientRect();
      const actionRect = actionBar.getBoundingClientRect();
      const overlap = targetRect.bottom - actionRect.top + 16;
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "auto" });
    });
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
  const desktopSnapshotQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionInitAbortRef = useRef<AbortController | null>(null);
  const autoSessionInitRef = useRef<{ key: string; promise: Promise<SessionInitResponse>; controller: AbortController } | null>(null);
  const patientReplyAbortRef = useRef<AbortController | null>(null);
  const patientSubmitLockRef = useRef(false);
  const orderSubmitLockRef = useRef(false);
  const stageSubmitLockRef = useRef(false);
  const historyLogSyncRef = useRef(false);
  const historyLogRetryTimerRef = useRef(0);
  const historyLogRetryWaitingRef = useRef(false);
  const aiGenerationRef = useRef(0);
  const reconnectPromiseRef = useRef<Promise<boolean> | null>(null);
  const practiceDeployment = process.env.NEXT_PUBLIC_DEPLOYMENT_TIER !== "formal";
  const isDesktopRuntime = desktopRuntimeReady;

  useEffect(() => {
    const syncRuntimeState = () => setDesktopRuntimeReady(Boolean(desktopRuntimeConfig()));
    window.addEventListener("hematuria-desktop-runtime-change", syncRuntimeState);
    return () => window.removeEventListener("hematuria-desktop-runtime-change", syncRuntimeState);
  }, []);

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
  const physicalGroups = useMemo(() => groupPhysicalExamItems(lang, caseData.sex), [caseData.sex, lang]);

  const orderGroups = useMemo(() => {
    const keyword = orderSearch.trim().toLowerCase();
    const visible = orderCatalog.filter((item) => {
      if (item.primaryCategory !== activeOrderTab) return false;
      if (!orderApplicableForSex(item, caseData.sex)) return false;
      if (!keyword) return true;
      return [item.displayName, item.secondaryCategory, item.priority, item.studentDisplayHint, ...item.synonyms].join(" ").toLowerCase().includes(keyword);
    });
    const categoryOrder = activeOrderTab === "检验" ? labSecondaryOrder : activeOrderTab === "检查" ? imagingSecondaryOrder : [];
    const grouped = new Map<string, StudentOrderCatalogItem[]>();
    visible.forEach((item) => {
      const key = item.secondaryCategory || activeOrderTab;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });
    const categories = unique([...categoryOrder, ...Array.from(grouped.keys())]).filter((key) => grouped.has(key));
    return categories.map((category) => {
      const items = (grouped.get(category) ?? []).map((item) => presentOrderCatalogItem(item, lang) as PresentedOrderCatalogItem);
      return {
        category,
        categoryLabel: lang === "en"
          ? items[0]?.secondaryCategoryLabel || ENGLISH_CATEGORY_PLACEHOLDER
          : category,
        items
      };
    });
  }, [activeOrderTab, caseData.sex, lang, orderSearch]);

  const consultGroups = useMemo(() => consultGroupOrder.map((group) => ({
    group,
    items: consultCatalog.filter((item) => item.group === group && !/^泌尿外科$/i.test(item.department.trim()))
  })).filter((group) => group.items.length > 0), []);

  const evidenceOptions = useMemo<EvidenceOption[]>(() => {
    return serverEvidenceOptions.map((item) => ({
      id: item.evidenceId,
      label: studentEvidenceLabel(item.label, lang)
    }));
  }, [lang, serverEvidenceOptions]);

  const diagnosisEvidence = useMemo(() => {
    const parsed = parseEvidenceAnswer(answers.diagnosticEvidence);
    return { ...parsed, selected: normalizeEvidenceSelection(parsed.selected, evidenceOptions) };
  }, [answers.diagnosticEvidence, evidenceOptions]);
  const differentialRows = useMemo(() => parseDifferentialRows(answers.differentials, answers.differentialAnalysis).map((row) => ({
    ...row,
    support: normalizeEvidenceSelection(row.support, evidenceOptions),
    oppose: normalizeEvidenceSelection(row.oppose, evidenceOptions)
  })), [answers.differentialAnalysis, answers.differentials, evidenceOptions]);
  const testPlans = useMemo(() => parseTestPlans(answers.confirmatoryTests), [answers.confirmatoryTests]);
  const availableTestOptions = useMemo(() => orderCatalog
    .filter((item) => orderApplicableForSex(item, caseData.sex))
    .map((item) => presentOrderCatalogItem(item, lang) as PresentedOrderCatalogItem)
    .filter((item) => item.translationAvailable)
    .slice(0, 160), [caseData.sex, lang]);
  const consultPurposeByDepartment = useMemo(() => parseDepartmentField(answers.consultPurpose, answers.consultDepartments), [answers.consultDepartments, answers.consultPurpose]);
  const consultQuestionsByDepartment = useMemo(() => parseDepartmentField(answers.consultQuestions, answers.consultDepartments), [answers.consultDepartments, answers.consultQuestions]);
  const consultEvidenceByDepartment = useMemo(() => {
    const raw = parseDepartmentField(answers.consultSummary, answers.consultDepartments);
    return Object.fromEntries(Object.entries(raw).map(([department, value]) => [department, normalizeEvidenceSelection(unique(value.split(" || ")), evidenceOptions)]));
  }, [answers.consultDepartments, answers.consultSummary, evidenceOptions]);
  const perioperativeState = useMemo(() => parsePerioperative(answers.perioperativePreparation), [answers.perioperativePreparation]);
  const visibleTimeline = useMemo(() => sanitizeTimeline(timeline, lang), [lang, timeline]);

  const ensureTrainingStateToken = useCallback(async (forceRetry = false) => {
    const attemptId = attempt.attemptId;
    let runtimeReady = Boolean(desktopRuntimeConfig());
    if (forceRetry && desktopShellAvailable()) {
      try {
        const result = await restartDesktopRuntime();
        if (!result.prepared) {
          throw new ApiRequestError("network", 503, result.diagnostic.lastFailure?.category || "unknown_runtime_failure");
        }
        runtimeReady = Boolean(desktopRuntimeConfig());
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError("network", 503, "unknown_runtime_failure");
      }
    }
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
      if (!runtimeReady) {
        try { saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem(legacyStorageKey) || ""; } catch { /* Continue with a fresh in-memory token. */ }
      }
      if (saved) {
        try {
          const validationId = createIdempotencyKey(attemptId, "training-validate", caseData.id, runtimeMode, lang);
          const validated = await requestTrainingAction<{ currentStage: number; status: string; evidenceOptions?: StudentEvidenceOption[] }>({
            action: "validate-attempt", caseId: caseData.id, attemptId,
            language: lang, mode: runtimeMode, requestId: validationId
          }, saved, validationId, 0);
          trainingStateTokenRef.current = { attemptId, token: validated.stateToken };
          setServerEvidenceOptions(extractStudentEvidenceOptions(validated.payload) || []);
          trainingInitFailureRef.current = null;
          if (!runtimeReady) {
            try {
              sessionStorage.setItem(storageKey, validated.stateToken);
              sessionStorage.removeItem(legacyStorageKey);
            } catch { /* The validated token can continue in memory. */ }
          }
          setTrainingAttemptStatus("ready");
          return validated.stateToken;
        } catch (error) {
          const reason = trainingFailureReason(error);
          const safeStageOneRecovery = stageProgressRef.current.activeStageNo === 1 && !stageProgressRef.current.hasSubmittedStages
            && ["attempt_not_found", "token_expired", "state_mismatch"].includes(reason);
          if (!safeStageOneRecovery) throw error;
          if (!runtimeReady) {
            try {
              sessionStorage.removeItem(storageKey);
              sessionStorage.removeItem(legacyStorageKey);
            } catch { /* Recovery can continue in memory. */ }
          }
        }
      }
      if (!saved && runtimeReady) {
        try {
          const resumed = await requestDesktopAttemptResume({
            attemptId,
            caseId: caseData.id,
            mode: attempt.mode,
            language: lang
          });
          trainingStateTokenRef.current = { attemptId, token: resumed.stateToken };
          setServerEvidenceOptions(extractStudentEvidenceOptions(resumed.payload) || []);
          trainingInitFailureRef.current = null;
          const restoredStage = Math.max(1, Math.min(7, Number(resumed.payload.currentStage) || 1)) as AgentStageNo;
          setActiveStageNo(restoredStage);
          setTrainingAttemptStatus("ready");
          return resumed.stateToken;
        } catch (error) {
          const genuinelyMissing = error instanceof ApiRequestError && error.status === 404 && error.code === "attempt_not_found";
          if (!genuinelyMissing) throw error;
        }
      }
      const initRequestId = createIdempotencyKey(attempt.attemptId, "training-init", caseData.id, runtimeMode, lang);
      const initialized = await requestTrainingAction<{ attemptId: string; evidenceOptions?: StudentEvidenceOption[] }>({
        action: "init-attempt", caseId: caseData.id, attemptId: attempt.attemptId,
        language: lang, mode: runtimeMode, requestId: initRequestId
      }, "", initRequestId, 0);
      trainingStateTokenRef.current = { attemptId, token: initialized.stateToken };
      setServerEvidenceOptions(extractStudentEvidenceOptions(initialized.payload) || []);
      trainingInitFailureRef.current = null;
      setTrainingAttemptStatus("ready");
      if (!runtimeReady) {
        try {
          sessionStorage.setItem(storageKey, initialized.stateToken);
          sessionStorage.removeItem(legacyStorageKey);
        } catch { /* Memory fallback. */ }
      }
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
  }, [attempt.attemptId, attempt.mode, caseData.id, lang, runtimeMode]);

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
        if (!isDesktopRuntime) {
          try {
            sessionStorage.removeItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin));
            sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
          } catch { /* Recovery can continue in memory. */ }
        }
        token = await ensureTrainingStateToken(true);
        result = await requestTrainingAction<T>(requestBody, token, requestId, 0);
      }
      trainingStateTokenRef.current = { attemptId: attempt.attemptId, token: result.stateToken };
      const nextEvidenceOptions = extractStudentEvidenceOptions(result.payload);
      if (nextEvidenceOptions) setServerEvidenceOptions(nextEvidenceOptions);
      if (!isDesktopRuntime) {
        try {
          sessionStorage.setItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin), result.stateToken);
          sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
        } catch { /* Memory fallback. */ }
      }
      return result.payload;
    });
    trainingActionQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }

  useEffect(() => {
    // Invalidate pre-desktop patient-session caches whose opening statement
    // could contain a chief complaint. Attempt state remains intact.
    const storageInit = initializeStorageVersion("2.4.2-desktop-poc.1");
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
    const attemptMode = attemptModeForTrainingMode(targetMode);
    const expectedAttempt = {
      caseId: initialCaseData.id,
      mode: attemptMode,
      language: targetLang,
      participantId: "practice-user",
      schemaVersion: "attempt-v3" as const
    };
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
    let cancelled = false;
    const hydrate = async () => {
      const pointer = attemptPointerKey(initialCaseData.id, attemptMode, targetLang);
      let activeAttempt = createAttempt(initialCaseData.id, attemptMode, targetLang);
      let saved: PersistedAttemptState = {};
      let savedResult: ReturnType<typeof readJsonStorage<PersistedAttemptState | null>> = { value: null, recovered: false };
      if (isDesktopRuntime) {
        try {
          const authority = await bootstrapDesktopStateAuthority();
          const durable = await loadDesktopAttemptState({ caseId: initialCaseData.id, mode: attemptMode, language: targetLang });
          if (!desktopAuthoritiesCompatible(authority, durable)) throw new Error("desktop_state_authority_changed");
          const durableAttempt = durable.snapshot?.attempt;
          if (isAttemptCompatible(durableAttempt, expectedAttempt) && durableAttempt.attemptId === durable.attemptId) {
            activeAttempt = durableAttempt;
            saved = isStoredAttemptStateCompatible(durable.snapshot, durableAttempt) ? durable.snapshot : { attempt: durableAttempt };
            trainingStateTokenRef.current = { attemptId: durableAttempt.attemptId, token: durable.stateToken };
          } else {
            throw new Error("desktop_attempt_snapshot_invalid");
          }
        } catch (error) {
          const missing = error instanceof ApiRequestError && error.status === 404 && error.code === "attempt_not_found";
          if (!missing) {
            setStorageWarning(targetLang === "en" ? "Saved training state is temporarily unavailable." : "已保存的训练状态暂时不可用。");
            return;
          }
        }
      } else {
        const savedAttempt = readJsonStorage<unknown>(pointer, null).value;
        activeAttempt = isAttemptCompatible(savedAttempt, expectedAttempt)
          ? savedAttempt
          : activeAttempt;
        savedResult = readJsonStorage<PersistedAttemptState | null>(attemptStorageKey(activeAttempt), null);
        saved = isStoredAttemptStateCompatible(savedResult.value, activeAttempt) ? savedResult.value : {};
      }
      if (cancelled) return;
      setAttempt(activeAttempt);
      if (!isDesktopRuntime) {
        const pointerWrite = writeJsonStorage(pointer, activeAttempt);
        if (!pointerWrite.ok) setStorageWarning(targetLang === "en"
          ? "Browser cache is unavailable. Keep this page open until storage recovers."
          : "浏览器缓存不可用，请保持页面打开直至存储恢复。");
        writeJsonStorage(attemptStorageKey(activeAttempt), saved);
        if (savedResult.value && !isStoredAttemptStateCompatible(savedResult.value, activeAttempt)) {
          setStorageWarning(targetLang === "en" ? "An incompatible saved attempt was ignored and a safe session was started." : "已忽略身份不一致的训练记录，并安全创建新会话。");
        }
        if (savedResult.recovered) setStorageWarning("检测到损坏的训练缓存，已安全恢复为空白会话。");
      }
      if (Number.isInteger(saved.activeStageNo) && Number(saved.activeStageNo) >= 1 && Number(saved.activeStageNo) <= 7) setActiveStageNo(saved.activeStageNo as AgentStageNo);
      if (saved.answers) setAnswers(sanitizeAnswers(saved.answers));
      if (saved.submitted) setSubmitted(saved.submitted);
      if (saved.finalReport) setFinalReport(saved.finalReport);
      if (saved.messages) setMessages(saved.messages.map((message, index) => index === 0 && message.role === "patient" ? { ...message, text: patientOpening(targetLang) } : message));
      if (saved.askedSlots) setAskedSlots(saved.askedSlots);
      if (saved.collected) setCollected(saved.collected);
      if (saved.examLogs) setExamLogs(saved.examLogs);
      if (saved.orderLogs) setOrderLogs(saved.orderLogs.map((log) => log.pendingResults?.length ? { ...log, results: log.pendingResults, pendingResults: undefined, returnedAt: log.returnedAt || new Date().toISOString(), status: "reported" } : log));
      if (saved.mdtOpinions) setMdtOpinions(saved.mdtOpinions);
      if (saved.timeline) setTimeline(sanitizeTimeline(saved.timeline, targetLang));
      if (saved.serverEvidenceOptions) setServerEvidenceOptions(extractStudentEvidenceOptions({ evidenceOptions: saved.serverEvidenceOptions }) || []);
      if (saved.pendingHistoryLogs) setPendingHistoryLogs(saved.pendingHistoryLogs);
      if (typeof saved.osceTimeLeft === "number") setOsceTimeLeft(saved.osceTimeLeft);
      setAttemptReady(true);
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [initialCaseData.id, isDesktopRuntime, mode, practiceDeployment]);

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
    if (isDesktopRuntime) return;
    const handleOffline = () => { setAiStatus("offline"); setReconnectNotice(lang === "en" ? "You are offline. Existing training records are preserved." : "当前处于离线状态，既有训练记录已保留。"); };
    const handleOnline = () => {
      setAiStatus((current) => current === "offline" ? "unknown" : current);
      setReconnectNotice(lang === "en" ? "Network restored. You can resume the interview." : "网络已恢复，可以继续问诊。");
      globalThis.setTimeout(() => setReconnectNotice((current) => /Network restored|网络已恢复/.test(current) ? "" : current), 1800);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (!navigator.onLine) handleOffline();
    return () => { window.removeEventListener("offline", handleOffline); window.removeEventListener("online", handleOnline); };
  }, [isDesktopRuntime, lang]);

  useEffect(() => {
    if (!attemptReady) return;
    setMessages((current) => current.length ? current : [{ role: "patient", text: patientOpening(lang) }]);
  }, [attemptReady, caseData, lang]);

  useEffect(() => {
    if (!attemptReady || !healthResolved) return;
    let cancelled = false;
    const generation = ++aiGenerationRef.current;
    const cacheKey = aiSessionCacheKey(attempt.attemptId, caseData.id, lang, runtimeMode);
    const cached = isDesktopRuntime ? null : readJsonStorage<SessionInitResponse | null>(cacheKey, null).value;
    const expectedDeploymentSha = serviceHealth?.deploymentSha || serviceHealth?.gitSha;
    if (validCachedSession(cached, { attemptId: attempt.attemptId, caseId: caseData.id, language: lang, mode: runtimeMode, deploymentSha: expectedDeploymentSha && expectedDeploymentSha !== "unknown" ? expectedDeploymentSha : undefined, apiVersion: EXPECTED_API_VERSION })) {
      setAiSessionId(cached.sessionId);
      setAiStatus(cached.aiStatus === "degraded" ? "degraded" : "unknown");
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: cached.patientOpeningStatement || patientOpening(lang) }];
      });
      return;
    }
    if (!isDesktopRuntime) {
      try { localStorage.removeItem(cacheKey); } catch { /* Session continues in memory. */ }
    }
    if (!isDesktopRuntime && !navigator.onLine) { setAiStatus("offline"); return; }
    setSessionInitLoading(true);
    setSessionInitError("");
    setAiStatus("checking");
    const requestKey = `${attempt.attemptId}:${caseData.id}:${lang}:${runtimeMode}:${aiMode}`;
    let request = autoSessionInitRef.current;
    if (!request || request.key !== requestKey) {
      request?.controller.abort();
      const controller = new AbortController();
      const initializeSession = async () => {
        const sessionRequest = (trainingStateToken: string) => requestSessionInit({
          caseId: caseData.id,
          runtimeMode,
          language: lang,
          debug: aiMode === "debug",
          attemptId: attempt.attemptId,
          trainingStateToken,
          signal: controller.signal
        });
        const trainingStateToken = await ensureTrainingStateToken();
        try {
          return await sessionRequest(trainingStateToken);
        } catch (error) {
          const tokenRotatedDuringInit = error instanceof ApiRequestError
            && error.code === "stale_attempt_token";
          if (!tokenRotatedDuringInit) throw error;
          await trainingActionQueueRef.current;
          if (controller.signal.aborted) throw error;
          return sessionRequest(await ensureTrainingStateToken());
        }
      };
      request = {
        key: requestKey,
        controller,
        promise: initializeSession()
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
      if (!isDesktopRuntime) writeJsonStorage(cacheKey, result);
      setMessages((current) => {
        const hasStudentMessage = current.some((message) => message.role === "student");
        if (hasStudentMessage) return current;
        return [{ role: "patient", text: result.patientOpeningStatement || patientOpening(lang) }];
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
  }, [aiMode, attempt.attemptId, attemptReady, caseData, ensureTrainingStateToken, healthResolved, isDesktopRuntime, lang, runtimeMode, serviceHealth?.apiVersion, serviceHealth?.deploymentSha, serviceHealth?.gitSha]);

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
    const snapshot: PersistedAttemptState = {
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
      serverEvidenceOptions,
      pendingHistoryLogs,
      osceTimeLeft
    };
    if (isDesktopRuntime) {
      desktopSnapshotQueueRef.current = desktopSnapshotQueueRef.current
        .then(() => ensureTrainingStateToken())
        .then(() => saveDesktopAttemptState(attempt, snapshot))
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error");
          setStorageWarning(lang === "en" ? "Desktop autosave is temporarily unavailable." : "桌面自动保存暂时不可用。");
        });
      return;
    }
    const result = writeJsonStorage(attemptStorageKey(attempt), snapshot);
    const pointerResult = result.ok && isAttemptCompatible(attempt, {
      caseId: caseData.id,
      mode: attempt.mode,
      language: attempt.language,
      participantId: attempt.participantId,
      schemaVersion: "attempt-v3"
    })
      ? writeJsonStorage(
        attemptPointerKey(attempt.caseId, attempt.mode, attempt.language, attempt.participantId, attempt.schemaVersion),
        attempt
      )
      : { ok: false as const };
    const persisted = result.ok && pointerResult.ok;
    setSaveStatus(persisted ? "saved" : "error");
    if (!persisted) setStorageWarning(lang === "en"
      ? "Autosave is temporarily unavailable. Keep this page open and retry after browser storage recovers."
      : "自动保存暂时不可用，请保持页面打开并在浏览器存储恢复后重试。");
  }, [activeStageNo, answers, askedSlots, attempt, attemptReady, caseData.id, collected, ensureTrainingStateToken, examLogs, finalReport, isDesktopRuntime, lang, mdtOpinions, messages, orderLogs, osceTimeLeft, pendingHistoryLogs, serverEvidenceOptions, submitted, timeline]);

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
    const pane = workbenchMainRef.current;
    if (!pane) return;
    pane.scrollTo({ top: 0, behavior: "auto" });
    if (window.innerWidth < 1024) stageHeadingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [activeStageNo]);

  useLayoutEffect(() => {
    if (activeStageNo !== 7 || !finalReport) return;
    const summary = reportSummaryRef.current;
    if (!summary) return;
    workbenchMainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    summary.focus({ preventScroll: true });
  }, [activeStageNo, finalReport]);

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
  }, [activeStageNo, ensureMobileComposerVisible, messages, patientReplyLoading]);

  useEffect(() => {
    if (composerLanguageRef.current === lang) return;
    composerLanguageRef.current = lang;
    revealInitialComposerRef.current = true;
  }, [lang]);

  useEffect(() => {
    if (activeStageNo !== 1 || !revealInitialComposerRef.current || messages.length !== 1 || messages[0]?.role !== "patient") return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        ensureMobileComposerVisible();
        revealInitialComposerRef.current = false;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeStageNo, aiSessionId, ensureMobileComposerVisible, lang, messages, sessionInitLoading, trainingAttemptStatus]);

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
    const safeLabel = safeText(label, lang === "en" ? "Training record" : "训练记录");
    const safeDetail = safeText(detail);
    setTimeline((current) => sanitizeTimeline([...current, { id: nowEventId(), stageNo, type, label: safeLabel, detail: safeDetail, at: new Date().toISOString() }], lang));
  }

  function applyLanguage(next: LanguageCode) {
    if (next === lang) return;
    if (isDesktopRuntime) {
      try { localStorage.setItem("hematuria-language", next); } catch { /* The reload will retain the current language if preferences are unavailable. */ }
      allowNavigationRef.current = true;
      window.location.reload();
      return;
    }
    const attemptMode = attemptModeForTrainingMode(runtimeMode);
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
    setMessages([{ role: "patient", text: patientOpening(next) }]);
  }

  function requestLanguage(next: LanguageCode, trigger: HTMLButtonElement) {
    if (next === lang) return;
    if (!timeline.length) {
      applyLanguage(next);
      return;
    }
    languageTriggerRef.current = trigger;
    setPendingLanguage(next);
    window.requestAnimationFrame(() => {
      const dialog = languageDialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
      dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    });
  }

  function closeLanguageDialog() {
    languageDialogRef.current?.close();
    setPendingLanguage(null);
    window.requestAnimationFrame(() => languageTriggerRef.current?.focus());
  }

  function confirmLanguageSwitch() {
    const next = pendingLanguage;
    closeLanguageDialog();
    if (next) applyLanguage(next);
  }

  function trapLanguageDialogFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateAnswer<K extends keyof FullProcessAnswers>(key: K, value: FullProcessAnswers[K]) {
    if (osceLocked) return;
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function updateDiagnosisEvidence(selected: string[], note = diagnosisEvidence.note) {
    updateAnswer("diagnosticEvidence", serializeEvidenceAnswer(selected, note));
  }

  function updateDifferentialRow(index: number, patch: Partial<DifferentialRow>) {
    const rows = differentialRows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
    updateAnswer("differentials", rows.map((row) => compactLine(row.name)).filter(Boolean).join("\n"));
    updateAnswer("differentialAnalysis", serializeDifferentialRows(rows));
  }

  function toggleTestPlan(name: string) {
    const existing = testPlans.find((row) => row.name === name);
    updateAnswer("confirmatoryTests", serializeTestPlans(existing ? testPlans.filter((row) => row.name !== name) : [...testPlans, { name, purpose: "" }]));
  }

  function updateTestPurpose(name: string, purpose: string) {
    updateAnswer("confirmatoryTests", serializeTestPlans(testPlans.map((row) => row.name === name ? { ...row, purpose } : row)));
  }

  function updateDepartmentText(key: "consultPurpose" | "consultQuestions", department: string, value: string) {
    const current = key === "consultPurpose" ? consultPurposeByDepartment : consultQuestionsByDepartment;
    updateAnswer(key, serializeDepartmentField({ ...current, [department]: value }, answers.consultDepartments));
    setMdtOpinions([]);
  }

  function updateDepartmentEvidence(department: string, selected: string[]) {
    const next = { ...consultEvidenceByDepartment, [department]: unique(selected) };
    const serialized = Object.fromEntries(Object.entries(next).map(([name, evidence]) => [name, evidence.join(" || ")]));
    updateAnswer("consultSummary", serializeDepartmentField(serialized, answers.consultDepartments));
    setMdtOpinions([]);
  }

  function updateTreatmentSection(key: "admissionTreatment" | "mdtRevisedPlan", section: string, value: string) {
    updateAnswer(key, replaceSection(answers[key], section, value));
  }

  function updatePerioperativeItem(item: string, checked: boolean) {
    const selected = checked ? unique([...perioperativeState.selected, item]) : perioperativeState.selected.filter((value) => value !== item);
    updateAnswer("perioperativePreparation", serializePerioperative(selected, perioperativeState.notes));
  }

  function updatePerioperativeNote(item: string, note: string) {
    updateAnswer("perioperativePreparation", serializePerioperative(perioperativeState.selected, { ...perioperativeState.notes, [item]: note }));
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
      "fallback-browser": { zh: "语音播放方式已自动切换", en: "Playback method switched automatically" },
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
            ? (lang === "en" ? "The preferred playback method is unavailable; another available method is now in use." : "首选播放方式暂不可用，已自动切换到可用方式。")
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
      setReconnectNotice(lang === "en" ? "Preparing the interview..." : "正在准备问诊……");
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
        setReconnectNotice(lang === "en" ? "Interview assistance is temporarily unavailable. You can continue safely and retry later." : "问诊辅助暂时不可用，仍可安全继续并稍后重试。");
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
    setReconnectNotice(lang === "en" ? "Interview resumed" : "问诊已恢复");
    globalThis.setTimeout(() => setReconnectNotice((current) => /Interview resumed|问诊已恢复/.test(current) ? "" : current), 1800);
    addTimeline("technical", eventLabel, lang === "en" ? "The failed patient reply was replaced without duplicating the question." : "已替换失败患者回答，未重复提问或计分。", 1);
    void speak(aiResult.replyText);
    return true;
  }

  function reconnectAiPatient() {
    if (reconnectPromiseRef.current) return reconnectPromiseRef.current;
    const promise = (async () => {
      if (!isDesktopRuntime && !navigator.onLine) {
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
        if (!isDesktopRuntime) {
          try { localStorage.removeItem(cacheKey); } catch { /* New session still works in memory. */ }
        }
        const trainingStateToken = await ensureTrainingStateToken();
        const session = await requestSessionInit({
          caseId: caseData.id, runtimeMode, language: lang, debug: aiMode === "debug", attemptId: attempt.attemptId,
          trainingStateToken, forceRefresh: true, signal: controller.signal
        });
        if (generation !== aiGenerationRef.current) return false;
        setAiSessionId(session.sessionId);
        if (!isDesktopRuntime) writeJsonStorage(cacheKey, session);
        const pending = pendingFailedQuestion;
        if (pending) {
          const aiResult = await requestAiPatientReply({
            sessionId: session.sessionId, caseId: caseData.id, question: pending.question, messages, askedSlots,
            aiMode: "deepseek", runtimeMode, language: lang, attemptId: attempt.attemptId, signal: controller.signal, recoveryCycle: `reconnect-${session.sessionId}`
          });
          if (generation !== aiGenerationRef.current) return false;
          if (!applyRecoveredReply(aiResult, pending, lang === "en" ? "Reconnection restored the patient reply" : "重新连接后回答成功")) {
            setAiStatus("degraded");
            setReconnectNotice(lang === "en" ? "Connection failed; the safe offline response remains available" : "连接失败，仍可使用安全离线回答");
            return false;
          }
        } else {
          const probe = await probeAiPatient({ caseId: caseData.id, sessionId: session.sessionId, attemptId: attempt.attemptId, mode: runtimeMode, language: lang, signal: controller.signal });
          if (generation !== aiGenerationRef.current) return false;
          if (probe.isFallback) {
            setAiStatus("degraded");
            setReconnectNotice(lang === "en" ? "Connection failed; the safe offline response remains available" : "连接失败，仍可使用安全离线回答");
            return false;
          }
          setAiStatus("connected");
          setSessionInitError("");
          setReconnectNotice(lang === "en" ? "Interview resumed" : "问诊已恢复");
          globalThis.setTimeout(() => setReconnectNotice((current) => /Interview resumed|问诊已恢复/.test(current) ? "" : current), 1800);
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
    if (osceLocked || orderSubmitLockRef.current) return;
    const text = (textOverride ?? orderInput).trim();
    if (!text) return;
    orderSubmitLockRef.current = true;
    setOrderSubmitting(true);
    try {
      const matchedLog = await trainingAction<OrderResultLog>({ action: "order", input: text });
      const hasReport = matchedLog.results.length > 0;
      const log: OrderResultLog = hasReport
        ? { ...matchedLog, returnedAt: new Date().toISOString(), status: "reported" }
        : matchedLog;
      setOrderLogs((current) => [...current, log]);
      addTimeline("order", lang === "en" ? "Order placed" : "开立医嘱", text, 2);
      if (hasReport) {
        const timelineResults = matchedLog.results.map((item) => {
          const result = safeText(item.result || item.value || item.impression);
          if (!result) return "";
          const category = safeText(item.orderCategory);
          return category ? `${category}：${result}` : result;
        }).filter(Boolean);
        if (timelineResults.length) addTimeline("result", lang === "en" ? "Report returned" : "返回检查结果", timelineResults.join("\n"), 2);
      }
      setOrderInput("");
    } catch (error) {
      setStorageWarning(orderSubmissionFailureMessage(error, lang));
    } finally {
      orderSubmitLockRef.current = false;
      setOrderSubmitting(false);
    }
  }

  function submitSelectedOrders() {
    const text = unique([...answers.selectedOrders, answers.customOrders]).join("；");
    if (text) submitOrder(text);
  }

  function toggleDepartment(item: string) {
    if (/^泌尿外科$/i.test(item.trim())) return;
    setAnswers((current) => {
      const departments = current.consultDepartments.includes(item) ? current.consultDepartments.filter((value) => value !== item) : [...current.consultDepartments, item];
      return {
        ...current,
        consultDepartments: departments,
        consultPurpose: serializeDepartmentField(parseDepartmentField(current.consultPurpose, current.consultDepartments), departments),
        consultQuestions: serializeDepartmentField(parseDepartmentField(current.consultQuestions, current.consultDepartments), departments),
        consultSummary: serializeDepartmentField(parseDepartmentField(current.consultSummary, current.consultDepartments), departments)
      };
    });
    setMdtOpinions([]);
  }

  function consultRequests() {
    return answers.consultDepartments.map((department) => ({
      department,
      purpose: consultPurposeByDepartment[department] || "",
      question: consultQuestionsByDepartment[department] || "",
      evidenceIds: consultEvidenceByDepartment[department] || []
    }));
  }

  async function generateReport() {
    return trainingAction<Evaluator360Report>({ action: "score" });
  }

  async function submitStage() {
    if (osceLocked || stageSubmitLockRef.current || trainingAttemptStatus !== "ready") return;
    if (activeStageNo === 3) {
      const hasThreeDifferentials = differentialRows.every((row) => row.name.trim() && (row.support.length > 0 || row.oppose.length > 0));
      if (!answers.diagnosis.trim() || diagnosisEvidence.selected.length < 2 || !hasThreeDifferentials) {
        alert(lang === "en" ? "Enter the most likely diagnosis, select at least two collected evidence items, and complete three differentials with supporting or opposing evidence." : "请填写最可能诊断、勾选至少2条已采集证据，并完成3项鉴别诊断及每项至少1条支持或不支持证据。");
        return;
      }
    }
    const requests = activeStageNo === 4 && answers.consultNeeded === "需要会诊" ? consultRequests() : [];
    if (activeStageNo === 4 && answers.consultNeeded === "需要会诊" && (!requests.length || requests.some((request) => !request.purpose.trim() || !request.question.trim() || request.evidenceIds.length === 0))) {
      alert(lang === "en" ? "For each selected department, enter the purpose, question, and at least one collected evidence item." : "请为每个已选科室填写会诊目的、希望解决的问题，并提供至少1条已采集证据。");
      return;
    }
    const answerText = [
      stageAnswerText(activeStageNo, answers, messages, examLogs, orderLogs, mdtOpinions),
      activeStageNo === 1 ? askedSlots.join("；") : ""
    ].filter(Boolean).join("；");
    stageSubmitLockRef.current = true;
    setStageSubmitting(true);
    try {
      let submittedMdtOpinions: MdtOpinion[] | null = null;
      if (activeStageNo === 4 && answers.consultNeeded === "需要会诊") {
        const purpose = requests.map((request) => `${request.department}：目的${request.purpose}；问题${request.question}；证据${request.evidenceIds.join("、")}`).join("；");
        submittedMdtOpinions = await trainingAction<MdtOpinion[]>({
          action: "mdt",
          departments: answers.consultDepartments,
          purpose,
          consultRequests: requests,
          requestId: createIdempotencyKey(attempt.attemptId, "mdt-submit", purpose)
        });
      }
      const evaluation = await trainingAction<StageEvaluation>({
        action: "stage-feedback",
        stageKey: stageScoreKey(activeStageNo),
        submission: {
          ...answers,
          answerText,
          ...(activeStageNo === 3 ? {
            evidenceSelections: {
              primary: { diagnosis: answers.diagnosis, evidenceIds: diagnosisEvidence.selected },
              differentials: differentialRows.map((row) => ({
                diagnosis: row.name,
                supportEvidenceIds: row.support,
                opposeEvidenceIds: row.oppose
              }))
            }
          } : {}),
          ...(activeStageNo === 1 ? { askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text) } : {})
        }
      });
      setSubmitted((current) => Object.fromEntries(
        Object.entries({ ...current, [activeStageNo]: evaluation }).filter(([stage]) => Number(stage) <= activeStageNo)
      ) as Partial<Record<AgentStageNo, StageEvaluation>>);
      setFinalReport(null);
      if (activeStageNo === 4) {
        setMdtOpinions(submittedMdtOpinions || []);
        if (submittedMdtOpinions?.length) addTimeline("mdt", lang === "en" ? "Consultation feedback returned" : "会诊反馈已返回", answers.consultDepartments.join("；"), 4);
      }
      addTimeline("submit", lang === "en" ? "Stage submitted" : "提交阶段", `${stageName(activeStageNo, lang)}：${evaluation.max > 0 ? Math.round((evaluation.score / evaluation.max) * 100) : 0}%`, activeStageNo);
    } catch (error) {
      const message = stageSubmissionFailureMessage(error, lang);
      const reason = trainingFailureReason(error);
      if (["attempt_not_found", "token_expired", "token_missing", "configuration_error", "origin_mismatch", "state_mismatch"].includes(reason)) {
        trainingStateTokenRef.current = null;
        trainingInitFailureRef.current = { attemptId: attempt.attemptId, error };
        setTrainingAttemptStatus("failed");
        setTrainingAttemptError(message);
        if (!isDesktopRuntime) {
          try {
            sessionStorage.removeItem(trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin));
            sessionStorage.removeItem(legacyTrainingStateStorageKey(attempt.attemptId));
          } catch { /* The UI still fails closed. */ }
        }
      }
      setStorageWarning(message);
    } finally {
      stageSubmitLockRef.current = false;
      setStageSubmitting(false);
    }
  }

  async function reopenInvestigationStage() {
    if (osceLocked || stageSubmitLockRef.current || trainingAttemptStatus !== "ready" || !submitted[1]) return;
    stageSubmitLockRef.current = true;
    setStageSubmitting(true);
    try {
      const evaluation = await trainingAction<StageEvaluation>({
        action: "stage-feedback",
        stageKey: "history",
        submission: {
          ...answers,
          answerText: stageAnswerText(1, answers, messages, examLogs, orderLogs, mdtOpinions),
          askedQuestions: messages.filter((message) => message.role === "student").map((message) => message.text)
        }
      });
      setSubmitted({ 1: evaluation });
      setFinalReport(null);
      setActiveStageNo(2);
      setMobileNavOpen(false);
      setStorageWarning("");
    } catch (error) {
      setStorageWarning(stageSubmissionFailureMessage(error, lang));
    } finally {
      stageSubmitLockRef.current = false;
      setStageSubmitting(false);
    }
  }

  async function completeTraining() {
    if (finalReport || stageSubmitLockRef.current || trainingAttemptStatus !== "ready") return;
    for (let stage = 1 as AgentStageNo; stage <= 6; stage = (stage + 1) as AgentStageNo) {
      if (!submitted[stage]) { alert(lang === "en" ? "Complete stages 1-6 first." : "请先完成并提交第1至第6阶段。"); return; }
    }
    stageSubmitLockRef.current = true;
    setStageSubmitting(true);
    try {
      const evaluation = await trainingAction<StageEvaluation>({ action: "stage-feedback", stageKey: "debrief", submission: { ...answers } });
      const report = await generateReport();
      setSubmitted((current) => ({ ...current, 7: evaluation }));
      setFinalReport(report);
      if (isDesktopRuntime) {
        setPreviousAttemptScore(null);
      } else {
        const summaries = readJsonStorage<unknown>(ATTEMPT_SUMMARY_KEY, []).value;
        const validatedSummaries: AttemptSummary[] = Array.isArray(summaries) ? summaries.filter(isAttemptSummary) : [];
        const previous = [...validatedSummaries].reverse().find((item) => item.caseId === caseData.id && item.language === lang && item.attemptId !== attempt.attemptId);
        setPreviousAttemptScore(previous?.total ?? null);
        if (!validatedSummaries.some((item) => item.attemptId === attempt.attemptId)) {
          writeJsonStorage(ATTEMPT_SUMMARY_KEY, [...validatedSummaries, createAttemptSummary(attempt, report.total, report.max)]);
        }
      }
      addTimeline("submit", lang === "en" ? "Final report generated" : "完成训练并生成最终报告", `${percentageScore(report.total)} / 100`, 7);
      setStorageWarning("");
    } catch {
      setStorageWarning(lang === "en" ? "Final scoring is temporarily unavailable." : "终末评分服务暂时不可用。" );
    } finally {
      stageSubmitLockRef.current = false;
      setStageSubmitting(false);
    }
  }

  function canOpenStage(stageNo: AgentStageNo) {
    return canOpenTrainingStage(stageNo, submittedTrainingStages(submitted), Boolean(finalReport));
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
    const cleared = removeBrowserStorageEntries([
      { area: "local", key: attemptStorageKey(attempt) },
      { area: "local", key: attemptPointerKey(attempt.caseId, attempt.mode, attempt.language, attempt.participantId, attempt.schemaVersion) },
      { area: "session", key: trainingStateStorageKey(attempt.attemptId, publicApiConfig.baseUrl, window.location.origin) },
      { area: "session", key: legacyTrainingStateStorageKey(attempt.attemptId) }
    ]);
    if (!cleared.ok) {
      allowNavigationRef.current = false;
      setStorageWarning(lang === "en"
        ? "Restart could not clear the current training record. Nothing was reset; please retry."
        : "重新开始未能清除当前训练记录，页面未重置，请重试。");
      return;
    }
    allowNavigationRef.current = true;
    window.location.reload();
  }

  const activeEvaluation = submitted[activeStageNo];
  const trainingComplete = Boolean(finalReport);
  const currentStageSubmitted = Boolean(activeEvaluation);
  const showStageFeedback = Boolean(activeEvaluation && (!isOsce || activeStageNo === 7));
  const acquiredStats = {
    questions: messages.filter((item) => item.role === "student").length,
    patientAnswers: Math.max(0, messages.filter((item) => item.role === "patient").length - 1),
    exams: examLogs.length,
    orders: unique([...answers.selectedOrders, ...orderLogs.flatMap((log) => log.matchedOrders.map((item) => item.displayName))]).length,
    reports: orderLogs.reduce((sum, log) => sum + log.results.length, 0)
  };
  const healthNotice = healthCheckFailed
    ? (lang === "en" ? "Interview readiness could not be confirmed. Text practice remains available." : "暂时无法确认问诊准备状态，仍可继续文字练习。")
    : (serviceHealth?.patientServiceConfigured === false || serviceHealth?.trainingStateConfigured === false)
      ? (lang === "en" ? "Some online functions are unavailable. Text practice remains available." : "部分在线功能暂不可用，仍可继续文字练习。")
      : "";
  const connectionMessage = reconnectNotice || sessionInitError || ((sessionInitLoading || !aiSessionId) ? (lang === "en" ? "Preparing the interview..." : "正在准备问诊……") : "") || healthNotice;
  const connectionIsBusy = sessionInitLoading || !aiSessionId || aiStatus === "reconnecting";
  const connectionIsRecovered = /Network restored|网络已恢复|Interview resumed|问诊已恢复/.test(reconnectNotice);
  const connectionNoticeState = connectionIsRecovered ? "recovered" : connectionIsBusy ? "recovering" : "unavailable";
  const showReconnect = aiMode !== "rule" && (["degraded", "offline", "error", "reconnecting"].includes(aiStatus) || /reconnect|重新连接/i.test(reconnectNotice));
  const patientServiceAvailable = Boolean(aiSessionId) && !["offline", "error"].includes(aiStatus);
  const patientServiceLabel = connectionIsBusy
    ? (lang === "en" ? "Preparing interview environment" : "正在准备问诊环境")
    : patientServiceAvailable
      ? (lang === "en" ? "Interview dialogue available" : "问诊对话可用")
      : (lang === "en" ? "Interview dialogue unavailable" : "问诊对话暂不可用");
  const showAttemptRecovery = trainingAttemptStatus === "failed" && Boolean(trainingAttemptError) && !currentStageSubmitted && !trainingComplete;
  const showStorageRecovery = Boolean(storageWarning) && !showAttemptRecovery;
  const showConnectionNotice = Boolean(connectionMessage) && trainingAttemptStatus !== "failed" && !showStorageRecovery;
  const stageStatusMessage = trainingComplete
    ? (lang === "en" ? "Training completed" : "训练已完成")
    : currentStageSubmitted
      ? (lang === "en" ? "This stage has been submitted" : "本阶段已提交")
      : trainingAttemptStatus === "initializing"
        ? (lang === "en" ? "Preparing..." : "正在准备…")
        : trainingAttemptStatus === "failed"
          ? (lang === "en" ? "Prepare the training record again" : "请重新准备训练记录")
          : "";
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
          <p className="mt-3 text-clinic-muted">未找到 {caseDisplay(initialCaseData, "zh").title}。</p>
          <Link href="/cases/" className="mt-5 inline-flex rounded-md bg-clinic-blue px-4 py-2 font-medium text-white">病例库</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="desktop-workbench mx-auto max-w-[1600px] px-4 py-4 sm:px-5 sm:py-5">
      <div className="workbench-topbar mb-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-clinic-blue">
            <span>{display.title}</span>
            <span className={`ui-status ${isOsce ? "ui-status-danger" : "ui-status-success"}`}>
              {isOsce
                ? `${t(lang, "osceMode")} ${formatDuration(osceTimeLeft)}`
                : isDesktopRuntime
                  ? (lang === "en" ? "Exam-style practice" : "考试式练习")
                  : t(lang, "freeTraining")}
            </span>
          </div>
          <h1 className="mt-1 hidden text-xl font-semibold tracking-tight sm:block sm:text-2xl">{lang === "en" ? "Hematuria Clinical Interview Training System" : "血尿临床问诊训练系统"}</h1>
          <p className="mt-1 hidden text-sm text-clinic-muted md:block">{t(lang, "appSubtitle")}</p>
          <p className="mt-1 line-clamp-2 text-sm text-clinic-muted lg:hidden">{display.age || "-"} / {display.sex || "-"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="ui-segmented">
            <button type="button" onClick={(event) => requestLanguage("zh", event.currentTarget)} className={`ui-segment ${lang === "zh" ? "ui-segment-active" : ""}`}>{t(lang, "zh")}</button>
            <button type="button" onClick={(event) => requestLanguage("en", event.currentTarget)} className={`ui-segment ${lang === "en" ? "ui-segment-active" : ""}`}>{t(lang, "en")}</button>
          </div>
          <DesktopModelSettings />
          {!showConnectionNotice && <span data-testid="patient-service-status" role="status" aria-label={patientServiceLabel} className={`ui-status ${patientServiceAvailable ? "ui-status-success" : connectionIsBusy ? "ui-status-info" : "ui-status-warning"}`}>
            {patientServiceLabel}
          </span>}
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
                : (lang === "en" ? "Reconnect" : "重新连接")}
          </button>}
          <button type="button" aria-label={lang === "en" ? "Restart training" : "重新开始训练"} title={lang === "en" ? "Restart" : "重新开始"} onClick={restartTraining} className="ui-button-secondary px-3"><RotateCcw size={16} /><span className="hidden sm:inline">{lang === "en" ? "Restart" : "重新开始"}</span></button>
          <Link aria-label={t(lang, "backToCases")} title={t(lang, "backToCases")} onClick={(event) => { if (!confirmExit()) event.preventDefault(); }} href="/cases" className="ui-button-secondary px-3"><ClipboardList size={16} /><span className="hidden sm:inline">{t(lang, "backToCases")}</span></Link>
        </div>
      </div>
      {showStorageRecovery && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{storageWarning}</span>
          <button type="button" onClick={() => setStorageWarning("")} className="font-medium underline">{t(lang, "dismiss")}</button>
        </div>
      )}
      {showAttemptRecovery && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{trainingAttemptError}</span>
          <button type="button" onClick={() => void ensureTrainingStateToken(true).catch(() => undefined)} className="shrink-0 whitespace-nowrap font-medium underline">
            {lang === "en" ? "Prepare again" : "重新准备"}
          </button>
        </div>
      )}
      {showConnectionNotice && <div className="workbench-connection mb-3" aria-live="polite">
        <div data-testid="resource-status-notice" data-state={connectionNoticeState} role="status" className={`flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${connectionIsRecovered ? "border-emerald-200 bg-emerald-50 text-emerald-900" : connectionIsBusy ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <span>{connectionMessage}</span>
          {showReconnect && aiStatus !== "reconnecting" && <button type="button" onClick={() => void reconnectAiPatient()} className="font-semibold underline underline-offset-2">{lang === "en" ? "Reconnect" : "重新连接"}</button>}
        </div>
      </div>}

      <button type="button" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)} className="mb-3 inline-flex w-full items-center justify-between rounded-md border border-clinic-line bg-white px-4 py-3 font-medium lg:hidden">
        <span className="inline-flex items-center gap-2"><Menu size={18} />{t(lang, "mobileNavigation")}</span>
        <span>{activeStageNo}/7</span>
      </button>
      <div className="workbench-grid grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)] min-[1180px]:grid-cols-[190px_minmax(0,1fr)_240px]">
        <aside className={`workbench-sidebar ${mobileNavOpen ? "block" : "hidden"} space-y-3 lg:block`}>
          <section className="rounded-lg border border-clinic-line bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-clinic-blue"><Languages size={16} /> {lang === "en" ? "Seven stages" : "七阶段"}</div>
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
                    data-testid="stage-navigation-item"
                    className={`stage-navigation-item w-full rounded-md border p-3 text-left transition ${active ? "border-clinic-line border-l-2 border-l-clinic-blue bg-clinic-paper text-clinic-ink" : completed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : locked ? "cursor-not-allowed border-clinic-line bg-slate-50 text-clinic-muted opacity-60" : "border-clinic-line bg-white hover:border-clinic-blue"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">
                        {locked ? <LockKeyhole size={14} /> : completed ? <CheckCircle2 size={14} /> : <AgentIcon stageNo={agent.stageNo} />}
                      </span>
                      <span className="min-w-0">
                        <span className="stage-navigation-label block text-sm font-semibold leading-5">{agent.stageNo}. {stageName(agent.stageNo, lang)}</span>
                        <span className="stage-navigation-description mt-1 block text-xs leading-5 text-clinic-muted">{agent.competency[lang]}</span>
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
            </dl>
          </section>
        </aside>

        <section ref={workbenchMainRef} tabIndex={0} aria-label={`${studentStageLabel(activeStageNo, lang)}：${stageName(activeStageNo, lang)}`} onFocusCapture={ensureMobileStageControlVisible} className="workbench-main rounded-xl border border-clinic-line bg-white p-4 shadow-soft sm:p-5">
          <div className="stage-intro mb-3 border-b border-clinic-line pb-3">
            <p className="text-sm font-medium text-clinic-blue">{studentStageLabel(activeStageNo, lang)}</p>
            <h2 ref={stageHeadingRef} data-testid="stage-heading" className="mt-1 text-lg font-semibold sm:text-xl">{stageName(activeStageNo, lang)}</h2>
            <p className="stage-submission-hint mt-1 hidden text-sm text-clinic-muted sm:block">{t(lang, "noFeedbackBeforeSubmit")}</p>
          </div>

          <fieldset disabled={(osceLocked && activeStageNo !== 7) || (trainingAttemptStatus !== "ready" && !currentStageSubmitted && !trainingComplete)} className={`workbench-stage-form min-w-0 border-0 p-0 disabled:opacity-75 ${activeStageNo === 1 ? "history-stage-form" : ""}`}>
          {activeStageNo === 1 && (
            <div className="history-stage">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{lang === "en" ? "Patient interview" : "患者问诊"}</h3>
                  <p className="history-task-hint mt-1 text-sm text-clinic-muted">{lang === "en" ? "Continue asking the patient." : "继续向患者提问，完成本阶段病史采集。"}</p>
                </div>
                <button type="button" aria-label={t(lang, "voiceSettings")} title={t(lang, "voiceSettings")} onClick={() => setSpeechSettingsOpen(true)} disabled={!speechOutputSupported} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:border-clinic-blue disabled:opacity-50">
                  <Settings2 size={16} /> <span className="hidden sm:inline">{t(lang, "voiceSettings")}</span>
                  <span className="sr-only">{autoSpeak ? speechStateLabel() : t(lang, "speechOff")}</span>
                </button>
              </div>
              {speechSettingsOpen && (
                <div role="dialog" aria-modal="true" aria-label={t(lang, "voiceSettings")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                  <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-clinic-blue">{t(lang, "voiceSettings")}</h4>
                      <button type="button" onClick={() => setSpeechSettingsOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 py-1 text-sm hover:bg-clinic-paper" aria-label={t(lang, "close")}>×</button>
                    </div>
                    <label className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{t(lang, "autoRead")}</span><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /></label>
                    <label className="mt-4 block text-sm"><span>{lang === "en" ? "Playback method" : "播放方式"}</span><select value={speechProvider} onChange={(event) => setSpeechProvider(event.target.value as TtsProviderPreference)} className="ui-input mt-2 w-full"><option value="auto">{lang === "en" ? "Automatic (recommended)" : "自动（推荐）"}</option><option value="browser">{lang === "en" ? "System voice" : "系统语音"}</option><option value="disabled">{t(lang, "disabled")}</option></select></label>
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
                      <button type="button" onClick={() => void speak(lang === "en" ? "Hello doctor, I can hear you clearly." : "医生您好，我能听清您的问题。", true)} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-clinic-blue px-3 py-2 text-sm text-white"><Volume2 size={15} />{t(lang, "testVoice")}</button>
                      {speechState === "playing" || speechState === "fallback-browser" ? <button type="button" onClick={pauseSpeech} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-clinic-line p-2" title={t(lang, "pause")}><Pause size={16} /></button> : <button type="button" onClick={resumeSpeech} disabled={speechState !== "paused"} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-clinic-line p-2 disabled:opacity-50" title={t(lang, "resume")}><Play size={16} /></button>}
                      <button type="button" onClick={() => stopSpeech()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-clinic-line p-2" title={t(lang, "stop")}><Square size={16} /></button>
                      <button type="button" onClick={() => lastSpokenText && void speak(lastSpokenText, true)} disabled={!lastSpokenText} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm"><RotateCcw size={15} />{t(lang, "replay")}</button>
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
              <div className="history-dialogue relative">
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
                className="history-transcript mt-3 h-[220px] overflow-y-auto rounded-lg border border-clinic-line bg-clinic-paper p-3 sm:h-[320px] sm:p-4 lg:h-[390px]"
              >
                <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                    <div className={`history-message max-w-[88%] whitespace-pre-line rounded-xl px-3 py-2.5 text-sm leading-6 sm:max-w-[78%] sm:px-4 sm:py-3 ${message.role === "student" ? "bg-clinic-blue text-white" : "border border-clinic-line bg-white text-clinic-ink"}`}>
                      <span className={`mb-1 block text-[11px] font-semibold leading-4 ${message.role === "student" ? "text-white/80" : "text-clinic-muted"}`}>{message.role === "student" ? (lang === "en" ? "You · clinician" : "你 · 医生") : (lang === "en" ? "Standardized patient" : "标准化患者")}</span>
                      <span className="block">{message.text}</span>
                    </div>
                  </div>
                ))}
                </div>
              </div>
              {chatHasNewMessage && <button type="button" onClick={scrollChatToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-clinic-line bg-white px-3 py-1.5 text-xs font-semibold text-clinic-blue shadow-soft">{lang === "en" ? "New message · go to latest" : "有新消息 · 回到底部"}</button>}
              </div>
              <div ref={chatComposerRef} data-testid="chat-composer" className="history-composer relative z-20 mt-3 scroll-mb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] rounded-xl border border-clinic-line bg-white p-1.5 shadow-soft">
                <textarea
                  value={question}
                  rows={1}
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
                  className="ui-input block min-h-11 max-h-[44px] w-full resize-none"
                  placeholder={t(lang, "inputQuestion")}
                  aria-label={t(lang, "inputQuestion")}
                />
                <div className="mt-1 flex items-center justify-between gap-2">
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
              <label className="history-summary mt-5 block">
                <span className="font-medium">{t(lang, "historySummary")}</span>
                <textarea data-testid="history-summary" value={answers.historySummary} onChange={(event) => updateAnswer("historySummary", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" />
              </label>
            </div>
          )}

          {activeStageNo === 2 && (
            <div className="space-y-6">
              <section data-testid="investigation-selection-summary" className="investigation-selection-summary rounded-lg bg-clinic-paper px-4 py-3 text-sm leading-6 text-clinic-muted">
                <p className="font-medium text-clinic-ink">{lang === "en" ? "Current investigation summary" : "当前检查摘要"}</p>
                <p>{lang === "en"
                  ? `${answers.selectedOrders.length} orders selected · ${examLogs.length} examination records returned · ${orderLogs.reduce((sum, log) => sum + log.results.length, 0)} reports returned`
                  : `已勾选医嘱 ${answers.selectedOrders.length} 项 · 已返回查体记录 ${examLogs.length} 项 · 已返回检查报告 ${orderLogs.reduce((sum, log) => sum + log.results.length, 0)} 份`}</p>
                {answers.selectedOrders.length > 0 && <p className="mt-1 line-clamp-2">{answers.selectedOrders.join(lang === "en" ? "; " : "；")}</p>}
              </section>
              <section>
                <h3 className="text-lg font-semibold">{lang === "en" ? "Physical examination" : "查体"}</h3>
                <div className="mt-4 space-y-4">
                  {physicalGroups.map((group) => (
                    <Disclosure key={group.category} initiallyOpen summary={`${group.category} · ${group.items.length}`}>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.items.map((item) => (
                          <button key={item.examId} type="button" onClick={() => submitExam(item.displayName)} disabled={!item.translationAvailable} className="ui-button-secondary">
                            {item.displayName}
                          </button>
                        ))}
                      </div>
                    </Disclosure>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input value={examInput} onChange={(event) => setExamInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitExam(); }} className="ui-input min-w-0 flex-1" placeholder={t(lang, "examPlaceholder")} />
                  <button onClick={() => submitExam()} className="ui-button-primary">{t(lang, "queryExam")}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {examLogs.map((log) => (
                    <article key={`${log.at}-${log.input}`} className="rounded-lg border border-clinic-line bg-clinic-paper p-3 text-sm leading-6">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-clinic-blue">{safeStudentFacingText(log.input, lang, ENGLISH_EXAM_PLACEHOLDER)}</span><span className="ui-status-info"><FileText size={14} aria-hidden="true" />{lang === "en" ? "Returned" : "已返回"}</span></div>
                      <p>{safeStudentFacingText(log.result, lang, ENGLISH_RESULT_PLACEHOLDER)}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="border-t border-clinic-line pt-5">
                <h3 className="text-lg font-semibold">{lang === "en" ? "Orders and reports" : "医嘱与报告"}</h3>
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
                    <Disclosure key={group.category} initiallyOpen summary={`${group.categoryLabel} · ${group.items.length}`}>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {group.items.map((item) => (
                          <label key={item.catalogId || item.orderId} className="flex min-h-[72px] items-start justify-between gap-3 rounded-lg border border-clinic-line px-3 py-2 text-sm transition-colors hover:border-clinic-blue">
                            <span className="flex items-start gap-2">
                              <input className="mt-1" type="checkbox" disabled={!item.translationAvailable} checked={answers.selectedOrders.includes(item.displayName)} onChange={() => toggleOrder(item.displayName)} />
                              <span>
                                <span className="block font-medium">{item.displayName || (lang === "en" ? ENGLISH_ORDER_PLACEHOLDER : "")}</span>
                                {(item.studentDisplayHintLabel || item.studentDisplayHint) && <span className="mt-1 block text-xs leading-5 text-clinic-muted">{item.studentDisplayHintLabel || item.studentDisplayHint}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-full bg-clinic-paper px-2 py-1 text-xs text-clinic-muted">{item.priorityLabel || item.priority || (lang === "en" ? "As needed" : "按需")}</span>
                          </label>
                        ))}
                      </div>
                    </Disclosure>
                  ))}
                </div>
                <label className="mt-4 block"><span className="font-medium">{t(lang, "otherOrders")}</span><textarea value={answers.customOrders} onChange={(event) => updateAnswer("customOrders", event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue" /></label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input value={orderInput} onChange={(event) => setOrderInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitOrder(); }} className="ui-input min-w-[220px] flex-1" placeholder={t(lang, "orderPlaceholder")} />
                  <button onClick={() => submitOrder()} disabled={orderSubmitting} className="ui-button-primary">{orderSubmitting ? (lang === "en" ? "Submitting..." : "提交中……") : t(lang, "orderAndReturn")}</button>
                  <button onClick={submitSelectedOrders} disabled={orderSubmitting} className="ui-button-secondary">{t(lang, "selectedOrderResults")}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {orderLogs.map((log) => (
                    <div key={log.id} className="rounded-md border border-clinic-line p-3">
                      <p className="text-sm font-medium text-clinic-blue">{log.input}</p>
                      <p className="mt-1 text-xs text-clinic-muted">
                        {t(lang, "placedAt")}：{shortTime(log.placedAt || log.at, lang)}
                        {log.returnedAt ? ` · ${t(lang, "returnedAt")}：${shortTime(log.returnedAt, lang)}` : ""}
                        {" · "}<span data-testid="order-stage-label">{studentStageLabel(log.stageNo || 2, lang)}</span>
                      </p>
                      {log.matchedOrders.length > 0 && <p className="mt-1 text-xs text-clinic-muted">{t(lang, "recognizedOrders")}：{log.matchedOrders.map((item) => safeStudentFacingText(item.displayName, lang, ENGLISH_ORDER_PLACEHOLDER)).join("；")}</p>}
                      {log.duplicateOrderIds && log.duplicateOrderIds.length > 0 && <p className="mt-1 text-xs text-amber-800">{t(lang, "duplicateOrder")}</p>}
                      <p className="mt-1 text-sm text-clinic-muted">{studentFacingClinicalText(log.message, lang)}</p>
                      {log.orderOutcomes && log.orderOutcomes.length > 0 && (
                        <div className="mt-3 space-y-2" aria-label={lang === "en" ? "Per-order result status" : "逐项医嘱结果状态"}>
                          {log.orderOutcomes.map((outcome, index) => (
                            <div data-testid="order-outcome" key={`${log.id}-${outcome.orderId || outcome.displayName}-${index}`} className={`rounded-md border px-3 py-2 text-sm ${
                              outcome.status === "reported"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                                : outcome.status === "no_indication" || outcome.status === "not_performed" || outcome.status === "no_specimen" || outcome.status === "not_provided" || outcome.status === "medical_review_pending" || outcome.status === "prerequisite_missing"
                                  ? "border-amber-200 bg-amber-50 text-amber-950"
                                  : "border-clinic-line bg-clinic-paper text-clinic-muted"
                            }`}>
                              <p className="font-medium">{orderOutcomeLabel(outcome.status, lang)}</p>
                              <p className="mt-1">{studentFacingClinicalText(safeStudentFacingText(outcome.message, lang, ENGLISH_RESULT_PLACEHOLDER), lang)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {log.status === "ordered" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-clinic-paper"><div className="h-full w-1/2 animate-pulse rounded-full bg-clinic-teal" /></div>}
                      {log.results.map((item, index) => <ReportCard key={`${log.id}-${item.resultId || `${item.orderId}-${index}`}`} item={item} lang={lang} />)}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeStageNo === 3 && (
            <div data-testid="diagnosis-builder" className="space-y-5">
              {evidenceOptions.length < 2 && (
                <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <p>{lang === "en"
                    ? "At least two reviewed findings are required to build a diagnosis. Return to stage 2 and collect another available finding."
                    : "诊断构建至少需要2条已审核可用依据。请返回阶段2，再补充1条可用检查依据。"}</p>
                  <button type="button" disabled={stageSubmitting} onClick={reopenInvestigationStage} className="ui-button-secondary mt-3">
                    {stageSubmitting
                      ? (lang === "en" ? "Reopening..." : "正在返回……")
                      : (lang === "en" ? "Return to stage 2 for more evidence" : "返回阶段2补充依据")}
                  </button>
                </div>
              )}
              <section className="rounded-xl border border-clinic-line p-4">
                <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "A. Most likely diagnosis" : "A. 最可能诊断"}</h3>
                <label className="mt-3 block"><span className="font-medium">{t(lang, "diagnosis")}</span><input aria-label={t(lang, "diagnosis")} value={answers.diagnosis} onChange={(event) => updateAnswer("diagnosis", event.target.value)} className="ui-input mt-2 w-full" placeholder={lang === "en" ? "Search, select, or enter a short diagnosis" : "搜索、选择或简短输入诊断名称"} /></label>
                <div className="mt-4">
                  <EvidenceChecklist options={evidenceOptions} selected={diagnosisEvidence.selected} onChange={(selected) => updateDiagnosisEvidence(selected)} lang={lang} ariaLabel={lang === "en" ? "Diagnostic evidence from collected findings" : "诊断依据（从已采集证据中选择）"} defaultOpen />
                </div>
                <label className="mt-3 block text-sm"><span className="font-medium">{lang === "en" ? "Optional note" : "补充说明（可选）"}</span><input aria-label={lang === "en" ? "Diagnosis optional note" : "诊断补充说明"} value={diagnosisEvidence.note} onChange={(event) => updateDiagnosisEvidence(diagnosisEvidence.selected, event.target.value)} className="ui-input mt-2 w-full" /></label>
              </section>

              <section className="rounded-xl border border-clinic-line p-4">
                <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "B. Differential diagnoses (maximum 3)" : "B. 鉴别诊断（最多3项）"}</h3>
                <div className="mt-4 space-y-4">
                  {differentialRows.map((row, index) => (
                    <article key={`differential-${index}`} data-testid="differential-card" className="rounded-lg bg-clinic-paper p-4">
                      <label className="block"><span className="font-medium">{lang === "en" ? `Differential diagnosis ${index + 1}` : `鉴别诊断 ${index + 1}`}</span><input aria-label={lang === "en" ? `Differential diagnosis ${index + 1}` : `鉴别诊断 ${index + 1}`} value={row.name} onChange={(event) => updateDifferentialRow(index, { name: event.target.value })} className="ui-input mt-2 w-full bg-white" /></label>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <EvidenceChecklist options={evidenceOptions} selected={row.support} onChange={(support) => updateDifferentialRow(index, { support })} lang={lang} ariaLabel={lang === "en" ? `Differential ${index + 1} supporting evidence` : `鉴别诊断 ${index + 1} 支持证据`} />
                        <EvidenceChecklist options={evidenceOptions} selected={row.oppose} onChange={(oppose) => updateDifferentialRow(index, { oppose })} lang={lang} ariaLabel={lang === "en" ? `Differential ${index + 1} opposing evidence` : `鉴别诊断 ${index + 1} 不支持证据`} />
                      </div>
                      <label className="mt-3 block text-sm"><span>{lang === "en" ? "Optional note" : "补充说明（可选）"}</span><input aria-label={lang === "en" ? `Differential ${index + 1} optional note` : `鉴别诊断 ${index + 1} 补充说明`} value={row.note} onChange={(event) => updateDifferentialRow(index, { note: event.target.value })} className="ui-input mt-1 w-full bg-white" /></label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-clinic-line p-4">
                <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "C. Further investigations" : "C. 还需要的检查"}</h3>
                <div aria-label={lang === "en" ? "Further investigation catalogue" : "后续检查目录"} className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-clinic-paper p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    {availableTestOptions.map((item) => (
                      <label key={item.catalogId || item.orderId} className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-sm">
                        <input className="mt-1" type="checkbox" checked={testPlans.some((row) => row.name === item.displayName)} onChange={() => toggleTestPlan(item.displayName)} />
                        <span>{item.displayName}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {testPlans.length > 0 && <div className="mt-3 space-y-2">{testPlans.map((row) => <label key={row.name} className="grid gap-2 rounded-md border border-clinic-line p-3 text-sm sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center"><span className="font-medium">{row.name}</span><input aria-label={`${row.name} ${lang === "en" ? "purpose" : "目的"}`} value={row.purpose} onChange={(event) => updateTestPurpose(row.name, event.target.value)} className="ui-input" placeholder={lang === "en" ? "Purpose (optional)" : "填写检查目的（可选）"} /></label>)}</div>}
              </section>

              <section data-testid="stage3-completion" className="rounded-lg border border-clinic-line bg-clinic-paper p-4 text-sm">
                <h4 className="font-semibold text-clinic-blue">{lang === "en" ? "Completion" : "完成度"}</h4>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  <li>{answers.diagnosis.trim() ? "✓" : "○"} {lang === "en" ? "Most likely diagnosis entered" : "已填写最可能诊断"}</li>
                  <li>{diagnosisEvidence.selected.length >= 2 ? "✓" : "○"} {lang === "en" ? "At least 2 diagnostic evidence items selected" : "已选择至少2条诊断依据"}</li>
                  <li>{differentialRows.filter((row) => row.name.trim()).length === 3 ? "✓" : "○"} {lang === "en" ? "3 differential diagnoses entered" : "已填写3项鉴别诊断"}</li>
                  <li>{differentialRows.every((row) => row.name.trim() && (row.support.length > 0 || row.oppose.length > 0)) ? "✓" : "○"} {lang === "en" ? "Each differential has supporting or opposing evidence" : "每项至少1条支持或不支持证据"}</li>
                </ul>
              </section>
            </div>
          )}

          {activeStageNo === 4 && (
            <div data-testid="consultation-builder">
              <div className="mt-2 flex flex-wrap gap-3">
                {["需要会诊", "暂不需要会诊"].map((item) => (
                  <label key={item} className="flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2">
                    <input type="radio" name="consultNeeded" checked={answers.consultNeeded === item} onChange={() => { updateAnswer("consultNeeded", item); setMdtOpinions([]); }} />
                    {lang === "en" ? (item === "需要会诊" ? "Consultation needed" : "No consultation for now") : item}
                  </label>
                ))}
              </div>
              {answers.consultNeeded === "需要会诊" && <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {consultGroups.map((group) => (
                  <section key={group.group} className="rounded-md border border-clinic-line p-4">
                    <h3 className="font-medium text-clinic-blue">{consultGroupLabel(group.group, lang)}</h3>
                    <div className="mt-3 grid gap-2">
                      {group.items.map((item) => (
                        <label key={item.consultId} className="flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm">
                          <input type="checkbox" checked={answers.consultDepartments.includes(item.department)} onChange={() => toggleDepartment(item.department)} />
                          <span>{departmentLabel(item.department, lang)}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>}
              {answers.consultNeeded === "需要会诊" && answers.consultDepartments.length > 0 && <div className="mt-5 space-y-4">
                {answers.consultDepartments.map((department) => (
                  <section key={department} data-testid="consult-request-card" className="rounded-xl border border-clinic-line bg-clinic-paper p-4">
                    <h3 className="font-semibold text-clinic-blue">{departmentLabel(department, lang)}</h3>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <label className="block text-sm"><span className="font-medium">{lang === "en" ? "Consultation purpose" : "会诊目的"}</span><input aria-label={`${departmentLabel(department, lang)} ${lang === "en" ? "consultation purpose" : "会诊目的"}`} value={consultPurposeByDepartment[department] || ""} onChange={(event) => updateDepartmentText("consultPurpose", department, event.target.value)} className="ui-input mt-2 w-full bg-white" /></label>
                      <label className="block text-sm"><span className="font-medium">{lang === "en" ? "Question to resolve" : "希望解决的问题"}</span><input aria-label={`${departmentLabel(department, lang)} ${lang === "en" ? "question to resolve" : "希望解决的问题"}`} value={consultQuestionsByDepartment[department] || ""} onChange={(event) => updateDepartmentText("consultQuestions", department, event.target.value)} className="ui-input mt-2 w-full bg-white" /></label>
                    </div>
                    <div className="mt-3"><EvidenceChecklist options={evidenceOptions} selected={consultEvidenceByDepartment[department] || []} onChange={(selected) => updateDepartmentEvidence(department, selected)} lang={lang} ariaLabel={`${departmentLabel(department, lang)} ${lang === "en" ? "collected evidence" : "提供给会诊方的已采集证据"}`} /></div>
                  </section>
                ))}
              </div>}
              {!submitted[4] && <p className="mt-4 rounded-lg bg-clinic-paper px-4 py-3 text-sm text-clinic-muted">{lang === "en" ? "Department-specific feedback is shown only after this stage is submitted." : "各科室会诊意见仅在提交本阶段后显示。"}</p>}
              {submitted[4] && mdtOpinions.length > 0 && <div data-testid="consultation-feedback" className="mt-5">
                <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "Consultation feedback" : "会诊反馈"}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                {mdtOpinions.map((item) => (
                  <div key={item.department} className="rounded-md border border-clinic-line p-3 text-sm leading-6">
                    <p className="font-medium text-clinic-blue">{departmentLabel(item.department, lang)}</p>
                    <p className="mt-1"><span className="font-medium">{lang === "en" ? "Can address: " : "可解决的问题："}</span>{studentFacingClinicalText(item.opinion || item.expertJudgment, lang)}</p>
                    {item.neededInfo && <p className="mt-2"><span className="font-medium">{lang === "en" ? "Additional evidence: " : "建议补充证据："}</span>{studentFacingClinicalText(item.neededInfo, lang)}</p>}
                    {item.necessity && <p><span className="font-medium">{lang === "en" ? "Current necessity: " : "当前会诊是否必要："}</span>{studentFacingClinicalText(item.necessity, lang)}</p>}
                    {item.suggestedHandling && <p><span className="font-medium">{lang === "en" ? "Next step: " : "建议处理："}</span>{studentFacingClinicalText(item.suggestedHandling, lang)}</p>}
                    {item.riskReminder && <p className="text-amber-800"><span className="font-medium">{lang === "en" ? "Risk reminder: " : "风险提示："}</span>{studentFacingClinicalText(item.riskReminder, lang)}</p>}
                  </div>
                ))}
                </div>
                {unique(mdtOpinions.map((item) => studentFacingClinicalText(item.mdtIntegration, lang)).filter(Boolean)).length > 0 && <section className="mt-3 rounded-lg border border-clinic-line bg-clinic-paper p-4 text-sm leading-6"><h4 className="font-semibold text-clinic-blue">{lang === "en" ? "Integrated MDT recommendation" : "MDT整合建议"}</h4><p className="mt-2">{unique(mdtOpinions.map((item) => studentFacingClinicalText(item.mdtIntegration, lang)).filter(Boolean)).join(lang === "en" ? " " : "；")}</p></section>}
              </div>
              }
            </div>
          )}

          {activeStageNo === 5 && (
            <div data-testid="treatment-order-workbench" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "Treatment order workbench" : "治疗医嘱工作台"}</h3>
                <p className="mt-1 text-sm leading-6 text-clinic-muted">{lang === "en" ? "Enter the orders you would issue. The system will not fill in prescription content for you." : "请独立填写拟定医嘱；系统不会代填处方内容。"}</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <OrderListEditor testId="treatment-emergency" label={lang === "en" ? "Emergency / admission management" : "急诊/入院处理"} value={answers.immediateTreatment} onChange={(value) => updateAnswer("immediateTreatment", value)} placeholder={lang === "en" ? "One order per row" : "每行一条医嘱"} />
                <MedicationOrderEditor value={parseSection(answers.admissionTreatment, "药物医嘱")} onChange={(value) => updateTreatmentSection("admissionTreatment", "药物医嘱", value)} lang={lang} />
                <OrderListEditor testId="treatment-labs" label={lang === "en" ? "Laboratory orders" : "检验医嘱"} value={parseSection(answers.admissionTreatment, "检验医嘱")} onChange={(value) => updateTreatmentSection("admissionTreatment", "检验医嘱", value)} placeholder={lang === "en" ? "Laboratory order" : "填写检验医嘱"} />
                <OrderListEditor testId="treatment-procedures" label={lang === "en" ? "Imaging / procedure orders" : "影像/操作医嘱"} value={parseSection(answers.admissionTreatment, "影像/操作医嘱")} onChange={(value) => updateTreatmentSection("admissionTreatment", "影像/操作医嘱", value)} placeholder={lang === "en" ? "Imaging or procedure order" : "填写影像或操作医嘱"} />
                <OrderListEditor testId="treatment-surgery" label={lang === "en" ? "Surgical or interventional plan" : "手术或介入计划"} value={answers.definitiveTreatment} onChange={(value) => updateAnswer("definitiveTreatment", value)} placeholder={lang === "en" ? "Plan item" : "填写计划项目"} />
                <OrderListEditor testId="treatment-nursing" label={lang === "en" ? "Nursing and monitoring" : "护理与监测"} value={answers.patientEducation} onChange={(value) => updateAnswer("patientEducation", value)} placeholder={lang === "en" ? "Monitoring or nursing order" : "填写监测或护理医嘱"} />
                <OrderListEditor testId="treatment-stop" label={lang === "en" ? "Medication hold / contraindications" : "停药/禁忌"} value={parseSection(answers.mdtRevisedPlan, "停药/禁忌")} onChange={(value) => updateTreatmentSection("mdtRevisedPlan", "停药/禁忌", value)} placeholder={lang === "en" ? "Hold or risk item" : "填写停药、禁忌或风险项目"} />
                <OrderListEditor testId="treatment-discharge" label={lang === "en" ? "Discharge and follow-up" : "出院及随访"} value={answers.followUp} onChange={(value) => updateAnswer("followUp", value)} placeholder={lang === "en" ? "Follow-up order" : "填写出院或随访医嘱"} />
              </div>
            </div>
          )}

          {activeStageNo === 6 && (
            <div data-testid="perioperative-checklist" className="space-y-4">
              <h3 className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "Perioperative checklist and order set" : "围术期结构化清单与医嘱集"}</h3>
              <p className="text-sm leading-6 text-clinic-muted">{lang === "en" ? "Select the items you considered and add a concise learner-authored note where needed." : "勾选已考虑的项目，并可填写简短的学习者备注。"}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {perioperativeItems[lang].map((item, index) => {
                  const checked = perioperativeState.selected.includes(item);
                  return (
                    <section key={item} className={`rounded-xl border p-4 ${checked ? "border-clinic-blue bg-sky-50/60" : "border-clinic-line bg-white"}`}>
                      <label className="flex items-start gap-3 font-medium">
                        <input className="mt-1" type="checkbox" checked={checked} onChange={(event) => updatePerioperativeItem(item, event.target.checked)} />
                        <span>{index + 1}. {item}</span>
                      </label>
                      {checked && <input aria-label={`${item} ${lang === "en" ? "note" : "备注"}`} value={perioperativeState.notes[item] || ""} onChange={(event) => updatePerioperativeNote(item, event.target.value)} className="ui-input mt-3 w-full bg-white" placeholder={lang === "en" ? "Optional concise note" : "可选简短备注"} />}
                    </section>
                  );
                })}
              </div>
              <p className="rounded-lg bg-clinic-paper px-4 py-3 text-sm text-clinic-muted">{lang === "en" ? `${perioperativeState.selected.length} / ${perioperativeItems[lang].length} items selected` : `已选择 ${perioperativeState.selected.length} / ${perioperativeItems[lang].length} 项`}</p>
            </div>
          )}

          {activeStageNo === 7 && (
            <div>
              {finalReport && <section data-testid="final-report-summary" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 ref={reportSummaryRef} tabIndex={-1} className="text-xl font-semibold text-emerald-950 outline-none focus-visible:ring-2 focus-visible:ring-clinic-blue focus-visible:ring-offset-2">{lang === "en" ? "Training completed" : "训练已完成"}</h3>
                    <p className="mt-1 text-sm text-emerald-900">{lang === "en" ? "The final report is ready. Review the details and continue your reflection." : "最终报告已生成，可查看完整报告并继续复盘。"}</p>
                  </div>
                  <div data-testid="final-percentage-score" aria-label={lang === "en" ? `Percentage score ${percentageScore(finalReport.total)} out of 100` : `百分制得分 ${percentageScore(finalReport.total)} / 100`} className="text-3xl font-semibold text-clinic-blue">
                    {percentageScore(finalReport.total)}<span className="text-base text-clinic-muted"> / 100</span>
                  </div>
                </div>
                <a href="#final-report-details" className="ui-button-secondary mt-4 w-fit">{lang === "en" ? "View full report" : "查看完整报告"}</a>
              </section>}
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
                    : (() => {
                        const change = Math.round((percentageScore(finalReport.total) - percentageScore(previousAttemptScore)) * 10) / 10;
                        return lang === "en"
                          ? `Change from the previous attempt: ${change >= 0 ? "+" : ""}${change} percentage points`
                          : `较上次训练：${change >= 0 ? "+" : ""}${change} 个百分点`;
                      })()}</p>
                  <button type="button" onClick={restartTraining} className="inline-flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 font-medium text-white"><RotateCcw size={16} />{lang === "en" ? "Retrain this case" : "立即重练同病例"}</button>
                </div>
              </>}</div>
              <section className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
                <h4 className="font-semibold">{t(lang, "timeline")}</h4>
                <div className="mt-3 space-y-3">
                  {visibleTimeline.map((item) => (
                    <div key={item.id} className="rounded-md bg-white p-3 text-sm leading-6">
                      <p className="font-medium text-clinic-blue">{shortTime(item.at, lang)} · {studentStageLabel(item.stageNo, lang)} · {item.label}</p>
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
                  <FormattedText text={Object.values(submitted).map((item) => studentScoreText(item?.standardAnswer || "", lang)).filter(Boolean).join("\n\n")} />
                </div>
              </section>
            </div>
          )}

          <div className="workbench-actions mt-5 flex flex-wrap items-center gap-3 border-t border-clinic-line pt-4">
            <p className="min-w-0 flex-1 text-sm text-clinic-muted" role="status">
              {stageStatusMessage || (activeStageNo === 3
                ? (lang === "en" ? `${diagnosisEvidence.selected.length} diagnostic findings · ${differentialRows.filter((row) => row.name.trim()).length}/3 differentials` : `诊断依据 ${diagnosisEvidence.selected.length} 条 · 鉴别诊断 ${differentialRows.filter((row) => row.name.trim()).length}/3 项`)
                : activeStageNo === 4
                  ? (answers.consultNeeded === "暂不需要会诊" ? (lang === "en" ? "No consultation selected for now" : "当前选择：暂不需要会诊") : (lang === "en" ? `${answers.consultDepartments.length} departments selected` : `已选择 ${answers.consultDepartments.length} 个会诊科室`))
                  : activeStageNo === 5
                    ? (lang === "en" ? `${[answers.immediateTreatment, answers.admissionTreatment, answers.definitiveTreatment, answers.patientEducation, answers.mdtRevisedPlan, answers.followUp].filter((value) => value.trim()).length} order sections completed` : `已填写 ${[answers.immediateTreatment, answers.admissionTreatment, answers.definitiveTreatment, answers.patientEducation, answers.mdtRevisedPlan, answers.followUp].filter((value) => value.trim()).length} 类医嘱`)
                    : activeStageNo === 6
                      ? (lang === "en" ? `${perioperativeState.selected.length}/${perioperativeItems[lang].length} checklist items selected` : `清单已选 ${perioperativeState.selected.length}/${perioperativeItems[lang].length} 项`)
                      : activeStageNo === 7
                        ? (lang === "en" ? "Complete the reflection before generating the review" : "完成反思后生成复盘")
                        : (lang === "en" ? "Review the current stage before submitting" : "提交前请复核本阶段内容"))}
            </p>
            {trainingComplete ? (
              <span data-testid="training-complete-state" className="workbench-action-state"><CheckCircle2 size={16} />{lang === "en" ? "Completed" : "已完成"}</span>
            ) : currentStageSubmitted && activeStageNo !== 7 ? (
              <button data-testid="next-stage" onClick={() => {
                const next = nextTrainingStage(activeStageNo);
                if (next) openStage(next);
              }} className="ui-button-primary">
                <ClipboardList size={16} /> {lang === "en" ? "Next stage" : "进入下一阶段"}
              </button>
            ) : trainingAttemptStatus !== "ready" ? (
              <span data-testid="stage-preparing-state" className="workbench-action-state">{trainingAttemptStatus === "initializing" ? (lang === "en" ? "Preparing..." : "正在准备…") : (lang === "en" ? "Preparation required" : "需要重新准备")}</span>
            ) : activeStageNo === 7 ? (
              <button data-testid="complete-training" disabled={stageSubmitting} onClick={completeTraining} className="ui-button-primary">
                <CheckCircle2 size={16} /> {stageSubmitting ? (lang === "en" ? "Generating report..." : "正在生成报告……") : t(lang, "finishTraining")}
              </button>
            ) : (
              <>
                <button data-testid="submit-stage" disabled={osceLocked || stageSubmitting} onClick={submitStage} className="ui-button-primary">
                  <CheckCircle2 size={16} /> {stageSubmitting ? (lang === "en" ? "Submitting..." : "正在提交……") : t(lang, "submitStage")}
                </button>
                <button data-testid="next-stage" type="button" disabled className="ui-button-secondary">
                  <ClipboardList size={16} /> {lang === "en" ? "Complete this stage first" : "请先完成"}
                </button>
              </>
            )}
          </div>
          </fieldset>

          {showStageFeedback && activeEvaluation && <FeedbackBox evaluation={activeEvaluation} lang={lang} />}
        </section>

        <aside tabIndex={0} aria-label={lang === "en" ? "Attempt details and timeline" : "训练资料与时间线"} className="workbench-drawer hidden space-y-4 min-[1180px]:block">
          <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "trainingState")}</h2>
            <div className="mt-3 space-y-2 text-sm text-clinic-muted">
              <p>{isOsce ? t(lang, "osceMode") : isDesktopRuntime ? (lang === "en" ? "Exam-style practice" : "考试式练习") : t(lang, "freeTraining")}</p>
              {isOsce && <p>{formatDuration(osceTimeLeft)}</p>}
              <p>{studentStageLabel(activeStageNo, lang)}：{stageName(activeStageNo, lang)}</p>
              <p>{Object.keys(submitted).length} / 7 {t(lang, "completed")}</p>
              <p>{t(lang, "saveStatus")}：{saveStatus === "saved" ? t(lang, "saved") : saveStatus === "saving" ? t(lang, "saving") : t(lang, "saveFailed")}</p>
              <p className="pt-2 text-xs leading-5">{t(lang, "teachingOnly")}</p>
            </div>
            <div className="mt-4 border-t border-clinic-line pt-4">
            <h3 className="font-semibold">{t(lang, "obtainedData")}</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-clinic-muted">
              <p>{t(lang, "questionsCount")}：{acquiredStats.questions}</p>
              <p>{t(lang, "repliesCount")}：{acquiredStats.patientAnswers}</p>
              <p>{t(lang, "examsCount")}：{acquiredStats.exams}</p>
              <p>{t(lang, "ordersCount")}：{acquiredStats.orders}</p>
              <p>{t(lang, "reportsCount")}：{acquiredStats.reports}</p>
            </div>
            </div>
          </section>
          {activeStageNo !== 7 && <section className="rounded-lg border border-clinic-line bg-white p-5">
            <h2 className="font-semibold">{t(lang, "timeline")}</h2>
            <div className="mt-3 space-y-3">
              {(visibleTimeline.length ? visibleTimeline.slice(-6).reverse() : []).map((item) => (
                <div key={item.id} className="rounded-md bg-clinic-paper p-3 text-xs leading-5">
                  <p className="font-medium text-clinic-blue">{shortTime(item.at, lang)} · {studentStageLabel(item.stageNo, lang)} · {item.label}</p>
                  <p className="mt-1 line-clamp-3 text-clinic-muted">{item.detail}</p>
                </div>
              ))}
              {!visibleTimeline.length && <p className="text-sm text-clinic-muted">{t(lang, "noTimeline")}</p>}
            </div>
          </section>}
          {isOsce && activeEvaluation && activeStageNo !== 7 && (
            <section className="rounded-lg border border-clinic-line bg-white p-5 text-sm leading-6 text-clinic-muted">
              {t(lang, "osceFeedbackNotice")}
            </section>
          )}
        </aside>
      </div>
      <dialog
        ref={languageDialogRef}
        aria-labelledby="language-switch-title"
        onCancel={(event) => { event.preventDefault(); closeLanguageDialog(); }}
        onKeyDown={trapLanguageDialogFocus}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-clinic-line bg-white p-0 text-clinic-ink shadow-raised backdrop:bg-black/35"
      >
        <div className="p-5">
          <h2 id="language-switch-title" className="text-lg font-semibold text-clinic-blue">{lang === "en" ? "Switch training language?" : "切换训练语言？"}</h2>
          <p className="mt-3 text-sm leading-6 text-clinic-muted">{lang === "en"
            ? "Your current attempt will be kept. Switching opens a separate Chinese training record for this case."
            : "当前训练记录会保留。切换后将为本病例打开一份独立的英文训练记录。"}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={closeLanguageDialog} className="ui-button-secondary">{lang === "en" ? "Cancel" : "取消"}</button>
            <button data-testid="confirm-language-switch" type="button" onClick={confirmLanguageSwitch} className="ui-button-primary">{lang === "en" ? "Switch language" : "确认切换"}</button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
