const { matchPatientFactOntology } = require("../src/lib/patientIntentCatalog.js");
const { verifiedPatientKnowableRecords } = require("./patientKnowableAllowlist.js");
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
const RESULT_WORD = /(?:提示|发现|显示|可见|未见|无异常|阴性|阳性|增大|积水|结石|占位|病变|异常|升高|降低|血尿|蛋白|\+|RBC|WBC)/i;
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

const PRIOR_CARE_CONTEXT = /(?:此前|之前|曾|当地|外院|来我院前|\d+(?:个)?(?:天|周|月|年)(?:余)?前|\d+(?:个)?(?:天|周|月|年)内)/;
const NO_PRIOR_INVESTIGATION = /(?:没|没有|未)(?:有)?(?:做|查|验)[^。]{0,12}(?:检查|化验|尿|血|B超|彩超|超声|CT|MRI|磁共振|膀胱镜|病理|活检)/i;
const COMPLETED_INVESTIGATION = /(?:做|查|验)(?:了|过)?[^。]{0,20}(?:尿|血|B超|彩超|超声|CT|MRI|磁共振|膀胱镜|病理|活检|检查)|(?:尿检|尿常规|B超|彩超|超声|CT|MRI|磁共振|膀胱镜|病理|活检).{0,20}(?:提示|显示|发现|结果|均|说)/i;

function patientAwareInvestigationNarrative(caseData) {
  const explicitPriorCare = sentences(caseData?.presentIllness?.priorCare, caseData?.patientAnswers?.priorCare);
  const anchoredHistory = sentences(caseData?.presentIllness?.onset, caseData?.raw?.symptomsDetail)
    .filter((line) => PRIOR_CARE_CONTEXT.test(line));
  return unique([...explicitPriorCare, ...anchoredHistory]);
}

function patientAwareInvestigations(lines) {
  return unique(lines.filter((line) => COMPLETED_INVESTIGATION.test(line) && !NO_PRIOR_INVESTIGATION.test(line) && !PLAN_ONLY.test(line)))
    .map((line) => ({ type: modality("", line), result: line }));
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
  const negative = /(?:未见|未发现|无)[^。；，,]{0,12}(?:红细胞|潜血|血尿)|(?:红细胞|潜血|尿蛋白|蛋白)[^。；，,]{0,8}(?:阴性|未见|未发现)/.test(text);
  if (negative) return language === "en"
    ? "I had a urine test; I was told there was no obvious abnormality."
    : "我查过尿，医生说没有看到明显异常。";
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
  const negative = /(?:未见|未发现|阴性|无(?:明显)?(?:异常|占位|结石))/.test(result);
  const negatedStone = /(?:无|未见|未发现)[^。；，,]{0,12}结石|排除[^。；，,]{0,12}结石/.test(result);
  const negatedHydronephrosis = /(?:无|未见|未发现)[^。；，,]{0,12}(?:积水|积液扩张|肾盂扩张)/.test(result);
  const negatedProstate = /(?:无|未见|未发现)[^。；，,]{0,12}前列腺[^。；，,]{0,12}(?:增大|增生)|前列腺[^。；，,]{0,12}(?:无|未见|未发现)[^。；，,]{0,12}(?:增大|增生)/.test(result);
  const coarseFinding = /结石/.test(result) && !negatedStone
    ? (language === "en" ? "I was told there was a stone." : "医生说有个结石。")
    : /积水|积液扩张|肾盂扩张/.test(result) && !negatedHydronephrosis
      ? (language === "en" ? "I was told there was some swelling." : "医生说有点积水。")
      : /前列腺.{0,12}(?:增大|增生)/.test(result) && !negatedProstate
        ? (language === "en" ? "I was told my prostate was a little enlarged." : "医生说前列腺有点大。")
        : "";
  if (language === "en") return coarseFinding || (negative
    ? `I had ${kind}; I was told there was no obvious abnormality.`
    : `I had ${kind}; I was told something needed further review.`);
  return coarseFinding || (negative
    ? `我做过${kind}，医生说没有看到明显异常。`
    : `我做过${kind}，医生说还得再看看。`);
}

function missingAnswer(intent, index, language) {
  const knownTests = index.completedInvestigations.map((item) => modality(item.type, item.result));
  if (language === "en") {
    if (intent === "prior_investigations" && knownTests.length) return `I remember having ${unique(knownTests).join(" and ")}.`;
    if (intent === "prior_investigation_results_patient_aware" && index.resultSummaries.length) return joinSummaries(index.resultSummaries, language);
    if (intent === "prior_medication_for_current_problem" && index.longTermMedicationNegative) return "I do not take regular medication; I honestly cannot remember whether I took anything for this episode.";
    return {
      prior_medical_visit: "I'm not sure whether I saw a doctor for this before.",
      prior_investigations: "I'm not sure what tests I had before.",
      prior_investigation_results_patient_aware: "I don't remember being told the test result.",
      prior_diagnosis_patient_aware: "I don't remember what the doctor told me it was.",
      prior_treatment: "I'm not sure whether anything was done for it before.",
      prior_medication_for_current_problem: "I honestly cannot remember whether I took medicine for this.",
      treatment_response: "I honestly cannot remember whether it got better afterward."
    }[intent] || "I'm not sure about that.";
  }
  if (intent === "prior_investigations" && knownTests.length) return `我记得做过${unique(knownTests).join("和")}。`;
  if (intent === "prior_investigation_results_patient_aware" && index.resultSummaries.length) return joinSummaries(index.resultSummaries, language);
  if (intent === "prior_medication_for_current_problem" && index.longTermMedicationNegative) return "我平时没有长期服药；这次有没有用过药，我确实记不清了。";
  return {
    prior_medical_visit: "之前有没有去看过，我记不太准了。",
    prior_investigations: "之前有没有做过检查，我记不太准了。",
    prior_investigation_results_patient_aware: "具体结果我记不清了。",
    prior_diagnosis_patient_aware: "医生以前怎么说的，我记不清了。",
    prior_treatment: "之前有没有处理过，我记不太准了。",
    prior_medication_for_current_problem: "有没有用过药我确实记不清了。",
    treatment_response: "后来有没有好转，我确实记不清了。"
  }[intent] || "这个我不太清楚。";
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

function priorVisitAnswer(caseData, language) {
  const lines = sentences(caseData?.presentIllness?.priorCare, caseData?.patientAnswers?.priorCare, caseData?.raw?.symptomsDetail, caseData?.presentIllness?.onset);
  const priorVisit = lines.some((line) => {
    const history = line.replace(/(?:遂)?(?:来|至)我院(?:急诊|门诊)?(?:就诊|收入院)?/g, "");
    return /(?:当时)?(?:到|前往)?(?:当地|外院|社区)[^。]{0,20}(?:医院|门诊|急诊)[^。]{0,20}(?:看了|看过|就诊)/.test(history)
      || /(?:此前|之前|曾|多次)[^。]{0,40}(?:医院|门诊|急诊|医生)[^。]{0,20}(?:看了|看过|就诊|使用|治疗)/.test(history);
  });
  if (!priorVisit) return "";
  return language === "en" ? "I sought medical care for this before." : "我之前为这个问题去医院看过。";
}

function buildPatientKnowableFactIndex(caseData, language = "zh") {
  const caseId = String(caseData?.displayCaseId || caseData?.id || "");
  if (/^P\d{3}$/.test(caseId)) {
    const records = verifiedPatientKnowableRecords(caseData);
    const facts = Object.fromEntries(Object.keys(SLOT_BY_INTENT).map((intent) => [intent, ""]));
    if (language === "zh") {
      for (const record of records) facts[record.intent] = record.patientAwareZh;
    }
    const investigationRecords = records.filter((record) => record.intent === "prior_investigations");
    const resultRecords = records.filter((record) => record.intent === "prior_investigation_results_patient_aware");
    return {
      caseId,
      completedInvestigations: investigationRecords.flatMap((record) =>
        record.modalities.map((type) => ({ type, result: record.patientAwareZh }))
      ),
      resultSummaries: resultRecords.map((record) => record.patientAwareZh),
      explicitNoPriorInvestigations: records.some((record) => record.noPriorInvestigations),
      longTermMedicationNegative: false,
      facts,
      allowlistRecords: records
    };
  }
  const narrative = sourceNarrative(caseData);
  const currentProblemNarrative = sentences(caseData?.presentIllness?.onset, caseData?.raw?.symptomsDetail);
  const investigationNarrative = patientAwareInvestigationNarrative(caseData);
  const explicitNoPriorInvestigations = investigationNarrative.some((line) => NO_PRIOR_INVESTIGATION.test(line));
  const completedInvestigations = patientAwareInvestigations(investigationNarrative);
  const resultSummaries = unique(completedInvestigations.filter(isCompletedInvestigation).map((item) => investigationSummary(item, language)));
  const diagnosis = firstMatchingNarrative(narrative, /(?:被诊断为|医生说是|诊断过)/, /(?:否认|无|未)/);
  const treatment = firstMatchingNarrative(currentProblemNarrative, /(?:治疗|输液|抗菌药|抗生素|保守处理|导尿)/, /(?:未|没有|否认|尚未|无|癌|肿瘤|占位|病理|转移|分期|分级|评分|教师|标准答案|长期|慢性|降尿酸)/);
  const currentMedication = firstMatchingNarrative(currentProblemNarrative, /(?:用药|服药|吃药|抗菌药|抗生素|止痛药)/, /(?:未|没有|否认|尚未|无|癌|肿瘤|占位|病理|转移|分期|分级|评分|教师|标准答案|长期|慢性|降尿酸)/);
  const response = firstMatchingNarrative(currentProblemNarrative, /(?:治疗|用药|服药|吃药|抗菌药|抗生素|输液|处理)[^。]{0,60}(?:缓解|好转|无效|复发)|(?:缓解|好转|无效|复发)[^。]{0,60}(?:治疗|用药|服药|吃药|抗菌药|抗生素|输液|处理)/, new RegExp(`${UNSAFE_NARRATIVE.source}|${ABSENT_TREATMENT.source}`));
  return {
    caseId,
    completedInvestigations,
    resultSummaries,
    explicitNoPriorInvestigations,
    longTermMedicationNegative: /(?:无长期用药|没有长期服药|不服用长期药)/.test(String(caseData?.medication || caseData?.sourceFacts?.medication || "")),
    facts: {
      prior_medical_visit: priorVisitAnswer(caseData, language),
      prior_investigations: completedInvestigations.length
        ? missingAnswer("prior_investigations", { completedInvestigations, resultSummaries }, language)
        : explicitNoPriorInvestigations ? (language === "en" ? "I did not have any tests before." : "之前没有做过检查。") : "",
      prior_investigation_results_patient_aware: resultSummaries.length
        ? joinSummaries(resultSummaries, language)
        : explicitNoPriorInvestigations ? (language === "en" ? "I did not have a test result before." : "之前没做过检查，也没有检查结果。") : "",
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
        else if (index.explicitNoPriorInvestigations) {
          answer = language === "en" ? "I did not have any tests before." : "之前没有做过检查。";
          state = FACT_STATES.EXACT_VALUE;
        } else {
          answer = language === "en"
            ? `I'm not sure whether I had ${requested} before.`
            : `之前有没有做过${requested}，我记不太准了。`;
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
