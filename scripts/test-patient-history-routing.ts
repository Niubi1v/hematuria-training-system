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
    replyText: string;
    matchedSlotIds?: string[];
    matchedFacts?: string[];
    fallbackReason?: string;
    safetyFlags?: string[];
    factStates?: Record<string, string>;
    clauseOutcomes?: Array<{ intent: string; sourceSlotId: string; status: string; factState: string }>;
    contextResolution?: { inherited?: boolean; reason?: string };
  }>;
};
type HistoryFact = {
  status: "present" | "absent" | string;
  patientAnswerZh: string;
  patientAnswerEn: string;
  provenance?: string;
  teacherReviewRequired?: boolean;
};
type Medication = {
  name: string;
  dose: string;
  frequency: string;
  indication: string;
  provenance?: string;
  teacherReviewRequired?: boolean;
};
type PatientCase = {
  id: string;
  structuredHistory: {
    hypertension: HistoryFact;
    diabetes: HistoryFact;
    coronaryDisease: HistoryFact;
    stroke: HistoryFact;
    liverDisease: HistoryFact;
    tuberculosis: HistoryFact;
    stoneHistory: HistoryFact;
    urinaryInfectionHistory: HistoryFact;
    malignancyHistory: HistoryFact;
    smokingHistory: HistoryFact;
    alcoholHistory: HistoryFact;
    medicationList: Medication[];
    medicationAnswerZh: string;
  };
};
const cases = require("../data/cases.json") as PatientCase[];
const {
  controlledAntihypertensiveNames,
  historySummaryRecommendations
} = require("../src/lib/patientRuntimeRecommendations.js") as {
  controlledAntihypertensiveNames(caseId: string): string[];
  historySummaryRecommendations(caseId: string): Array<{ targetField: string }>;
};
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
  { id: "urinary-procedure-history-en", language: "en", question: "Have you had a urinary procedure?", expectedSlots: ["PAST_URINARY_PROCEDURE"] },
  { id: "retention-en", language: "en", question: "Have you been unable to pass urine?", expectedSlots: ["retention"] }
];

const pastDiseaseKeys = [
  "hypertension",
  "diabetes",
  "coronaryDisease",
  "stroke",
  "liverDisease",
  "tuberculosis",
  "stoneHistory",
  "urinaryInfectionHistory",
  "malignancyHistory"
] as const;
const pastDiseaseLabels: Record<(typeof pastDiseaseKeys)[number], string> = {
  hypertension: "高血压",
  diabetes: "糖尿病",
  coronaryDisease: "冠心病",
  stroke: "脑卒中",
  liverDisease: "肝病",
  tuberculosis: "结核",
  stoneHistory: "泌尿系结石",
  urinaryInfectionHistory: "尿路感染",
  malignancyHistory: "肿瘤"
};
const pastDiseaseSlots: Record<(typeof pastDiseaseKeys)[number], string> = {
  hypertension: "PAST_HYPERTENSION",
  diabetes: "PAST_DIABETES",
  coronaryDisease: "PAST_CORONARY",
  stroke: "PAST_STROKE",
  liverDisease: "PAST_LIVER",
  tuberculosis: "PAST_TB",
  stoneHistory: "PAST_STONE",
  urinaryInfectionHistory: "PAST_UTI",
  malignancyHistory: "PAST_MALIGNANCY"
};

const categoryOnlyMedication = /^(?:降压药|降糖药|降脂药|止痛药|抗凝药|抗血小板药|利尿药|他汀(?:类)?(?:药)?|中药|保健品)$/i;

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
    } else if (result.fallbackReason === "canonical_fact_unknown" || result.fallbackReason === "patient_not_observed") {
      assert.ok(canonical, `${probe.id} unknown must remain under canonical governance`);
      assert.ok(Object.values(canonical.factValues || {}).every((value) => value === "unknown"));
      assert.deepEqual(canonical.collectableSlotIds || [], []);
      assert.deepEqual(result.matchedSlotIds || [], [], `${probe.id} unknown must remain uncollected`);
    } else if (result.fallbackReason === "medical_history_pending_review") {
      assert.deepEqual(result.matchedSlotIds || [], [], `${probe.id} unreviewed history must remain uncollected`);
    } else {
      assert.deepEqual(result.matchedSlotIds || [], probe.expectedSlots, probe.id);
    }
  }

  let medicationCases = 0;
  let hypertensionMedicationCases = 0;
  let personalHistoryChecks = 0;
  for (const currentCase of cases) {
    const compoundHistory = await generatePatientAnswer({
      sessionId: `history-compound-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "有没有高血压、糖尿病？",
      language: "zh",
      conversationHistory: []
    });
    const compoundIntents = compoundHistory.clauseOutcomes?.map((item) => item.intent) || [];
    assert.ok(compoundIntents.includes("hypertension_history"), `${currentCase.id} hypertension clause dropped`);
    assert.ok(compoundIntents.includes("diabetes_history"), `${currentCase.id} diabetes clause dropped`);
    assert.equal(compoundIntents.filter((item) => item === "hypertension_history").length, 1);
    assert.equal(compoundIntents.filter((item) => item === "diabetes_history").length, 1);

    const hypertension = await generatePatientAnswer({
      sessionId: `hypertension-authority-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "有高血压吗？",
      language: "zh",
      conversationHistory: []
    });
    if (hypertension.fallbackReason === "medical_history_pending_review") {
      assert.doesNotMatch(hypertension.replyText, /^有高血压。?$/, `${currentCase.id} unreviewed hypertension must not be inferred`);
    } else {
      assert.equal(
        hypertension.replyText,
        currentCase.structuredHistory.hypertension.patientAnswerZh,
        `${currentCase.id} hypertension must come from the authoritative history fact`
      );
    }

    const historySummary = await generatePatientAnswer({
      sessionId: `history-summary-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "有没有其他疾病？",
      language: "zh",
      conversationHistory: []
    });
    assert.notEqual(historySummary.fallbackReason, "classifier_disabled", `${currentCase.id} history summary fell through`);
    assert.ok(
      historySummary.clauseOutcomes?.some((item) => item.intent === "past_medical_history_summary"),
      `${currentCase.id} history summary missed canonical intent`
    );
    assert.doesNotMatch(historySummary.replyText, /这项情况我现在不太清楚/, `${currentCase.id} history summary became generic unknown`);
    const knownPositiveHistory = pastDiseaseKeys.filter((key) => {
      const fact = currentCase.structuredHistory[key];
      return fact.status === "present" && fact.provenance === "source" && !fact.teacherReviewRequired;
    });
    for (const key of knownPositiveHistory) {
      assert.ok(
        historySummary.replyText.includes(pastDiseaseLabels[key]),
        `${currentCase.id} history summary omitted ${key}`
      );
    }
    const knownNegativeHistory = pastDiseaseKeys.filter((key) => {
      const fact = currentCase.structuredHistory[key];
      return fact.status === "absent" && fact.provenance === "source" && !fact.teacherReviewRequired;
    });
    if (knownPositiveHistory.length) {
      for (const key of knownNegativeHistory) {
        assert.ok(
          !historySummary.replyText.includes(pastDiseaseLabels[key]),
          `${currentCase.id} history summary disclosed an unasked negative ${key}`
        );
      }
    }
    const summaryRuntimeRecommendations = historySummaryRecommendations(currentCase.id);
    if (summaryRuntimeRecommendations.length && !knownPositiveHistory.length) {
      assert.match(
        historySummary.replyText,
        /没有.*(?:慢性病|其他病)/,
        `${currentCase.id} governed negative summary was not applied`
      );
    }
    if (summaryRuntimeRecommendations.length) {
      assert.deepEqual(
        historySummary.matchedSlotIds || [],
        knownPositiveHistory.map((key) => pastDiseaseSlots[key]),
        `${currentCase.id} summary may collect only source-approved positive diseases`
      );
    }

    for (const personalProbe of [
      { field: "smokingHistory", intent: "smoking_history", question: "抽烟吗？" },
      { field: "alcoholHistory", intent: "alcohol_history", question: "喝酒吗？" }
    ] as const) {
      personalHistoryChecks += 1;
      const fact = currentCase.structuredHistory[personalProbe.field];
      const answer = await generatePatientAnswer({
        sessionId: `${personalProbe.intent}-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: personalProbe.question,
        language: "zh",
        conversationHistory: []
      });
      assert.ok(answer.clauseOutcomes?.some((item) => item.intent === personalProbe.intent), `${currentCase.id} ${personalProbe.intent} route missed`);
      if (fact.provenance === "source" && !fact.teacherReviewRequired) {
        assert.notEqual(answer.fallbackReason, "medical_history_pending_review", `${currentCase.id} source ${personalProbe.intent} was blocked`);
        const absent = ["never", "none", "absent", "no"].includes(String(fact.status || "").toLowerCase());
        assert.match(
          answer.replyText,
          personalProbe.intent === "smoking_history"
            ? absent ? /不(?:抽|吸)烟/ : /(?:抽|吸)烟/
            : absent ? /不喝酒/ : /喝.*酒/,
          `${currentCase.id} source ${personalProbe.intent} was not answered`
        );
        assert.doesNotMatch(answer.replyText, /\d+.*(?:支|根|包|年|次|两|瓶)|每天|一周/u, `${currentCase.id} ${personalProbe.intent} leaked unasked amount/frequency`);
      } else {
        assert.equal(
          answer.factStates?.[personalProbe.intent],
          "needs_review",
          `${currentCase.id} ${personalProbe.intent} runtime state`
        );
        assert.equal(answer.fallbackReason, "medical_history_pending_review", `${currentCase.id} ${personalProbe.intent} missing source must not be invented`);
        assert.deepEqual(answer.matchedSlotIds || [], [], `${currentCase.id} unreviewed personal history must not be collected`);
      }
    }

    const medications = currentCase.structuredHistory.medicationList;
    if (
      currentCase.structuredHistory.hypertension.status === "present"
      && currentCase.structuredHistory.hypertension.provenance === "source"
      && !currentCase.structuredHistory.hypertension.teacherReviewRequired
    ) {
      hypertensionMedicationCases += 1;
      const hypertensionHistory = [
        { role: "student", text: "有高血压吗？" },
        { role: "patient", text: currentCase.structuredHistory.hypertension.patientAnswerZh }
      ];
      const controlledNames = new Set(controlledAntihypertensiveNames(currentCase.id));
      const linkedMedications = medications.filter(
        (item) => /高血压|降压/.test(`${item.name} ${item.indication}`) || controlledNames.has(item.name)
      );
      const bareMedicationFollowup = await generatePatientAnswer({
        sessionId: `hypertension-bare-medication-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: "吃什么药？",
        language: "zh",
        conversationHistory: hypertensionHistory
      });
      assert.equal(bareMedicationFollowup.contextResolution?.inherited, true, `${currentCase.id} bare medication follow-up did not inherit hypertension`);
      assert.equal(bareMedicationFollowup.contextResolution?.reason, "contextual_medication_name");
      assert.ok(bareMedicationFollowup.matchedFacts?.includes("medication_name"));
      assert.notEqual(bareMedicationFollowup.fallbackReason, "classifier_disabled");
      const highBloodPressureMedication = await generatePatientAnswer({
        sessionId: `hypertension-medication-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: "高血压吃什么药？",
        language: "zh",
        conversationHistory: hypertensionHistory
      });
      assert.equal(highBloodPressureMedication.contextResolution?.inherited, true, `${currentCase.id} hypertension medication context not inherited`);
      assert.ok(highBloodPressureMedication.matchedFacts?.includes("medication_name"), `${currentCase.id} hypertension medication did not route to medication name`);
      assert.ok(!highBloodPressureMedication.matchedFacts?.includes("hypertension_history"), `${currentCase.id} medication question redundantly answered diagnosis`);
      assert.notEqual(highBloodPressureMedication.fallbackReason, "classifier_disabled");
      if (linkedMedications.length) {
        for (const medication of linkedMedications) {
          assert.ok(highBloodPressureMedication.replyText.includes(medication.name), `${currentCase.id} omitted linked antihypertensive ${medication.name}`);
        }
        for (const medication of medications.filter((item) => !linkedMedications.includes(item))) {
          assert.ok(!highBloodPressureMedication.replyText.includes(medication.name), `${currentCase.id} leaked unrelated medication ${medication.name}`);
        }
      } else {
        assert.equal(highBloodPressureMedication.factStates?.medication_name, "partially_known");
        for (const medication of medications) {
          assert.ok(highBloodPressureMedication.replyText.includes(medication.name), `${currentCase.id} did not preserve known medication ${medication.name}`);
        }
        assert.match(highBloodPressureMedication.replyText, /哪一种是降压药说不清/);
      }

      const antihypertensiveName = await generatePatientAnswer({
        sessionId: `antihypertensive-name-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: "吃的什么降压药？",
        language: "zh",
        conversationHistory: [
          ...hypertensionHistory,
          { role: "student", text: "高血压吃什么药？" },
          { role: "patient", text: highBloodPressureMedication.replyText }
        ]
      });
      assert.equal(antihypertensiveName.contextResolution?.inherited, true);
      assert.ok(antihypertensiveName.matchedFacts?.includes("medication_name"));
      assert.notEqual(antihypertensiveName.fallbackReason, "classifier_disabled");

      const medicationHow = await generatePatientAnswer({
        sessionId: `antihypertensive-frequency-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: "这个药怎么吃？",
        language: "zh",
        conversationHistory: [
          ...hypertensionHistory,
          { role: "student", text: "吃的什么降压药？" },
          { role: "patient", text: antihypertensiveName.replyText }
        ]
      });
      assert.equal(medicationHow.contextResolution?.inherited, true, `${currentCase.id} medication frequency context not inherited`);
      assert.equal(medicationHow.contextResolution?.reason, "contextual_medication_frequency");
      assert.ok(medicationHow.matchedFacts?.includes("medication_frequency"));
      const allLinkedFrequenciesKnown = linkedMedications.length > 0 && linkedMedications.every((item) => item.frequency);
      assert.equal(
        medicationHow.factStates?.medication_frequency,
        allLinkedFrequenciesKnown ? "exact_value" : "partially_known",
        `${currentCase.id} scoped medication frequency state`
      );

      const otherMedicationFollowup = await generatePatientAnswer({
        sessionId: `hypertension-other-medication-${currentCase.id}`,
        caseId: currentCase.id,
        studentInput: "还有其他药吗？",
        language: "zh",
        conversationHistory: [
          ...hypertensionHistory,
          { role: "student", text: "吃的什么降压药？" },
          { role: "patient", text: antihypertensiveName.replyText }
        ]
      });
      assert.equal(otherMedicationFollowup.contextResolution?.inherited, true, `${currentCase.id} other medication context not inherited`);
      assert.equal(otherMedicationFollowup.contextResolution?.reason, "contextual_other_medications");
      assert.ok(otherMedicationFollowup.matchedFacts?.includes("other_medications"));
      for (const medication of medications) {
        assert.ok(otherMedicationFollowup.replyText.includes(medication.name), `${currentCase.id} other medication followup omitted ${medication.name}`);
      }
    }
    if (!medications.length) continue;
    medicationCases += 1;
    const genericMedication = await generatePatientAnswer({
      sessionId: `medication-list-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "平时吃什么药？",
      language: "zh",
      conversationHistory: []
    });
    assert.notEqual(genericMedication.fallbackReason, "classifier_disabled");
    for (const medication of medications) {
      assert.ok(genericMedication.replyText.includes(medication.name), `${currentCase.id} generic medication omitted ${medication.name}`);
    }

    const medicationName = await generatePatientAnswer({
      sessionId: `medication-name-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "具体药名是什么？",
      language: "zh",
      conversationHistory: []
    });
    for (const medication of medications) {
      assert.ok(medicationName.replyText.includes(medication.name), `${currentCase.id} medication name omitted ${medication.name}`);
    }
    const hasCategoryOnlyName = medications.some((item) => categoryOnlyMedication.test(item.name));
    assert.equal(
      medicationName.factStates?.medication_name,
      hasCategoryOnlyName ? "partially_known" : "exact_value",
      `${currentCase.id} medication name state`
    );

    const medicationDose = await generatePatientAnswer({
      sessionId: `medication-dose-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "剂量多少？",
      language: "zh",
      conversationHistory: []
    });
    assert.notEqual(medicationDose.fallbackReason, "classifier_disabled", `${currentCase.id} medication dose fell through`);
    const hasMissingDose = medications.some((item) => !item.dose);
    assert.equal(medicationDose.factStates?.medication_dosage, hasMissingDose ? "partially_known" : "exact_value");
    for (const medication of medications.filter((item) => item.dose)) {
      assert.ok(medicationDose.replyText.includes(medication.dose), `${currentCase.id} omitted source dose`);
    }
    if (medications.every((item) => !item.dose)) {
      assert.doesNotMatch(medicationDose.replyText, /\d+\s*(?:mg|毫克|片|粒)/i, `${currentCase.id} invented a dose`);
    }

    const medicationFrequency = await generatePatientAnswer({
      sessionId: `medication-frequency-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "一天吃几次？",
      language: "zh",
      conversationHistory: []
    });
    const hasMissingFrequency = medications.some((item) => !item.frequency);
    assert.equal(
      medicationFrequency.factStates?.medication_frequency,
      hasMissingFrequency ? "partially_known" : "exact_value",
      `${currentCase.id} medication frequency state`
    );
    for (const medication of medications.filter((item) => item.frequency)) {
      assert.ok(
        medicationFrequency.replyText.includes(medication.frequency === "每日" ? "每天" : medication.frequency),
        `${currentCase.id} omitted source frequency`
      );
    }

    const otherMedication = await generatePatientAnswer({
      sessionId: `other-medication-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "还有没有其他药？",
      language: "zh",
      conversationHistory: []
    });
    assert.equal(otherMedication.factStates?.other_medications, "exact_value");
    for (const medication of medications) {
      assert.ok(otherMedication.replyText.includes(medication.name), `${currentCase.id} other medication omitted ${medication.name}`);
    }

    const contextualDose = await generatePatientAnswer({
      sessionId: `contextual-medication-dose-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "剂量多少？",
      language: "zh",
      conversationHistory: [
        { role: "student", text: "平时吃什么药？" },
        { role: "patient", text: currentCase.structuredHistory.medicationAnswerZh }
      ]
    });
    assert.equal(contextualDose.contextResolution?.inherited, true, `${currentCase.id} medication context not inherited`);
    assert.equal(contextualDose.contextResolution?.reason, "contextual_medication_dosage");
    assert.equal(contextualDose.factStates?.medication_dosage, hasMissingDose ? "partially_known" : "exact_value");

    const medicationCompound = await generatePatientAnswer({
      sessionId: `medication-compound-${currentCase.id}`,
      caseId: currentCase.id,
      studentInput: "有没有高血压、糖尿病，平时吃什么药？",
      language: "zh",
      conversationHistory: []
    });
    const medicationCompoundIntents = medicationCompound.clauseOutcomes?.map((item) => item.intent) || [];
    for (const intent of ["hypertension_history", "diabetes_history", "medication_list"]) {
      assert.ok(medicationCompoundIntents.includes(intent), `${currentCase.id} compound omitted ${intent}`);
    }
  }
  assert.equal(medicationCases, 21, "all cases with structured long-term medication must be covered");
  assert.equal(hypertensionMedicationCases, 11, "all source-confirmed hypertension cases must have multi-turn medication coverage");
  assert.equal(personalHistoryChecks, 84, "smoking and alcohol routing must cover all 42 cases");

  for (const probe of [
    {
      input: "有没有冠心病，平时吃什么药？",
      intents: ["coronary_history", "medication_list"]
    },
    {
      input: "有没有尿频，之前做过什么检查？",
      intents: ["urinary_frequency", "prior_investigations"]
    },
    {
      input: "家里有人得过肾病吗，你以前做过手术吗，之前怎么治疗的？",
      intents: ["family_history", "surgery_history", "prior_treatment"]
    }
  ]) {
    const answer = await generatePatientAnswer({
      sessionId: `cross-system-compound-${probe.intents.join("-")}`,
      caseId: "P001",
      studentInput: probe.input,
      language: "zh",
      conversationHistory: []
    });
    const actualIntents = answer.clauseOutcomes?.map((item) => item.intent) || [];
    for (const intent of probe.intents) {
      assert.ok(actualIntents.includes(intent), `${probe.input} omitted ${intent}`);
    }
  }

  for (const question of [
    "这是什么病？",
    "我是不是肿瘤？",
    "你判断一下我得啥？",
    "我的最终诊断是什么？"
  ]) {
    const answer = await generatePatientAnswer({
      sessionId: `routing-current-diagnosis-${question}`,
      caseId: "P001",
      studentInput: question,
      language: "zh",
      conversationHistory: []
    });
    assert.equal(answer.fallbackReason, "diagnosis_boundary", `${question} must remain behind the diagnosis boundary`);
    assert.ok(answer.safetyFlags?.includes("blocked_diagnosis_request"), `${question} must carry the diagnosis safety flag`);
    assert.deepEqual(answer.matchedSlotIds || [], []);
  }

  for (const question of [
    "以前医生说是什么病？",
    "当时医生怎么告诉你的？",
    "之前诊断叫什么？"
  ]) {
    const answer = await generatePatientAnswer({
      sessionId: `routing-prior-diagnosis-${question}`,
      caseId: "P001",
      studentInput: question,
      language: "zh",
      conversationHistory: []
    });
    assert.ok(answer.matchedFacts?.includes("prior_diagnosis_patient_aware"), `${question} must use the patient-known prior diagnosis`);
    assert.ok(!answer.safetyFlags?.includes("blocked_diagnosis_request"), `${question} must remain an allowed history question`);
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

  console.log("Patient history routing preserved 42 summaries, 11 hypertension medication conversations, 21 medication suites, 84 personal-history checks, and 4 public safety boundaries.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
