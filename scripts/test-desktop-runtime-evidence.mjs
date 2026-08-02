import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-runtime-evidence-"));
const databasePath = path.join(testDirectory, "runtime.sqlite3");
const runtimeSessionId = "runtime-evidence-main";
const originalDatabasePath = process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
const originalRuntimeSessionId = process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID;
delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
delete process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID;
const {
  desktopEvidenceSnapshot,
  desktopPatientEvidence,
  desktopRuntimeEventsForTests,
  desktopRuntimeSummary,
  resetDesktopPatientEvidenceForTests,
  runtimeSnapshot
} = require("../server/desktopRuntimeEvidence.js");
const sqliteStore = require("../server/desktopSqliteStore.js");

function runtime(overrides = {}) {
  return {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0,
    ...overrides
  };
}

function patient({
  classificationSource = "local_ai",
  classifierStatus = "accepted",
  providerHttpSuccess = true,
  inherited = true,
  factState = "exact_value",
  unknownReason = null,
  model = "Qwen3-1.7B",
  fallbackReason = "",
  intent = "smoking_history",
  requestedSlot = "SMOKING",
  durationMs = 321
} = {}) {
  return {
    runtimeTrace: {
      classificationSource,
      classifierStatus,
      providerHttpSuccess,
      model,
      fallbackReason,
      intent,
      requestedSlot,
      durationMs,
      responseErrors: []
    },
    contextResolution: { inherited },
    answerPlans: [{ intent, sourceSlotId: requestedSlot, factState, unknownReason }]
  };
}

function runChild(source, environment) {
  const result = spawnSync(process.execPath, ["-e", source], {
    cwd: path.resolve("."),
    env: { ...process.env, ...environment },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const childRuntime = `
  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    sessionStartedAt: "2026-08-01T13:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    productHead: "${"b".repeat(40)}",
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0
  });
`;

const childPatient = `({
  runtimeTrace: {
    classificationSource: "local_ai",
    classifierStatus: "accepted",
    providerHttpSuccess: true,
    model: "Qwen3-1.7B",
    durationMs: 10,
    responseErrors: []
  },
  answerPlans: []
})`;

try {
  resetDesktopPatientEvidenceForTests();
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
  assert.equal(runtimeSnapshot(), null);
  assert.equal(desktopPatientEvidence(patient()), null);

  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = databasePath;
  process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID = runtimeSessionId;
  sqliteStore.startDesktopRuntimeSession({
    runtimeSessionId,
    sessionStartedAt: "2026-08-01T12:00:00.000Z"
  });
  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime();
  assert.deepEqual(desktopEvidenceSnapshot(), {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: 0,
    answerSource: null,
    fallbackReason: null,
    intent: null,
    requestedSlot: null,
    factState: null,
    unknown: null,
    latency: 0,
    responseErrors: []
  });
  assert.deepEqual(desktopPatientEvidence(patient(), { sessionId: "runtime-test-session" }), {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: 0,
    answerSource: "local_ai",
    fallbackReason: null,
    intent: "smoking_history",
    requestedSlot: "SMOKING",
    factState: "exact_value",
    unknown: null,
    latency: 321,
    responseErrors: []
  });
  assert.equal(desktopEvidenceSnapshot().intent, "smoking_history");

  assert.equal(
    desktopPatientEvidence(patient({ classifierStatus: "rejected" })).answerSource,
    "rule_fallback"
  );
  assert.equal(
    desktopPatientEvidence(patient({ providerHttpSuccess: false })).answerSource,
    "rule_fallback"
  );

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ llamaServerReady: false, localModelReady: false, model: "Qwen3-4B" });
  const unavailable = desktopPatientEvidence(patient());
  assert.equal(unavailable.answerSource, "rule_fallback");
  assert.equal(unavailable.llamaServerReady, false);
  assert.equal(unavailable.localModelReady, false);
  assert.equal(unavailable.model, "Qwen3-4B");

  const unknown = desktopPatientEvidence(patient({
    factState: "missing",
    unknownReason: "fact_missing",
    fallbackReason: "semantic_low_confidence"
  }));
  assert.equal(unknown.factState, "missing");
  assert.equal(unknown.unknown, "fact_missing");
  assert.equal(unknown.fallbackReason, "semantic_low_confidence");

  resetDesktopPatientEvidenceForTests();
  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime();
  for (let index = 0; index < 5; index += 1) {
    desktopPatientEvidence(patient(), { sessionId: `local-session-${index}` });
  }
  desktopPatientEvidence(patient({ classifierStatus: "rejected" }), { sessionId: "fallback-session" });
  const aggregate = desktopRuntimeSummary();
  assert.deepEqual(aggregate, {
    schemaVersion: 1,
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    localAiAcceptedCount: 5,
    ruleFallbackCount: 1,
    eventWriteFailureCount: 0,
    runtimeAuditHealthy: true,
    cloudRequestCount: 0,
    generatedAt: aggregate.generatedAt
  });
  assert.doesNotMatch(JSON.stringify(aggregate), /question|answer|prompt|reply|caseId|token|secret|reasoning|patient|intent/i);
  const runtimeEvent = desktopRuntimeEventsForTests()[0];
  assert.deepEqual(Object.keys(runtimeEvent).sort(), ["eventId", "runtimeSessionId", "eventType", "latency", "model", "timestamp"].sort());
  assert.equal(runtimeEvent.eventType, "local_ai_accepted");
  assert.match(runtimeEvent.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.doesNotMatch(JSON.stringify(desktopRuntimeEventsForTests()), /question|answer|prompt|reply|caseId|token|secret|reasoning|patient|intent/i);

  resetDesktopPatientEvidenceForTests();
  for (let index = 0; index < 10; index += 1) {
    desktopPatientEvidence(patient({
      classificationSource: "deterministic",
      classifierStatus: "not_invoked",
      providerHttpSuccess: false
    }), { sessionId: `model-disabled-session-${index}` });
  }
  const modelDisabledAggregate = desktopRuntimeSummary();
  assert.equal(modelDisabledAggregate.localAiAcceptedCount, 0);
  assert.equal(modelDisabledAggregate.ruleFallbackCount, 10);
  assert.equal(modelDisabledAggregate.cloudRequestCount, 0);

  const crossProcessEnvironment = {
    HEMATURIA_DESKTOP_DATABASE_PATH: databasePath,
    HEMATURIA_DESKTOP_RUNTIME_SESSION_ID: "runtime-cross-process"
  };
  runChild(`
    const store = require("./server/desktopSqliteStore.js");
    store.startDesktopRuntimeSession({
      runtimeSessionId: process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID,
      sessionStartedAt: "2026-08-01T13:00:00.000Z"
    });
    ${childRuntime}
    const evidence = require("./server/desktopRuntimeEvidence.js");
    const accepted = ${childPatient};
    for (let index = 0; index < 5; index += 1) {
      evidence.desktopPatientEvidence(accepted, { eventId: \`cross-accepted-\${index}\` });
    }
    evidence.desktopPatientEvidence({
      ...accepted,
      runtimeTrace: { ...accepted.runtimeTrace, classifierStatus: "rejected" }
    }, { eventId: "cross-fallback" });
    evidence.desktopPatientEvidence(accepted, { eventId: "cross-accepted-0" });
  `, crossProcessEnvironment);
  const crossProcessSummary = JSON.parse(runChild(`
    ${childRuntime}
    const evidence = require("./server/desktopRuntimeEvidence.js");
    process.stdout.write(JSON.stringify(evidence.desktopRuntimeSummary()));
  `, crossProcessEnvironment));
  assert.equal(crossProcessSummary.localAiAcceptedCount, 5);
  assert.equal(crossProcessSummary.ruleFallbackCount, 1);
  assert.equal(crossProcessSummary.eventWriteFailureCount, 0);
  assert.equal(crossProcessSummary.runtimeAuditHealthy, true);

  const missingProviderEnvironment = {
    HEMATURIA_DESKTOP_DATABASE_PATH: databasePath,
    HEMATURIA_DESKTOP_RUNTIME_SESSION_ID: "runtime-provider-missing"
  };
  runChild(`
    const store = require("./server/desktopSqliteStore.js");
    store.startDesktopRuntimeSession({
      runtimeSessionId: process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID,
      sessionStartedAt: "2026-08-01T13:05:00.000Z"
    });
    const evidence = require("./server/desktopRuntimeEvidence.js");
    evidence.desktopPatientEvidence(${childPatient}, { eventId: "provider-missing" });
  `, missingProviderEnvironment);
  const missingProviderSummary = JSON.parse(runChild(`
    globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
      sessionStartedAt: "2026-08-01T13:05:00.000Z",
      runtimeTarget: "desktop",
      model: "Qwen3-1.7B",
      modelProfile: "lightweight",
      productHead: "${"b".repeat(40)}",
      llamaServerReady: true,
      localModelReady: true,
      cloudRequestCount: 0
    });
    const evidence = require("./server/desktopRuntimeEvidence.js");
    process.stdout.write(JSON.stringify(evidence.desktopRuntimeSummary()));
  `, missingProviderEnvironment));
  assert.equal(missingProviderSummary.localAiAcceptedCount, 0);
  assert.equal(missingProviderSummary.ruleFallbackCount, 0);
  assert.equal(missingProviderSummary.eventWriteFailureCount, 1);
  assert.equal(missingProviderSummary.runtimeAuditHealthy, false);

  const isolatedEnvironment = {
    HEMATURIA_DESKTOP_DATABASE_PATH: databasePath,
    HEMATURIA_DESKTOP_RUNTIME_SESSION_ID: "runtime-isolated-start"
  };
  const isolatedSummary = JSON.parse(runChild(`
    const store = require("./server/desktopSqliteStore.js");
    store.startDesktopRuntimeSession({
      runtimeSessionId: process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID,
      sessionStartedAt: "2026-08-01T13:10:00.000Z"
    });
    globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
      sessionStartedAt: "2026-08-01T13:10:00.000Z",
      runtimeTarget: "desktop",
      model: "Qwen3-1.7B",
      modelProfile: "lightweight",
      productHead: "${"b".repeat(40)}",
      llamaServerReady: true,
      localModelReady: true,
      cloudRequestCount: 0
    });
    const evidence = require("./server/desktopRuntimeEvidence.js");
    process.stdout.write(JSON.stringify(evidence.desktopRuntimeSummary()));
  `, isolatedEnvironment));
  assert.equal(isolatedSummary.localAiAcceptedCount, 0);
  assert.equal(isolatedSummary.ruleFallbackCount, 0);
  assert.equal(isolatedSummary.eventWriteFailureCount, 0);
  assert.equal(isolatedSummary.runtimeAuditHealthy, true);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ cloudRequestCount: -1 });
  assert.equal(runtimeSnapshot(), null);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ model: "attacker-controlled-model" });
  assert.equal(runtimeSnapshot(), null);

  process.stdout.write("desktop runtime evidence tests passed\n");
} finally {
  resetDesktopPatientEvidenceForTests();
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
  sqliteStore.closeDesktopSqliteStore();
  if (originalDatabasePath === undefined) delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
  else process.env.HEMATURIA_DESKTOP_DATABASE_PATH = originalDatabasePath;
  if (originalRuntimeSessionId === undefined) delete process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID;
  else process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID = originalRuntimeSessionId;
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
