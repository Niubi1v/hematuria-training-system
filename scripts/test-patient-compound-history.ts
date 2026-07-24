import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const cases = require("../data/cases.json") as Array<{
  id: string;
  sex?: string;
  structuredHistory?: Record<string, unknown>;
}>;
const {
  BILINGUAL_CONFLICT_REASON,
  bilingualConflictEntries
} = require("../server/bilingualConflictQuarantine.js") as {
  BILINGUAL_CONFLICT_REASON: string;
  bilingualConflictEntries: Array<{ caseId: string; field: string }>;
};
const {
  generatePatientAnswer,
  initSession
} = require("../server/patientSession.js");
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../server/structuredFacts.js");

type Probe = {
  id: string;
  zh: string;
  en: string;
  canonical: string[];
  structured: string[];
  femaleOnly?: boolean;
};

const probes: Probe[] = [
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

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

async function main() {
  assert.equal(cases.length, 42);
  const conflictKeys = new Set(
    bilingualConflictEntries.map((item) => `${item.caseId}:${item.field}`)
  );
  let providerCalls = 0;
  let scenarios = 0;
  let crossLayer = 0;
  let conflictScenarios = 0;
  let malignancyBoundaryChecks = 0;
  const failures: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("compound_history_test_forbids_provider_calls");
  };
  console.warn = (event, payload) => {
    if (event === "patient_fact_quarantined"
      || event === "patient_deterministic_answer_blocked") return;
    originalWarn(event, payload);
  };

  try {
    for (const caseData of cases) {
      for (const language of ["zh", "en"] as const) {
        const session = await initSession({
          caseId: caseData.id,
          mode: "compound-history-test",
          language
        });
        for (const probe of probes) {
          if (probe.femaleOnly && !String(caseData.sex || "").includes("女")) continue;
          scenarios += 1;
          if (probe.structured.length) crossLayer += 1;
          const question = probe[language];
          const canonical = matchCanonicalPatientFacts(caseData.id, question, language);
          const structured = matchStructuredFacts(caseData, question, language);
          const canonicalSlots = canonical?.matchedSlotIds || [];
          const structuredSlots = structured?.matchedSlotIds || [];
          const missingMatcherSlots = [
            ...probe.canonical.filter((slotId) => !canonicalSlots.includes(slotId)),
            ...probe.structured.filter((slotId) => !structuredSlots.includes(slotId))
          ];
          if (missingMatcherSlots.length) {
            failures.push(`${probe.id}:${language}:matcher:${unique(missingMatcherSlots).join(",")}`);
          }

          const expectedSlots = unique([
            ...(canonical?.collectableSlotIds || canonicalSlots),
            ...probe.structured
          ]);
          const governanceSlots = unique([
            ...(canonical?.governanceSlotIds || canonicalSlots),
            ...probe.structured
          ]);
          const conflictSlots = governanceSlots.filter(
            (slotId) => conflictKeys.has(`${caseData.id}:${slotId}`)
          );
          if (conflictSlots.length) conflictScenarios += 1;

          const request = {
            sessionId: session.sessionId,
            caseId: caseData.id,
            studentInput: question,
            conversationHistory: [],
            language
          };
          const first = await generatePatientAnswer(request);
          const repeated = await generatePatientAnswer(request);
          assert.deepEqual(
            {
              slots: first.matchedSlotIds,
              facts: first.matchedFacts,
              source: first.answerSource,
              reason: first.fallbackReason,
              reply: first.replyText
            },
            {
              slots: repeated.matchedSlotIds,
              facts: repeated.matchedFacts,
              source: repeated.answerSource,
              reason: repeated.fallbackReason,
              reply: repeated.replyText
            }
          );

          if (probe.id === "fever-and-uti-tumor-history" && language === "zh") {
            malignancyBoundaryChecks += 1;
            if (first.fallbackReason === "diagnosis_boundary") {
              failures.push(`${caseData.id}:past-malignancy:false-diagnosis-boundary`);
            }
          }
          if (conflictSlots.length) {
            const isolated = first.fallbackReason === BILINGUAL_CONFLICT_REASON
              && first.answerSource === "pending_medical_review"
              && (first.matchedSlotIds || []).length === 0;
            if (!isolated) failures.push(`${caseData.id}:${probe.id}:${language}:conflict-not-isolated`);
            continue;
          }
          const actualSlots = unique(first.matchedSlotIds || []);
          const missing = expectedSlots.filter((slotId) => !actualSlots.includes(slotId));
          if (missing.length) {
            failures.push(`${caseData.id}:${probe.id}:${language}:dropped:${missing.join(",")}:reason=${first.fallbackReason || "none"}:tooLong=${Boolean(first.filter?.tooLong)}:shape=${Boolean(first.filter?.hasBulletShape)}`);
          }
          const allowed = new Set([...probe.canonical, ...probe.structured]);
          const unexpected = actualSlots.filter((slotId) => !allowed.has(slotId));
          if (unexpected.length) {
            failures.push(`${caseData.id}:${probe.id}:${language}:extra:${unexpected.join(",")}`);
          }
          if ((first.safetyFlags || []).some((flag: string) => flag.startsWith("blocked_"))) {
            failures.push(`${caseData.id}:${probe.id}:${language}:false-boundary`);
          }
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }

  assert.equal(scenarios, 786);
  assert.equal(crossLayer, 618);
  assert.equal(malignancyBoundaryChecks, 42);
  assert.equal(conflictScenarios, 56);
  assert.equal(providerCalls, 0);
  assert.equal(
    failures.length,
    0,
    `compound-history failures=${failures.length}; first=${failures.slice(0, 20).join(" | ")}`
  );
  console.log("Patient compound-history gates passed.", {
    scenarios,
    crossLayer,
    malignancyBoundaryChecks,
    conflictScenarios,
    providerCalls
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "patient_compound_history_test_failed");
  process.exitCode = 1;
});
