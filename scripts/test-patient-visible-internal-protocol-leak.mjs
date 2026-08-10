import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const environmentKeys = [
  "NODE_ENV", "TRAINING_STATE_SECRET", "TRAINING_ATTEMPT_STORE_MODE",
  "LLM_ENABLE_AI_PATIENT", "LLM_API_KEY", "LLM_API_BASE_URL", "LLM_PROVIDER",
  "LLM_MODEL", "LLM_STREAMING_ENABLED", "PATIENT_DEEPSEEK_THINKING",
  "HEMATURIA_DESKTOP_DATABASE_PATH", "HEMATURIA_DESKTOP_RUNTIME_SESSION_ID"
];
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalRuntimeEvidence = globalThis.__hematuriaDesktopRuntimeEvidence;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "r5-patient-protocol-leak-"));

process.env.NODE_ENV = "test";
process.env.TRAINING_STATE_SECRET = "patient-protocol-leak-test-secret-2026";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_ENABLE_AI_PATIENT = "true";
process.env.LLM_API_KEY = "";
process.env.LLM_API_BASE_URL = "http://127.0.0.1:18080/v1";
process.env.LLM_PROVIDER = "local";
process.env.LLM_MODEL = "Qwen3-1.7B";
process.env.LLM_STREAMING_ENABLED = "false";
process.env.PATIENT_DEEPSEEK_THINKING = "disabled";
process.env.HEMATURIA_DESKTOP_DATABASE_PATH = path.join(scratch, "runtime.sqlite3");
process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID = "patient-protocol-leak-runtime";

const { filterPatientOutput, generatePatientAnswer, initSession } = require("../server/patientSession.js");
const { resetPatientIntentClassifierState } = require("../server/patientIntentClassifier.js");
const sqliteStore = require("../server/desktopSqliteStore.js");
const {
  desktopPatientEvidence,
  desktopRuntimeSummary,
  resetDesktopPatientEvidenceForTests
} = require("../server/desktopRuntimeEvidence.js");

const allowed = "之前没有做过检查。";
const realLeakValues = [
  "之前没有做过检查。",
  "之前没做检查，所以没有检查结果。",
  "以前吃过一点消炎药。",
  "这次以前吃过一点消炎药。",
  "那时医生说可能是上火。",
  "我是差不多1月余前发现的。",
  "洗肉水样。"
];
const forbiddenOutputs = [
  `{"currentAllowedAnswer":"${allowed}"}`,
  `{"allowedAnswer":"${allowed}"}`,
  `{"replyText":"${allowed}","currentAllowedAnswer":"..."}`,
  `\`\`\`json\n{"currentAllowedAnswer":"${allowed}"}\n\`\`\``,
  `currentAllowedAnswer: ${allowed}`,
  `["${allowed}"]`,
  `{"role":"assistant","content":"${allowed}"}`,
  `{"groundedAnswer":"${allowed}","answerPlan":[]}`,
  `{"matchedFacts":[],"matchedSlots":[],"sourceSlot":"x","provenance":"x"}`,
  `{"classifier":{},"fallbackReason":"x","teacherOnly":true,"system":"x"}`,
  `intent: prior_investigation`,
  `replyText: ${allowed}`,
  `provider: local`,
  `answerSource: governed_planner`,
  `factState: exact_value`,
  `requestedSlot: PATIENT_PRIOR_INVESTIGATIONS`,
  `generationSource: local_ai`,
  `说明如下：\n{"replyText":"${allowed}"}`,
  `Here is the answer:\n["${allowed}"]`,
  `说明如下：\n{"role":"assistant","content":"${allowed}"}`,
  `Here is ["${allowed}"]`,
  `Plain prefix ["${allowed}"] suffix`,
  ...realLeakValues.map((text) => JSON.stringify({ currentAllowedAnswer: text }))
];

function providerResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function runNaturalizer(outputs, suffix) {
  resetPatientIntentClassifierState();
  let calls = 0;
  let classifierCalls = 0;
  const requests = [];
  const requestUrls = [];
  globalThis.fetch = async (input, init) => {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    requestUrls.push(requestUrl);
    const body = JSON.parse(String(init?.body || "{}"));
    const payload = JSON.parse(String(body.messages?.[1]?.content || "{}"));
    if (payload.classificationId) {
      classifierCalls += 1;
      return providerResponse(JSON.stringify({
        intent: "prior_investigations",
        currentTopic: "prior_investigations",
        currentEntity: "prior_investigations",
        requestedSlot: "PATIENT_PRIOR_INVESTIGATIONS",
        contextReference: { inherited: false, sourceIntent: null },
        clauses: [{ intent: "prior_investigations", requestedSlot: "PATIENT_PRIOR_INVESTIGATIONS" }],
        naturalizationStyle: "direct"
      }));
    }
    assert.equal(payload.currentAllowedAnswer, allowed, `${suffix} must keep the governed fallback authoritative`);
    requests.push(body);
    const output = outputs[Math.min(calls, outputs.length - 1)];
    calls += 1;
    return providerResponse(output);
  };
  const session = await initSession({
    caseId: "P001",
    attemptId: `patient-protocol-${suffix}`,
    mode: "free",
    capabilityMode: "public-practice",
    language: "zh"
  });
  const answer = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P001",
    studentInput: "查过尿吗？",
    conversationHistory: [],
    language: "zh"
  });
  assert.ok(requestUrls.length > 0, `${suffix} must call the local provider`);
  for (const requestUrl of requestUrls) {
    assert.match(requestUrl, /^http:\/\/127\.0\.0\.1:18080\/v1\//, `${suffix} must stay on the loopback local provider`);
  }
  assert.equal(classifierCalls, 1, `${suffix} must classify once before local naturalization`);
  return { answer, calls, requests };
}

try {
  assert.equal(filterPatientOutput(allowed, ["PATIENT_PRIOR_INVESTIGATIONS"]).ok, true, "ordinary patient text must remain valid");
  for (const output of forbiddenOutputs) {
    assert.equal(filterPatientOutput(output, ["PATIENT_PRIOR_INVESTIGATIONS"]).ok, false, `internal protocol output passed: ${output}`);
  }

  const corrected = await runNaturalizer([forbiddenOutputs[0], allowed], "corrected");
  assert.equal(corrected.calls, 2, "invalid output must receive exactly one bounded correction");
  assert.equal(corrected.answer.replyText, allowed);
  assert.equal(corrected.answer.isFallback, false, "a valid corrected plain-text answer may count as AI output");
  assert.match(corrected.requests[1].messages[0].content, /plain text/i);
  assert.match(corrected.requests[1].messages[0].content, /do not output or return json/i);

  const rejected = await runNaturalizer([forbiddenOutputs[1], forbiddenOutputs[2]], "rejected");
  assert.equal(rejected.calls, 2, "correction must be bounded to one retry");
  assert.equal(rejected.answer.replyText, allowed, "invalid correction must use the deterministic governed fallback");
  assert.equal(rejected.answer.isFallback, true);
  assert.equal(rejected.answer.fallbackReason, "ai_response_blocked");

  const ordinary = await runNaturalizer([allowed], "ordinary");
  assert.equal(ordinary.calls, 1);
  assert.equal(ordinary.answer.replyText, allowed);
  assert.equal(ordinary.answer.isFallback, false);

  sqliteStore.startDesktopRuntimeSession({
    runtimeSessionId: process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID,
    sessionStartedAt: "2026-08-10T00:00:00.000Z"
  });
  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    sessionStartedAt: "2026-08-10T00:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    configuredMode: null,
    effectiveMode: "lightweight",
    effectiveModel: "Qwen3-1.7B",
    overrideSource: "runtime_default",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0
  });
  resetDesktopPatientEvidenceForTests();
  desktopPatientEvidence({
    ...rejected.answer,
    runtimeTrace: {
      ...rejected.answer.runtimeTrace,
      classificationSource: "local_ai",
      classifierStatus: "accepted",
      providerHttpSuccess: true,
      generationSource: "governed_planner"
    }
  });
  assert.equal(desktopRuntimeSummary().localAiAcceptedCount, 0, "rejected naturalization must not count as local AI accepted");
  assert.equal(desktopRuntimeSummary().ruleFallbackCount, 1);
  assert.equal(desktopRuntimeSummary().cloudRequestCount, 0);

  console.log(`R5-PATIENT-VISIBLE-INTERNAL-PROTOCOL-LEAK passed: ${forbiddenOutputs.length} blocked shapes, one correction maximum, loopback local, cloud=0.`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.__hematuriaDesktopRuntimeEvidence = originalRuntimeEvidence;
  sqliteStore.closeDesktopSqliteStore();
  fs.rmSync(scratch, { recursive: true, force: true });
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
