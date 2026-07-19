import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
const cases = require("../../data/cases.json");
const bilingualSlots = require("../../data/patient_slots_bilingual.json");
const {
  BILINGUAL_CONFLICT_REASON,
  bilingualConflictEntries
} = require("../../server/bilingualConflictQuarantine.js");
const {
  generatePatientAnswer,
  initSession
} = require("../../server/patientSession.js");
const { matchCanonicalPatientFacts } = require("../../server/canonicalFacts.js");

const MATRIX_SCHEMA_VERSION = 2;
const DEFAULT_REPORT = "artifacts/exploratory-qa/reports/patient-session-matrix.json";
const TEACHER_META = /根据原始病史|根据病例资料|病例资料显示|未主动诉|需追问|教师提示|标准答案|评分点|标准病例摘要|teacher hint|standard answer|scoring point|case data shows/i;
const CJK = /[\u3400-\u9fff]/;
const SOURCE_UNKNOWN = /不(?:太)?清楚|不知道|未说明|不详|not sure|do not know|don't know|unknown/i;
const GENERIC_UNKNOWN_REPLIES = new Set([
  "这项情况我现在不太清楚。",
  "这个我不太清楚。",
  "I'm not sure about that right now."
]);

const variant = (question, expectedSlotIds) => ({ question, expectedSlotIds });

// These are routing and safety probes, not medical-truth assertions. Expected IDs
// describe the production server's public slot contract; no answer value is compared.
const slotProbes = [
  {
    slotId: "chief_complaint",
    zh: [variant("哪里不舒服？", ["chief_complaint"]), variant("为什么来看病？", ["chief_complaint"])],
    en: [variant("What brings you here?", ["chief_complaint"]), variant("What is your main complaint?", ["chief_complaint"])]
  },
  {
    slotId: "hematuria_visibility",
    zh: [variant("是肉眼血尿还是镜下血尿？", ["hematuria_visibility"]), variant("尿里的血看得见吗？", ["hematuria_visibility"])],
    en: [variant("Is this visible blood or microscopic hematuria?", ["hematuria_visibility"]), variant("Did a urine test find blood?", ["hematuria_visibility"])]
  },
  {
    slotId: "hematuria_onset",
    zh: [variant("什么时候开始的？", ["hematuria_onset"]), variant("血尿有多久了？", ["hematuria_onset"])],
    en: [variant("When did it start?", ["hematuria_onset"]), variant("How long have you had blood in your urine?", ["hematuria_onset"])]
  },
  {
    slotId: "hematuria_frequency",
    zh: [variant("血尿是间断还是持续的？", ["hematuria_frequency"]), variant("这种情况反复出现吗？", ["hematuria_frequency"])],
    en: [variant("Is the blood intermittent or continuous?", ["hematuria_frequency"]), variant("How often does this happen?", ["hematuria_frequency"])]
  },
  {
    slotId: "hematuria_phase",
    zh: [variant("是全程都有血吗？", ["hematuria_phase"]), variant("是开始红还是最后几滴红？", ["hematuria_phase"])],
    en: [variant("Is the blood present throughout the whole stream?", ["hematuria_phase"]), variant("Is it at the beginning or the end of urination?", ["hematuria_phase"])]
  },
  {
    slotId: "urine_color",
    zh: [variant("尿液是什么颜色？", ["urine_color"]), variant("尿色是鲜红还是暗红？", ["urine_color"])],
    en: [variant("What is the urine colour?", ["urine_color"]), variant("Is it bright red or dark red?", ["urine_color"])]
  },
  {
    slotId: "clots",
    zh: [variant("有血块吗？", ["clots"]), variant("见到过血凝块吗？", ["clots"])],
    en: [variant("Are there blood clots?", ["clots"]), variant("Have you passed any blood clot?", ["clots"])]
  },
  {
    slotId: "pain",
    zh: [variant("疼不疼？", ["pain"]), variant("有没有痛？", ["pain"])],
    en: [variant("Does it hurt?", ["pain"]), variant("Do you have any pain?", ["pain"])]
  },
  {
    slotId: "dysuria",
    zh: [variant("有尿痛吗？", ["dysuria"]), variant("小便时有烧灼感吗？", ["dysuria"])],
    en: [variant("Do you have painful urination?", ["dysuria"]), variant("Do you have burning during urination?", ["dysuria"])]
  },
  {
    slotId: "flank_pain",
    zh: [variant("有腰痛吗？", ["flank_pain"]), variant("肾区痛吗？", ["flank_pain"])],
    en: [variant("Do you have flank pain?", ["flank_pain"]), variant("Do you have loin pain?", ["flank_pain"])]
  },
  {
    slotId: "renal_colic",
    zh: [variant("有肾绞痛吗？", ["renal_colic"]), variant("出现过绞痛吗？", ["renal_colic"])],
    en: [variant("Have you had renal colic?", ["renal_colic"]), variant("Have you had colicky pain?", ["renal_colic"])]
  },
  {
    slotId: "radiating_pain",
    zh: [variant("有放射痛吗？", ["radiating_pain"]), variant("疼痛会放射到腹股沟吗？", ["radiating_pain"])],
    en: [variant("Do you have radiating pain?", ["radiating_pain"]), variant("Does the pain radiate to the groin?", ["radiating_pain"])]
  },
  {
    slotId: "urinary_frequency",
    zh: [variant("有尿频吗？", ["urinary_frequency"]), variant("小便次数多吗？", ["urinary_frequency"])],
    en: [variant("Do you have frequent urination?", ["urinary_frequency"]), variant("Have you been urinating more often?", ["urinary_frequency"])]
  },
  {
    slotId: "urinary_urgency",
    zh: [variant("有尿急吗？", ["urinary_urgency"]), variant("会突然憋不住吗？", ["urinary_urgency"])],
    en: [variant("Do you have urinary urgency?", ["urinary_urgency"]), variant("Do you have an urgent need to urinate?", ["urinary_urgency"])]
  },
  {
    slotId: "voiding_difficulty",
    zh: [variant("排尿困难吗？", ["voiding_difficulty"]), variant("尿线细或尿不尽吗？", ["voiding_difficulty"])],
    en: [variant("Do you have difficulty urinating?", ["voiding_difficulty"]), variant("Do you have a weak stream or incomplete emptying?", ["voiding_difficulty"])]
  },
  {
    slotId: "retention",
    zh: [variant("有尿潴留吗？", ["retention"]), variant("有没有尿不出来的时候？", ["retention"])],
    en: [variant("Have you had urinary retention?", ["retention"]), variant("Have you been unable to pass urine?", ["retention"])]
  },
  {
    slotId: "fever_chills",
    zh: [variant("有发热或寒战吗？", ["fever_chills"]), variant("有没有发烧或畏寒？", ["fever_chills"])],
    en: [variant("Do you have fever or chills?", ["fever_chills"]), variant("Have you had a temperature or rigors?", ["fever_chills"])]
  },
  {
    slotId: "glomerular_features",
    zh: [variant("有泡沫尿吗？", ["glomerular_features"]), variant("眼睑或下肢水肿吗？", ["glomerular_features"])],
    en: [variant("Do you have foamy urine?", ["glomerular_features"]), variant("Have you had swelling or oedema?", ["glomerular_features"])]
  },
  {
    slotId: "recent_uri",
    zh: [variant("最近感冒或咽痛吗？", ["recent_uri"]), variant("近期有扁桃体炎吗？", ["recent_uri"])],
    en: [variant("Have you recently had a cold or sore throat?", ["recent_uri"]), variant("Have you recently had tonsillitis?", ["recent_uri"])]
  },
  {
    slotId: "triggers",
    zh: [variant("运动会诱发吗？", ["triggers"]), variant("劳累后会出现吗？", ["triggers"])],
    en: [variant("Was this triggered by exercise?", ["triggers"]), variant("Does it happen after exertion?", ["triggers"])]
  },
  {
    slotId: "stone_history",
    zh: [variant("以前得过结石吗？", ["PAST_STONE"]), variant("有结石史吗？", ["PAST_STONE"])],
    en: [variant("Have you had stones before?", ["PAST_STONE"]), variant("Do you have a stone history?", ["PAST_STONE"])]
  },
  {
    slotId: "uti_history",
    zh: [variant("以前有过尿路感染吗？", ["PAST_UTI"]), variant("有感染史吗？", ["PAST_UTI"])],
    en: [variant("Have you had a urinary infection before?", ["PAST_UTI"]), variant("Do you have a UTI history?", ["PAST_UTI"])]
  },
  {
    slotId: "tumor_history",
    zh: [variant("以前有肿瘤史吗？", ["PAST_MALIGNANCY"]), variant("以前得过癌吗？", ["PAST_MALIGNANCY"])],
    en: [variant("Do you have a cancer history?", ["PAST_MALIGNANCY"]), variant("Have you had a previous cancer?", ["PAST_MALIGNANCY"])]
  },
  {
    slotId: "urinary_procedure_history",
    zh: [variant("以前做过膀胱镜吗？", ["PAST_URINARY_PROCEDURE"]), variant("以前导过尿吗？", ["PAST_URINARY_PROCEDURE"])],
    en: [variant("Have you had a cystoscopy?", ["PAST_URINARY_PROCEDURE"]), variant("Have you had a urinary procedure?", ["PAST_URINARY_PROCEDURE"])]
  },
  {
    slotId: "surgery_history",
    zh: [variant("以前开过刀吗？", ["PAST_SURGERY"]), variant("有手术史吗？", ["PAST_SURGERY"])],
    en: [variant("Have you had an operation?", ["PAST_SURGERY"]), variant("Do you have a surgery history?", ["PAST_SURGERY"])]
  },
  {
    slotId: "anticoagulant",
    zh: [variant("在用抗凝药吗？", ["MED_ANTICOAGULANT"]), variant("吃华法林或利伐沙班吗？", ["MED_ANTICOAGULANT"])],
    en: [variant("Do you take an anticoagulant?", ["MED_ANTICOAGULANT"]), variant("Do you take warfarin or rivaroxaban?", ["MED_ANTICOAGULANT"])]
  },
  {
    slotId: "antiplatelet",
    zh: [variant("在用抗血小板药吗？", ["MED_ANTIPLATELET"]), variant("吃阿司匹林或氯吡格雷吗？", ["MED_ANTIPLATELET"])],
    en: [variant("Do you take antiplatelet medication?", ["MED_ANTIPLATELET"]), variant("Do you take aspirin or clopidogrel?", ["MED_ANTIPLATELET"])]
  },
  {
    slotId: "medications",
    zh: [variant("平时都吃什么药？", ["MED_ALL"]), variant("有长期用药吗？", ["MED_ALL"])],
    en: [variant("What regular medications do you take?", ["MED_ALL"]), variant("What medications do you take?", ["MED_ALL"])]
  },
  {
    slotId: "smoking",
    zh: [variant("吸烟吗？", ["LIFE_SMOKING"]), variant("有抽烟史吗？", ["LIFE_SMOKING"])],
    en: [variant("Do you smoke?", ["LIFE_SMOKING"]), variant("What is your smoking history?", ["LIFE_SMOKING"])]
  },
  {
    slotId: "alcohol",
    zh: [variant("喝酒吗？", ["LIFE_ALCOHOL"]), variant("平时饮酒吗？", ["LIFE_ALCOHOL"])],
    en: [variant("Do you drink alcohol?", ["LIFE_ALCOHOL"]), variant("What is your alcohol history?", ["LIFE_ALCOHOL"])]
  },
  {
    slotId: "occupation_exposure",
    zh: [variant("接触过化工物质吗？", ["LIFE_EXPOSURE"]), variant("接触过染料或重金属吗？", ["LIFE_EXPOSURE"])],
    en: [variant("Have you had chemical exposure?", ["LIFE_EXPOSURE"]), variant("Have you had exposure to dyes or heavy metals?", ["LIFE_EXPOSURE"])]
  },
  {
    slotId: "gynecologic_contamination",
    zh: [variant("现在是月经期吗？", ["GYNE_MENSTRUAL"]), variant("有没有怀孕？", ["GYNE_PREGNANCY"])],
    en: [variant("Are you currently on your period?", ["GYNE_MENSTRUAL"]), variant("Are you pregnant?", ["GYNE_PREGNANCY"])]
  },
  {
    slotId: "family_history",
    zh: [variant("有家族史吗？", ["FAMILY_HISTORY"]), variant("家里有人有类似情况吗？", ["FAMILY_HISTORY"])],
    en: [variant("Do you have a family history?", ["FAMILY_HISTORY"]), variant("Is there anything hereditary in your family?", ["FAMILY_HISTORY"])]
  },
  {
    slotId: "bleeding_tendency",
    zh: [variant("有鼻出血吗？", ["bleeding_tendency"]), variant("有牙龈出血或瘀斑吗？", ["bleeding_tendency"])],
    en: [variant("Do you have nosebleeds?", ["bleeding_tendency"]), variant("Do you have gum bleeding or bruising?", ["bleeding_tendency"])]
  },
  {
    slotId: "past_history",
    zh: [variant("有高血压吗？", ["PAST_HYPERTENSION"]), variant("有糖尿病吗？", ["PAST_DIABETES"])],
    en: [variant("Do you have hypertension?", ["PAST_HYPERTENSION"]), variant("Do you have diabetes?", ["PAST_DIABETES"])]
  },
  {
    slotId: "prior_care",
    zh: [variant("以前看过医生吗？", ["prior_care"]), variant("之前治疗过吗？", ["prior_care"])],
    en: [variant("Have you seen a doctor before?", ["prior_care"]), variant("Have you had previous treatment?", ["prior_care"])]
  },
  {
    slotId: "general_condition",
    zh: [variant("胃口和睡眠怎么样？", ["general_condition"]), variant("体重有下降吗？", ["general_condition"])],
    en: [variant("How are your appetite and sleep?", ["general_condition"]), variant("Have you lost weight?", ["general_condition"])]
  }
];

function cliValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameSet(left, right) {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function replyMetrics(replyText) {
  const text = String(replyText || "");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    characters: text.length,
    lines: lines.length,
    maxLineCharacters: lines.reduce((max, line) => Math.max(max, line.length), 0),
    bulletShaped: lines.some((line) => /^[-•*#]/.test(line))
  };
}

function addFailure(failures, failure) {
  failures.push({
    ...failure,
    expectedSlotIds: sortedUnique(failure.expectedSlotIds || []),
    actualSlotIds: sortedUnique(failure.actualSlotIds || []),
    safetyFlags: sortedUnique(failure.safetyFlags || [])
  });
}

function groupedFailures(failures) {
  const groups = new Map();
  for (const failure of failures) {
    const { caseId, ...signature } = failure;
    const key = JSON.stringify(signature);
    const group = groups.get(key) || { signature, caseIds: [] };
    group.caseIds.push(caseId);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group.signature, caseIds: sortedUnique(group.caseIds), count: group.caseIds.length }))
    .sort((left, right) => `${left.kind}:${left.slotId || ""}:${left.language || ""}`.localeCompare(`${right.kind}:${right.slotId || ""}:${right.language || ""}`));
}

function assertReplyEnvelope({ result, caseId, slotId, language, variantIndex, failures }) {
  const metrics = replyMetrics(result.replyText);
  if (!result.replyText) {
    addFailure(failures, { kind: "empty_reply", caseId, slotId, language, variantIndex, metrics });
  }
  if (metrics.bulletShaped || metrics.maxLineCharacters > 80 || metrics.characters > 180) {
    addFailure(failures, { kind: "reply_format", caseId, slotId, language, variantIndex, metrics });
  }
  if (language === "en" && CJK.test(String(result.replyText || ""))) {
    addFailure(failures, { kind: "english_reply_contains_cjk", caseId, slotId, language, variantIndex, metrics });
  }
  if (TEACHER_META.test(String(result.replyText || ""))) {
    addFailure(failures, { kind: "teacher_meta_leak", caseId, slotId, language, variantIndex, metrics });
  }
}

async function main() {
  const reportPath = path.resolve(cliValue("report", DEFAULT_REPORT));
  const previousEnv = {
    agents: process.env.LLM_ENABLE_AI_AGENTS,
    patient: process.env.LLM_ENABLE_AI_PATIENT
  };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.LLM_ENABLE_AI_AGENTS = "false";
  process.env.LLM_ENABLE_AI_PATIENT = "false";
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("QA matrix forbids provider calls");
  };

  const failures = [];
  const conflictKeys = new Set(bilingualConflictEntries.map((item) => `${item.caseId}:${item.field}`));
  const quarantineEvents = [];
  const originalWarn = console.warn;
  console.warn = (event, payload) => {
    if (event === "patient_fact_quarantined") quarantineEvents.push(payload);
  };

  let routeChecks = 0;
  let repeatChecks = 0;
  let boundaryChecks = 0;
  let sessionChecks = 0;
  let unsafeDeterministicSourceBlocks = 0;
  let governedUnknowns = 0;
  let unsafeGovernedUnknowns = 0;
  const sessionIds = new Set();

  try {
    if (cases.length !== 42) {
      addFailure(failures, { kind: "case_count", caseId: "_library", expectedSlotIds: ["42"], actualSlotIds: [String(cases.length)] });
    }
    if (slotProbes.length !== 37) {
      addFailure(failures, { kind: "probe_slot_count", caseId: "_matrix", expectedSlotIds: ["37"], actualSlotIds: [String(slotProbes.length)] });
    }

    for (const caseData of cases) {
      const sourceSlots = bilingualSlots[caseData.id] || {};
      for (const probe of slotProbes) {
        const source = sourceSlots[probe.slotId];
        if (!source || !String(source.patientAnswerZh || "").trim() || !String(source.patientAnswerEn || "").trim()) {
          addFailure(failures, { kind: "source_slot_missing", caseId: caseData.id, slotId: probe.slotId });
        }
      }

      for (const language of ["zh", "en"]) {
        const session = await initSession({ caseId: caseData.id, mode: "qa-matrix", language, debug: false });
        sessionChecks += 1;
        const opening = String(session.patientOpeningStatement || "");
        const openingMetrics = replyMetrics(opening);
        if (
          !session.sessionId ||
          !opening ||
          session.caseId !== caseData.id ||
          session.language !== language ||
          session.mode !== "qa-matrix" ||
          !Number.isFinite(Date.parse(session.sessionCreatedAt)) ||
          !Number.isFinite(Date.parse(session.sessionExpiresAt)) ||
          Date.parse(session.sessionExpiresAt) <= Date.parse(session.sessionCreatedAt)
        ) {
          addFailure(failures, { kind: "session_envelope", caseId: caseData.id, language, metrics: openingMetrics });
        }
        if (sessionIds.has(session.sessionId)) {
          addFailure(failures, { kind: "duplicate_session_id", caseId: caseData.id, language });
        }
        sessionIds.add(session.sessionId);
        if ("completedPatientFacingProfile" in session || "teacherOnlyData" in session) {
          addFailure(failures, { kind: "session_private_data_exposed", caseId: caseData.id, language });
        }
        if (language === "en" && CJK.test(opening)) {
          addFailure(failures, { kind: "english_opening_contains_cjk", caseId: caseData.id, language, metrics: openingMetrics });
        }
        if (TEACHER_META.test(opening)) {
          addFailure(failures, { kind: "opening_teacher_meta_leak", caseId: caseData.id, language, metrics: openingMetrics });
        }

        for (const probe of slotProbes) {
          const isConflict = conflictKeys.has(`${caseData.id}:${probe.slotId}`);
          for (const [variantIndex, routeProbe] of probe[language].entries()) {
            const request = {
              sessionId: session.sessionId,
              caseId: caseData.id,
              studentInput: routeProbe.question,
              conversationHistory: [],
              language
            };
            const first = await generatePatientAnswer(request);
            const repeated = await generatePatientAnswer(request);
            routeChecks += 1;
            repeatChecks += 1;

            assertReplyEnvelope({ result: first, caseId: caseData.id, slotId: probe.slotId, language, variantIndex, failures });

            const firstSignature = JSON.stringify({
              replyText: first.replyText,
              matchedSlotIds: sortedUnique(first.matchedSlotIds || []),
              safetyFlags: sortedUnique(first.safetyFlags || []),
              answerSource: first.answerSource || "",
              fallbackReason: first.fallbackReason || ""
            });
            const repeatedSignature = JSON.stringify({
              replyText: repeated.replyText,
              matchedSlotIds: sortedUnique(repeated.matchedSlotIds || []),
              safetyFlags: sortedUnique(repeated.safetyFlags || []),
              answerSource: repeated.answerSource || "",
              fallbackReason: repeated.fallbackReason || ""
            });
            if (firstSignature !== repeatedSignature) {
              addFailure(failures, { kind: "repeat_not_deterministic", caseId: caseData.id, slotId: probe.slotId, language, variantIndex });
            }

            if (isConflict) {
              if (
                first.fallbackReason !== BILINGUAL_CONFLICT_REASON ||
                first.answerSource !== "pending_medical_review" ||
                (first.matchedSlotIds || []).length !== 0 ||
                (first.matchedFacts || []).length !== 0 ||
                first.confidence !== 0 ||
                !(first.quarantinedSlotIds || []).includes(probe.slotId)
              ) {
                addFailure(failures, {
                  kind: "medical_conflict_not_quarantined",
                  caseId: caseData.id,
                  slotId: probe.slotId,
                  language,
                  variantIndex,
                  expectedSlotIds: [],
                  actualSlotIds: first.matchedSlotIds,
                  safetyFlags: first.safetyFlags,
                  fallbackReason: first.fallbackReason || "",
                  answerSource: first.answerSource || ""
                });
              }
              continue;
            }

            const sourceAnswer = String(sourceSlots[probe.slotId]?.[language === "en" ? "patientAnswerEn" : "patientAnswerZh"] || "");
            const canonical = matchCanonicalPatientFacts(caseData.id, routeProbe.question, language);
            const canonicalFactValues = Object.values(canonical?.factValues || {});
            const canonicalFactReasons = Object.values(canonical?.factValueReasons || {});
            const governedUnknown =
              ["canonical_fact_unknown", "unsafe_deterministic_answer"].includes(first.fallbackReason) &&
              first.answerSource === "unknown" &&
              first.confidence === 0 &&
              (first.matchedSlotIds || []).length === 0 &&
              (first.matchedFacts || []).length === 0 &&
              sameSet(canonical?.matchedSlotIds || [], routeProbe.expectedSlotIds) &&
              (canonical?.collectableSlotIds || []).length === 0 &&
              canonicalFactValues.length > 0 &&
              canonicalFactValues.every((value) => value === "unknown") &&
              (first.fallbackReason !== "unsafe_deterministic_answer" || canonicalFactReasons.includes("unsafe_deterministic_answer"));
            if (governedUnknown) {
              governedUnknowns += 1;
              if (first.fallbackReason === "unsafe_deterministic_answer") unsafeGovernedUnknowns += 1;
            }
            const unsafeDeterministicSourceBlocked =
              first.fallbackReason === "unsafe_deterministic_answer" &&
              (first.safetyFlags || []).includes("deterministic_answer_blocked") &&
              (first.matchedSlotIds || []).length === 0 &&
              (first.matchedFacts || []).length === 0;
            if (unsafeDeterministicSourceBlocked) unsafeDeterministicSourceBlocks += 1;

            if (!unsafeDeterministicSourceBlocked && !governedUnknown && !sameSet(first.matchedSlotIds || [], routeProbe.expectedSlotIds)) {
              addFailure(failures, {
                kind: "route_mismatch",
                caseId: caseData.id,
                slotId: probe.slotId,
                language,
                variantIndex,
                expectedSlotIds: routeProbe.expectedSlotIds,
                actualSlotIds: first.matchedSlotIds,
                safetyFlags: first.safetyFlags,
                fallbackReason: first.fallbackReason || "",
                answerSource: first.answerSource || ""
              });
            }
            if (
              sameSet(first.matchedSlotIds || [], routeProbe.expectedSlotIds) &&
              !first.answerSource
            ) {
              addFailure(failures, {
                kind: "matched_route_missing_source",
                caseId: caseData.id,
                slotId: probe.slotId,
                language,
                variantIndex,
                expectedSlotIds: routeProbe.expectedSlotIds,
                actualSlotIds: first.matchedSlotIds
              });
            }
            if (
              sameSet(first.matchedSlotIds || [], routeProbe.expectedSlotIds) &&
              sourceAnswer &&
              !SOURCE_UNKNOWN.test(sourceAnswer) &&
              GENERIC_UNKNOWN_REPLIES.has(String(first.replyText || ""))
            ) {
              addFailure(failures, {
                kind: "matched_fact_suppressed_to_unknown",
                caseId: caseData.id,
                slotId: probe.slotId,
                language,
                variantIndex,
                expectedSlotIds: routeProbe.expectedSlotIds,
                actualSlotIds: first.matchedSlotIds,
                answerSource: first.answerSource || "",
                sourceCharacters: sourceAnswer.length
              });
            }
            if ((first.safetyFlags || []).some((flag) => String(flag).startsWith("blocked_"))) {
              addFailure(failures, {
                kind: "history_question_false_boundary",
                caseId: caseData.id,
                slotId: probe.slotId,
                language,
                variantIndex,
                expectedSlotIds: routeProbe.expectedSlotIds,
                actualSlotIds: first.matchedSlotIds,
                safetyFlags: first.safetyFlags,
                fallbackReason: first.fallbackReason || ""
              });
            }
          }
        }

        for (const boundary of [
          { kind: "diagnosis", question: language === "en" ? "What is the diagnosis?" : "这是什么病？", flag: "blocked_diagnosis_request" },
          { kind: "report", question: language === "en" ? "What did the CT and pathology report show?" : "CT和病理报告显示什么？", flag: "blocked_report_request" }
        ]) {
          const result = await generatePatientAnswer({
            sessionId: session.sessionId,
            caseId: caseData.id,
            studentInput: boundary.question,
            conversationHistory: [],
            language
          });
          boundaryChecks += 1;
          assertReplyEnvelope({ result, caseId: caseData.id, slotId: `_boundary_${boundary.kind}`, language, variantIndex: 0, failures });
          if (!(result.safetyFlags || []).includes(boundary.flag) || (result.matchedSlotIds || []).length !== 0) {
            addFailure(failures, {
              kind: "boundary_not_enforced",
              caseId: caseData.id,
              slotId: `_boundary_${boundary.kind}`,
              language,
              expectedSlotIds: [],
              actualSlotIds: result.matchedSlotIds,
              safetyFlags: result.safetyFlags,
              fallbackReason: result.fallbackReason || ""
            });
          }
          if (result.provider !== "rule" || result.model !== "local-rule" || (result.matchedFacts || []).length !== 0) {
            addFailure(failures, {
              kind: "boundary_envelope",
              caseId: caseData.id,
              slotId: `_boundary_${boundary.kind}`,
              language,
              actualSlotIds: result.matchedSlotIds,
              safetyFlags: result.safetyFlags,
              fallbackReason: result.fallbackReason || "",
              provider: result.provider || "",
              model: result.model || ""
            });
          }
        }
      }
    }
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    if (previousEnv.agents === undefined) delete process.env.LLM_ENABLE_AI_AGENTS;
    else process.env.LLM_ENABLE_AI_AGENTS = previousEnv.agents;
    if (previousEnv.patient === undefined) delete process.env.LLM_ENABLE_AI_PATIENT;
    else process.env.LLM_ENABLE_AI_PATIENT = previousEnv.patient;
  }

  if (providerCalls !== 0) {
    addFailure(failures, { kind: "unexpected_provider_call", caseId: "_matrix", providerCalls });
  }

  const grouped = groupedFailures(failures);
  const report = {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode: "local-rule-no-provider",
    medicalTruthAdjudicated: false,
    medicalBlocksPreserved: ["HEM-P0-001", "HEM-P0-023"],
    matrix: {
      cases: cases.length,
      canonicalSlots: slotProbes.length,
      languages: 2,
      variantsPerSlotPerLanguage: 2,
      sourceCellsChecked: cases.length * slotProbes.length * 2,
      sessionChecks,
      routeChecks,
      repeatChecks,
      boundaryChecks,
      unsafeDeterministicSourceBlocks,
      governedUnknowns,
      unsafeGovernedUnknowns,
      providerCalls,
      expectedDirectQuarantineEvents: bilingualConflictEntries.length * 2 * 2 * 2,
      quarantineEventsObserved: quarantineEvents.length
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
  console.log(JSON.stringify({ report: path.relative(process.cwd(), reportPath), ...report.result, ...report.matrix }));
  if (failures.length) process.exitCode = 1;
}

await main();
