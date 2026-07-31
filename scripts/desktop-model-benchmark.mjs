import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
const modelMode = String(process.env.HEMATURIA_DESKTOP_MODEL_MODE || manifest.defaultModelMode);
const model = manifest.models?.[modelMode];
if (!model) throw new Error("desktop_model_mode_invalid");
const llamaPath = path.join(repoRoot, "desktop-runtime", "llama", manifest.llamaCpp.entryPoint);
const defaultDataDirectory = path.join(
  process.env.LOCALAPPDATA || "",
  "cn.hematuria.training.desktop"
);
const modelPath = process.env.HEMATURIA_DESKTOP_MODEL_PATH
  || path.join(defaultDataDirectory, "models", model.fileName);

assert.equal((await fs.stat(llamaPath)).isFile(), true, "llama runtime missing");
assert.equal((await fs.stat(modelPath)).size, model.size, "model size mismatch");

async function sha256(filePath) {
  const digest = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

const modelSha256 = await sha256(modelPath);
assert.equal(modelSha256, model.sha256, "model SHA256 mismatch");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("benchmark_port_unavailable");
  return port;
}

function percentile(values, quantile) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1));
  return ordered[index];
}

async function probeLlamaReadiness({ origin, apiKey, modelAlias, fetchImpl }) {
  const evidence = {
    llamaServerReady: false,
    localModelReady: false,
    healthStatus: null,
    modelsStatus: null,
    modelListed: false
  };
  try {
    const healthResponse = await fetchImpl(`${origin}/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1500)
    });
    evidence.healthStatus = healthResponse.status;
    evidence.llamaServerReady = healthResponse.ok;
    if (!healthResponse.ok) return evidence;

    const modelsResponse = await fetchImpl(`${origin}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1500)
    });
    evidence.modelsStatus = modelsResponse.status;
    if (!modelsResponse.ok) return evidence;
    const models = await modelsResponse.json();
    evidence.modelListed = Array.isArray(models?.data)
      && models.data.some((item) => item?.id === modelAlias);
    evidence.localModelReady = evidence.modelListed;
    return evidence;
  } catch {
    return evidence;
  }
}

async function processPeakBytes(pid) {
  return new Promise((resolve, reject) => {
    const command = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).PeakWorkingSet64`
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    command.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    command.once("error", reject);
    command.once("exit", (code) => {
      const value = Number(output.trim());
      if (code === 0 && Number.isFinite(value)) resolve(value);
      else reject(new Error("benchmark_peak_memory_unavailable"));
    });
  });
}

const port = await reservePort();
const apiKey = crypto.randomBytes(32).toString("base64url");
const origin = `http://127.0.0.1:${port}`;
const llama = spawn(llamaPath, [
  "--model", modelPath,
  "--alias", model.alias,
  "--host", "127.0.0.1",
  "--port", String(port),
  "--ctx-size", "4096",
  "--threads", String(Math.max(1, os.availableParallelism() - 1)),
  "--parallel", "1",
  "--jinja",
  "--reasoning", "off",
  "--chat-template-kwargs", "{\"enable_thinking\":false}",
  "--no-webui",
  "--api-key", apiKey
], {
  cwd: path.dirname(llamaPath),
  windowsHide: true,
  stdio: "ignore"
});

const startedAt = performance.now();
const nativeFetch = globalThis.fetch;
let cloudRequestCount = 0;
try {
  const deadline = Date.now() + 180_000;
  let startupReadiness = null;
  while (Date.now() < deadline) {
    if (llama.exitCode !== null) throw new Error("benchmark_llama_exited");
    startupReadiness = await probeLlamaReadiness({
      origin,
      apiKey,
      modelAlias: model.alias,
      fetchImpl: nativeFetch
    });
    if (startupReadiness.llamaServerReady && startupReadiness.localModelReady) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!startupReadiness?.llamaServerReady || !startupReadiness?.localModelReady) {
    throw new Error("benchmark_llama_startup_timeout");
  }
  const loadMs = Math.round(performance.now() - startedAt);

  globalThis.fetch = async (input, init) => {
    const value = input instanceof Request ? input.url : String(input);
    const url = new URL(value);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname)) {
      cloudRequestCount += 1;
      throw new TypeError("benchmark_external_network_blocked");
    }
    return nativeFetch(input, init);
  };

  Object.assign(process.env, {
    NODE_ENV: "test",
    TRAINING_STATE_SECRET: "desktop-model-benchmark-training-secret-2026",
    TRAINING_ATTEMPT_STORE_MODE: "memory",
    LLM_PROVIDER: "local",
    LLM_API_BASE_URL: `${origin}/v1`,
    LLM_API_KEY: apiKey,
    LLM_MODEL: model.alias,
    LLM_ENDPOINT_TYPE: "chat_completions",
    LLM_STREAMING_ENABLED: "false",
    LLM_ENABLE_AI_PATIENT: "true",
    PATIENT_SEMANTIC_CLASSIFIER_ENABLED: "true",
    LLM_THINKING_MODE: "disabled",
    PATIENT_LOCAL_TIMEOUT_MS: "90000"
  });

  const { generatePatientAnswer, initSession } = require("../server/patientSession.js");
  const { resetPatientIntentClassifierState } = require("../server/patientIntentClassifier.js");
  const expectation = [
    { expectedIntent: "chief_complaint", expectedSlot: "chief_complaint" },
    { expectedIntent: "hematuria_onset", expectedSlot: "hematuria_onset", requiresContext: true },
    { expectedIntent: "past_medical_history_summary", expectedSlot: "PAST_ALL", allowsUnknown: true },
    { expectedIntent: "medication_name", expectedSlot: "MED_ALL" },
    { expectedIntent: "medication_frequency", expectedSlot: "MED_ALL", requiresContext: true },
    { expectedIntent: "other_medications", expectedSlot: "MED_ALL" },
    { expectedIntent: "smoking_history", expectedSlot: "LIFE_SMOKING", allowsUnknown: true },
    { expectedIntent: "alcohol_history", expectedSlot: "LIFE_ALCOHOL", allowsUnknown: true }
  ];
  const questionSets = [
    {
      language: "zh",
      questions: [
        "哪里不舒服？", "多久了？", "有没有其他疾病？", "高血压吃什么药？",
        "这个药怎么吃？", "还有其他药吗？", "抽烟吗？", "喝酒吗？"
      ]
    },
    {
      language: "en",
      questions: [
        "What brings you in?", "How long has it been going on?", "Do you have any other diseases?",
        "What medicine do you take for high blood pressure?", "How do you take it?",
        "Do you take any other medications?", "Do you smoke?", "Do you drink alcohol?"
      ]
    }
  ];
  const timings = [];
  const sources = {};
  const fallbackReasons = {};
  const turnEvidence = [];
  for (const set of questionSets) {
    resetPatientIntentClassifierState();
    const session = await initSession({
      caseId: "P001",
      attemptId: `benchmark-${set.language}-${Date.now()}`,
      mode: "free",
      capabilityMode: "public-practice",
      language: set.language
    });
    const conversationHistory = [];
    for (const [index, question] of set.questions.entries()) {
      const expected = expectation[index];
      const turnReadiness = await probeLlamaReadiness({
        origin,
        apiKey,
        modelAlias: model.alias,
        fetchImpl: nativeFetch
      });
      assert.equal(turnReadiness.llamaServerReady, true, "llama /health must be ready before each turn");
      assert.equal(turnReadiness.localModelReady, true, "selected model must be listed before each turn");
      const turnStarted = performance.now();
      const answer = await generatePatientAnswer({
        sessionId: session.sessionId,
        caseId: "P001",
        studentInput: question,
        conversationHistory,
        language: set.language
      });
      const latency = Math.round(performance.now() - turnStarted);
      timings.push(latency);
      const classificationSource = String(answer.runtimeTrace?.classificationSource || "none");
      const classifierStatus = String(answer.runtimeTrace?.classifierStatus || "unknown");
      const source = `${answer.runtimeTrace?.generationSource || "unknown"}/${classificationSource}/${classifierStatus}`;
      sources[source] = (sources[source] || 0) + 1;
      const fallbackReason = String(answer.runtimeTrace?.fallbackReason || "none");
      fallbackReasons[fallbackReason] = (fallbackReasons[fallbackReason] || 0) + 1;
      assert.ok(String(answer.replyText || "").trim(), "Patient answer must be non-empty");
      const plans = Array.isArray(answer.answerPlans) ? answer.answerPlans : [];
      const governedTraceIntent = String(answer.runtimeTrace?.governedIntent || "");
      const plan = [...plans].reverse().find((candidate) => candidate?.intent === governedTraceIntent)
        || plans.at(-1)
        || null;
      const unknown = String(
        plan?.unknownReason
        || Object.values(answer.unknownReasonCodes || {})[0]
        || ""
      ) || null;
      const localAccepted = classificationSource === "local_ai" && classifierStatus === "accepted";
      const localMetadata = localAccepted && answer.localMetadata && typeof answer.localMetadata === "object"
        ? answer.localMetadata
        : null;
      if (localAccepted) {
        assert.ok(localMetadata, "accepted local classification must expose validated localMetadata");
      }
      if (classificationSource === "local_ai" && classifierStatus === "rejected") {
        assert.notEqual(fallbackReason, "none", "validator rejection must expose its actual safe reason");
      }
      const intent = localMetadata
        ? String(localMetadata.intent || "") || null
        : String(answer.runtimeTrace?.intent || "") || null;
      const requestedSlot = localMetadata
        ? String(localMetadata.requestedSlot || "") || null
        : String(answer.runtimeTrace?.requestedSlot || "") || null;
      const governedFinalIntent = String(governedTraceIntent || plan?.intent || "") || null;
      const governedFinalSlot = String(
        answer.runtimeTrace?.governedRequestedSlot
        || plan?.sourceSlotId
        || ""
      ) || null;
      const answerSource = localAccepted ? "local_ai" : "rule_fallback";
      const contextReference = localMetadata?.contextReference
        ? {
            inherited: localMetadata.contextReference.inherited === true,
            sourceIntent: String(localMetadata.contextReference.sourceIntent || "") || null
          }
        : null;
      const governedContextInherited = answer.contextResolution?.inherited === true;
      const modelContextInherited = contextReference?.inherited === true;
      const contextLost = expected.requiresContext
        ? !(governedContextInherited || modelContextInherited)
        : false;
      const erroneousUnknown = !expected.allowsUnknown
        && ["fact_missing", "intent_ambiguous", "classifier_unavailable"].includes(String(unknown || ""));
      turnEvidence.push({
        language: set.language,
        turn: index + 1,
        answerSource,
        classificationSource,
        classifierStatus,
        llamaServerReady: turnReadiness.llamaServerReady,
        localModelReady: turnReadiness.localModelReady,
        model: String(answer.runtimeTrace?.model || model.alias),
        cloudRequestCount,
        fallbackReason: fallbackReason === "none" ? null : fallbackReason,
        intent,
        requestedSlot,
        contextReference,
        governedContextInherited,
        modelContextInherited,
        governedFinalIntent,
        governedFinalSlot,
        factState: String(plan?.factState || "") || null,
        unknown,
        latency,
        expectedIntent: expected.expectedIntent,
        expectedSlot: expected.expectedSlot,
        intentMatch: localAccepted && intent === expected.expectedIntent,
        slotMatch: localAccepted && requestedSlot === expected.expectedSlot,
        governedFinalIntentMatch: governedFinalIntent === expected.expectedIntent,
        governedFinalSlotMatch: governedFinalSlot === expected.expectedSlot,
        erroneousUnknown,
        contextLost
      });
      conversationHistory.push(
        { role: "student", text: question },
        { role: "patient", text: answer.replyText }
      );
    }
  }
  const peakWorkingSetBytes = await processPeakBytes(llama.pid);
  const fallbackCount = turnEvidence.filter((turn) => turn.answerSource === "rule_fallback").length;
  const intentMatches = turnEvidence.filter((turn) => turn.intentMatch).length;
  const slotMatches = turnEvidence.filter((turn) => turn.slotMatch).length;
  const localAcceptedCount = turnEvidence.filter((turn) => turn.answerSource === "local_ai").length;
  const governedFinalIntentMatches = turnEvidence.filter((turn) => turn.governedFinalIntentMatch).length;
  const governedFinalSlotMatches = turnEvidence.filter((turn) => turn.governedFinalSlotMatch).length;
  assert.equal(turnEvidence.length, 16, "benchmark must cover the same eight turns in zh and en");
  assert.equal(cloudRequestCount, 0, "desktop model benchmark must remain loopback-only");
  assert.equal(new URL(origin).hostname, "127.0.0.1", "llama-server must listen on IPv4 loopback");
  const finalReadiness = await probeLlamaReadiness({
    origin,
    apiKey,
    modelAlias: model.alias,
    fetchImpl: nativeFetch
  });
  assert.equal(finalReadiness.llamaServerReady, true, "llama /health must remain ready after the benchmark");
  assert.equal(finalReadiness.localModelReady, true, "selected model must remain listed after the benchmark");
  const byLanguage = Object.fromEntries(["zh", "en"].map((language) => {
    const rows = turnEvidence.filter((turn) => turn.language === language);
    const fallbacks = rows.filter((turn) => turn.answerSource === "rule_fallback").length;
    const acceptedRows = rows.filter((turn) => turn.answerSource === "local_ai");
    return [language, {
      turns: rows.length,
      intentAccuracy: rows.filter((turn) => turn.intentMatch).length / rows.length,
      slotAccuracy: rows.filter((turn) => turn.slotMatch).length / rows.length,
      acceptedTurns: acceptedRows.length,
      acceptedIntentAccuracy: acceptedRows.length
        ? acceptedRows.filter((turn) => turn.intentMatch).length / acceptedRows.length
        : null,
      acceptedSlotAccuracy: acceptedRows.length
        ? acceptedRows.filter((turn) => turn.slotMatch).length / acceptedRows.length
        : null,
      governedFinalIntentAccuracy: rows.filter((turn) => turn.governedFinalIntentMatch).length / rows.length,
      governedFinalSlotAccuracy: rows.filter((turn) => turn.governedFinalSlotMatch).length / rows.length,
      unknownCount: rows.filter((turn) => turn.unknown).length,
      erroneousUnknownCount: rows.filter((turn) => turn.erroneousUnknown).length,
      contextLostCount: rows.filter((turn) => turn.contextLost === true).length,
      governedContextAppliedCount: rows.filter((turn) => turn.governedContextInherited).length,
      modelContextDeclaredCount: rows.filter((turn) => turn.modelContextInherited).length,
      fallbackCount: fallbacks,
      fallbackRate: fallbacks / rows.length,
      p50Ms: percentile(rows.map((turn) => turn.latency), 0.5),
      p95Ms: percentile(rows.map((turn) => turn.latency), 0.95)
    }];
  }));
  const result = {
    modelMode,
    model: model.fileName,
    modelAlias: model.alias,
    modelBytes: model.size,
    modelSha256,
    modelSha256Verified: modelSha256 === model.sha256,
    thinkingMode: "disabled",
    loadMs,
    readiness: {
      startup: startupReadiness,
      final: finalReadiness
    },
    turns: timings.length,
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    minMs: Math.min(...timings),
    maxMs: Math.max(...timings),
    peakWorkingSetBytes,
    intentAccuracy: intentMatches / turnEvidence.length,
    slotAccuracy: slotMatches / turnEvidence.length,
    acceptedTurns: localAcceptedCount,
    acceptedIntentAccuracy: localAcceptedCount ? intentMatches / localAcceptedCount : null,
    acceptedSlotAccuracy: localAcceptedCount ? slotMatches / localAcceptedCount : null,
    governedFinalIntentAccuracy: governedFinalIntentMatches / turnEvidence.length,
    governedFinalSlotAccuracy: governedFinalSlotMatches / turnEvidence.length,
    unknownCount: turnEvidence.filter((turn) => turn.unknown).length,
    erroneousUnknownCount: turnEvidence.filter((turn) => turn.erroneousUnknown).length,
    contextLostCount: turnEvidence.filter((turn) => turn.contextLost === true).length,
    governedContextAppliedCount: turnEvidence.filter((turn) => turn.governedContextInherited).length,
    modelContextDeclaredCount: turnEvidence.filter((turn) => turn.modelContextInherited).length,
    fallbackCount,
    fallbackRate: fallbackCount / turnEvidence.length,
    cloudRequestCount,
    listenHost: new URL(origin).hostname,
    loopbackOnly: new URL(origin).hostname === "127.0.0.1" && cloudRequestCount === 0,
    byLanguage,
    sources,
    fallbackReasons,
    turnEvidence
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  globalThis.fetch = nativeFetch;
  if (llama.exitCode === null) {
    llama.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      llama.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (llama.exitCode === null) llama.kill("SIGKILL");
}
