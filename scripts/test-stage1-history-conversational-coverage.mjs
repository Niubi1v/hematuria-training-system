import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "r5-stage1-history-conversational-coverage-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json");
const { quarantineForMatchedSlots } = require("../server/bilingualConflictQuarantine.js");
const { generatePatientAnswer, initSession, projectRoutedPatientFacts } = require("../server/patientSession.js");
const { applyPatientProgressiveDisclosure } = require("../server/patientProgressiveDisclosure.js");
const { FACT_STATES } = require("../src/lib/patientFactState.js");
const { stage1HistoryIntentDefinitions } = require("../src/lib/stage1HistoryIntentRegistry.js");

const knownStates = new Set([
  FACT_STATES.KNOWN_TRUE,
  FACT_STATES.KNOWN_FALSE,
  FACT_STATES.EXACT_VALUE,
  FACT_STATES.APPROXIMATE_VALUE,
  FACT_STATES.PARTIALLY_KNOWN
]);
const genericUnknown = /(?:这个|这点|这项).*(?:不清楚|记不清)|(?:i(?:'m| am) not sure|i (?:do not|don't) know)(?: about that)?/i;
const reportFallback = /得看检查报告|check the (?:formal )?report/i;
const internalLeak = /(?:allowedAnswer|currentAllowedAnswer|groundedAnswer|answerPlan|matchedFacts|matchedSlots|sourceSlot|provenance|teacherOnly|classifier|fallbackReason|diagnosticEligible|scoringEligible)/i;
const governanceVoice = /(?:可靠的信息|没记录|数据库|病例字段|系统(?:没有|未有)记录|source fact|needs review)/i;
const patientUnknown = /(?:这个|这点|这项).*(?:不清楚|记不清|没(?:有)?特别(?:注意|留意))|(?:i(?:'m| am) not sure|i (?:do not|don't) know)(?: about that)?/i;
const malformedPunctuation = /(?:[。！？.!?][、，,；;]|\n[、，,；;])/u;
const medicalese = /(?:镜下血尿|尿潴留|排尿踌躇|抗菌药|肾小球|glomerular|microscopic hematuria|urinary retention)/i;

function deterministicIndex(seed, modulo) {
  return crypto.createHash("sha256").update(seed).digest().readUInt32BE(0) % modulo;
}

function expectedProjection(caseData, intent, question, language) {
  return applyPatientProgressiveDisclosure({
    caseData,
    matched: projectRoutedPatientFacts(caseData.id, caseData, [{ intent, text: question }], language),
    language
  });
}

function planFor(answer, intent) {
  return (answer?.answerPlans || []).find((plan) => plan.intent === intent) || null;
}

function expectedPlan(projection, intent) {
  return (projection?.answerPlans || []).find((plan) => plan.intent === intent) || null;
}

function governanceAllows(projection, intent, caseId) {
  const plan = expectedPlan(projection, intent);
  if (!plan || !knownStates.has(plan.factState)) return false;
  if (quarantineForMatchedSlots(caseId, projection.governanceSlotIds || []).conflictingSlotIds.includes(plan.sourceSlotId)) return false;
  return (projection.collectableFacts || []).includes(intent)
    || (intent === "past_medical_history_summary" && (projection.collectableSlotIds || []).length > 0);
}

function unknownClass(plan, answer) {
  const reason = plan?.unknownReason || answer?.fallbackReason;
  if (reason === "patient_not_observed") return "PATIENT_NOT_AWARE";
  if (reason === "partial_fact") return "PATIENT_NOT_AWARE";
  if (reason === "medical_history_pending_review") return "MEDICAL_REVIEW_BLOCK";
  const state = plan?.factState;
  if (state === FACT_STATES.PATIENT_NOT_AWARE) return "PATIENT_NOT_AWARE";
  if (state === FACT_STATES.NEEDS_REVIEW) return "MEDICAL_REVIEW_BLOCK";
  if (state === FACT_STATES.MEDICAL_CONFLICT) return "MEDICAL_CONFLICT";
  if (state === FACT_STATES.MISSING) return "TRUE_MISSING";
  if (answer?.fallbackReason === "context_clarification") return "AMBIGUOUS_REFERENCE";
  return plan ? "KNOWN_FACT_UNKNOWN" : "ROUTE_MISS_UNKNOWN";
}

async function evaluateTurn(caseData, definition, question, language, turnId, sessionId = `stage1-oracle-${turnId}`, conversationHistory = []) {
  const projection = expectedProjection(caseData, definition.intent, question, language);
  const expected = expectedPlan(projection, definition.intent);
  const answer = await generatePatientAnswer({
    sessionId,
    caseId: caseData.id,
    studentInput: question,
    conversationHistory,
    language
  });
  const actual = planFor(answer, definition.intent);
  const routedOutcome = (answer.clauseOutcomes || []).find((outcome) => outcome.intent === definition.intent) || null;
  const medicallyQuarantined = Boolean(expected && quarantineForMatchedSlots(
    caseData.id,
    projection?.governanceSlotIds || []
  ).conflictingSlotIds.includes(expected.sourceSlotId));
  const sourceKnown = governanceAllows(projection, definition.intent, caseData.id);
  const routeMissing = !actual && !routedOutcome && definition.ontologyDomain !== "safe_missing";
  const knownFactUnknown = sourceKnown && (!actual || !knownStates.has(actual.factState) || answer.answerSource === "unknown");
  const knownFactGenericUnknown = sourceKnown && genericUnknown.test(String(answer.replyText || ""));
  const performedAsResultMisroute = definition.intent === "prior_investigations"
    && !/结果|报告|发现|显示|提示|result|report|show/i.test(question)
    && (answer.fallbackReason === "report_boundary" || reportFallback.test(String(answer.replyText || "")));
  const polarityError = Boolean(actual && expected && sourceKnown && actual.factState !== expected.factState);
  const hallucination = Boolean(actual && expected && actual.sourceSlotId !== expected.sourceSlotId);
  const summaryIntents = new Set([
    "hypertension_history", "diabetes_history", "coronary_history", "stroke_history",
    "liver_disease_history", "tuberculosis_history", "previous_stone",
    "previous_urinary_infection", "previous_malignancy"
  ]);
  const parentIntents = new Set(stage1HistoryIntentDefinitions
    .filter((candidate) => candidate.followUpIntents.includes(definition.intent))
    .map((candidate) => candidate.intent));
  const prematureDisclosure = (answer.matchedFacts || []).some((intent) => (
    intent !== definition.intent
    && !parentIntents.has(intent)
    && !(definition.intent === "past_medical_history_summary" && summaryIntents.has(intent))
  ));
  const replyText = String(answer.replyText || "");
  const plans = answer.answerPlans || [];
  const internalLeakFound = internalLeak.test(replyText);
  const blankReply = !replyText.trim();
  const specificPlusUnknownCollision = sourceKnown
    && plans.some((plan) => knownStates.has(plan.factState))
    && plans.some((plan) => plan.intent !== definition.intent && !knownStates.has(plan.factState))
    && patientUnknown.test(replyText);
  const contradictoryClause = sourceKnown
    && actual?.factState !== FACT_STATES.PARTIALLY_KNOWN
    && patientUnknown.test(replyText);
  const malformedPunctuationFound = malformedPunctuation.test(replyText);
  const templateJoinArtifact = malformedPunctuationFound || (replyText.match(/记不(?:太)?清/g) || []).length > 1;
  const spillPattern = definition.sourceProjection?.spillPattern?.[language];
  const childIntentSpill = Boolean(spillPattern?.test(replyText));
  const crossIntentDisclosure = prematureDisclosure || childIntentSpill;
  const compositeFactOverDisclosure = Boolean(definition.sourceProjection && childIntentSpill);
  const quarantineError = medicallyQuarantined && routedOutcome?.factState !== FACT_STATES.MEDICAL_CONFLICT;
  return {
    caseId: caseData.displayCaseId || caseData.id,
    question,
    reply: answer.replyText,
    intent: definition.intent,
    sourceFactState: expected?.factState || FACT_STATES.MISSING,
    actualFactState: actual?.factState || routedOutcome?.factState || null,
    sourceKnown,
    medicallyQuarantined,
    answeredIntents: (answer.answerPlans || []).map((plan) => plan.intent),
    outcome: sourceKnown ? "ANSWERED_FROM_GOVERNED_SOURCE" : unknownClass(actual || routedOutcome || expected, answer),
    reason: actual?.unknownReason || routedOutcome?.unknownReason || answer.fallbackReason || "governed_known_fact",
    checks: {
      routeMissing, knownFactUnknown, knownFactGenericUnknown, performedAsResultMisroute,
      polarityError, hallucination, prematureDisclosure, internalLeakFound, blankReply,
      missingProjection: !expected && definition.ontologyDomain !== "safe_missing", quarantineError,
      unknownClassificationError: !sourceKnown && unknownClass(actual || routedOutcome || expected, answer) === "KNOWN_FACT_UNKNOWN",
      governanceVoiceLeak: governanceVoice.test(replyText), specificPlusUnknownCollision, contradictoryClause,
      malformedPunctuation: malformedPunctuationFound, templateJoinArtifact, crossIntentDisclosure,
      childIntentSpill, compositeFactOverDisclosure,
      medicaleseWarning: medicalese.test(replyText), overlongPatientReply: replyText.length > (language === "en" ? 180 : 90),
      genericTemplateRepetition: (replyText.match(/(?:记不(?:太)?清|没(?:有)?特别(?:注意|留意))/g) || []).length > 1
    }
  };
}

async function main() {
  assert.equal(cases.length, 42, "Stage-1 oracle requires all 42 cases");
  assert.ok(stage1HistoryIntentDefinitions.length >= 48, "Stage-1 registry must cover at least 48 intents");
  for (const definition of stage1HistoryIntentDefinitions) {
    assert.equal(definition.naturalForms.zh.length, 6, `${definition.intent}: six Chinese forms required`);
    assert.equal(definition.naturalForms.en.length, 6, `${definition.intent}: six English forms required`);
    assert.ok("sourceField" in definition && definition.governancePolicy && definition.compoundBehavior);
  }

  const metrics = {
    turns: 0,
    knownFactGenericUnknown: 0,
    routeMissUnknown: 0,
    knownFactUnknown: 0,
    performedAsResultMisroute: 0,
    polarityError: 0,
    hallucination: 0,
    prematureDisclosure: 0,
    internalLeak: 0,
    blankReply: 0,
    missingProjection: 0,
    quarantineError: 0,
    governanceVoiceLeak: 0,
    specificPlusUnknownCollision: 0,
    contradictoryClause: 0,
    malformedPunctuation: 0,
    templateJoinArtifact: 0,
    crossIntentDisclosure: 0,
    childIntentSpill: 0,
    compositeFactOverDisclosure: 0,
    medicaleseWarning: 0,
    overlongPatientReply: 0,
    genericTemplateRepetition: 0,
    unknownClasses: {}
  };
  const reviewSamples = new Map();
  const sampleCategories = [
    ["gross hematuria", (turn) => turn.intent === "gross_hematuria"],
    ["microscopic hematuria", (turn) => turn.intent === "microscopic_hematuria"],
    ["LUTS / BPH", (turn) => ["hesitancy", "weak_stream", "nocturia", "urinary_retention"].includes(turn.intent)],
    ["stone", (turn) => ["previous_stone", "renal_colic", "flank_pain"].includes(turn.intent)],
    ["UTI", (turn) => ["dysuria", "fever", "previous_urinary_infection"].includes(turn.intent)],
    ["malignancy risk", (turn) => ["smoking_history", "occupation_exposure", "previous_malignancy"].includes(turn.intent)],
    ["glomerular pattern", (turn) => ["foamy_urine", "edema", "recent_uri"].includes(turn.intent)],
    ["medication-heavy", (turn) => turn.intent.startsWith("medication_")],
    ["smoking / alcohol", (turn) => /^(?:smoking|alcohol)_/.test(turn.intent)],
    ["past medical history", (turn) => turn.intent === "past_medical_history_summary" || turn.intent === "hypertension_history"],
    ["prior treatment / investigation", (turn) => /^(?:prior_treatment|prior_investigation)/.test(turn.intent)],
    ["true missing", (turn) => turn.outcome === "TRUE_MISSING"],
    ["patient not aware", (turn) => turn.outcome === "PATIENT_NOT_AWARE"],
    ["partially known", (turn) => turn.sourceFactState === FACT_STATES.PARTIALLY_KNOWN]
  ];
  const warningChecks = new Set(["medicaleseWarning", "overlongPatientReply", "genericTemplateRepetition"]);
  const violations = [];
  function recordTurn(turn) {
    metrics.turns += 1;
    metrics.unknownClasses[turn.outcome] = (metrics.unknownClasses[turn.outcome] || 0) + 1;
    const metricByCheck = {
      routeMissing: "routeMissUnknown",
      knownFactUnknown: "knownFactUnknown",
      unknownClassificationError: "knownFactUnknown",
      knownFactGenericUnknown: "knownFactGenericUnknown",
      performedAsResultMisroute: "performedAsResultMisroute",
      polarityError: "polarityError",
      hallucination: "hallucination",
      prematureDisclosure: "prematureDisclosure",
      internalLeakFound: "internalLeak",
      blankReply: "blankReply",
      missingProjection: "missingProjection",
      quarantineError: "quarantineError",
      governanceVoiceLeak: "governanceVoiceLeak",
      specificPlusUnknownCollision: "specificPlusUnknownCollision",
      contradictoryClause: "contradictoryClause",
      malformedPunctuation: "malformedPunctuation",
      templateJoinArtifact: "templateJoinArtifact",
      crossIntentDisclosure: "crossIntentDisclosure",
      childIntentSpill: "childIntentSpill",
      compositeFactOverDisclosure: "compositeFactOverDisclosure",
      medicaleseWarning: "medicaleseWarning",
      overlongPatientReply: "overlongPatientReply",
      genericTemplateRepetition: "genericTemplateRepetition"
    };
    for (const [check, metric] of Object.entries(metricByCheck)) {
      if (!turn.checks[check]) continue;
      metrics[metric] += 1;
      if (!warningChecks.has(check) && violations.length < 5000) violations.push({ check, ...turn, checks: undefined });
    }
    for (const [category, matches] of sampleCategories) {
      if (!reviewSamples.has(category) && matches(turn)) reviewSamples.set(category, turn);
    }
  }
  for (const caseData of cases) {
    for (const definition of stage1HistoryIntentDefinitions) {
      for (const language of ["zh", "en"]) {
        for (let index = 0; index < 6; index += 1) {
          const turn = await evaluateTurn(
            caseData,
            definition,
            definition.naturalForms[language][index],
            language,
            `${caseData.displayCaseId || caseData.id}-${definition.intent}-${language}-${index}`
          );
          recordTurn(turn);
        }
      }
    }
  }

  const randomConversations = [];
  for (let trajectory = 0; trajectory < 100; trajectory += 1) {
    const caseData = cases[deterministicIndex(`case:${trajectory}`, cases.length)];
    const turnCount = 15 + deterministicIndex(`length:${trajectory}`, 16);
    const pool = [...stage1HistoryIntentDefinitions];
    const turns = [];
    const session = await initSession({ caseId: caseData.id, mode: "free", language: "zh" });
    const conversationHistory = [];
    for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
      const definition = pool[deterministicIndex(`intent:${trajectory}:${turnIndex}`, pool.length)];
      const formIndex = deterministicIndex(`form:${trajectory}:${turnIndex}`, 6);
      const turn = await evaluateTurn(
        caseData,
        definition,
        definition.naturalForms.zh[formIndex],
        "zh",
        `random-${trajectory}-${turnIndex}`,
        session.sessionId,
        conversationHistory
      );
      turns.push(turn);
      recordTurn(turn);
      conversationHistory.push(
        { role: "student", text: turn.question },
        { role: "patient", text: turn.reply }
      );
    }
    randomConversations.push({ caseId: caseData.displayCaseId || caseData.id, turns });
  }

  const outputDirectory = path.join(process.cwd(), "test-results", "r5-stage1-history-conversation");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const selected = randomConversations.slice(0, 50).map((conversation) => ({
    ...conversation,
    turns: conversation.turns
  }));
  fs.writeFileSync(path.join(outputDirectory, "conversation-audit.json"), `${JSON.stringify({ metrics, violations, conversations: selected }, null, 2)}\n`);
  const hardHumanFidelityMetrics = [
    "governanceVoiceLeak", "specificPlusUnknownCollision", "contradictoryClause", "malformedPunctuation",
    "templateJoinArtifact", "crossIntentDisclosure", "childIntentSpill", "compositeFactOverDisclosure"
  ];
  const warningMetrics = ["medicaleseWarning", "overlongPatientReply", "genericTemplateRepetition"];
  const humanFidelityAudit = {
    turns: metrics.turns,
    hardGates: Object.fromEntries(hardHumanFidelityMetrics.map((key) => [key, metrics[key]])),
    warnings: Object.fromEntries(warningMetrics.map((key) => [key, metrics[key]])),
    violations: violations.filter((item) => hardHumanFidelityMetrics.includes(item.check)),
    reviewSamples: Object.fromEntries(reviewSamples)
  };
  fs.writeFileSync(path.join(outputDirectory, "human-fidelity-audit.json"), `${JSON.stringify(humanFidelityAudit, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, "human-fidelity-review.md"), [
    "# R5.1 Patient Human Fidelity review",
    "",
    "以下为医生人工评审样本；自动门禁只验证事实边界与表达结构，不能替代临床真实性评审。",
    "",
    ...[...reviewSamples].flatMap(([category, turn]) => [
      `## ${category}`,
      "",
      `- 病例：${turn.caseId}`,
      `- 医生：${turn.question}`,
      `- 患者：${turn.reply}`,
      `- 事实状态：${turn.sourceFactState}`,
      ""
    ])
  ].join("\n"));
  fs.writeFileSync(path.join(outputDirectory, "conversation-audit.md"), [
    "# R5 Stage-1 history conversation audit",
    "",
    `- deterministic + random turns: ${metrics.turns}`,
    `- KNOWN_FACT_GENERIC_UNKNOWN: ${metrics.knownFactGenericUnknown}`,
    `- ROUTE_MISS_UNKNOWN: ${metrics.routeMissUnknown}`,
    `- PERFORMED_AS_RESULT_MISROUTE: ${metrics.performedAsResultMisroute}`,
    "",
    ...selected.flatMap((conversation, index) => [
      `## ${index + 1}. ${conversation.caseId}`,
      "",
      ...conversation.turns.flatMap((turn) => [
        `- Student: ${turn.question}`,
        `- Patient: ${turn.reply}`,
        `- Audit: intent=${turn.intent}; sourceFactState=${turn.sourceFactState}; outcome=${turn.outcome}; reason=${turn.reason}`
      ]),
      ""
    ])
  ].join("\n"));
  assert.equal(metrics.knownFactGenericUnknown, 0);
  assert.equal(metrics.routeMissUnknown, 0);
  assert.equal(metrics.knownFactUnknown, 0);
  assert.equal(metrics.performedAsResultMisroute, 0);
  assert.equal(metrics.polarityError, 0);
  assert.equal(metrics.hallucination, 0);
  assert.equal(metrics.prematureDisclosure, 0);
  assert.equal(metrics.internalLeak, 0);
  assert.equal(metrics.blankReply, 0);
  assert.equal(metrics.missingProjection, 0);
  assert.equal(metrics.quarantineError, 0);
  for (const metric of hardHumanFidelityMetrics) assert.equal(metrics[metric], 0, metric);
  console.log("R5-STAGE1-HISTORY-CONVERSATIONAL-COVERAGE passed.", metrics);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "stage1_history_conversation_coverage_failed");
  process.exitCode = 1;
});
