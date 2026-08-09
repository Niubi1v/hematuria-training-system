const { matchPatientFactOntology } = require("../src/lib/patientIntentCatalog.js");
const {
  FACT_STATES,
  UNKNOWN_REASON_CODES,
  answerPlanFromRendered,
  renderAnswerPlan
} = require("../src/lib/patientFactState.js");

const SLOT_BY_INTENT = Object.freeze({
  prior_medical_visit: "prior_care",
  prior_investigations: "PATIENT_PRIOR_INVESTIGATIONS",
  prior_investigation_results_patient_aware: "PATIENT_PRIOR_RESULTS",
  prior_diagnosis_patient_aware: "PATIENT_PRIOR_DIAGNOSIS",
  prior_treatment: "PATIENT_PRIOR_TREATMENT",
  prior_medication_for_current_problem: "PATIENT_CURRENT_PROBLEM_MEDICATION",
  treatment_response: "PATIENT_TREATMENT_RESPONSE"
});

const PLAN_ONLY = /(?:建议|必要时|按需|用于|用来|需(?:要)?(?:排除|完善|评估)|通常不需|可考虑|若.*再|进一步评估|尚未|未完成|等待)/;
const RESULT_WORD = /(?:提示|发现|显示|可见|未见|无异常|阴性|阳性|增大|积水|结石|占位|病变|异常|升高|降低|\+|RBC|WBC)/i;
const UNSAFE_NARRATIVE = /(?:癌|肿瘤|占位|病理|转移|分期|分级|评分|教师|标准答案|CT提示|CTU提示|超声提示|彩超提示)/;
const ABSENT_TREATMENT = /(?:未|没有|否认|尚未).{0,10}(?:用药|服药|吃药|抗菌药|抗生素|治疗|输液|处理)/;
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function joinSummaries(values, language = "zh") {
  const clean = unique(values).map((value) => String(value).replace(/[。.!]+$/, ""));
  return clean.length ? `${clean.join(language === "en" ? "; " : "，")}${language === "en" ? "." : "。"}` : "";
}

function sentences(...values) {
  return values
    .flatMap((value) => String(value || "").split(/[。；;\n]/))
    .map((value) => value.replace(/^患者(?:因|自述)?/, "").trim())
    .filter(Boolean);
}

function sourceNarrative(caseData) {
  return sentences(
    caseData?.presentIllness?.onset,
    caseData?.presentIllness?.priorCare,
    caseData?.patientAnswers?.priorCare,
    caseData?.raw?.symptomsDetail,
    caseData?.raw?.medicalHistory,
    caseData?.pastHistory,
    caseData?.medication,
    caseData?.sourceFacts?.pastHistory,
    caseData?.sourceFacts?.medication
  );
}

function modality(type, result) {
  const typeText = String(type || "");
  const resultText = String(result || "").split(/[；;]/)[0];
  if (/尿检|尿常规/.test(typeText)) return "尿检";
  if (/血检|血液|抽血/.test(typeText)) return "抽血检查";
  const text = `${resultText} ${typeText}`;
  if (/CTU|CT|计算机断层/i.test(text)) return "CT";
  if (/MRI|MR|磁共振/i.test(text)) return "磁共振";
  if (/超声|彩超|B超/i.test(text)) return "B超";
  if (/膀胱镜/.test(resultText)) return "膀胱镜";
  if (/病理|活检/.test(text)) return "病理检查";
  if (/尿|RBC|WBC/i.test(text)) return "尿检";
  if (/血|肌酐|eGFR|CRP|PCT/i.test(text)) return "抽血检查";
  if (/影像|内镜/.test(typeText)) return "影像检查";
  return String(type || "检查").replace(/\/.*$/, "") || "检查";
}

function isCompletedInvestigation(item) {
  const result = String(item?.result || "").trim();
  if (!result) return false;
  return result.split(/[；;]/).some((part) => RESULT_WORD.test(part)
    && !(PLAN_ONLY.test(part) && !/(?:提示|发现|显示|可见|未见|无异常|无占位|无结石|阴性|阳性)/.test(part)));
}

function urineSummary(value, language) {
  const text = String(value || "");
  if (!text) return "";
  if (language === "en") {
    const details = [/(?:RBC|红细胞|潜血|血尿)/i.test(text) && "blood was found in my urine", /蛋白/i.test(text) && "there was also some protein", /WBC|白细胞|亚硝酸盐|培养/i.test(text) && "there were signs that may relate to inflammation"].filter(Boolean);
    return details.length ? `I had a urine test; ${details.join(", ")}.` : "I had a urine test, but I cannot recall the details.";
  }
  const details = [/(?:RBC|红细胞|潜血|血尿)/i.test(text) && "尿里有血", /蛋白/.test(text) && "还有蛋白", /WBC|白细胞|亚硝酸盐|培养/i.test(text) && "还有些炎症相关变化"].filter(Boolean);
  return details.length ? `我查过尿，医生说${details.join("，")}。` : "我查过尿，具体细节记不清了。";
}

function investigationSummary(item, language) {
  const kind = modality(item?.type, item?.result);
  const result = String(item?.result || "");
  if (kind === "尿检") return urineSummary(result, language);
  const negative = /(?:未见|无异常|阴性|无占位|无结石|未见异常)/.test(result);
  if (language === "en") return negative
    ? `I had ${kind}; I was told there was no obvious abnormality.`
    : `I had ${kind}; I was told something needed further review.`;
  return negative
    ? `我做过${kind}，医生说没有看到明显异常。`
    : `我做过${kind}，医生说有个地方需要继续看。`;
}

function missingAnswer(intent, index, language) {
  const knownTests = index.completedInvestigations.map((item) => modality(item.type, item.result));
  if (language === "en") {
    if (intent === "prior_investigations" && knownTests.length) return `I remember having ${unique(knownTests).join(" and ")}.`;
    if (intent === "prior_investigation_results_patient_aware" && index.resultSummaries.length) return joinSummaries(index.resultSummaries, language);
    if (intent === "prior_medication_for_current_problem" && index.longTermMedicationNegative) return "I do not take regular medication; I do not have a reliable record of medicine for this episode.";
    return {
      prior_medical_visit: "The available history does not say whether I sought care for this before.",
      prior_investigations: "The available history does not say which tests I had before.",
      prior_investigation_results_patient_aware: "The available history does not contain a test result that I can reliably describe.",
      prior_diagnosis_patient_aware: "The available history does not say what diagnosis I was previously told.",
      prior_treatment: "The available history does not say whether I received treatment before.",
      prior_medication_for_current_problem: "The available history does not say whether I took medicine for this episode.",
      treatment_response: "The available history does not record how I responded to prior treatment."
    }[intent] || "The available history does not contain a reliable answer to that.";
  }
  if (intent === "prior_investigations" && knownTests.length) return `我记得做过${unique(knownTests).join("和")}。`;
  if (intent === "prior_investigation_results_patient_aware" && index.resultSummaries.length) return joinSummaries(index.resultSummaries, language);
  if (intent === "prior_medication_for_current_problem" && index.longTermMedicationNegative) return "我平时没有长期服药；这次有没有用药，现有记录没有写清楚。";
  return {
    prior_medical_visit: "现有病史没有写清我以前是否为这个问题就诊过。",
    prior_investigations: "现有病史没有写清我以前做过哪些检查。",
    prior_investigation_results_patient_aware: "现有病史没有记录我能说清的检查结果。",
    prior_diagnosis_patient_aware: "现有病史没有写清医生以前给过什么说法。",
    prior_treatment: "现有病史没有写清我以前是否接受过治疗。",
    prior_medication_for_current_problem: "现有病史没有写清我这次是否用过药。",
    treatment_response: "现有病史没有记录治疗后的变化，我不能凭空说好转或没好转。"
  }[intent] || "这件事现有病史没有写清楚。";
}

function firstMatchingNarrative(lines, pattern, forbidden = null) {
  return lines.find((line) => pattern.test(line) && (!forbidden || !forbidden.test(line))) || "";
}

function patientSentence(raw, language) {
  const text = String(raw || "").replace(/患者|未诉\/|需追问|需核实/g, "").trim();
  if (!text) return "";
  if (language === "en") return "I remember this was recorded in my history.";
  return /^我/.test(text) ? `${text.replace(/[。]+$/, "")}。` : `我记得${text.replace(/[。]+$/, "")}。`;
}

function patientClause(raw, pattern, language) {
  const clause = String(raw || "").split(/[，,]/).find((part) => pattern.test(part));
  return patientSentence(clause, language);
}

function priorVisitAnswer(lines, language) {
  const priorVisit = lines.some((line) => /(?:此前|之前|曾|多次|反复|当地|外院).{0,40}(?:就诊|门诊|急诊|看过医生|去医院)/.test(line));
  if (!priorVisit) return "";
  return language === "en" ? "I sought medical care for this before." : "我之前为这个问题去医院看过。";
}

function buildPatientKnowableFactIndex(caseData, language = "zh") {
  const narrative = sourceNarrative(caseData);
  const currentProblemNarrative = sentences(caseData?.presentIllness?.onset, caseData?.raw?.symptomsDetail);
  const investigations = Array.isArray(caseData?.investigations) ? caseData.investigations : [];
  const urine = String(caseData?.urineTestResult || "").trim();
  const completedInvestigations = investigations.filter(isCompletedInvestigation);
  if (urine && !completedInvestigations.some((item) => modality(item.type, item.result) === "尿检")) {
    completedInvestigations.unshift({ type: "尿检", result: urine });
  }
  const resultSummaries = unique(completedInvestigations.map((item) => investigationSummary(item, language)));
  const diagnosis = firstMatchingNarrative(narrative, /(?:被诊断为|医生说是|诊断过)/, /(?:否认|无|未)/);
  const treatment = firstMatchingNarrative(currentProblemNarrative, /(?:治疗|输液|抗菌药|抗生素|保守处理|导尿)/, /(?:未|没有|否认|尚未|无|癌|肿瘤|占位|病理|转移|分期|分级|评分|教师|标准答案)/);
  const currentMedication = firstMatchingNarrative(currentProblemNarrative, /(?:用药|服药|吃药|抗菌药|抗生素|止痛药)/, /(?:未|没有|否认|尚未|无|癌|肿瘤|占位|病理|转移|分期|分级|评分|教师|标准答案)/);
  const response = firstMatchingNarrative(currentProblemNarrative, /(?:治疗|用药|服药|吃药|抗菌药|抗生素|输液|处理)[^。]{0,60}(?:缓解|好转|无效|复发)|(?:缓解|好转|无效|复发)[^。]{0,60}(?:治疗|用药|服药|吃药|抗菌药|抗生素|输液|处理)/, new RegExp(`${UNSAFE_NARRATIVE.source}|${ABSENT_TREATMENT.source}`));
  return {
    caseId: caseData?.displayCaseId || caseData?.id || "",
    completedInvestigations,
    resultSummaries,
    longTermMedicationNegative: /(?:无长期用药|没有长期服药|不服用长期药)/.test(String(caseData?.medication || caseData?.sourceFacts?.medication || "")),
    facts: {
      prior_medical_visit: priorVisitAnswer(narrative, language),
      prior_investigations: completedInvestigations.length ? missingAnswer("prior_investigations", { completedInvestigations, resultSummaries }, language) : "",
      prior_investigation_results_patient_aware: joinSummaries(resultSummaries, language),
      prior_diagnosis_patient_aware: diagnosis ? patientSentence(diagnosis, language) : "",
      prior_treatment: treatment ? patientClause(treatment, /(?:治疗|输液|抗菌药|抗生素|保守处理|导尿)/, language) : "",
      prior_medication_for_current_problem: currentMedication ? patientClause(currentMedication, /(?:用药|服药|吃药|抗菌药|抗生素|止痛药)/, language) : "",
      treatment_response: response ? patientClause(response, /(?:缓解|好转|无效|复发)/, language) : ""
    }
  };
}

function requestedModality(question) {
  const text = String(question || "");
  if (/CTU|CT|计算机断层/i.test(text)) return "CT";
  if (/MRI|MR|磁共振/i.test(text)) return "磁共振";
  if (/B超|彩超|超声/i.test(text)) return "B超";
  if (/尿检|尿常规|查尿|查过尿|验尿/i.test(text)) return "尿检";
  if (/抽过血|查血|验血|血检|血液检查/i.test(text)) return "抽血检查";
  if (/膀胱镜|内镜/.test(text)) return "膀胱镜";
  if (/病理|活检/.test(text)) return "病理检查";
  return "";
}

function matchPatientKnowableFacts(caseData, question, language = "zh") {
  if (!caseData) return null;
  const temporalFinding = /多久|什么时候|何时|几天|几周|几个月|how long|when/i.test(String(question || ""));
  const matches = matchPatientFactOntology(question, language, ["patient_knowledge"])
    .filter((match) => !(temporalFinding && match.intentKey === "prior_investigation_results_patient_aware"));
  if (!matches.length) return null;
  const index = buildPatientKnowableFactIndex(caseData, language);
  const plans = [];
  for (const match of unique(matches.map((item) => item.intentKey)).map((intent) => matches.find((item) => item.intentKey === intent))) {
    const intent = match.intentKey;
    let answer = index.facts[intent] || "";
    let state = answer ? FACT_STATES.EXACT_VALUE : FACT_STATES.MISSING;
    if (["prior_investigations", "prior_investigation_results_patient_aware"].includes(intent)) {
      const requested = requestedModality(question);
      if (requested) {
        const item = index.completedInvestigations.find((candidate) => modality(candidate.type, candidate.result) === requested);
        if (item) answer = intent === "prior_investigations"
          ? (language === "en" ? `Yes, I had ${requested}.` : `有，我做过${requested}。`)
          : investigationSummary(item, language);
        else {
          answer = language === "en"
            ? `I only remember the tests already mentioned; I cannot confirm that I had ${requested}.`
            : `我只记得前面这些检查，现有病史不能确认我做过${requested}。`;
          state = FACT_STATES.PATIENT_NOT_AWARE;
        }
      }
    }
    if (!answer) answer = missingAnswer(intent, index, language);
    plans.push(answerPlanFromRendered({
      intent,
      sourceSlotId: SLOT_BY_INTENT[intent],
      factState: state,
      renderedAnswer: answer,
      unknownReason: state === FACT_STATES.MISSING ? UNKNOWN_REASON_CODES.FACT_MISSING : state === FACT_STATES.PATIENT_NOT_AWARE ? UNKNOWN_REASON_CODES.PATIENT_NOT_AWARE : null,
      clauseStatus: state === FACT_STATES.EXACT_VALUE ? "matched" : "safe_unknown",
      matchIndex: match.matchIndex,
      provenance: "repo_patient_knowable_projection"
    }));
  }
  const collectable = plans.filter((plan) => plan.factState === FACT_STATES.EXACT_VALUE);
  return {
    replyText: unique(plans.map(renderAnswerPlan)).join("\n"),
    matchedSlotIds: unique(plans.map((plan) => plan.sourceSlotId)),
    matchedFacts: unique(plans.map((plan) => plan.intent)),
    governanceSlotIds: unique(plans.map((plan) => plan.sourceSlotId)),
    collectableSlotIds: unique(collectable.map((plan) => plan.sourceSlotId)),
    collectableFacts: unique(collectable.map((plan) => plan.intent)),
    answerSource: "repo_patient_knowable_projection",
    provenance: "repo_patient_knowable_projection",
    reviewerStatus: "source_projection_only",
    confidence: collectable.length === plans.length ? 0.99 : 0.8,
    safetyFlags: [],
    fallbackReason: collectable.length === plans.length ? "" : "patient_knowable_fact_missing",
    factStates: Object.fromEntries(plans.map((plan) => [plan.intent, plan.factState])),
    answerPlans: plans,
    unknownReasonCodes: Object.fromEntries(plans.filter((plan) => plan.unknownReason).map((plan) => [plan.intent, plan.unknownReason])),
    groundedIntent: plans.at(-1)?.intent || "",
    matchedPatientFactDomain: "patient_knowledge"
  };
}

module.exports = {
  buildPatientKnowableFactIndex,
  matchPatientKnowableFacts
};
