import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const cases = require("../../data/cases.json");
const {
  BILINGUAL_CONFLICT_REASON,
  bilingualConflictEntries
} = require("../../server/bilingualConflictQuarantine.js");
const {
  generatePatientAnswer,
  initSession
} = require("../../server/patientSession.js");
const { matchCanonicalPatientFacts } = require("../../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../../server/structuredFacts.js");

const DEFAULT_REPORT = "artifacts/exploratory-qa/reports/patient-compound-history-matrix.json";
const CJK = /[\u3400-\u9fff]/u;
const TEACHER_META = /根据原始病史|根据病例资料|病例资料显示|未主动诉|需追问|教师提示|标准答案|评分点|standard answer|teacher hint|scoring point|case data shows/i;

const probes = [
  {
    id: "hematuria-and-stones",
    zh: "血尿是什么时候开始的，反复吗，以前得过结石吗？",
    en: "When did the blood in your urine start, does it keep coming back, and have you had stones before?",
    canonical: ["hematuria_onset", "hematuria_frequency"],
    structured: ["PAST_STONE"]
  },
  {
    id: "urinary-symptoms-and-medication",
    zh: "尿频尿急尿痛有没有，平时吃抗凝药、抗血小板药或其他长期用药吗？",
    en: "Do you have urinary frequency, urgency, or pain when urinating, and do you take anticoagulants, antiplatelet drugs, or any other regular medication?",
    canonical: ["urinary_frequency", "urinary_urgency", "dysuria"],
    structured: ["MED_ANTICOAGULANT", "MED_ANTIPLATELET", "MED_ALL"]
  },
  {
    id: "glomerular-and-medical-history",
    zh: "有没有泡沫尿或水肿，过去有高血压、糖尿病或肾病吗？",
    en: "Do you have foamy urine or swelling, and have you had hypertension, diabetes, or kidney disease?",
    canonical: ["glomerular_features"],
    structured: ["PAST_HYPERTENSION", "PAST_DIABETES"]
  },
  {
    id: "fever-and-uti-tumor-history",
    zh: "有没有发热寒战，以前得过尿路感染或肿瘤吗？",
    en: "Do you have fever or chills, and have you had a urinary infection or previous cancer?",
    canonical: ["fever_chills"],
    structured: ["PAST_UTI", "PAST_MALIGNANCY"]
  },
  {
    id: "color-exposure-and-family",
    zh: "尿是什么颜色，抽烟吗，工作接触过染料或化工品吗，家里有人有类似情况吗？",
    en: "What color is your urine, do you smoke, have you worked around dyes or chemicals, and is there a family history of anything similar?",
    canonical: ["urine_color"],
    structured: ["LIFE_SMOKING", "LIFE_EXPOSURE", "FAMILY_HISTORY"]
  },
  {
    id: "pain-and-procedure-history",
    zh: "疼不疼，以前做过手术、输过血、受过外伤、导过尿或其他泌尿操作吗？",
    en: "Do you have any pain, and have you had surgery, a blood transfusion, trauma, catheterization, or another urinary procedure?",
    canonical: ["pain"],
    structured: ["PAST_SURGERY", "PAST_TRANSFUSION", "PAST_TRAUMA", "PAST_URINARY_PROCEDURE"]
  },
  {
    id: "retention-and-allergy",
    zh: "有没有尿不出来，平时有什么药物过敏吗？",
    en: "Have you been unable to pass urine, and do you have any medication allergies?",
    canonical: ["retention"],
    structured: ["PAST_ALLERGY"]
  },
  {
    id: "hematuria-canonical-control",
    zh: "是肉眼看到还是化验发现，尿是什么颜色，是刚开始、最后还是全程红，有血块或疼痛吗？",
    en: "Is the blood visible or microscopic, what color is the urine, is it red at the beginning, the end, or throughout, and are there clots or pain?",
    canonical: ["hematuria_visibility", "urine_color", "hematuria_phase", "clots", "pain"],
    structured: []
  },
  {
    id: "urinary-emergency-canonical-control",
    zh: "有没有尿频、尿急、尿痛、排尿困难、尿不出来、发热或寒战？",
    en: "Do you have urinary frequency, urgency, painful urination, difficulty urinating, inability to pass urine, fever, or chills?",
    canonical: ["urinary_frequency", "urinary_urgency", "dysuria", "voiding_difficulty", "retention", "fever_chills"],
    structured: []
  },
  {
    id: "dysuria-and-gynecology",
    zh: "有尿痛吗，现在是月经期、可能怀孕或有其他妇科出血吗？",
    en: "Do you have painful urination, and are you currently menstruating, possibly pregnant, or having other vaginal bleeding?",
    canonical: ["dysuria"],
    structured: ["GYNE_MENSTRUAL", "GYNE_PREGNANCY"],
    femaleOnly: true
  }
];

function cliValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function groupedFailures(failures) {
  const groups = new Map();
  for (const failure of failures) {
    const { caseId, ...signature } = failure;
    const key = JSON.stringify(signature);
    const group = groups.get(key) || { ...signature, caseIds: [] };
    group.caseIds.push(caseId);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, caseIds: sortedUnique(group.caseIds), count: group.caseIds.length }))
    .sort((left, right) => `${left.kind}:${left.probeId}:${left.language}`.localeCompare(`${right.kind}:${right.probeId}:${right.language}`));
}

function signature(result) {
  return JSON.stringify({
    matchedSlotIds: sortedUnique(result.matchedSlotIds || []),
    matchedFacts: sortedUnique(result.matchedFacts || []),
    safetyFlags: sortedUnique(result.safetyFlags || []),
    answerSource: result.answerSource || "",
    fallbackReason: result.fallbackReason || "",
    provider: result.provider || "",
    isFallback: Boolean(result.isFallback),
    replyText: String(result.replyText || "")
  });
}

async function main() {
  assert.equal(cases.length, 42, "compound history matrix must cover all 42 cases");
  const reportPath = path.resolve(cliValue("report", DEFAULT_REPORT));
  const conflictKeys = new Set(bilingualConflictEntries.map((item) => `${item.caseId}:${item.field}`));
  const failures = [];
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let sessionChecks = 0;
  let scenarioChecks = 0;
  let repeatChecks = 0;
  let crossLayerChecks = 0;
  let canonicalControlChecks = 0;
  let conflictBearingChecks = 0;
  let conflictIsolatedChecks = 0;
  let quarantineWarnings = 0;
  let deterministicBlockWarnings = 0;

  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("compound history QA forbids provider calls");
  };
  const originalWarn = console.warn;
  console.warn = (event, payload) => {
    if (event === "patient_fact_quarantined") {
      quarantineWarnings += 1;
      return;
    }
    if (event === "patient_deterministic_answer_blocked") {
      deterministicBlockWarnings += 1;
      return;
    }
    originalWarn(event, payload);
  };

  try {
    for (const [caseIndex, caseData] of cases.entries()) {
      const caseId = `P${String(caseIndex + 1).padStart(3, "0")}`;
      const female = String(caseData.sex || "").includes("女");
      for (const language of ["zh", "en"]) {
        const session = await initSession({ caseId: caseData.id, mode: "qa-compound-history", language });
        sessionChecks += 1;
        for (const probe of probes) {
          if (probe.femaleOnly && !female) continue;
          scenarioChecks += 1;
          if (probe.structured.length) crossLayerChecks += 1;
          else canonicalControlChecks += 1;

          const question = probe[language];
          const canonical = matchCanonicalPatientFacts(caseData.id, question, language);
          const structured = matchStructuredFacts(caseData, question, language);
          const canonicalMatched = canonical?.matchedSlotIds || [];
          const structuredMatched = structured?.matchedSlotIds || [];
          const missingCanonicalRoute = probe.canonical.filter((slotId) => !canonicalMatched.includes(slotId));
          const missingStructuredRoute = probe.structured.filter((slotId) => !structuredMatched.includes(slotId));
          if (missingCanonicalRoute.length) {
            failures.push({
              kind: "canonical_matcher_missing",
              caseId,
              probeId: probe.id,
              language,
              missingSlotIds: sortedUnique(missingCanonicalRoute)
            });
          }
          if (missingStructuredRoute.length) {
            failures.push({
              kind: "structured_matcher_missing",
              caseId,
              probeId: probe.id,
              language,
              missingSlotIds: sortedUnique(missingStructuredRoute)
            });
          }

          const expectedSlots = sortedUnique([
            ...(canonical?.collectableSlotIds || canonicalMatched),
            ...probe.structured
          ]);
          const conflictSlots = sortedUnique([
            ...(canonical?.governanceSlotIds || canonicalMatched),
            ...probe.structured
          ]).filter((slotId) => conflictKeys.has(`${caseData.id}:${slotId}`));
          if (conflictSlots.length) conflictBearingChecks += 1;

          const request = {
            sessionId: session.sessionId,
            caseId: caseData.id,
            studentInput: question,
            conversationHistory: [],
            language
          };
          const first = await generatePatientAnswer(request);
          const repeated = await generatePatientAnswer(request);
          repeatChecks += 1;

          if (signature(first) !== signature(repeated)) {
            failures.push({ kind: "repeat_not_deterministic", caseId, probeId: probe.id, language });
          }
          if (!String(first.replyText || "").trim()) {
            failures.push({ kind: "empty_reply", caseId, probeId: probe.id, language });
          }
          if (language === "en" && CJK.test(String(first.replyText || ""))) {
            failures.push({ kind: "english_reply_contains_cjk", caseId, probeId: probe.id, language });
          }
          if (TEACHER_META.test(String(first.replyText || ""))) {
            failures.push({ kind: "teacher_meta_leak", caseId, probeId: probe.id, language });
          }

          if (conflictSlots.length) {
            const isolated = first.fallbackReason === BILINGUAL_CONFLICT_REASON
              && first.answerSource === "pending_medical_review"
              && (first.matchedSlotIds || []).length === 0
              && (first.matchedFacts || []).length === 0;
            if (isolated) conflictIsolatedChecks += 1;
            else {
              failures.push({
                kind: "compound_conflict_not_isolated",
                caseId,
                probeId: probe.id,
                language,
                conflictSlotIds: sortedUnique(conflictSlots),
                actualSlotIds: sortedUnique(first.matchedSlotIds || []),
                fallbackReason: first.fallbackReason || "",
                answerSource: first.answerSource || ""
              });
            }
            continue;
          }

          const actualSlots = sortedUnique(first.matchedSlotIds || []);
          const missingSlots = expectedSlots.filter((slotId) => !actualSlots.includes(slotId));
          const allowedSlots = new Set([...probe.canonical, ...probe.structured]);
          const unexpectedSlots = actualSlots.filter((slotId) => !allowedSlots.has(slotId));
          if (missingSlots.length) {
            failures.push({
              kind: "compound_slot_dropped",
              caseId,
              probeId: probe.id,
              language,
              missingSlotIds: sortedUnique(missingSlots),
              actualSlotIds: actualSlots,
              fallbackReason: first.fallbackReason || "",
              answerSource: first.answerSource || ""
            });
          }
          if (unexpectedSlots.length) {
            failures.push({
              kind: "compound_unexpected_slot",
              caseId,
              probeId: probe.id,
              language,
              unexpectedSlotIds: sortedUnique(unexpectedSlots),
              actualSlotIds: actualSlots
            });
          }
          if ((first.safetyFlags || []).some((flag) => String(flag).startsWith("blocked_"))) {
            failures.push({
              kind: "history_compound_false_boundary",
              caseId,
              probeId: probe.id,
              language,
              safetyFlags: sortedUnique(first.safetyFlags || []),
              fallbackReason: first.fallbackReason || ""
            });
          }
        }
      }
    }
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }

  if (providerCalls !== 0) {
    failures.push({ kind: "unexpected_provider_call", caseId: "_matrix", probeId: "_all", language: "_all", providerCalls });
  }

  const grouped = groupedFailures(failures);
  const report = {
    schemaVersion: 1,
    mode: "local-rule-no-provider",
    medicalTruthAdjudicated: false,
    medicalBlocksPreserved: ["HEM-P0-001", "HEM-P0-023"],
    matrix: {
      cases: cases.length,
      languages: 2,
      probes: probes.length,
      sessionChecks,
      scenarioChecks,
      repeatChecks,
      crossLayerChecks,
      canonicalControlChecks,
      conflictBearingChecks,
      conflictIsolatedChecks,
      quarantineWarnings,
      deterministicBlockWarnings,
      providerCalls
    },
    result: {
      passed: failures.length === 0,
      failureInstances: failures.length,
      failureGroups: grouped.length
    },
    failureGroups: grouped
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`PATIENT_COMPOUND_HISTORY_EVIDENCE ${JSON.stringify({ ...report.matrix, ...report.result })}`);
  if (failures.length) process.exitCode = 1;
}

await main();
