import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const originalEnvironment = new Map();
const environmentKeys = [
  "NODE_ENV",
  "TRAINING_STATE_SECRET",
  "TRAINING_ATTEMPT_STORE_MODE",
  "HEMATURIA_DESKTOP_DATABASE_PATH",
  "LLM_PROVIDER",
  "LLM_API_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "LLM_ENDPOINT_TYPE",
  "LLM_ENABLE_AI_PATIENT",
  "LLM_ENABLE_AI_AGENTS",
  "LLM_STREAMING_ENABLED",
  "LLM_THINKING_MODE",
  "PATIENT_DEEPSEEK_THINKING",
  "PATIENT_SEMANTIC_CLASSIFIER_ENABLED",
  "PATIENT_LOCAL_TIMEOUT_MS"
];
for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);

process.env.NODE_ENV = "test";
process.env.TRAINING_STATE_SECRET = "local-structured-test-training-secret-2026";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_PROVIDER = "local";
process.env.LLM_API_BASE_URL = "http://127.0.0.1:18080/v1";
process.env.LLM_ENDPOINT_TYPE = "chat_completions";
process.env.LLM_ENABLE_AI_PATIENT = "true";
process.env.PATIENT_DEEPSEEK_THINKING = "max";
delete process.env.LLM_API_KEY;
delete process.env.LLM_MODEL;
delete process.env.LLM_STREAMING_ENABLED;
delete process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED;

const {
  DEFAULT_LOCAL_MODEL,
  getLLMProviderConfig,
  providerCredentialsAvailable
} = require("../server/llmClient.runtime.js");
const {
  PATIENT_METADATA_JSON_SCHEMA,
  PATIENT_METADATA_RESPONSE_FORMAT,
  classifyPatientIntent,
  parseClassifierResponse,
  patientThinkingConfig,
  resetPatientIntentClassifierState,
  semanticClassifierEnabled
} = require("../server/patientIntentClassifier.js");
const {
  generatePatientAnswer,
  getSession,
  initSession
} = require("../server/patientSession.js");
const { closeDesktopSqliteStore } = require("../server/desktopSqliteStore.js");
const agentChatHandler = require("../api/agent-chat.js");

function localMetadata(intent = "dysuria", overrides = {}) {
  const requestedSlot = intent === null
    ? null
    : intent === "fever"
      ? "fever_chills"
      : intent === "medication_name"
        ? "MED_ALL"
        : "dysuria";
  return {
    intent,
    currentTopic: intent,
    currentEntity: intent === "fever"
      ? "infection_symptoms"
      : intent === "medication_name"
        ? "medication"
        : "urination",
    requestedSlot,
    contextReference: { inherited: false, sourceIntent: null },
    clauses: [{ intent, requestedSlot }],
    naturalizationStyle: intent === null ? "clarification" : "direct",
    ...overrides
  };
}

function providerResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function callApi(handler, { body, headers = {}, ip = "local-structured-api" }) {
  let statusCode = 200;
  let payload;
  const responseHeaders = {};
  const req = {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
    socket: { remoteAddress: ip }
  };
  const res = {
    setHeader(name, value) {
      responseHeaders[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
    end() {
      return this;
    }
  };
  await handler(req, res);
  return { statusCode, payload, headers: responseHeaders };
}

async function main() {
  const config = getLLMProviderConfig();
  assert.equal(config.provider, "local");
  assert.equal(config.model, DEFAULT_LOCAL_MODEL);
  assert.match(config.model, /qwen3/i);
  assert.equal(config.thinkingMode, "disabled");
  assert.equal(config.streaming, false);
  assert.equal(providerCredentialsAvailable(config), true, "loopback local providers must not require a cloud API key");
  assert.equal(semanticClassifierEnabled(), true, "local metadata classification is enabled unless explicitly disabled");
  assert.deepEqual(patientThinkingConfig(), {
    mode: "disabled",
    thinkingMode: "disabled",
    reasoningEffort: undefined
  });

  assert.deepEqual(
    [...PATIENT_METADATA_JSON_SCHEMA.required].sort(),
    [
      "intent",
      "currentTopic",
      "currentEntity",
      "requestedSlot",
      "contextReference",
      "clauses",
      "naturalizationStyle"
    ].sort()
  );
  assert.equal(PATIENT_METADATA_JSON_SCHEMA.additionalProperties, false);
  assert.equal(PATIENT_METADATA_JSON_SCHEMA.properties.clauses.items.additionalProperties, false);
  assert.equal(PATIENT_METADATA_RESPONSE_FORMAT.type, "json_schema");
  assert.equal(PATIENT_METADATA_RESPONSE_FORMAT.json_schema.strict, true);
  assert.equal(
    parseClassifierResponse(JSON.stringify(localMetadata()))?.intent,
    "dysuria"
  );
  for (const invalid of [
    { ...localMetadata(), answer: "yes" },
    { ...localMetadata(), diagnosis: "cancer" },
    { ...localMetadata(), medicationName: "synthetic-drug" },
    { ...localMetadata(), score: 100 },
    { ...localMetadata(), requestedSlot: "fever_chills" },
    {
      ...localMetadata(),
      clauses: [{ intent: "dysuria", requestedSlot: "dysuria", factValue: true }]
    },
    {
      ...localMetadata(),
      intent: "diagnosis",
      currentTopic: "diagnosis",
      requestedSlot: null,
      clauses: [{ intent: "diagnosis", requestedSlot: null }]
    }
  ]) {
    assert.equal(parseClassifierResponse(JSON.stringify(invalid)), null);
  }
  assert.equal(
    parseClassifierResponse(`<think>hidden reasoning</think>${JSON.stringify(localMetadata())}`),
    null
  );

  resetPatientIntentClassifierState();
  let classifierInput;
  const injected = await classifyPatientIntent({
    question: "小便时痛不痛？",
    language: "zh",
    enabled: true,
    forceMetadata: true,
    callProvider: async (input) => {
      classifierInput = input;
      return {
        text: JSON.stringify(localMetadata()),
        provider: "local",
        model: DEFAULT_LOCAL_MODEL,
        durationMs: 7
      };
    }
  });
  assert.equal(injected.accepted, true);
  assert.equal(injected.routingAuthorized, false);
  assert.equal(injected.confidence, 0);
  assert.equal(injected.metadataValid, true);
  assert.equal(injected.provider, "local");
  assert.deepEqual(classifierInput.responseFormat, PATIENT_METADATA_RESPONSE_FORMAT);
  assert.equal(classifierInput.thinkingMode, "disabled");
  assert.equal(classifierInput.reasoningEffort, undefined);
  assert.equal(classifierInput.temperature, 0);
  assert.deepEqual(
    Object.keys(classifierInput.userPayload).sort(),
    [
      "allowedEntities",
      "allowedIntents",
      "allowedNaturalizationStyles",
      "classificationId",
      "conversationState",
      "governedCandidateMappings",
      "governedIntentCandidates",
      "language",
      "question",
      "recentUserQuestions",
      "requiredContextReference",
      "schemaVersion"
    ].sort()
  );
  assert.doesNotMatch(
    JSON.stringify(classifierInput.userPayload),
    /caseId|patientAnswer|factValue|reviewerStatus|teacher|score/i
  );

  const originalFetch = globalThis.fetch;
  try {
    resetPatientIntentClassifierState();
    let networkCalls = 0;
    let requestBody;
    let requestHeaders;
    globalThis.fetch = async (url, options) => {
      networkCalls += 1;
      assert.equal(String(url), "http://127.0.0.1:18080/v1/chat/completions");
      requestBody = JSON.parse(String(options?.body || "{}"));
      requestHeaders = options?.headers || {};
      return providerResponse(JSON.stringify(localMetadata()));
    };
    const direct = await classifyPatientIntent({
      question: "排尿的时候会不会痛？",
      language: "zh",
      enabled: true,
      forceMetadata: true
    });
    assert.equal(direct.accepted, true);
    assert.equal(networkCalls, 1);
    assert.equal("Authorization" in requestHeaders, false);
    assert.equal(requestBody.model, DEFAULT_LOCAL_MODEL);
    assert.equal(requestBody.stream, false);
    assert.deepEqual(requestBody.chat_template_kwargs, { enable_thinking: false });
    assert.equal("thinking" in requestBody, false);
    assert.deepEqual(requestBody.response_format, PATIENT_METADATA_RESPONSE_FORMAT);
    const directUserPayload = JSON.parse(requestBody.messages[1].content);
    assert.doesNotMatch(
      JSON.stringify(directUserPayload),
      /caseId|patientAnswer|factValue|reviewerStatus|teacher|score/i
    );

    resetPatientIntentClassifierState();
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify(localMetadata()));
    };
    const deterministic = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "小便痛不痛？",
      language: "zh"
    });
    assert.equal(networkCalls, 1, "local provider may classify common questions but must not generate answer text");
    assert.deepEqual(deterministic.matchedFacts, ["dysuria"]);
    assert.match(deterministic.replyText, /没有|不痛/);
    assert.ok(deterministic.answerSource);
    assert.notEqual(deterministic.answerSource, "local");
    assert.equal(deterministic.provider, "local");
    assert.equal(deterministic.isFallback, false);
    assert.equal(deterministic.localMetadataApplied, true);
    assert.deepEqual(
      Object.keys(deterministic.localMetadata).sort(),
      [
        "intent",
        "currentTopic",
        "currentEntity",
        "requestedSlot",
        "contextReference",
        "clauses",
        "naturalizationStyle"
      ].sort()
    );
    assert.equal(deterministic.runtimeTrace.generationSource, "governed_planner");
    assert.equal(deterministic.runtimeTrace.classificationSource, "local_ai");
    assert.equal(deterministic.runtimeTrace.classifierStatus, "accepted");
    assert.equal(deterministic.runtimeTrace.thinkingExecuted, false);

    resetPatientIntentClassifierState();
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify({
        ...localMetadata(),
        diagnosis: "synthetic-cancer",
        answer: "synthetic-answer"
      }));
    };
    const schemaFailure = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "你小便时痛不痛？",
      language: "zh"
    });
    assert.equal(networkCalls, 1);
    assert.match(schemaFailure.replyText, /没有|不痛/);
    assert.doesNotMatch(schemaFailure.replyText, /synthetic/i);
    assert.equal(schemaFailure.isFallback, true);
    assert.equal(schemaFailure.fallbackReason, "semantic_response_invalid");
    assert.equal(schemaFailure.runtimeTrace.generationSource, "governed_planner");
    assert.equal(schemaFailure.runtimeTrace.classificationSource, "local_ai");
    assert.equal(schemaFailure.runtimeTrace.classifierStatus, "rejected");

    resetPatientIntentClassifierState();
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify(localMetadata("fever")));
    };
    const disagreement = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "排尿的时候疼不疼？",
      language: "zh"
    });
    assert.equal(networkCalls, 1);
    assert.deepEqual(disagreement.matchedFacts, ["dysuria"]);
    assert.equal(disagreement.localMetadataApplied, false);
    assert.equal(disagreement.fallbackReason, "local_metadata_conflict_with_governed_candidates");
    assert.equal(disagreement.runtimeTrace.generationSource, "governed_planner");
    assert.equal(disagreement.runtimeTrace.classificationSource, "local_ai");
    assert.equal(disagreement.runtimeTrace.classifierStatus, "rejected");

    resetPatientIntentClassifierState();
    process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("disabled classifier must not call the provider");
    };
    const disabled = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "小便痛吗？",
      language: "zh"
    });
    assert.equal(networkCalls, 0);
    assert.equal(disabled.isFallback, true);
    assert.equal(disabled.runtimeTrace.generationSource, "governed_planner");
    assert.equal(disabled.runtimeTrace.classificationSource, "deterministic");
    assert.equal(disabled.runtimeTrace.classifierStatus, "not_invoked");
    delete process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED;

    resetPatientIntentClassifierState();
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify(localMetadata()));
    };
    const semantic = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "排泄尿液时会产生灼热样感觉吗？",
      language: "zh"
    });
    assert.equal(networkCalls, 1);
    assert.deepEqual(semantic.matchedFacts || [], []);
    assert.equal(semantic.answerSource, "unknown");
    assert.equal(semantic.fallbackReason, "semantic_route_requires_governed_match");
    assert.equal(semantic.runtimeTrace.generationSource, "rule_fallback");
    assert.equal(semantic.runtimeTrace.classificationSource, "local_ai");
    assert.equal(semantic.runtimeTrace.classifierStatus, "rejected");

    resetPatientIntentClassifierState();
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify(localMetadata("medication_name")));
    };
    const misroutedMedication = await generatePatientAnswer({
      sessionId: "",
      caseId: "P001",
      studentInput: "排泄尿液时会产生灼热样感觉吗？",
      language: "zh"
    });
    assert.equal(networkCalls, 1);
    assert.deepEqual(misroutedMedication.matchedFacts || [], []);
    assert.equal(misroutedMedication.fallbackReason, "semantic_route_requires_governed_match");
    assert.doesNotMatch(misroutedMedication.replyText, /氨氯地平|amlodipine/i);

    resetPatientIntentClassifierState();
    const apiSession = await initSession({
      caseId: "P002",
      attemptId: "local-structured-api-attempt",
      mode: "free",
      capabilityMode: "public-practice",
      language: "zh"
    });
    networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return providerResponse(JSON.stringify(localMetadata()));
    };
    const apiLocal = await callApi(agentChatHandler, {
      headers: { "x-idempotency-key": "local-structured-api-success" },
      body: {
        caseId: "P002",
        agentId: "standardized_patient",
        sessionId: apiSession.sessionId,
        attemptId: apiSession.attemptId,
        sessionMode: "free",
        mode: "free",
        stage: "history",
        language: "zh",
        studentInput: "小便痛不痛？",
        conversationHistory: []
      }
    });
    assert.equal(apiLocal.statusCode, 200, JSON.stringify(apiLocal.payload));
    assert.equal(networkCalls, 1);
    assert.equal(apiLocal.payload.generationSource, "governed_planner");
    assert.equal(apiLocal.payload.classificationSource, "local_ai");
    assert.equal(apiLocal.payload.classifierStatus, "accepted");
    assert.equal(apiLocal.payload.provider, "local");
    assert.equal(apiLocal.payload.isFallback, false);
    assert.notEqual(apiLocal.payload.answerSource, "local");

    resetPatientIntentClassifierState();
    globalThis.fetch = async () => providerResponse(JSON.stringify({
      ...localMetadata(),
      score: 360
    }));
    const apiFallback = await callApi(agentChatHandler, {
      ip: "local-structured-api-fallback",
      headers: { "x-idempotency-key": "local-structured-api-fallback" },
      body: {
        caseId: "P002",
        agentId: "standardized_patient",
        sessionId: apiSession.sessionId,
        attemptId: apiSession.attemptId,
        sessionMode: "free",
        mode: "free",
        stage: "history",
        language: "zh",
        studentInput: "排尿痛不痛？",
        conversationHistory: []
      }
    });
    assert.equal(apiFallback.statusCode, 200, JSON.stringify(apiFallback.payload));
    assert.equal(apiFallback.payload.generationSource, "governed_planner");
    assert.equal(apiFallback.payload.classificationSource, "local_ai");
    assert.equal(apiFallback.payload.classifierStatus, "rejected");
    assert.equal(apiFallback.payload.isFallback, true);
    assert.match(apiFallback.payload.replyText, /没有|不痛/);

    resetPatientIntentClassifierState();
    globalThis.fetch = async () => {
      throw new DOMException("synthetic local timeout", "AbortError");
    };
    const timedOut = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "小便的时候疼吗？",
      language: "zh"
    });
    assert.equal(timedOut.isFallback, true);
    assert.equal(timedOut.fallbackReason, "semantic_provider_timeout");
    assert.equal(timedOut.runtimeTrace.generationSource, "governed_planner");
    assert.equal(timedOut.runtimeTrace.classificationSource, "local_ai");
    assert.equal(timedOut.runtimeTrace.classifierStatus, "timeout");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const sqliteDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-patient-session-"));
  const sqlitePath = path.join(sqliteDirectory, "desktop.sqlite");
  try {
    process.env.TRAINING_ATTEMPT_STORE_MODE = "sqlite";
    process.env.HEMATURIA_DESKTOP_DATABASE_PATH = sqlitePath;
    const persistedSession = await initSession({
      caseId: "P003",
      attemptId: "local-session-restore",
      mode: "free",
      capabilityMode: "public-practice",
      language: "en"
    });
    closeDesktopSqliteStore();
    globalThis.__hematuriaSessionCache.clear();
    const restored = getSession(persistedSession.sessionId, "P003");
    assert.ok(restored, "valid desktop session metadata must restore an in-memory deterministic session");
    assert.match(
      restored.completedPatientFacingProfile.patient_opening_statement.value,
      /[A-Za-z]/,
      "the language claim must select the English deterministic profile during restore"
    );
    assert.deepEqual(restored.conversationState, {
      currentTopic: "",
      currentEntity: "",
      requestedSlot: "",
      lastResolvedFact: null,
      lastAnswerPlan: null
    });
    closeDesktopSqliteStore();
    const database = new DatabaseSync(sqlitePath);
    const sessionRow = database.prepare("SELECT * FROM desktop_sessions WHERE session_id = ?")
      .get(persistedSession.sessionId);
    assert.deepEqual(
      Object.keys(sessionRow).sort(),
      [
        "session_id",
        "attempt_id",
        "case_id",
        "language",
        "mode",
        "status",
        "created_at",
        "updated_at"
      ].sort()
    );
    assert.equal(sessionRow.attempt_id, "local-session-restore");
    assert.equal(sessionRow.case_id, "P003");
    assert.equal(sessionRow.status, "active");
    const columns = database.prepare("PRAGMA table_info(desktop_sessions)").all().map((row) => row.name);
    assert.equal(columns.some((name) => /conversation|prompt|answer|profile|config/i.test(name)), false);
    database.close();
  } finally {
    closeDesktopSqliteStore();
    process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
    delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
    fs.rmSync(sqliteDirectory, { recursive: true, force: true });
  }

  console.log("Local Qwen3 structured Patient metadata, deterministic authority, fallback, API source, and SQLite session restore tests passed.");
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  try {
    closeDesktopSqliteStore();
  } catch {
    // Best-effort cleanup after an assertion failure.
  }
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
if (failure) throw failure;
