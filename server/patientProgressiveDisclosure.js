"use strict";

const { FACT_STATES, answerPlanFromRendered, renderAnswerPlan } = require("../src/lib/patientFactState.js");

const historyLabels = {
  hypertension_history: /高血压|hypertension/i,
  diabetes_history: /糖尿病|diabetes/i,
  coronary_history: /冠心病|coronary|heart disease/i,
  stroke_history: /脑卒中|脑梗|中风|stroke/i,
  liver_disease_history: /肝病|肝炎|liver disease|hepatitis/i,
  tuberculosis_history: /结核|tuberculosis|\bTB\b/i,
  previous_stone: /结石|stone/i,
  previous_urinary_infection: /尿路感染|UTI|urinary infection/i,
  previous_malignancy: /肿瘤|癌|cancer|malignancy/i
};

const clinicalDisclosurePattern = /(?:\d+(?:\.\d+)?|[一二三四五六七八九十两]+个?)\s*(?:天|周|月|年|小时|次|片|毫克|mg|ml|years?|months?|weeks?|days?|hours?|times?)|每天|每日|全程|起始|终末|间断|持续|洗肉水|茶色|酱油色|暗红|鲜红|血块|尿频|尿急|尿痛|腰痛|发热|发烧|寒战|运动|劳累|外伤|高血压|糖尿病|冠心病|脑卒中|肝病|结核|结石|尿路感染|肿瘤|癌|药|片子|尿检|检查|报告|诊断|治疗|手术|intermittent|continuous|clots?|frequency|urgency|dysuria|flank pain|fever|exercise|trauma|hypertension|diabetes|coronary|stroke|liver disease|tuberculosis|stones?|infection|cancer|medicat|medicine|test|scan|report|diagnos|treat|surgery/i;

function validatePatientDisclosureOutput(reply, allowedAnswer) {
  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ").replace(/[。！？.!?]+$/u, "");
  const replyText = clean(reply);
  const allowedText = clean(allowedAnswer);
  if (!replyText || !allowedText) return { ok: false, reason: "missing_disclosure_text" };
  if (replyText === allowedText) return { ok: true, reason: "exact_governed_answer" };
  const index = replyText.indexOf(allowedText);
  if (index < 0) return { ok: false, reason: "governed_answer_not_verbatim" };
  const residue = `${replyText.slice(0, index)} ${replyText.slice(index + allowedText.length)}`.trim();
  return clinicalDisclosurePattern.test(residue)
    ? { ok: false, reason: "unauthorized_clinical_disclosure" }
    : { ok: true, reason: "nonclinical_patient_wording_only" };
}

function pastMedicalDuration(caseData, intent, language) {
  const source = String(caseData?.patientFacingProfile?.knownPastHistory || caseData?.pastHistory || "");
  const label = historyLabels[intent];
  if (!label) return "";
  const section = source.split(/[。；;]/).find((part) => label.test(part)) || "";
  const duration = section.match(/(?:\d+|[一二三四五六七八九十]+)(?:余|多)?年|好几年|多年/i)?.[0] || "";
  if (!duration) return language === "en" ? "I cannot recall exactly how many years it has been." : "具体几年我记不太清了。";
  return language === "en" ? `It has been about ${duration}.` : `有${duration}了。`;
}

function presentingClue(caseData, original, language) {
  const source = [
    caseData?.patientFacingProfile?.chiefComplaint,
    caseData?.studentChiefComplaint,
    caseData?.chiefComplaint,
    original
  ].filter(Boolean).join(" ");
  const microscopic = /体检|尿检|潜血|镜下|health.?check|urinalysis|microscopic/i.test(source);
  const visible = /血尿|肉眼|小便.{0,8}(?:红|血)|尿.{0,8}(?:红|血)|茶色|可乐色|酱油色|hematuria|red urine|blood in (?:my |the )?urine/i.test(source);
  if (language === "en") {
    if (microscopic) return "A urine test during a checkup showed blood.";
    if (visible) return "My urine has looked a little red lately.";
    return "Urination has not felt right lately.";
  }
  if (microscopic) return "我体检的时候尿检说有血。";
  if (visible) return "我最近小便看着有点红。";
  return "我最近小便有点不舒服。";
}

function applyPatientProgressiveDisclosure({ caseData, matched, language = "zh", contextResolution = null }) {
  if (!matched?.answerPlans?.length) return matched;
  const answerPlans = matched.answerPlans.map((plan) => {
    if (
      contextResolution?.reason === "contextual_past_medical_history_duration"
      && contextResolution.sourceIntent === plan.intent
    ) {
      const renderedAnswer = pastMedicalDuration(caseData, plan.intent, language);
      return answerPlanFromRendered({
        ...plan,
        intent: `${plan.intent}_duration`,
        factState: /记不|cannot recall/i.test(renderedAnswer) ? FACT_STATES.MISSING : FACT_STATES.EXACT_VALUE,
        renderedAnswer
      });
    }
    if (plan.intent !== "chief_complaint") return plan;
    return answerPlanFromRendered({
      ...plan,
      renderedAnswer: presentingClue(caseData, renderAnswerPlan(plan), language)
    });
  });
  const authorizedIntents = [...new Set(answerPlans.flatMap((plan) => {
    if (plan.intent === "chief_complaint") return ["presenting_clue"];
    if (plan.intent === "past_medical_history_summary" && matched.pastMedicalHistoryIntents?.length) {
      return matched.pastMedicalHistoryIntents;
    }
    return [plan.intent];
  }))].filter((intent, _index, intents) => intent !== "medication_name" || !intents.includes("medication_list"));
  return {
    ...matched,
    replyText: [...new Set(answerPlans.map(renderAnswerPlan).filter(Boolean))].join("\n"),
    answerPlans,
    disclosurePlan: {
      authorizedIntents,
      mode: "question_triggered",
      contextEntities: authorizedIntents.filter((intent) => /_history$|^previous_/.test(intent)),
      contextReason: contextResolution?.reason || ""
    }
  };
}

module.exports = { applyPatientProgressiveDisclosure, validatePatientDisclosureOutput };
