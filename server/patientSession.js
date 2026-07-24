const crypto = require("node:crypto");
const cases = require("../data/cases.json");
const { callLLM, getLLMProviderConfig } = require("./llmClient.runtime.js");
const { BILINGUAL_CONFLICT_REASON, quarantineForMatchedSlots, uncertainConflictReply } = require("./bilingualConflictQuarantine.js");
const { matchStructuredFacts } = require("./structuredFacts.js");
const { matchCanonicalPatientFacts, projectCanonicalPatientFacts } = require("./canonicalFacts.js");
const { classifyPatientIntent } = require("./patientIntentClassifier.js");
const { auditPatientPrompt, estimateTokens, promptAuditEnabled } = require("./patientPromptAudit.js");
const safeLogger = require("./safeLogger.js");
const { createSessionCapability, verifySessionCapability } = require("./sessionCapability.js");

const sessionCache = globalThis.__hematuriaSessionCache || new Map();
const answerCache = globalThis.__hematuriaAnswerCache || new Map();
globalThis.__hematuriaSessionCache = sessionCache;
globalThis.__hematuriaAnswerCache = answerCache;

const SESSION_TTL_MS = Math.max(60_000, Number(process.env.PATIENT_SESSION_TTL_MS || 30 * 60 * 1000));
const ANSWER_TTL_MS = Math.max(30_000, Number(process.env.PATIENT_ANSWER_TTL_MS || 15 * 60 * 1000));
const SESSION_CACHE_MAX = Math.max(20, Number(process.env.PATIENT_SESSION_CACHE_MAX || 200));
const ANSWER_CACHE_MAX = Math.max(50, Number(process.env.PATIENT_ANSWER_CACHE_MAX || 500));
const DEPLOYMENT_SHA = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || "local").slice(0, 40);
const API_VERSION = "2.6.0";

function pruneCache(cache, maxEntries) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now || entry.deploymentSha !== DEPLOYMENT_SHA) cache.delete(key);
  }
  while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
}

function cacheGet(cache, key, maxEntries) {
  pruneCache(cache, maxEntries);
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(cache, key, value, ttlMs, maxEntries) {
  pruneCache(cache, maxEntries);
  cache.delete(key);
  cache.set(key, { value, createdAt: Date.now(), expiresAt: Date.now() + ttlMs, deploymentSha: DEPLOYMENT_SHA });
  pruneCache(cache, maxEntries);
}

const teacherOnlyKeys = [
  "urine_test_result",
  "blood_test_result",
  "imaging_finding",
  "cystoscopy_result",
  "pathology_result",
  "renal_biopsy_result",
  "physical_exam_result",
  "primary_diagnosis",
  "final_diagnosis",
  "differential_diagnosis",
  "treatment_plan",
  "perioperative_plan",
  "mdt_trigger",
  "scoring_points",
  "evaluator_rubric",
  "standard_case_summary"
];

const patientBlockedTerms = [
  "根据原始病史",
  "根据病例资料",
  "病例资料显示",
  "未主动诉",
  "未诉",
  "需追问",
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "癌",
  "肿瘤",
  "占位",
  "癌栓",
  "淋巴结",
  "骨转移",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "评分",
  "教师提示",
  "标准答案",
  "final diagnosis",
  "diagnosis is",
  "system prompt",
  "standard answer",
  "scoring point",
  "teacher hint",
  "evaluator rubric",
  "json",
  "matchedslotid",
  "matchedfacts",
  "\"caseid\"",
  "\"slotid\""
];

const reportWords = ["ct", "ctu", "彩超", "超声", "b超", "膀胱镜", "病理", "尿常规", "尿检", "肌酐", "egfr", "psa", "培养", "药敏", "肾活检", "报告", "检查结果", "片子", "影像"];
const diagnosisWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];
const reportWordsEn = ["ct result", "ct scan result", "ultrasound result", "cystoscopy result", "pathology result", "urinalysis result", "lab result", "test result", "report"];
const diagnosisWordsEn = ["what disease", "diagnosis", "is it cancer", "do i have cancer", "what is wrong with me", "prognosis"];
const historyBoundarySlotIds = new Set(["PAST_MALIGNANCY", "PAST_URINARY_PROCEDURE"]);
const explicitHistoryContext = /以前|既往|病史|做过|导过|得过|曾经|previous|history|before|have you had|did you ever/i;
const boundaryDetailIntent = /检查结果|报告|显示|提示|发现|诊断|什么病|严重吗|能治|预后|test result|report|show|finding|diagnosis|what disease|prognosis/i;

function getCaseById(caseId) {
  return cases.find((item) => String(item.id).toLowerCase() === String(caseId).toLowerCase());
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "").replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

function hasAny(text, words) {
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function blockedHits(text) {
  const value = String(text || "").toLowerCase();
  return patientBlockedTerms.filter((term) => value.includes(String(term).toLowerCase()));
}

function cleanPatientValue(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未诉\/?需主动询问/g, "")
    .replace(/未诉\/?/g, "")
    .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
    .replace(/需追问[^，。；;]*[，。；;]?/g, "")
    .trim();
  if (!text || /未诉\/?需主动询问|需追问|提交前隐藏|评分/.test(text)) return "";
  if (blockedHits(text).length) return "";
  return text;
}

function field(value, fallback = "不太清楚") {
  const clean = cleanPatientValue(value);
  return clean ? { value: clean, source: "case_explicit" } : { value: fallback, source: "unknown" };
}

function completed(value) {
  return { value, source: "ai_completed" };
}

function firstField(...values) {
  for (const value of values) {
    const clean = cleanPatientValue(value);
    if (clean) return { value: clean, source: "case_explicit" };
  }
  return { value: "不太清楚", source: "unknown" };
}

function patientHistoryField(...values) {
  for (const value of values) {
    const clean = String(value || "")
      .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
      .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
      .replace(/需追问[^，。；;]*[，。；;]?/g, "")
      .replace(/提交前隐藏|评分点|教师提示/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean) return { value: clean, source: "case_explicit" };
  }
  return { value: "这个我不太清楚。", source: "unknown" };
}

function sentenceWith(value, words) {
  return String(value || "")
    .split(/[。；;\n]/)
    .flatMap((line) => line.split(/[，,]/))
    .map((line) => cleanPatientValue(line))
    .find((line) => line && words.some((word) => line.includes(word))) || "";
}

function findDurationNearHematuria(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const durationPattern = "([半\\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?)";
  const symptomPattern = "(?:小便(?:颜色)?(?:变红|发红)|尿(?:色)?(?:变红|发红)|血尿|尿潜血阳性|尿隐血阳性|肉眼血尿|镜下血尿)";
  const after = new RegExp(`${symptomPattern}[^，。；、,;]*?${durationPattern}`).exec(compact);
  if (after?.[1]) return after[1];
  const before = new RegExp(`${durationPattern}[^，。；、,;]*?${symptomPattern}`).exec(compact);
  if (before?.[1]) return before[1];
  const allDurations = Array.from(compact.matchAll(new RegExp(durationPattern, "g"))).map((match) => match[1]);
  return allDurations[allDurations.length - 1] || "";
}

function simplifiedChiefComplaintZh(raw) {
  const text = String(raw || "").trim();
  const duration = findDurationNearHematuria(text) || "数天";
  if (/小便|尿色|尿液|发红|变红/.test(text) && !/尿潜血|尿隐血|镜下/.test(text)) return `小便颜色变红${duration}`;
  return `血尿${duration}`;
}

function durationToEnglish(duration) {
  const chineseDigits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const match = /^([半\d一二两三四五六七八九十]+)(小时|天|日|周|个月|月|年)(余|多|左右)?$/.exec(duration);
  if (!match) return "several days";

  const [, rawAmount, unit, approximation] = match;
  let amount = rawAmount;
  if (rawAmount !== "半" && !/^\d+$/.test(rawAmount)) {
    if (rawAmount === "十") amount = "10";
    else if (rawAmount.startsWith("十")) amount = String(10 + (chineseDigits[rawAmount.slice(1)] || 0));
    else if (rawAmount.endsWith("十")) amount = String((chineseDigits[rawAmount.slice(0, 1)] || 1) * 10);
    else if (rawAmount.includes("十")) {
      const [left, right] = rawAmount.split("十");
      amount = String((chineseDigits[left] || 1) * 10 + (chineseDigits[right] || 0));
    } else amount = String(chineseDigits[rawAmount] || rawAmount);
  }

  if (amount === "半") {
    if (unit === "天" || unit === "日") return "half a day";
    if (unit === "月" || unit === "个月") return "half a month";
    if (unit === "年") return "half a year";
  }

  const unitEn = unit === "小时" ? "hour" : unit === "天" || unit === "日" ? "day" : unit === "周" ? "week" : unit === "月" || unit === "个月" ? "month" : "year";
  const plural = amount === "1" ? unitEn : `${unitEn}s`;
  return `${approximation ? "more than " : ""}${amount} ${plural}`;
}

function simplifiedChiefComplaintEn(raw) {
  const text = String(raw || "").trim();
  const duration = findDurationNearHematuria(text) || "数天";
  const label = /小便|尿色|尿液|发红|变红/.test(text) && !/尿潜血|尿隐血|镜下/.test(text) ? "red urine" : "blood in my urine";
  return `${label} for ${durationToEnglish(duration)}`;
}

function buildRawPatientFacingProfile(caseData, language = "zh") {
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};
  const answers = caseData.patientAnswers || {};
  const pfp = caseData.patientFacingProfile || {};
  const sh = caseData.structuredHistory || {};
  const rawComplaint = pfp.chiefComplaint || caseData.studentChiefComplaint || caseData.chiefComplaint;
  const simplifiedComplaint = language === "en" ? simplifiedChiefComplaintEn(rawComplaint) : simplifiedChiefComplaintZh(rawComplaint);
  const openingStatement = language === "en"
    ? `Hello, doctor. I came in because I have had ${simplifiedComplaint}.`
    : `医生您好，我是因为${simplifiedComplaint || "小便颜色异常"}来看病的。`;
  return {
    patient_id: field(caseData.id),
    age: field(pfp.age || caseData.age),
    gender: field(pfp.sex || caseData.sex),
    chief_complaint: field(simplifiedComplaint),
    patient_opening_statement: field(openingStatement),
    current_symptoms_patient_safe: field(simplifiedComplaint),
    hematuria_visibility: firstField(pfp.hematuriaType, illness.hematuriaType),
    hematuria_onset_time: firstField(illness.onset, illness.duration),
    hematuria_frequency: firstField(illness.frequency, illness.duration),
    hematuria_phase: firstField(pfp.hematuriaPhase, answers.phase, illness.hematuriaPhase),
    hematuria_color: firstField(pfp.urineColor, answers.color, illness.color),
    clot_status: firstField(pfp.clots, answers.clots, illness.clots),
    pain_status: firstField(answers.pain, illness.pain),
    urinary_frequency_urgency_dysuria: firstField(pfp.luts, answers.irritativeSymptoms, illness.urinaryFrequency, illness.urgency, illness.dysuria),
    voiding_difficulty: firstField(sentenceWith(pfp.luts, ["排尿困难", "尿线", "尿潴留"]), illness.voidingDifficulty),
    flank_pain: firstField(pfp.flankPain, illness.flankPain, answers.stoneClues),
    fever_chills: firstField(pfp.fever, answers.fever, illness.fever),
    nausea_vomiting: firstField(illness.nauseaVomiting),
    foamy_urine: firstField(sentenceWith(pfp.glomerularClues, ["泡沫"]), sentenceWith(answers.glomerularClues, ["泡沫"])),
    edema: firstField(sentenceWith(pfp.glomerularClues, ["水肿", "眼睑", "下肢"]), sentenceWith(answers.glomerularClues, ["水肿", "眼睑", "下肢"])),
    blood_pressure_related_symptoms: firstField(sentenceWith(pfp.knownPastHistory, ["高血压"]), sentenceWith(caseData.pastHistory, ["高血压"])),
    recent_uri_or_sore_throat: firstField(sentenceWith(pfp.glomerularClues, ["感冒", "咽痛", "扁桃体"]), answers.glomerularClues),
    triggers: {
      exercise: firstField(sentenceWith(illness.trigger, ["运动", "劳累"])),
      trauma: firstField(risk.trauma, sentenceWith(illness.trigger, ["外伤"])),
      sex: firstField(sentenceWith(illness.trigger, ["性生活"])),
      catheterization: firstField(sentenceWith(illness.trigger, ["导尿"])),
      cystoscopy: firstField(sentenceWith(illness.trigger, ["膀胱镜"])),
      surgery: firstField(sentenceWith(illness.trigger, ["手术"])),
      menstruation: firstField(sentenceWith(answers.gynecologicClues, ["月经"]), sentenceWith(caseData.personalHistory, ["月经"]))
    },
    past_history_patient_safe: patientHistoryField(pfp.knownPastHistory, caseData.pastHistory),
    medication_patient_safe: firstField(sh.medicationAnswerZh, pfp.knownMedication, risk.anticoagulants, caseData.medication),
    allergy_history: firstField(sh.allergyHistory?.patientAnswerZh, sentenceWith(caseData.pastHistory, ["过敏"]), sentenceWith(caseData.personalHistory, ["过敏"])),
    smoking_history: firstField(sh.smokingHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["吸烟", "抽烟"]), risk.smoking),
    drinking_history: firstField(sh.alcoholHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["饮酒", "喝酒"]), risk.alcohol),
    occupational_exposure: firstField(sh.occupationalExposure?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["职业", "染料", "化工", "橡胶", "皮革", "重金属"]), risk.occupation),
    family_history: firstField(sh.familyHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["家族"]), risk.familyHistory, caseData.familyHistory),
    menstrual_gynecologic_history: firstField(answers.gynecologicClues),
    general_condition: {
      appetite: firstField(sentenceWith(answers.generalCondition, ["食欲", "胃口"])),
      sleep: firstField(sentenceWith(answers.generalCondition, ["睡眠"])),
      stool: firstField(sentenceWith(answers.generalCondition, ["大便"])),
      weight_change: firstField(sentenceWith(answers.generalCondition, ["体重", "消瘦"]))
    },
    patient_persona: {
      emotion: completed("有些担心，但能配合问诊。"),
      health_literacy: completed("医学知识有限，主要按自己的感受回答。"),
      memory_reliability: completed("对明显症状记得较清楚，检查细节说不清。"),
      cooperation_style: completed("医生问到具体问题时再回答。")
    }
  };
}

function validateRequiredProfileFacts(caseData, profile) {
  const structured = caseData.structuredHistory || {};
  const checks = [
    ["past_history_patient_safe", profile.past_history_patient_safe],
    ["smoking_history", structured.smokingHistory ? profile.smoking_history : null],
    ["drinking_history", structured.alcoholHistory ? profile.drinking_history : null],
    ["allergy_history", structured.allergyHistory ? profile.allergy_history : null],
    ["medication_patient_safe", structured.medicationAnswerZh ? profile.medication_patient_safe : null]
  ];
  const missing = checks.filter(([, value]) => value && (value.source === "unknown" || !String(value.value || "").trim())).map(([key]) => key);
  if (missing.length) throw new Error(`Patient-facing profile lost structured facts for ${caseData.id}: ${missing.join(", ")}`);
}

function localCompleteProfile(rawProfile) {
  const clone = JSON.parse(JSON.stringify(rawProfile));
  const fill = (node) => {
    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (value && typeof value === "object" && "value" in value && "source" in value) {
        if (value.source === "unknown" || !String(value.value || "").trim()) {
          node[key] = completed(["nausea_vomiting", "foamy_urine", "edema"].includes(key) ? "我没有特别注意到。" : "这个我不太清楚。");
        }
      } else if (value && typeof value === "object") {
        fill(value);
      }
    });
  };
  fill(clone);
  return clone;
}

function buildTeacherOnlyData(caseData) {
  return {
    urine_test_result: caseData.urineTestResult,
    blood_test_result: caseData.clinical?.requiredLabs,
    imaging_finding: caseData.investigations || caseData.clinical?.imagingAndProcedures,
    cystoscopy_result: caseData.clinical?.imagingAndProcedures,
    pathology_result: caseData.clinical?.pathology,
    renal_biopsy_result: caseData.clinical?.specialTests,
    physical_exam_result: caseData.clinical?.physicalExamFocus,
    primary_diagnosis: caseData.clinical?.initialDiagnosis,
    final_diagnosis: caseData.diagnosis,
    differential_diagnosis: caseData.differentialDiagnosis,
    treatment_plan: caseData.clinical?.definitiveTreatment,
    perioperative_plan: caseData.clinical?.perioperativePreparation,
    mdt_trigger: caseData.agentProfile?.mdtTrigger,
    scoring_points: caseData.scoringKey,
    evaluator_rubric: caseData.agentProfile?.evaluatorDeductions,
    standard_case_summary: caseData.standardSummary
  };
}

async function initSession({ caseId, attemptId, mode = "training", capabilityMode = mode, language = "zh", debug = false, forceRefresh = false }) {
  const caseData = getCaseById(caseId);
  if (!caseData) throw new Error(`Unknown caseId: ${caseId}`);
  const rawPatientFacingProfile = buildRawPatientFacingProfile(caseData, language);
  validateRequiredProfileFacts(caseData, rawPatientFacingProfile);
  const completedPatientFacingProfile = localCompleteProfile(rawPatientFacingProfile);
  const teacherOnlyData = buildTeacherOnlyData(caseData);
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_TTL_MS;
  const config = getLLMProviderConfig();
  const profileRecord = {
    rawPatientFacingProfile,
    completedPatientFacingProfile,
    teacherOnlyFieldList: teacherOnlyKeys.filter((key) => teacherOnlyData[key]),
    teacherOnlyData,
    debug: {
      provider: config.provider,
      model: config.model,
      responseFilter: { ok: true, hits: [] },
      estimatedTokens: Math.ceil(JSON.stringify(rawPatientFacingProfile).length / 4),
      cacheHit: false,
      forceRefresh: Boolean(forceRefresh)
    },
    isFallback: false,
    providerReachable: null,
    createdAt,
    expiresAt,
    deploymentSha: DEPLOYMENT_SHA,
    apiVersion: API_VERSION
  };
  const sessionId = createSessionCapability({ attemptId: String(attemptId || crypto.randomUUID()), caseId: caseData.id, language, mode: capabilityMode, expiresAt });
  cacheSet(sessionCache, sessionId, profileRecord, SESSION_TTL_MS, SESSION_CACHE_MAX);
  return {
    sessionId,
    attemptId: String(attemptId || ""),
    caseId: caseData.id,
    language,
    mode,
    patientOpeningStatement: completedPatientFacingProfile.patient_opening_statement?.value || (language === "en" ? "Hello, doctor." : "医生您好。"),
    cacheHit: false,
    sessionCreatedAt: new Date(createdAt).toISOString(),
    sessionExpiresAt: new Date(expiresAt).toISOString(),
    deploymentSha: DEPLOYMENT_SHA,
    apiVersion: API_VERSION,
    aiStatus: config.enabled ? "available" : "degraded",
    profileSource: caseData.medicalReview?.status === "approved" ? "local-reviewed" : "local-simulation",
    ...(debug && process.env.NODE_ENV !== "production" ? { debug: { provider: config.provider, model: config.model, cacheHit: false, forceRefresh: Boolean(forceRefresh) } } : {})
  };
}

function getSession(sessionId, caseId, profile) {
  if (profile) return { completedPatientFacingProfile: profile, debug: { cacheHit: false } };
  try {
    verifySessionCapability(sessionId, { caseId });
  } catch {
    return null;
  }
  return cacheGet(sessionCache, sessionId, SESSION_CACHE_MAX) || null;
}

function providerFallbackReason(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (/429|rate limit|too many/.test(message)) return "provider_rate_limit";
  if (/abort|timeout|timed out/.test(message)) return "provider_timeout";
  return "provider_unavailable";
}

async function probePatientProvider() {
  const config = getLLMProviderConfig();
  if (!config.enabled || !config.apiKey || !config.baseUrl || !config.model) return { isFallback: true, provider: config.provider, model: config.model, fallbackReason: "provider_not_configured" };
  try {
    const result = await callLLM({
      systemPrompt: "Return exactly OK. Do not include any patient or case information.",
      userPayload: { probe: true },
      temperature: 0,
      maxTokens: 8,
      maxRetries: 0,
      timeoutMs: 5000
    });
    return { isFallback: false, provider: result.provider, model: result.model, fallbackReason: "", providerDurationMs: result.durationMs, providerFirstTokenMs: result.firstTokenMs };
  } catch (error) {
    return { isFallback: true, provider: config.provider, model: config.model, fallbackReason: providerFallbackReason(error) };
  }
}

function allowedHistoryTerms(matchedSlotIds = []) {
  const allowed = new Set();
  if (matchedSlotIds.some((slotId) => String(slotId).startsWith("PAST_"))) {
    ["诊断", "治疗", "手术"].forEach((term) => allowed.add(term));
  }
  if (matchedSlotIds.includes("PAST_MALIGNANCY")) {
    ["癌", "肿瘤", "化疗", "放疗"].forEach((term) => allowed.add(term));
  }
  if (matchedSlotIds.includes("PAST_URINARY_PROCEDURE")) {
    ["膀胱镜", "手术"].forEach((term) => allowed.add(term));
  }
  if (matchedSlotIds.includes("PAST_SURGERY")) allowed.add("手术");
  if (matchedSlotIds.includes("FAMILY_HISTORY")) {
    ["癌", "肿瘤", "诊断"].forEach((term) => allowed.add(term));
  }
  if (matchedSlotIds.some((slotId) => ["GYNE_MENSTRUAL", "GYNE_PREGNANCY"].includes(slotId))) {
    allowed.add("治疗");
  }
  return allowed;
}

function filterPatientOutput(text, matchedSlotIds = []) {
  const allowedTerms = allowedHistoryTerms(matchedSlotIds);
  const hits = blockedHits(text).filter((term) => !allowedTerms.has(term));
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const hasBulletShape = lines.length > 0 && lines.every((line) => !/^[-•*#]/.test(line));
  const maxTotalLength = Math.max(180, matchedSlotIds.length * 80, lines.length * 80);
  const tooLong = lines.some((line) => line.length > 80) || String(text || "").length > maxTotalLength;
  return { ok: hits.length === 0 && hasBulletShape && !tooLong, hits, hasBulletShape, tooLong };
}

function formatPatientReply(text) {
  const lines = String(text || "")
    .split(/\n|。|；|;/)
    .map((line) => line.replace(/^[-•\s]*/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => {
      return line.length > 80 ? `${line.slice(0, 79)}。` : line;
    });
  return lines.length ? lines.join("\n") : "";
}

function readProfileField(profile, path) {
  const value = path.split(".").reduce((node, key) => node?.[key], profile);
  return typeof value?.value === "string" ? value.value : "";
}

function oneBullet(value, language = "zh") {
  const clean = cleanPatientValue(value) || (language === "en" ? "I'm not sure about that right now." : "这项情况我现在不太清楚。");
  return clean.length > 80 ? `${clean.slice(0, 80)}。` : clean;
}

function wrapPatientReply(text, maxLineLength = 80) {
  const wrapped = [];
  for (const rawLine of String(text || "").split(/\n+/)) {
    let remaining = rawLine.trim();
    while (remaining.length > maxLineLength) {
      const window = remaining.slice(0, maxLineLength + 1);
      const whitespaceBreak = window.lastIndexOf(" ");
      const punctuationBreak = Math.max(...["，", "。", "；", ",", ";"].map((mark) => window.lastIndexOf(mark) + 1));
      const naturalBreak = Math.max(whitespaceBreak, punctuationBreak);
      const breakAt = naturalBreak >= Math.floor(maxLineLength / 2) && naturalBreak <= maxLineLength
        ? naturalBreak
        : maxLineLength;
      wrapped.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) wrapped.push(remaining);
  }
  return wrapped.join("\n");
}

function conciseDeterministicReply(result, language = "zh") {
  const replyText = String(result?.replyText || "").trim();
  if (!replyText) return { ...result, replyText: language === "en" ? "I'm not sure about that right now." : "这项情况我现在不太清楚。" };
  const originalFilter = filterPatientOutput(replyText, result.matchedSlotIds || []);
  if (originalFilter.ok) return result;
  if (language === "zh" && result.matchedSlotIds?.length === 1 && result.matchedSlotIds[0] === "hematuria_onset") {
    const duration = replyText.match(/(\d+(?:\.\d+)?)(天|周|月|年)(余|多)?/);
    if (duration) return { ...result, replyText: `大概${duration[1]}${duration[2]}${duration[3] ? "多" : ""}了。` };
  }
  if (originalFilter.hits.length || !originalFilter.hasBulletShape) return result;
  const wrappedReply = wrapPatientReply(replyText);
  if (filterPatientOutput(wrappedReply, result.matchedSlotIds || []).ok) return { ...result, replyText: wrappedReply };
  return result;
}

function profileFallbackForQuestion(question, profile) {
  if (!profile) return "";
  if (hasAny(question, ["哪里不舒服", "怎么不舒服", "怎么回事", "为什么来看", "主要症状", "主诉"])) return readProfileField(profile, "current_symptoms_patient_safe") || readProfileField(profile, "chief_complaint");
  if (hasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年"])) return readProfileField(profile, "smoking_history");
  if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return readProfileField(profile, "drinking_history");
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return readProfileField(profile, "hematuria_color");
  if (hasAny(question, ["血块", "血凝块", "凝血块"])) return readProfileField(profile, "clot_status");
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红"])) return readProfileField(profile, "hematuria_phase");
  if (hasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) return readProfileField(profile, "pain_status") || readProfileField(profile, "urinary_frequency_urgency_dysuria");
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return readProfileField(profile, "urinary_frequency_urgency_dysuria");
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "体温"])) return readProfileField(profile, "fever_chills");
  if (hasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛"])) return readProfileField(profile, "flank_pain");
  if (hasAny(question, ["泡沫尿"])) return readProfileField(profile, "foamy_urine");
  if (hasAny(question, ["水肿", "眼睑肿", "下肢肿"])) return readProfileField(profile, "edema");
  if (hasAny(question, ["高血压"])) return readProfileField(profile, "blood_pressure_related_symptoms");
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎"])) return readProfileField(profile, "recent_uri_or_sore_throat");
  if (hasAny(question, ["用药", "阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板"])) return readProfileField(profile, "medication_patient_safe");
  if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属"])) return readProfileField(profile, "occupational_exposure");
  if (hasAny(question, ["家族", "遗传", "家里"])) return readProfileField(profile, "family_history");
  return "";
}

function safeFallbackForQuestion(question, profile, language = "zh") {
  if (hasAny(question, language === "en" ? diagnosisWordsEn : diagnosisWords)) return { replyText: language === "en" ? "I do not know the diagnosis. The doctor will need to decide." : "这个我不清楚，需要医生判断。", safetyFlags: ["blocked_diagnosis_request"] };
  if (hasAny(question, language === "en" ? reportWordsEn : reportWords)) return { replyText: language === "en" ? "I cannot explain the exact results. Please check the formal report." : "我说不清楚，得看检查报告。", safetyFlags: ["blocked_report_request"] };
  const matched = language === "en" ? "" : profileFallbackForQuestion(question, profile);
  return { replyText: oneBullet(matched, language), safetyFlags: ["llm_error_fallback"] };
}

function isNaturalClarificationRequest(question, language = "zh") {
  const text = String(question || "");
  return language === "en"
    ? /\b(?:clarify|explain)\b.*\b(?:other|that|this|part|point)\b|\b(?:what|which) (?:part|point) (?:do you mean|are you referring to)\b/i.test(text)
    : /(?:解释|说明|说清楚).*(?:另一|其他|刚才|这个|那个|部分)|(?:哪一|哪个).*(?:部分|方面|意思)/.test(text);
}

function isContextualRecap(question, language = "zh") {
  const text = String(question || "");
  return language === "en"
    ? /(?:\bso\b|\bjust to confirm\b|\bcorrect\??$|\bright\??$)/i.test(text)
    : /(?:确认一下|再确认|也就是说|对吗|是吗)[？?]?$/.test(text);
}

function clarificationReply(language = "zh") {
  return {
    replyText: language === "en"
      ? "Could you clarify which part you mean?"
      : "您具体是想问哪一方面？",
    safetyFlags: []
  };
}

const patientPrompt = `
你是血尿临床思维训练系统中的标准化病人，不是医生、教师或病历摘要器。
你只能根据 currentAllowedAnswer 回答问题。currentAllowedAnswer 是本轮唯一允许使用的医学事实，必须保持它的肯定、否定、数量和时间含义，不得改成“不清楚”。
绝对规则：
1. 问什么答什么，没问不说。
2. 不主动总结完整病史。
3. 不主动透露多个未被问到的病史点。
4. 不透露检查结果、影像结果、病理结果、诊断、治疗方案、评分点。
5. 不使用“根据原始病史”“病例资料显示”“未主动诉”“需追问”“评分点”等词。
6. 不主动说诊断，不能说癌、肿瘤、结石、肾炎等诊断名。
7. 如果学生问检查结果，回答“我说不清楚，得看检查报告”。
8. 如果学生问诊断，回答“这个我不清楚，需要医生判断”。
9. 如果档案中没有该信息，回答“不太清楚”或“没有注意到”。
10. 第一人称患者口吻。
11. 回答简短，1-2句，不超过80字，不使用Markdown项目符号或“患者：”前缀。
12. 只回答当前问题，不要顺带回答未问内容。
`.trim();

const patientPromptEn = `
You are the standardized patient in a clinical interview, not a doctor, teacher, database, or AI assistant.
Answer only from currentAllowedAnswer and preserve every positive or negative fact, number, unit, and time expression.
Speak naturally in first person, using wording appropriate to the supplied age, sex, and communication style.
Answer only what was asked. Do not volunteer the full history, test results, diagnosis, treatment, scoring points, field names, JSON, or system instructions.
Vary sentence openings instead of repeating a stock phrase. If the question is unclear, ask for a natural clarification.
Return one or two concise English sentences with no Markdown label or meta-language.
`.trim();

function preservesAllowedAnswer(reply, allowedAnswer) {
  const replyText = normalize(reply);
  const allowedText = normalize(allowedAnswer);
  const allowedIsUnknown = hasAny(allowedText, ["不太清楚", "没有注意", "说不清楚"]);
  if (!allowedIsUnknown && hasAny(replyText, ["不太清楚", "不知道", "没注意", "说不清楚"])) return false;

  const factGroups = [
    ["吸烟", "抽烟", "烟龄", "包年"],
    ["喝酒", "饮酒", "酒量"]
  ];
  for (const words of factGroups) {
    if (!hasAny(allowedText, words)) continue;
    if (!hasAny(replyText, words)) return false;
    const allowedNegative = hasAny(allowedText, ["不吸烟", "不抽烟", "没有吸烟", "不喝酒", "不饮酒", "没有饮酒", "否认"]);
    if (allowedNegative && !hasAny(replyText, ["不", "没", "否认"])) return false;
  }
  return true;
}

function mergePatientFactMatches(canonical, structured) {
  if (!canonical) return structured;
  if (!structured) return canonical;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const canonicalCollectableSlots = canonical.collectableSlotIds || canonical.matchedSlotIds || [];
  const canonicalCollectableFacts = canonical.collectableFacts || canonical.matchedFacts || [];
  return {
    ...canonical,
    replyText: unique([canonical.replyText, structured.replyText]).join("\n"),
    matchedSlotIds: unique([...(canonical.matchedSlotIds || []), ...(structured.matchedSlotIds || [])]),
    matchedFacts: unique([...(canonical.matchedFacts || []), ...(structured.matchedFacts || [])]),
    governanceSlotIds: unique([
      ...(canonical.governanceSlotIds || canonical.matchedSlotIds || []),
      ...(structured.governanceSlotIds || structured.matchedSlotIds || [])
    ]),
    collectableSlotIds: unique([
      ...canonicalCollectableSlots,
      ...(structured.collectableSlotIds || structured.matchedSlotIds || [])
    ]),
    collectableFacts: unique([
      ...canonicalCollectableFacts,
      ...(structured.collectableFacts || structured.matchedFacts || [])
    ]),
    provenance: unique([canonical.provenance, structured.answerSource]).join("+") || "unknown",
    reviewerStatus: canonical.reviewerStatus || "governance_checked",
    answerSource: canonical.answerSource === structured.answerSource
      ? canonical.answerSource
      : "mixed_governed_patient_facts",
    confidence: Math.min(
      Number(canonical.confidence ?? 1),
      Number(structured.confidence ?? 1)
    ),
    matcherLayer: "compound_canonical_structured",
    safetyFlags: unique([...(canonical.safetyFlags || []), ...(structured.safetyFlags || [])]),
    fallbackReason: canonical.fallbackReason || structured.fallbackReason || ""
  };
}

async function generatePatientAnswer({ sessionId, caseId, studentInput, conversationHistory = [], language = "zh", completedPatientFacingProfile }) {
  const session = getSession(sessionId, caseId, completedPatientFacingProfile);
  const caseData = getCaseById(caseId);
  // Canonical symptoms and structured history are independent clauses. Resolve
  // both, then merge the governed projections so one layer cannot silently
  // discard a recognized clause from the other.
  let canonical = matchCanonicalPatientFacts(caseId, studentInput, language);
  let structured = matchStructuredFacts(caseData, studentInput, language);
  let matched = mergePatientFactMatches(canonical, structured);
  const matchedSlotIds = matched?.matchedSlotIds || [];
  const isExplicitHistoryQuestion = explicitHistoryContext.test(String(studentInput || ""))
    && !boundaryDetailIntent.test(String(studentInput || ""))
    && matchedSlotIds.length > 0
    && matchedSlotIds.some((slotId) => historyBoundarySlotIds.has(slotId));
  const isTemporalFindingQuestion = matchedSlotIds.includes("hematuria_onset")
    && /什么时候|多久|几天|几周|几个月|何时|when|how long/i.test(String(studentInput || ""))
    && !/结果|数值|多少个|显示|提示|报告内容|what.*result|result.*(?:show|value)|report.*(?:show|say)/i.test(String(studentInput || ""));
  if (!isExplicitHistoryQuestion && hasAny(studentInput, language === "en" ? diagnosisWordsEn : diagnosisWords)) {
    return { replyText: language === "en" ? "I do not know the diagnosis. The doctor will need to decide." : "这个我不清楚，需要医生判断。", provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] }, safetyFlags: ["blocked_diagnosis_request"], matchedSlotIds: [], matchedFacts: [], answerSource: "rule", confidence: 1, fallbackReason: "diagnosis_boundary" };
  }
  if (!isExplicitHistoryQuestion && !isTemporalFindingQuestion && hasAny(studentInput, language === "en" ? reportWordsEn : reportWords)) {
    return { replyText: language === "en" ? "I cannot explain the exact results. Please check the formal report." : "我说不清楚，得看检查报告。", provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] }, safetyFlags: ["blocked_report_request"], matchedSlotIds: [], matchedFacts: [], answerSource: "rule", confidence: 1, fallbackReason: "report_boundary" };
  }
  let semanticDecision = null;
  if (!matched) {
    semanticDecision = await classifyPatientIntent({ question: studentInput, language });
    if (semanticDecision.accepted) {
      canonical = projectCanonicalPatientFacts(caseId, [semanticDecision.intent], language, studentInput);
      if (canonical) {
        canonical.confidence = Math.min(canonical.confidence, semanticDecision.confidence);
        canonical.answerSource = "case_bilingual_slot_semantic_classification";
        structured = null;
        matched = canonical;
      }
    }
  }
  // Vercel的会话初始化与问答可能落到不同Serverless实例；每问均从当前病例重建安全档案，
  // 不依赖另一个实例的内存缓存，也不信任客户端传回的数据完整性。
  const authoritativeProfile = caseData ? localCompleteProfile(buildRawPatientFacingProfile(caseData)) : null;
  const runtimeProfile = authoritativeProfile || session?.completedPatientFacingProfile || completedPatientFacingProfile;
  const naturalClarification = !matched && isNaturalClarificationRequest(studentInput, language);
  const contextualRecap = Boolean(matched) && isContextualRecap(studentInput, language);
  const genericFallback = naturalClarification
    ? clarificationReply(language)
    : safeFallbackForQuestion(studentInput, runtimeProfile, language);
  const quarantine = quarantineForMatchedSlots(caseId, matched?.governanceSlotIds || matched?.matchedSlotIds || []);
  if (quarantine.conflictingSlotIds.length) {
    safeLogger.warn("patient_fact_quarantined", { caseId, slotIds: quarantine.conflictingSlotIds, reason: BILINGUAL_CONFLICT_REASON });
    return {
      replyText: uncertainConflictReply(language),
      provider: "rule",
      model: "local-rule",
      isFallback: true,
      filter: { ok: true, hits: [] },
      safetyFlags: [BILINGUAL_CONFLICT_REASON],
      matchedSlotIds: [],
      matchedFacts: [],
      answerSource: "pending_medical_review",
      confidence: 0,
      fallbackReason: BILINGUAL_CONFLICT_REASON,
      quarantinedSlotIds: quarantine.conflictingSlotIds
    };
  }
  const fallback = conciseDeterministicReply(matched
    ? { ...matched, matchedSlotIds: matched.collectableSlotIds || matched.matchedSlotIds, matchedFacts: matched.collectableFacts || matched.matchedFacts, provider: "rule", model: "local-rule", isFallback: true }
    : genericFallback, language);
  if (matched?.unresolvedReason && !(matched.collectableSlotIds || []).length) {
    return {
      ...fallback,
      matchedSlotIds: [],
      matchedFacts: [],
      answerSource: "unknown",
      confidence: 0,
      fallbackReason: matched.unresolvedReason,
      provider: "rule",
      model: "local-rule",
      isFallback: true,
      filter: { ok: true, hits: [] }
    };
  }
  if (fallback.safetyFlags?.[0]?.startsWith("blocked_")) return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] } };
  const deterministicFilter = filterPatientOutput(fallback.replyText, fallback.matchedSlotIds || []);
  if (!deterministicFilter.ok) {
    safeLogger.warn("patient_deterministic_answer_blocked", {
      caseId,
      slotIds: fallback.matchedSlotIds || [],
      reason: "unsafe_deterministic_answer"
    });
    return {
      replyText: language === "en" ? "I'm not sure about that right now." : "这项情况我现在不太清楚。",
      provider: "rule",
      model: "local-rule",
      isFallback: true,
      filter: { ...deterministicFilter, hits: [] },
      safetyFlags: [...(fallback.safetyFlags || []), "deterministic_answer_blocked"],
      matchedSlotIds: [],
      matchedFacts: [],
      answerSource: "safety",
      confidence: 0,
      fallbackReason: "unsafe_deterministic_answer"
    };
  }
  if (semanticDecision && !semanticDecision.accepted && !naturalClarification) {
    if (promptAuditEnabled()) {
      auditPatientPrompt({
        caseId, language, canonicalIntents: [], matcherLayer: "semantic_classifier", matcherConfidence: semanticDecision.confidence || 0,
        factFields: [], providerInvoked: semanticDecision.providerCalls > 0, historyCount: conversationHistory.length,
        estimatedInputTokens: estimateTokens([studentInput]), maxTokens: 80, temperature: 0,
        provider: getLLMProviderConfig().provider, outputFilter: "safe_unknown", fallbackReason: semanticDecision.reason
      });
    }
    return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] }, answerSource: "unknown", confidence: 0, fallbackReason: semanticDecision.reason };
  }
  if ((fallback.matchedSlotIds || []).length > 1 && !contextualRecap) {
    return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] }, fallbackReason: "compound_question_preserves_all_facts" };
  }
  if (!runtimeProfile) return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] } };

  const config = getLLMProviderConfig();
  const normalized = normalize(studentInput);
  const answerKey = `${sessionId || caseId}:${language}:${normalized}`;
  const cached = cacheGet(answerCache, answerKey, ANSWER_CACHE_MAX);
  if (cached) return { ...cached, cacheHit: true, providerDurationMs: undefined, providerFirstTokenMs: undefined };

  if (!config.enabled) return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: { ok: true, hits: [] } };

  const payload = {
    currentAllowedAnswer: matched?.replyText || fallback.replyText,
    matchedFacts: matched?.matchedFacts || [],
    patientPersona: runtimeProfile.patient_persona,
    patientContext: {
      age: caseData?.age || "",
      sex: caseData?.sexEn || caseData?.sex || "",
      communicationStyle: runtimeProfile.patient_persona?.cooperation_style?.value || ""
    },
    studentInput,
    conversationHistory: conversationHistory.slice(-6),
    language,
    requiredOutputLanguage: language === "en" ? "English only" : "Chinese only"
  };
  try {
    const activePrompt = language === "en" ? patientPromptEn : patientPrompt;
    if (promptAuditEnabled()) {
      auditPatientPrompt({
        caseId,
        language,
        canonicalIntents: matched?.matchedFacts || [],
        matchedAliases: matched?.matchedAliases || [],
        matcherLayer: semanticDecision?.accepted ? "semantic_classifier" : matched?.matcherLayer || "unknown",
        matcherConfidence: semanticDecision?.confidence || matched?.confidence || 0,
        factFields: matched?.matchedSlotIds || [],
        provenance: matched?.provenance || matched?.answerSource || "unknown",
        reviewerStatus: matched?.reviewerStatus || (matched?.unresolvedReason ? "needs_review" : "governance_checked"),
        providerInvoked: true,
        historyCount: conversationHistory.length,
        estimatedInputTokens: estimateTokens([activePrompt, payload.currentAllowedAnswer, studentInput, JSON.stringify(conversationHistory.slice(-6))]),
        maxTokens: 300,
        temperature: 0.35,
        provider: config.provider,
        outputFilter: "pending",
        fallbackReason: ""
      });
    }
    const first = await callLLM({ systemPrompt: activePrompt, userPayload: payload, temperature: 0.35, maxTokens: 300 });
    const firstText = formatPatientReply(first.text);
    let filter = filterPatientOutput(firstText, matched?.matchedSlotIds || []);
    const firstLanguageOk = language !== "en" || !/[\u3400-\u9fff]/.test(firstText);
    if (filter.ok && firstLanguageOk && preservesAllowedAnswer(firstText, payload.currentAllowedAnswer)) {
      const result = { replyText: firstText, provider: first.provider, model: first.model, isFallback: false, filter, rewriteTriggered: false, safetyFlags: [], matchedSlotIds: matched?.matchedSlotIds || [], matchedFacts: matched?.matchedFacts || [], answerSource: matched?.answerSource || "ai", confidence: matched?.confidence || 0.9, fallbackReason: "", allowedAnswer: payload.currentAllowedAnswer, providerDurationMs: first.durationMs, providerFirstTokenMs: first.firstTokenMs };
      cacheSet(answerCache, answerKey, result, ANSWER_TTL_MS, ANSWER_CACHE_MAX);
      return result;
    }
    const retryInstruction = language === "en"
      ? `The previous answer was unsafe, changed approved facts, or failed format checks: ${filter.hits.join(", ")}. Preserve currentAllowedAnswer exactly and reply in one or two concise English sentences.`
      : `上一次回答包含禁止内容、改变了获准事实或格式不合格：${filter.hits.join("、")}。请严格保持 currentAllowedAnswer 的事实含义，只用1-2句且不超过45字。`;
    const retry = await callLLM({
      systemPrompt: `${activePrompt}\n\n${retryInstruction}`,
      userPayload: payload,
      temperature: 0.2,
      maxTokens: 220
    });
    const retryText = formatPatientReply(retry.text);
    const retryFilter = filterPatientOutput(retryText, matched?.matchedSlotIds || []);
    const retryLanguageOk = language !== "en" || !/[\u3400-\u9fff]/.test(retryText);
    if (retryFilter.ok && retryLanguageOk && preservesAllowedAnswer(retryText, payload.currentAllowedAnswer)) {
      const result = { replyText: retryText, provider: retry.provider, model: retry.model, isFallback: false, filter: retryFilter, rewriteTriggered: true, safetyFlags: [], matchedSlotIds: matched?.matchedSlotIds || [], matchedFacts: matched?.matchedFacts || [], answerSource: matched?.answerSource || "ai", confidence: matched?.confidence || 0.9, fallbackReason: "", allowedAnswer: payload.currentAllowedAnswer, providerDurationMs: Number(first.durationMs || 0) + Number(retry.durationMs || 0), providerFirstTokenMs: retry.firstTokenMs === undefined ? undefined : Number(first.durationMs || 0) + retry.firstTokenMs };
      cacheSet(answerCache, answerKey, result, ANSWER_TTL_MS, ANSWER_CACHE_MAX);
      return result;
    }
    return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: retryFilter, rewriteTriggered: true, safetyFlags: [...fallback.safetyFlags, "ai_response_blocked"] };
  } catch (error) {
    const fallbackReason = providerFallbackReason(error);
    safeLogger.warn("patient_provider_fallback", { caseId, action: "patient_answer", language, fallbackReason, error });
    return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: { ok: true, hits: [] }, fallbackReason };
  }
}

module.exports = {
  initSession,
  generatePatientAnswer,
  buildRawPatientFacingProfile,
  buildTeacherOnlyData,
  filterPatientOutput,
  getSession,
  probePatientProvider,
  providerFallbackReason,
  teacherOnlyKeys
};
