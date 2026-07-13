import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const initHandler = require("../../api/session/init.js");
const chatHandler = require("../../api/agent-chat.js");

const DEFAULT_REPORT = "artifacts/exploratory-qa/reports/patient-api-adapter-smoke.json";
const BLOCKED_KEYS = ["diagnosis", "imaging", "pathology", "treatment", "teacherOnlyData", "case_card", "scoring"];
const CJK = /[\u3400-\u9fff]/;
const TEACHER_META = /根据原始病史|根据病例资料|病例资料显示|未主动诉|需追问|教师提示|标准答案|评分点|标准病例摘要/i;
const GENERIC_UNKNOWN_REPLIES = new Set(["这项情况我现在不太清楚。", "这个我不太清楚。", "I'm not sure about that right now."]);

function cliValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function sorted(values) {
  return [...new Set(values || [])].sort();
}

function sameSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function replyMetrics(replyText) {
  const text = String(replyText || "");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    characters: text.length,
    lines: lines.length,
    maxLineCharacters: lines.reduce((max, line) => Math.max(max, line.length), 0)
  };
}

async function invoke(handler, body, requestId) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const req = {
    method: "POST",
    body,
    headers: {
      origin: "http://qa.local",
      host: "qa.local",
      "x-forwarded-proto": "http",
      "x-request-id": `qa-${requestId}`,
      "x-idempotency-key": `qa-${requestId}`
    },
    socket: { remoteAddress: `qa-api-${requestId}` }
  };
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload || {}, headers };
}

function addFailure(failures, failure) {
  failures.push({
    ...failure,
    expectedSlotIds: sorted(failure.expectedSlotIds),
    actualSlotIds: sorted(failure.actualSlotIds),
    safetyFlags: sorted(failure.safetyFlags)
  });
}

function assertPublicEnvelope(result, probeId, failures) {
  const payload = result.payload;
  if (result.statusCode !== 200) {
    addFailure(failures, { kind: "http_status", probeId, statusCode: result.statusCode });
    return;
  }
  if (!Array.isArray(payload.revealedDataKeys) || payload.revealedDataKeys.length !== 0) {
    addFailure(failures, { kind: "revealed_data_keys", probeId });
  }
  if (!sameSet(payload.blockedDataKeys, BLOCKED_KEYS)) {
    addFailure(failures, { kind: "blocked_data_keys", probeId });
  }
  if ("completedPatientFacingProfile" in payload || "teacherOnlyData" in payload || "debug" in payload) {
    addFailure(failures, { kind: "private_api_field", probeId });
  }
  if (!String(result.headers["server-timing"] || "").trim()) {
    addFailure(failures, { kind: "missing_server_timing", probeId });
  }
}

async function main() {
  const reportPath = path.resolve(cliValue("report", DEFAULT_REPORT));
  const previousEnv = {
    agents: process.env.LLM_ENABLE_AI_AGENTS,
    patient: process.env.LLM_ENABLE_AI_PATIENT
  };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.LLM_ENABLE_AI_AGENTS = "false";
  process.env.LLM_ENABLE_AI_PATIENT = "false";
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("QA adapter smoke forbids provider calls");
  };

  const failures = [];
  let checks = 0;
  try {
    const sessions = new Map();
    for (const { caseId, language } of [
      { caseId: "P001", language: "en" },
      { caseId: "P001", language: "zh" },
      { caseId: "P002", language: "en" },
      { caseId: "P004", language: "zh" }
    ]) {
      const probeId = `init-${language}-${caseId.toLowerCase()}`;
      const result = await invoke(initHandler, { caseId, mode: "training", language }, probeId);
      checks += 1;
      if (result.statusCode !== 200 || !result.payload.sessionId) {
        addFailure(failures, { kind: "session_init", probeId, statusCode: result.statusCode });
      }
      if ("completedPatientFacingProfile" in result.payload || "teacherOnlyData" in result.payload) {
        addFailure(failures, { kind: "session_private_api_field", probeId });
      }
      if (caseId === "P001" && language === "en" && CJK.test(String(result.payload.patientOpeningStatement || ""))) {
        addFailure(failures, { kind: "english_opening_contains_cjk", probeId, metrics: replyMetrics(result.payload.patientOpeningStatement) });
      }
      sessions.set(`${caseId}/${language}`, result.payload.sessionId);
    }

    const probes = [
      { id: "onset-en", caseId: "P001", sessionId: sessions.get("P001/en"), language: "en", question: "When did it start?", expected: ["hematuria_onset"] },
      { id: "prior-care-en", caseId: "P001", sessionId: sessions.get("P001/en"), language: "en", question: "Have you seen a doctor before?", expected: ["prior_care"] },
      { id: "tumor-history-zh", caseId: "P001", sessionId: sessions.get("P001/zh"), language: "zh", question: "以前有肿瘤史吗？", expected: ["PAST_MALIGNANCY"] },
      { id: "cystoscopy-history-zh", caseId: "P001", sessionId: sessions.get("P001/zh"), language: "zh", question: "以前做过膀胱镜吗？", expected: ["PAST_URINARY_PROCEDURE"] },
      { id: "clots-meta-zh", caseId: "P004", sessionId: sessions.get("P004/zh"), language: "zh", question: "有血块吗？", expected: ["clots"], noTeacherMeta: true },
      { id: "flank-pain-en", caseId: "P002", sessionId: sessions.get("P002/en"), language: "en", question: "Do you have flank pain?", expected: ["flank_pain"] },
      { id: "glomerular-en", caseId: "P001", sessionId: sessions.get("P001/en"), language: "en", question: "Do you have foamy urine?", expected: ["glomerular_features"], noGenericUnknown: true }
    ];

    for (const [index, probe] of probes.entries()) {
      const result = await invoke(chatHandler, {
        sessionId: probe.sessionId,
        caseId: probe.caseId,
        agentId: "standardized_patient",
        stage: "history",
        mode: "training",
        language: probe.language,
        studentInput: probe.question,
        conversationHistory: []
      }, `chat-${index}-${probe.id}`);
      checks += 1;
      assertPublicEnvelope(result, probe.id, failures);
      const payload = result.payload;
      if (!sameSet(payload.matchedSlotIds, probe.expected)) {
        addFailure(failures, {
          kind: "route_mismatch",
          probeId: probe.id,
          expectedSlotIds: probe.expected,
          actualSlotIds: payload.matchedSlotIds,
          safetyFlags: payload.safetyFlags,
          fallbackReason: payload.fallbackReason || "",
          generationSource: payload.generationSource || ""
        });
      }
      if (probe.noTeacherMeta && TEACHER_META.test(String(payload.replyText || ""))) {
        addFailure(failures, { kind: "teacher_meta_leak", probeId: probe.id, metrics: replyMetrics(payload.replyText) });
      }
      if (probe.noGenericUnknown && GENERIC_UNKNOWN_REPLIES.has(String(payload.replyText || ""))) {
        addFailure(failures, { kind: "matched_fact_suppressed_to_unknown", probeId: probe.id, metrics: replyMetrics(payload.replyText) });
      }
      if (probe.language === "en" && CJK.test(String(payload.replyText || ""))) {
        addFailure(failures, { kind: "english_reply_contains_cjk", probeId: probe.id, metrics: replyMetrics(payload.replyText) });
      }
    }

    for (const [index, boundary] of [
      { id: "diagnosis-en", question: "What is the diagnosis?", flag: "blocked_diagnosis_request", reason: "diagnosis_boundary" },
      { id: "report-en", question: "What did the CT and pathology report show?", flag: "blocked_report_request", reason: "report_boundary" }
    ].entries()) {
      const result = await invoke(chatHandler, {
        sessionId: sessions.get("P001/en"),
        caseId: "P001",
        agentId: "standardized_patient",
        stage: "history",
        mode: "training",
        language: "en",
        studentInput: boundary.question,
        conversationHistory: []
      }, `boundary-${index}`);
      checks += 1;
      assertPublicEnvelope(result, boundary.id, failures);
      if (
        !result.payload.safetyFlags?.includes(boundary.flag) ||
        result.payload.fallbackReason !== boundary.reason ||
        !sameSet(result.payload.matchedSlotIds, []) ||
        result.payload.generationSource !== "safety_boundary"
      ) {
        addFailure(failures, {
          kind: "boundary_contract",
          probeId: boundary.id,
          actualSlotIds: result.payload.matchedSlotIds,
          safetyFlags: result.payload.safetyFlags,
          fallbackReason: result.payload.fallbackReason || "",
          generationSource: result.payload.generationSource || ""
        });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.agents === undefined) delete process.env.LLM_ENABLE_AI_AGENTS;
    else process.env.LLM_ENABLE_AI_AGENTS = previousEnv.agents;
    if (previousEnv.patient === undefined) delete process.env.LLM_ENABLE_AI_PATIENT;
    else process.env.LLM_ENABLE_AI_PATIENT = previousEnv.patient;
  }

  if (providerCalls !== 0) addFailure(failures, { kind: "unexpected_provider_call", probeId: "provider", providerCalls });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "api-handler-local-rule-no-provider",
    medicalTruthAdjudicated: false,
    checks,
    providerCalls,
    result: { passed: failures.length === 0, failures: failures.length },
    failures
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ report: path.relative(process.cwd(), reportPath), checks, providerCalls, ...report.result }));
  if (failures.length) process.exitCode = 1;
}

await main();
