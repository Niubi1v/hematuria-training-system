import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../../data/cases.json");
const {
  matchCanonicalPatientFacts,
  projectCanonicalPatientFacts
} = require("../../server/canonicalFacts.js");
const { generatePatientAnswer } = require("../../server/patientSession.js");
const {
  BILINGUAL_CONFLICT_REASON,
  quarantineForMatchedSlots
} = require("../../server/bilingualConflictQuarantine.js");
const {
  matchPriorityCanonicalIntents,
  priorityIntentDefinitions
} = require("../../src/lib/patientIntentCatalog.js");

const PRODUCTION_SHA = "70ea9b3c7b31e11a84878de5c277cac60f35481c";
const REPORT_PATH = path.resolve("artifacts/exploratory-qa/reports/70ea9b3-patient-natural-phrasing-audit.json");

process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const probes = [
  {
    id: "dysuria-colloquial",
    zh: "小便痛不痛？",
    en: "Does it hurt when you urinate?",
    expectedIntents: ["dysuria"]
  },
  {
    id: "dysuria-formal",
    zh: "排尿时疼吗？",
    en: "Is urination painful?",
    expectedIntents: ["dysuria"]
  },
  {
    id: "dysuria-natural",
    zh: "尿的时候会不会痛？",
    en: "Does it hurt when you pee?",
    expectedIntents: ["dysuria"]
  },
  {
    id: "dysuria-negated",
    zh: "没有尿痛吧？",
    en: "You do not have pain when urinating, right?",
    expectedIntents: ["dysuria"]
  },
  {
    id: "phase-whole",
    zh: "小便全程都是红的吗？",
    en: "Is the urine red throughout the whole stream?",
    expectedIntents: ["whole_stream_hematuria"]
  },
  {
    id: "phase-start-to-finish",
    zh: "从开始尿到最后都红吗？",
    en: "Is it red from the start to the end of urination?",
    expectedIntents: ["whole_stream_hematuria"]
  },
  {
    id: "phase-choice",
    zh: "是刚开始红、最后红，还是全程红？",
    en: "Is it red at the beginning, at the end, or throughout urination?",
    expectedIntents: ["initial_hematuria", "terminal_hematuria", "whole_stream_hematuria"]
  },
  {
    id: "phase-negated-terminal",
    zh: "不是只有最后才红吧？",
    en: "It is not only red at the end of urination, right?",
    expectedIntents: ["terminal_hematuria", "whole_stream_hematuria"]
  },
  {
    id: "lower-urinary-compound",
    zh: "尿频尿急尿痛有没有？",
    en: "Do you have urinary frequency, urgency, or pain when urinating?",
    expectedIntents: ["urinary_frequency", "urinary_urgency", "dysuria"]
  },
  {
    id: "red-flag-compound",
    zh: "有没有腰痛、发烧和血块？",
    en: "Do you have flank pain, fever, or blood clots?",
    expectedIntents: ["flank_pain", "fever", "blood_clots"]
  }
];

const intentToSlot = new Map(priorityIntentDefinitions.map((item) => [item.key, item.sourceSlotId]));
const uncertainPattern = {
  zh: /不太清楚|不清楚|说不准|没(?:有)?(?:特别)?留意|没仔细|没有数清|没看清/,
  en: /not sure|cannot say for sure|have not (?:paid|kept|been able)|did not (?:look|measure)|cannot tell/i
};

function sameValues(left, right) {
  const keys = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].sort();
  return keys.every((key) => left?.[key] === right?.[key]);
}

function sorted(values) {
  return [...new Set(values)].sort();
}

const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async () => {
  providerCalls += 1;
  throw new Error("QA audit forbids provider calls");
};

const rows = [];
const failures = [];
let expectedIntentChecks = 0;
let canonicalIntentHits = 0;
let canonicalScenarioHits = 0;
let erroneousUnknownCount = 0;
let knownFactCount = 0;
let polarityEligibleCount = 0;
let polarityErrorCount = 0;
let correctUnknownCount = 0;
let expectedUnknownCount = 0;
let medicalConflictScenarioCount = 0;
let medicalConflictIsolationCount = 0;
let extraHistoryLeakCount = 0;
let bilingualPairCount = 0;
let bilingualMeaningPassCount = 0;
const isolatedConflictKeys = new Set();

const originalWarn = console.warn;
console.warn = () => {};
try {
  assert.equal(cases.length, 42, "natural phrasing audit must cover all 42 internal case records");
  for (const caseData of cases) {
    for (const probe of probes) {
      const languageResults = {};
      for (const language of ["zh", "en"]) {
        const question = probe[language];
        const priorityMatches = matchPriorityCanonicalIntents(question, language);
        const routedIntents = sorted(priorityMatches.map((item) => item.intentKey));
        const missingIntents = probe.expectedIntents.filter((intent) => !routedIntents.includes(intent));
        expectedIntentChecks += probe.expectedIntents.length;
        canonicalIntentHits += probe.expectedIntents.length - missingIntents.length;
        const canonicalHit = missingIntents.length === 0;
        if (canonicalHit) canonicalScenarioHits += 1;

        const expected = projectCanonicalPatientFacts(caseData.id, probe.expectedIntents, language, question);
        assert.ok(expected, `${caseData.id}/${probe.id}/${language}: expected projection missing`);
        const matched = matchCanonicalPatientFacts(caseData.id, question, language);
        const expectedSlots = new Set(probe.expectedIntents.map((intent) => intentToSlot.get(intent)));
        const extraSlots = (matched?.matchedSlotIds || []).filter((slotId) => !expectedSlots.has(slotId));
        if (extraSlots.length) extraHistoryLeakCount += 1;

        const conflict = quarantineForMatchedSlots(caseData.id, expected.governanceSlotIds || []);
        const expectsConflict = conflict.conflictingSlotIds.length > 0;
        if (expectsConflict) {
          medicalConflictScenarioCount += 1;
          for (const slotId of conflict.conflictingSlotIds) isolatedConflictKeys.add(`${caseData.id}:${slotId}`);
        }

        const actual = await generatePatientAnswer({
          sessionId: "",
          caseId: caseData.id,
          studentInput: question,
          conversationHistory: [],
          language
        });
        const isConflictIsolated = actual.answerSource === "pending_medical_review"
          && actual.fallbackReason === BILINGUAL_CONFLICT_REASON
          && actual.safetyFlags?.includes(BILINGUAL_CONFLICT_REASON);
        if (expectsConflict && isConflictIsolated) medicalConflictIsolationCount += 1;

        const factEntries = Object.entries(expected.factValues || {});
        const scenarioKnown = factEntries.filter(([, value]) => value !== "unknown");
        const scenarioUnknown = factEntries.filter(([, value]) => value === "unknown");
        const actualFacts = new Set(actual.matchedFacts || []);
        const replyIsUncertain = uncertainPattern[language].test(String(actual.replyText || ""));
        const erroneousUnknownIntents = [];

        if (!expectsConflict) {
          knownFactCount += scenarioKnown.length;
          expectedUnknownCount += scenarioUnknown.length;
          for (const [intent] of scenarioUnknown) {
            const correctlyUnknown = !actualFacts.has(intent);
            if (correctlyUnknown) correctUnknownCount += 1;
          }
          for (const [intent] of scenarioKnown) {
            const erroneousUnknown = ["unknown", "safety"].includes(actual.answerSource)
              || (replyIsUncertain && !actualFacts.has(intent) && scenarioKnown.length === 1);
            if (erroneousUnknown) {
              erroneousUnknownCount += 1;
              erroneousUnknownIntents.push(intent);
            }
          }
        }

        let polarityPass = null;
        if (canonicalHit && !expectsConflict && !extraSlots.length && scenarioKnown.length > 0) {
          polarityEligibleCount += 1;
          polarityPass = String(actual.replyText || "").trim() === String(expected.replyText || "").trim();
          if (!polarityPass) polarityErrorCount += 1;
        }

        if (!canonicalHit || extraSlots.length || erroneousUnknownIntents.length || (expectsConflict && !isConflictIsolated) || polarityPass === false) {
          failures.push({
            caseId: caseData.displayCaseId || caseData.id,
            probeId: probe.id,
            language,
            missingIntents,
            extraSlots,
            erroneousUnknownIntents,
            conflictIsolationFailed: expectsConflict && !isConflictIsolated,
            polarityMismatch: polarityPass === false
          });
        }

        languageResults[language] = {
          routedIntents,
          canonicalHit,
          factValues: expected.factValues,
          answerSource: actual.answerSource,
          fallbackReason: actual.fallbackReason,
          polarityPass,
          expectsConflict,
          isConflictIsolated
        };
      }

      bilingualPairCount += 1;
      const bilingualMeaningPass = sameValues(languageResults.zh.factValues, languageResults.en.factValues)
        && languageResults.zh.canonicalHit
        && languageResults.en.canonicalHit
        && languageResults.zh.polarityPass !== false
        && languageResults.en.polarityPass !== false
        && languageResults.zh.isConflictIsolated === languageResults.en.isConflictIsolated;
      if (bilingualMeaningPass) bilingualMeaningPassCount += 1;
      rows.push({
        caseId: caseData.displayCaseId || caseData.id,
        probeId: probe.id,
        zhCanonicalHit: languageResults.zh.canonicalHit,
        enCanonicalHit: languageResults.en.canonicalHit,
        bilingualMeaningPass,
        medicalConflictIsolated: languageResults.zh.isConflictIsolated && languageResults.en.isConflictIsolated
      });
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

const scenarioCount = cases.length * probes.length * 2;
const failureGroups = Array.from(failures.reduce((groups, failure) => {
  const key = JSON.stringify({
    probeId: failure.probeId,
    language: failure.language,
    missingIntents: failure.missingIntents,
    extraSlots: failure.extraSlots,
    erroneousUnknownIntents: failure.erroneousUnknownIntents,
    conflictIsolationFailed: failure.conflictIsolationFailed,
    polarityMismatch: failure.polarityMismatch
  });
  const current = groups.get(key) || { ...JSON.parse(key), count: 0, caseIds: [] };
  current.count += 1;
  current.caseIds.push(failure.caseId);
  groups.set(key, current);
  return groups;
}, new Map()).values());
const bilingualProbeSummary = probes.map(({ id }) => {
  const probeRows = rows.filter((row) => row.probeId === id);
  return {
    probeId: id,
    pairs: probeRows.length,
    meaningPass: probeRows.filter((row) => row.bilingualMeaningPass).length,
    conflictIsolated: probeRows.filter((row) => row.medicalConflictIsolated).length
  };
});
const summary = {
  schemaVersion: 1,
  productionSha: PRODUCTION_SHA,
  source: "production_patient_session_local_deterministic_contract",
  cases: cases.length,
  probesPerLanguage: probes.length,
  scenarioCount,
  expectedIntentChecks,
  canonicalIntentHits,
  canonicalIntentHitRate: Number((canonicalIntentHits / expectedIntentChecks).toFixed(4)),
  canonicalScenarioHits,
  canonicalScenarioHitRate: Number((canonicalScenarioHits / scenarioCount).toFixed(4)),
  knownFactCount,
  erroneousUnknownCount,
  erroneousUnknownRate: knownFactCount ? Number((erroneousUnknownCount / knownFactCount).toFixed(4)) : 0,
  polarityEligibleCount,
  polarityErrorCount,
  polarityErrorRate: polarityEligibleCount ? Number((polarityErrorCount / polarityEligibleCount).toFixed(4)) : 0,
  expectedUnknownCount,
  correctUnknownCount,
  medicalConflictScenarioCount,
  medicalConflictIsolationCount,
  uniqueMedicalConflictItemsIsolated: isolatedConflictKeys.size,
  bilingualPairCount,
  bilingualMeaningPassCount,
  extraHistoryLeakCount,
  providerCalls,
  fullQuestionsRetained: false,
  fullAnswersRetained: false,
  medicalValuesRetained: false,
  failureCount: failures.length,
  failureGroupCount: failureGroups.length,
  failureGroups,
  bilingualProbeSummary
};

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(`Patient natural phrasing audit: scenarios=${scenarioCount} canonical=${canonicalScenarioHits}/${scenarioCount} erroneousUnknown=${erroneousUnknownCount}/${knownFactCount} polarity=${polarityErrorCount}/${polarityEligibleCount} correctUnknown=${correctUnknownCount}/${expectedUnknownCount} conflictIsolation=${medicalConflictIsolationCount}/${medicalConflictScenarioCount} bilingual=${bilingualMeaningPassCount}/${bilingualPairCount} leakage=${extraHistoryLeakCount} providerCalls=${providerCalls} failures=${failures.length}.`);
assert.equal(providerCalls, 0, "natural phrasing audit must not invoke a provider");
assert.equal(extraHistoryLeakCount, 0, "a natural phrasing probe exposed an unasked history slot");
assert.equal(erroneousUnknownCount, 0, "a known canonical fact was answered as unknown");
assert.equal(polarityErrorCount, 0, "a known fact changed polarity or phase");
assert.equal(medicalConflictIsolationCount, medicalConflictScenarioCount, "a bilingual medical conflict escaped quarantine");
assert.equal(canonicalScenarioHits, scenarioCount, "one or more requested natural phrasings missed canonical routing");
assert.equal(bilingualMeaningPassCount, bilingualPairCount, "Chinese and English probes did not preserve the same governed meaning");
