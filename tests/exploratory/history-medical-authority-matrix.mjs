import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../../data/cases.json");
const slots = require("../../data/patient_slots_bilingual.json");
const reconciliation = require("../../data/history_medical_reconciliation.json");
const release = require("../../data/hematuria_release_v14_normalized.json");
const chiefComplaintRuntime = require("../../data/chief_complaint_wording_runtime.json");
const { bilingualConflictEntries } = require("../../server/bilingualConflictQuarantine.js");
const { generatePatientAnswer, initSession } = require("../../server/patientSession.js");

process.env.TRAINING_STATE_SECRET ||= "qa-only-history-medical-authority-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_AGENTS = "false";

const productionBaseline = "77815862a0abebff67b8d958f66944a0e11b068f";
const outputArgIndex = process.argv.indexOf("--output");
const outputPath = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : "";
const languages = ["zh", "en"];
const cjk = /[\u3400-\u9fff]/u;
const naturalUnknown = {
  zh: /没(?:有)?(?:特别)?(?:留意|注意)|没仔细|记不(?:太)?清|说不准|记不准确/,
  en: /did not (?:pay|look|notice)|have not (?:paid|noticed)|cannot recall|not sure|could not tell|not clearly/i
};

const questionByField = {
  surgeryHistory: {
    zh: "以前做过手术吗？",
    en: "Have you had surgery?"
  },
  hematuria_visibility: {
    zh: "这是肉眼血尿还是镜下血尿？",
    en: "Was this visible blood or microscopic hematuria?"
  },
  renal_colic: {
    zh: "这是肾绞痛吗？",
    en: "Did you have renal colic?"
  },
  clots: {
    zh: "尿里有血块吗？",
    en: "Were there blood clots in the urine?"
  },
  flank_pain: {
    zh: "有没有腰痛或腰酸？",
    en: "Did you have flank pain or soreness?"
  },
  fever_chills: {
    zh: "有没有发热或寒战？",
    en: "Did you have fever or chills?"
  },
  pain: {
    zh: "这次有疼痛吗？",
    en: "Did you have pain with this?"
  },
  dysuria: {
    zh: "排尿时疼吗？",
    en: "Does it hurt when you urinate?"
  },
  urinary_urgency: {
    zh: "有尿急吗？",
    en: "Do you have urinary urgency?"
  },
  urinary_frequency: {
    zh: "有尿频吗？",
    en: "Do you urinate more often?"
  }
};

async function ask(caseId, language, studentInput) {
  const session = await initSession({ caseId, language, mode: "qa-history-medical-authority" });
  return generatePatientAnswer({
    sessionId: session.sessionId,
    caseId,
    studentInput,
    conversationHistory: [],
    language
  });
}

function assertNonCollectable(result, expectedReason, context) {
  assert.ok(result, `${context}: missing result`);
  assert.equal(result.fallbackReason, expectedReason, `${context}: wrong governance reason`);
  assert.deepEqual(result.matchedSlotIds || [], [], `${context}: blocked slot entered collection`);
  assert.deepEqual(result.matchedFacts || [], [], `${context}: blocked fact entered scoring`);
  assert.match(result.replyText, naturalUnknown[result.language || "zh"] || /./, `${context}: answer was not naturally uncertain`);
}

async function main() {
  assert.equal(cases.length, 42);
  assert.ok(cases.every((item) => item.medicalReview?.status === "needs_revision"));

  const slotCounts = Object.fromEntries(cases.map((item) => [item.id, Object.keys(slots[item.id] || {}).length]));
  assert.ok(Object.values(slotCounts).every((count) => count === 37), "42-case canonical slot matrix is incomplete");
  let bilingualSlotChecks = 0;
  let englishCjkFailures = 0;
  for (const item of cases) {
    for (const slot of Object.values(slots[item.id])) {
      assert.ok(String(slot.patientAnswerZh || "").trim(), `${item.id}: missing Chinese slot answer`);
      assert.ok(String(slot.patientAnswerEn || "").trim(), `${item.id}: missing English slot answer`);
      bilingualSlotChecks += 1;
      if (cjk.test(String(slot.patientAnswerEn || ""))) englishCjkFailures += 1;
    }
  }
  assert.equal(bilingualSlotChecks, 42 * 37);
  assert.equal(englishCjkFailures, 0);

  assert.equal(release.factCount, 572);
  assert.equal(release.facts.length, 572);
  const sourceFacts = release.facts.filter((item) => item["来源"] === "source");
  const simulationFacts = release.facts.filter((item) => item["来源"] === "author_added_for_simulation");
  const sourceMarkerConflicts = sourceFacts.filter((item) => item["是否程序或AI补充"] === "是");
  const reconciledSourceMarkers = sourceFacts.filter((item) => item["是否程序或AI补充"] === "否");
  assert.equal(sourceFacts.length, 153);
  assert.equal(simulationFacts.length, 419);
  assert.equal(sourceMarkerConflicts.length, 151);
  assert.equal(reconciledSourceMarkers.length, 2);
  assert.equal(release.formalUseAllowed, false);

  const historyBlocks = reconciliation.blockedMedicalHistory;
  assert.equal(historyBlocks.length, 14);
  assert.ok(historyBlocks.every((item) =>
    item.disposition === "BLOCKED_MEDICAL"
    && item.teacherReviewRequired === true
    && item.reviewStatus === "needs_review"
  ));
  assert.equal(bilingualConflictEntries.length, 18);
  assert.equal(new Set(bilingualConflictEntries.map((item) => item.reviewItemId)).size, 18);
  assert.equal(historyBlocks.length + bilingualConflictEntries.length, 32);

  let historyBlockRouteChecks = 0;
  let bilingualConflictRouteChecks = 0;
  let quarantineWarnings = 0;
  const originalWarn = console.warn;
  console.warn = () => { quarantineWarnings += 1; };
  try {
    for (const blocked of historyBlocks) {
      const field = blocked.canonicalSlotId || blocked.field;
      const questions = questionByField[field];
      assert.ok(questions, `${blocked.caseId}.${field}: missing question fixture`);
      for (const language of languages) {
        const result = await ask(blocked.caseId, language, questions[language]);
        result.language = language;
        assertNonCollectable(result, "medical_history_pending_review", `${blocked.caseId}.${field}.${language}`);
        historyBlockRouteChecks += 1;
      }
    }

    for (const blocked of bilingualConflictEntries) {
      const questions = questionByField[blocked.field];
      assert.ok(questions, `${blocked.reviewItemId}: missing question fixture`);
      for (const language of languages) {
        const result = await ask(blocked.caseId, language, questions[language]);
        result.language = language;
        assertNonCollectable(
          result,
          "medical_bilingual_conflict_pending_review",
          `${blocked.reviewItemId}.${language}`
        );
        assert.equal(result.answerSource, "pending_medical_review");
        bilingualConflictRouteChecks += 1;
      }
    }
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(historyBlockRouteChecks, 28);
  assert.equal(bilingualConflictRouteChecks, 36);

  const unknownProbes = [
    {
      caseId: "P004",
      field: "clots",
      question: { zh: "尿里有血块吗？", en: "Were there blood clots in the urine?" }
    },
    {
      caseId: "P005",
      field: "hematuria_phase",
      question: { zh: "是刚开始红、最后红还是全程红？", en: "Was it red at the start, at the end, or throughout urination?" }
    },
    {
      caseId: "P006",
      field: "hematuria_phase",
      question: { zh: "是刚开始红、最后红还是全程红？", en: "Was it red at the start, at the end, or throughout urination?" }
    }
  ];
  let patientNotObservedChecks = 0;
  for (const probe of unknownProbes) {
    for (const language of languages) {
      const result = await ask(probe.caseId, language, probe.question[language]);
      result.language = language;
      assertNonCollectable(result, "canonical_fact_unknown", `${probe.caseId}.${probe.field}.${language}`);
      patientNotObservedChecks += 1;
    }
  }
  assert.equal(patientNotObservedChecks, 6);

  const lifestyleFacts = [];
  for (const item of cases) {
    if (item.structuredHistory?.smokingHistory?.teacherReviewRequired) {
      lifestyleFacts.push({
        caseId: item.id,
        field: "smokingHistory",
        question: { zh: "吸烟吗？", en: "Do you smoke?" }
      });
    }
    if (item.structuredHistory?.alcoholHistory?.teacherReviewRequired) {
      lifestyleFacts.push({
        caseId: item.id,
        field: "alcoholHistory",
        question: { zh: "喝酒吗？", en: "Do you drink alcohol?" }
      });
    }
  }
  assert.equal(lifestyleFacts.filter((item) => item.field === "smokingHistory").length, 6);
  assert.equal(lifestyleFacts.filter((item) => item.field === "alcoholHistory").length, 36);
  let lifestyleRouteChecks = 0;
  for (const fact of lifestyleFacts) {
    for (const language of languages) {
      const result = await ask(fact.caseId, language, fact.question[language]);
      result.language = language;
      assertNonCollectable(result, "medical_history_pending_review", `${fact.caseId}.${fact.field}.${language}`);
      lifestyleRouteChecks += 1;
    }
  }
  assert.equal(lifestyleRouteChecks, 84);

  const specialMedicationChecks = [
    {
      displayCaseId: "P026",
      runtimeCaseId: "HX-ADD-014",
      question: { zh: "平时吃什么药？", en: "What medications do you take?" },
      answer: { zh: /降糖药/, en: /diabetes medication/i }
    },
    {
      displayCaseId: "P027",
      runtimeCaseId: "HX-ADD-015",
      question: { zh: "平时吃什么药？", en: "What medications do you take?" },
      answer: { zh: /别嘌醇/, en: /allopurinol/i }
    },
    {
      displayCaseId: "P029",
      runtimeCaseId: "HX-ADD-017",
      question: { zh: "吃抗凝药或抗血小板药吗？", en: "Do you take anticoagulants or antiplatelet medication?" },
      answer: { zh: /没有服用.*抗凝药[\s\S]*阿司匹林/, en: /do not take anticoagulants[\s\S]*antiplatelet medication/i }
    },
    {
      displayCaseId: "P039",
      runtimeCaseId: "HX-ADD-027",
      question: { zh: "平时吃什么止痛药？", en: "What medications do you take?" },
      answer: { zh: /布洛芬|复方止痛药/, en: /ibuprofen|combination painkillers/i }
    }
  ];
  let medicationRouteChecks = 0;
  for (const probe of specialMedicationChecks) {
    const item = cases.find((candidate) => candidate.id === probe.runtimeCaseId);
    assert.equal(item?.displayCaseId, probe.displayCaseId);
    for (const language of languages) {
      const result = await ask(probe.runtimeCaseId, language, probe.question[language]);
      assert.match(result.replyText, probe.answer[language], `${probe.displayCaseId}.${language}: authority drift`);
      assert.ok((result.matchedFacts || []).length > 0, `${probe.displayCaseId}.${language}: no governed fact`);
      medicationRouteChecks += 1;
    }
  }
  assert.equal(medicationRouteChecks, 8);

  const p037Runtime = chiefComplaintRuntime.updates["HX-ADD-025"];
  assert.ok(p037Runtime);
  assert.match(p037Runtime.en, /\b1 day ago\b/i);
  assert.match(p037Runtime.openingEn, /\bone day ago\b/i);
  let p037DurationRouteChecks = 0;
  for (const language of languages) {
    const question = language === "zh"
      ? "请用自己的话说说这次最主要的不舒服是什么？"
      : "Please describe the main problem that brought you here in your own words.";
    const result = await ask("HX-ADD-025", language, question);
    assert.match(result.replyText, language === "zh" ? /一天|1天/ : /\b(?:1|one) day\s+ago\b/i);
    p037DurationRouteChecks += 1;
  }
  assert.equal(p037DurationRouteChecks, 2);

  const summary = {
    schemaVersion: "exploratory-history-medical-authority-v1",
    productionBaseline,
    status: "PASS_LOCAL_QA",
    medicalApprovalStatus: "BLOCKED_MEDICAL",
    cases: cases.length,
    casesStillNeedsRevision: cases.filter((item) => item.medicalReview?.status === "needs_revision").length,
    bilingualSlots: {
      cases: 42,
      slotsPerCase: 37,
      checks: bilingualSlotChecks,
      englishCjkFailures
    },
    reviewGovernance: {
      facts: release.facts.length,
      sourceFacts: sourceFacts.length,
      pendingExpertFacts: simulationFacts.length,
      sourceMarkerConflicts: sourceMarkerConflicts.length,
      reconciledSourceMarkers: reconciledSourceMarkers.length,
      formalUseAllowed: release.formalUseAllowed
    },
    blockedFields: {
      newMedicalHistory: historyBlocks.length,
      bilingualConflicts: bilingualConflictEntries.length,
      totalRows: historyBlocks.length + bilingualConflictEntries.length,
      historyRouteChecks: historyBlockRouteChecks,
      bilingualRouteChecks: bilingualConflictRouteChecks,
      quarantineWarnings
    },
    governedUnknowns: {
      p004P005P006RouteChecks: patientNotObservedChecks,
      unreviewedSmokingFacts: lifestyleFacts.filter((item) => item.field === "smokingHistory").length,
      unreviewedAlcoholFacts: lifestyleFacts.filter((item) => item.field === "alcoholHistory").length,
      lifestyleRouteChecks
    },
    authorityCorrections: {
      medicationRouteChecks,
      p037DurationRouteChecks,
      failures: 0
    },
    sensitiveContentRetained: false
  };

  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "history_medical_authority_matrix_failed");
  process.exitCode = 1;
});
