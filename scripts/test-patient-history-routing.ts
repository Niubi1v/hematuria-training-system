import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const { generatePatientAnswer } = require("../server/patientSession.js") as {
  generatePatientAnswer(input: {
    sessionId: string;
    caseId: string;
    studentInput: string;
    language: "zh" | "en";
    conversationHistory: unknown[];
  }): Promise<{
    matchedSlotIds?: string[];
    fallbackReason?: string;
    safetyFlags?: string[];
  }>;
};
const cases = require("../data/cases.json") as Array<{ id: string }>;
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "zh" | "en"): { matchedSlotIds?: string[] } | null;
};
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): {
    matchedSlotIds?: string[];
    collectableSlotIds?: string[];
    factValues?: Record<string, boolean | "unknown">;
  } | null;
};

type Probe = {
  id: string;
  language: "zh" | "en";
  question: string;
  expectedSlots: string[];
};

const historyProbes: Probe[] = [
  { id: "prior-care-zh", language: "zh", question: "以前看过医生吗？", expectedSlots: ["prior_care"] },
  { id: "prior-care-en", language: "en", question: "Have you seen a doctor before?", expectedSlots: ["prior_care"] },
  { id: "tumor-history-zh", language: "zh", question: "以前有肿瘤史吗？", expectedSlots: ["PAST_MALIGNANCY"] },
  { id: "tumor-history-en", language: "en", question: "Have you had a previous cancer?", expectedSlots: ["PAST_MALIGNANCY"] },
  { id: "cystoscopy-history-zh", language: "zh", question: "以前做过膀胱镜吗？", expectedSlots: ["PAST_URINARY_PROCEDURE"] },
  { id: "catheter-history-zh", language: "zh", question: "以前导过尿吗？", expectedSlots: ["PAST_URINARY_PROCEDURE"] },
  { id: "retention-en", language: "en", question: "Have you been unable to pass urine?", expectedSlots: ["retention"] }
];

async function main() {
  const caseData = cases.find((item) => item.id === "P001");
  assert.ok(caseData, "P001 fixture is required");
  assert.equal(cases.length, 42, "history routing contract must cover all 42 cases");
  for (const currentCase of cases) {
    for (const probe of historyProbes) {
      const routed: { matchedSlotIds?: string[] } | null = matchCanonicalPatientFacts(currentCase.id, probe.question, probe.language)
        || matchStructuredFacts(currentCase, probe.question, probe.language);
      assert.deepEqual(routed?.matchedSlotIds || [], probe.expectedSlots, `${currentCase.id}/${probe.id} matcher`);
    }
  }
  for (const probe of historyProbes) {
    const canonical = matchCanonicalPatientFacts("P001", probe.question, probe.language);
    const routed: { matchedSlotIds?: string[] } | null = canonical
      || matchStructuredFacts(caseData, probe.question, probe.language);
    assert.deepEqual(routed?.matchedSlotIds || [], probe.expectedSlots, `${probe.id} matcher`);
    const result = await generatePatientAnswer({
      sessionId: `routing-${probe.id}`,
      caseId: "P001",
      studentInput: probe.question,
      language: probe.language,
      conversationHistory: []
    });
    assert.notEqual(result.fallbackReason, "diagnosis_boundary", `${probe.id} must remain a history question`);
    assert.notEqual(result.fallbackReason, "report_boundary", `${probe.id} must remain a history question`);
    if (result.fallbackReason === "unsafe_deterministic_answer") {
      assert.deepEqual(result.matchedSlotIds || [], [], `${probe.id} unsafe source must remain uncollected`);
      assert.ok(result.safetyFlags?.includes("deterministic_answer_blocked"), `${probe.id} safety boundary`);
    } else if (result.fallbackReason === "canonical_fact_unknown") {
      assert.ok(canonical, `${probe.id} unknown must remain under canonical governance`);
      assert.ok(Object.values(canonical.factValues || {}).every((value) => value === "unknown"));
      assert.deepEqual(canonical.collectableSlotIds || [], []);
      assert.deepEqual(result.matchedSlotIds || [], [], `${probe.id} unknown must remain uncollected`);
    } else {
      assert.deepEqual(result.matchedSlotIds || [], probe.expectedSlots, probe.id);
    }
  }

  const diagnosis = await generatePatientAnswer({
    sessionId: "routing-diagnosis",
    caseId: "P001",
    studentInput: "这是不是肿瘤？",
    language: "zh",
    conversationHistory: []
  });
  assert.equal(diagnosis.fallbackReason, "diagnosis_boundary");
  assert.deepEqual(diagnosis.matchedSlotIds || [], []);

  const report = await generatePatientAnswer({
    sessionId: "routing-report",
    caseId: "P001",
    studentInput: "膀胱镜检查结果是什么？",
    language: "zh",
    conversationHistory: []
  });
  assert.equal(report.fallbackReason, "report_boundary");
  assert.deepEqual(report.matchedSlotIds || [], []);

  const historicalReport = await generatePatientAnswer({
    sessionId: "routing-historical-report",
    caseId: "P001",
    studentInput: "以前做过膀胱镜，检查结果是什么？",
    language: "zh",
    conversationHistory: []
  });
  assert.equal(historicalReport.fallbackReason, "report_boundary");
  assert.deepEqual(historicalReport.matchedSlotIds || [], []);

  const historicalDiagnosis = await generatePatientAnswer({
    sessionId: "routing-historical-diagnosis",
    caseId: "P001",
    studentInput: "以前的肿瘤诊断是什么？",
    language: "zh",
    conversationHistory: []
  });
  assert.equal(historicalDiagnosis.fallbackReason, "diagnosis_boundary");
  assert.deepEqual(historicalDiagnosis.matchedSlotIds || [], []);

  console.log("Patient history routing preserved 42 cases x 7 natural questions plus 4 public safety boundaries.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
