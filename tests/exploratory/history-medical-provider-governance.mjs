import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.TRAINING_STATE_SECRET = "qa-only-provider-governance-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_AGENTS = "true";
process.env.LLM_API_KEY = "qa-synthetic-provider-credential";
process.env.LLM_API_BASE_URL = "https://synthetic-provider.invalid";
process.env.LLM_MODEL = "qa-synthetic-patient-model";
process.env.LLM_STREAMING_ENABLED = "false";
process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "memory";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const outputArgIndex = process.argv.indexOf("--output");
const outputPath = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : "";
const productionBaseline = process.env.QA_PRODUCTION_SHA || "unknown";
const originalFetch = globalThis.fetch;
let providerCalls = 0;

globalThis.fetch = async (_input, init) => {
  providerCalls += 1;
  const requestBody = JSON.parse(String(init?.body || "{}"));
  const promptPayload = JSON.parse(String(requestBody.messages?.[1]?.content || "{}"));
  return new Response(JSON.stringify({
    choices: [{ message: { content: String(promptPayload.currentAllowedAnswer || "") } }]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

const { generatePatientAnswer, initSession } = await import("../../server/patientSession.js");

const probes = [
  {
    id: "p002-surgery",
    caseId: "P002",
    question: { zh: "以前做过手术吗？", en: "Have you had surgery?" }
  },
  {
    id: "p004-smoking",
    caseId: "P004",
    question: { zh: "吸烟吗？", en: "Do you smoke?" }
  },
  {
    id: "p013-alcohol",
    caseId: "HX-ADD-001",
    question: { zh: "喝酒吗？", en: "Do you drink alcohol?" }
  }
];

try {
  const samples = [];
  for (const probe of probes) {
    for (const language of ["zh", "en"]) {
      const session = await initSession({
        caseId: probe.caseId,
        language,
        mode: "qa-provider-governance"
      });
      const result = await generatePatientAnswer({
        sessionId: session.sessionId,
        caseId: probe.caseId,
        studentInput: probe.question[language],
        conversationHistory: [],
        language
      });
      samples.push({
        id: probe.id,
        language,
        isFallback: result.isFallback === true,
        provider: String(result.provider || "").toLowerCase(),
        fallbackReason: String(result.fallbackReason || ""),
        matchedSlotCount: Array.isArray(result.matchedSlotIds) ? result.matchedSlotIds.length : 0,
        matchedFactCount: Array.isArray(result.matchedFacts) ? result.matchedFacts.length : 0,
        answerSource: String(result.answerSource || ""),
        responseTextRetained: false
      });
    }
  }

  const failures = samples.filter((sample) =>
    !sample.isFallback
    || sample.fallbackReason !== "medical_history_pending_review"
    || sample.matchedSlotCount !== 0
    || sample.matchedFactCount !== 0
  );
  const summary = {
    schemaVersion: "exploratory-history-medical-provider-governance-v1",
    productionBaseline,
    defectId: "HEM-P1-057",
    status: failures.length ? "FAIL_LOCAL_QA" : "PASS_LOCAL_QA",
    samples: samples.length,
    failures: failures.length,
    providerCalls,
    expectedProviderCalls: 0,
    scoringMetadataLeakCount: samples.filter((sample) =>
      sample.matchedSlotCount > 0 || sample.matchedFactCount > 0
    ).length,
    lostGovernanceReasonCount: samples.filter((sample) =>
      sample.fallbackReason !== "medical_history_pending_review"
    ).length,
    liveProviderAcceptanceCount: samples.filter((sample) =>
      !sample.isFallback && sample.provider === "deepseek"
    ).length,
    responseTextRetained: false,
    samples
  };

  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, "utf8");
  }
  process.stdout.write(serialized);
  assert.equal(failures.length, 0, `HEM-P1-057 reproduced ${failures.length}/${samples.length}`);
} finally {
  globalThis.fetch = originalFetch;
}
