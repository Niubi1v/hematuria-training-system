import assert from "node:assert/strict";

const cases = require("../data/cases.json") as Array<{ id: string; medicalReview?: { status?: string } }>;
const slots = require("../data/patient_slots_bilingual.json") as Record<string, Record<string, {
  patientAnswerZh: string;
  patientAnswerEn: string;
  provenance: string;
  teacherReviewRequired: boolean;
}>>;
const {
  BILINGUAL_CONFLICT_REASON,
  bilingualConflictEntries,
  filterQuarantinedEvents,
  quarantineForMatchedSlots,
  uncertainConflictReply
} = require("../server/bilingualConflictQuarantine.js");
const { generatePatientAnswer, initSession } = require("../server/patientSession.js");

const questions: Record<string, { zh: string; en: string }> = {
  pain: { zh: "这个疼不疼？", en: "Does it hurt?" },
  dysuria: { zh: "小便时疼不疼？", en: "Does it hurt or burn when you urinate?" },
  urinary_frequency: { zh: "最近有尿频吗？", en: "Have you been urinating more often?" },
  urinary_urgency: { zh: "最近有尿急吗？", en: "Do you have urinary urgency?" }
};

async function main() {
  assert.equal(BILINGUAL_CONFLICT_REASON, "medical_bilingual_conflict_pending_review");
  assert.equal(bilingualConflictEntries.length, 18, "the quarantine must contain exactly the adjudication set, not a heuristic bulk list");
  assert.equal(new Set(bilingualConflictEntries.map((item: { reviewItemId: string }) => item.reviewItemId)).size, 18);

  const quarantineLogs: Array<{ reason?: string }> = [];
  const originalWarn = console.warn;
  console.warn = (event?: unknown, payload?: unknown) => {
    if (event === "patient_fact_quarantined" && payload && typeof payload === "object") {
      quarantineLogs.push(payload as { reason?: string });
    }
  };

  try {
  for (const item of bilingualConflictEntries) {
    const source = slots[item.caseId]?.[item.field];
    assert.ok(source, `${item.caseId}.${item.field} must remain traceable to the existing bilingual slot`);
    assert.equal(source.teacherReviewRequired, true, `${item.caseId}.${item.field} must remain pending expert review`);
    assert.match(source.provenance, /^(source|derived_from_case_facts)$/);
    assert.equal(cases.find((caseData) => caseData.id === item.caseId)?.medicalReview?.status, "needs_revision");

    for (const language of ["zh", "en"] as const) {
      const session = await initSession({ caseId: item.caseId, language });
      const result = await generatePatientAnswer({
        sessionId: session.sessionId,
        caseId: item.caseId,
        studentInput: questions[item.field][language],
        language
      });
      assert.equal(result.fallbackReason, BILINGUAL_CONFLICT_REASON, `${item.caseId}.${item.field}.${language} must be quarantined`);
      assert.equal(result.replyText, uncertainConflictReply(language));
      assert.deepEqual(result.matchedSlotIds, [], "quarantined facts must not enter deterministic Patient Agent coverage");
      assert.deepEqual(result.matchedFacts, [], "quarantined facts must not enter deterministic Patient Agent context");
      assert.equal(result.confidence, 0);
    }
  }
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(quarantineLogs.length, 36, "every quarantined bilingual answer must emit a structured reason log");
  assert.ok(quarantineLogs.every((entry) => entry.reason === BILINGUAL_CONFLICT_REASON));

  const originalFetch = globalThis.fetch;
  const originalEnv = {
    enabled: process.env.LLM_ENABLE_AI_PATIENT,
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL
  };
  let providerCalls = 0;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.DEEPSEEK_API_KEY = "test-only-not-a-real-key";
  process.env.DEEPSEEK_BASE_URL = "https://example.invalid";
  process.env.DEEPSEEK_MODEL = "test-model";
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("quarantined facts must never reach the provider");
  };
  try {
    const session = await initSession({ caseId: "P001", language: "en" });
    const result = await generatePatientAnswer({
      sessionId: session.sessionId,
      caseId: "P001",
      studentInput: questions.urinary_urgency.en,
      language: "en"
    });
    assert.equal(result.fallbackReason, BILINGUAL_CONFLICT_REASON);
    assert.equal(providerCalls, 0, "quarantined facts must not enter the AI provider context");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      LLM_ENABLE_AI_PATIENT: originalEnv.enabled,
      DEEPSEEK_API_KEY: originalEnv.apiKey,
      DEEPSEEK_BASE_URL: originalEnv.baseUrl,
      DEEPSEEK_MODEL: originalEnv.model
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const quarantine = quarantineForMatchedSlots("P001", ["pain", "hematuria_onset"]);
  assert.deepEqual(quarantine.conflictingSlotIds, ["pain"]);
  assert.equal(quarantine.reason, BILINGUAL_CONFLICT_REASON);

  const filtered = filterQuarantinedEvents("P001", [
    { eventId: "urgency", slotId: "urinary_urgency", type: "slot_answered" },
    { eventId: "onset", slotId: "hematuria_onset", type: "slot_answered" }
  ]);
  assert.deepEqual(filtered.events.map((event: { eventId: string }) => event.eventId), ["onset"]);
  assert.deepEqual(filtered.quarantinedSlotIds, ["urinary_urgency"]);
  assert.equal(filtered.reason, BILINGUAL_CONFLICT_REASON);

  assert.equal(uncertainConflictReply("zh"), "这项情况我现在说不准。");
  assert.equal(uncertainConflictReply("en"), "I'm not sure about that right now.");
  assert.doesNotMatch(uncertainConflictReply("en"), /[\u3400-\u9fff]/);
  console.log("Bilingual medical conflict quarantine passed: 18 facts isolated without changing medical truth or review state.");
}

void main();
