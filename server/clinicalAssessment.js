const canonicalSlots = require("../data/patient_slots_bilingual.json");

const filler = /^(?:无|没有|不知道|不清楚|同上|略|正常|随便|asdf|test|none|nothing|不知道写什么)[。.!！\s]*$/i;
const templateSpam = /(肿瘤[、,，；; ]*结石[、,，；; ]*感染[、,，；; ]*肾小球|诊断诊断诊断|治疗治疗治疗)/i;
const genericDifferentialSpam = /^(?:肿瘤|结石|感染|肾小球)(?:[；;、,，\s]+(?:肿瘤|结石|感染|肾小球)){1,}$/i;
const unsafeTreatment = /(感染.{0,12}(?:直接|立即).{0,8}(?:碎石|手术取石)|未控制感染.{0,8}(?:碎石|取石)|不需(?:引流|抗感染)|仅观察|无需处理|停用所有抗凝且无需评估)/i;

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function terms(value) {
  const stop = new Set(["患者", "考虑", "可能", "需要", "进行", "评估", "检查", "治疗", "相关", "以及", "进一步", "the", "and", "with", "for"]);
  return [...new Set(String(value || "").match(/[\u3400-\u9fff]{2,8}|[a-zA-Z]{3,}/g) || [])]
    .map((item) => item.toLowerCase()).filter((item) => !stop.has(item));
}

function meaningful(text, min = 4) {
  const value = String(text || "").trim();
  return value.length >= min && !filler.test(value) && !templateSpam.test(value);
}

function conceptMatch(answer, reference, minimum = 1) {
  if (!meaningful(answer)) return [];
  const haystack = normalize(answer);
  return terms(reference).filter((term) => haystack.includes(normalize(term))).slice(0, 12).filter(Boolean).slice(0, Math.max(minimum, 12));
}

function diagnosisAliases(caseData) {
  const expected = String(caseData.diagnosis || "");
  const aliases = [expected, caseData.clinical?.primaryProblem, caseData.clinical?.diagnosticReasoning]
    .flatMap((value) => String(value || "").split(/[；;、,，\n/]/)).map((value) => value.replace(/^\d+[、.．]?/, "").trim()).filter((value) => value.length >= 2);
  if (/膀胱.*结石/.test(expected)) aliases.push("膀胱结石");
  if (/前列腺.*增生/.test(expected)) aliases.push("前列腺增生", "BPH");
  if (/IgA/i.test(expected)) aliases.push("IgA肾病", "iga nephropathy");
  return [...new Set(aliases)];
}

function isCorrectDiagnosis(caseData, answer) {
  const value = normalize(answer);
  return meaningful(answer) && diagnosisAliases(caseData).some((alias) => {
    const expected = normalize(alias);
    return expected.length >= 3 && (value.includes(expected) || expected.includes(value));
  });
}

function splitItems(value) {
  return [...new Set(String(value || "").split(/[；;、,，\n]|\band\b/i).map((item) => item.trim()).filter((item) => meaningful(item, 2)))];
}

function validateDiagnosis(caseData, submission, at, sequence) {
  const events = [];
  const warnings = [];
  const primary = String(submission.diagnosis || "");
  const evidence = String(submission.diagnosticEvidence || "");
  if (isCorrectDiagnosis(caseData, primary)) {
    const evidenceHits = conceptMatch(evidence, `${caseData.clinical?.keyHistory || ""} ${caseData.clinical?.diagnosticReasoning || ""}`);
    if (evidenceHits.length >= 2) events.push({ eventId: `srv-${sequence}-diagnosis-primary`, type: "diagnosis_supported", actionId: "primary", stageNo: 3, at, text: `${primary}: ${evidence}`, metadata: { validated: true, matches: evidenceHits } });
    else warnings.push("诊断方向正确，但诊断依据缺少病例特异证据。 ");
  } else if (meaningful(primary)) warnings.push(`最可能诊断与本病例关键事实不符：${primary}`);

  const references = [...(caseData.differentialDiagnosis || []), ...splitItems(caseData.clinical?.mustDifferentials || "")];
  const accepted = templateSpam.test(String(submission.differentials || "")) || genericDifferentialSpam.test(String(submission.differentials || "").trim()) ? [] : splitItems(submission.differentials).filter((item) => references.some((reference) => {
    const left = normalize(item); const right = normalize(reference); return left.length >= 2 && right.length >= 2 && (left.includes(right) || right.includes(left));
  })).slice(0, 3);
  accepted.forEach((item, index) => events.push({ eventId: `srv-${sequence}-diagnosis-diff-${index}`, type: "diagnosis_supported", actionId: `differential_${index + 1}`, stageNo: 3, at, text: item, metadata: { validated: true } }));
  if (accepted.length < 3) warnings.push(`合理鉴别诊断仅验证通过${accepted.length}项，需结合病例补足至少3项。`);

  const confirmationHits = conceptMatch(submission.confirmatoryTests, `${caseData.clinical?.requiredLabs || ""} ${caseData.clinical?.imagingAndProcedures || ""}`);
  if (confirmationHits.length >= 2) events.push({ eventId: `srv-${sequence}-diagnosis-confirmation`, type: "diagnosis_supported", actionId: "confirmation", stageNo: 3, at, text: submission.confirmatoryTests, metadata: { validated: true, matches: confirmationHits } });
  return { events, warnings };
}

function validateTreatment(caseData, submission, at, sequence) {
  const events = [];
  const warnings = [];
  const fields = [
    ["immediate", submission.immediateTreatment, caseData.clinical?.immediateTreatment],
    ["etiologic", submission.admissionTreatment, `${caseData.clinical?.immediateTreatment || ""} ${caseData.clinical?.definitiveTreatment || ""}`],
    ["definitive", submission.definitiveTreatment, caseData.clinical?.definitiveTreatment],
    ["perioperative", submission.perioperativePreparation, caseData.perioperativePlan || caseData.clinical?.perioperative || caseData.clinical?.consultQuestions]
  ];
  for (const [actionId, answer, reference] of fields) {
    if (!meaningful(answer, 8)) continue;
    if (unsafeTreatment.test(String(answer))) {
      warnings.push(`危险或禁忌处理：${String(answer).slice(0, 80)}`);
      events.push({ eventId: `srv-${sequence}-critical-${actionId}`, type: "critical_error", actionId, stageNo: actionId === "perioperative" ? 6 : 5, at, text: warnings.at(-1), metadata: { validated: true } });
      continue;
    }
    const hits = conceptMatch(answer, reference);
    if (hits.length >= 2) events.push({ eventId: `srv-${sequence}-treatment-${actionId}`, type: "treatment_action", actionId, stageNo: actionId === "perioperative" ? 6 : 5, at, text: answer, metadata: { validated: true, matches: hits } });
    else warnings.push(`${actionId}处理未与本病例标准路径形成足够对应。`);
  }
  for (const [actionId, answer, reference] of [["followup", submission.followUp, caseData.clinical?.followUp], ["education", submission.patientEducation, `${caseData.clinical?.followUp || ""} ${caseData.teachingPoints?.join(" ") || ""}`]]) {
    const hits = conceptMatch(answer, reference);
    if (hits.length >= 2) events.push({ eventId: `srv-${sequence}-safety-${actionId}`, type: "safety_net_provided", actionId, stageNo: 5, at, text: answer, metadata: { validated: true, matches: hits } });
  }
  return { events, warnings };
}

function matchHistoryQuestion(caseId, question, at, sequence) {
  const facts = canonicalSlots[caseId] || {};
  const patterns = {
    hematuria_visibility: /肉眼|镜下|看得见|gross|microscopic|visible blood/i, hematuria_onset: /什么时候|多久|起病|how long|when.*start|onset/i,
    hematuria_frequency: /间断|持续|反复|频率|intermittent|continuous|how often/i, hematuria_phase: /全程|起始|终末|最后几滴|一直红|whole stream|throughout|terminal|last drops/i,
    urine_color: /颜色|鲜红|暗红|洗肉水|茶色|酱油|colou?r|bright red|dark red|tea|cola/i, clots: /血块|凝血块|clots?/i,
    dysuria: /尿痛|小便疼|烧灼|dysuria|burning|painful urination/i, urinary_frequency: /尿频|次数多|frequency|urinate often/i,
    urinary_urgency: /尿急|憋不住|urgency|cannot hold/i, flank_pain: /腰痛|肾区痛|flank|loin/i, fever_chills: /发热|发烧|寒战|畏寒|fever|chills|rigors/i,
    glomerular_features: /泡沫尿|水肿|眼睑肿|下肢肿|foamy|frothy|edema|oedema|swelling/i, recent_uri: /感冒|咽痛|扁桃体|cold|sore throat|tonsillitis/i,
    smoking: /吸烟|抽烟|smok/i, occupation_exposure: /职业|染料|橡胶|皮革|化工|occupational|dye|rubber|leather|chemical/i,
    anticoagulant: /抗凝|华法林|利伐沙班|anticoagul|warfarin|rivaroxaban/i, antiplatelet: /阿司匹林|氯吡格雷|抗血小板|aspirin|clopidogrel|antiplatelet/i,
    stone_history: /结石史|以前.*结石|history.*stone|stones? before/i, uti_history: /感染史|尿路感染|UTI|urinary tract infection/i,
    family_history: /家族|遗传|family|hereditary/i, gynecologic_contamination: /月经|阴道|妊娠|menstru|vaginal|pregnan/i, bleeding_tendency: /鼻出血|牙龈|瘀斑|紫癜|nosebleed|gum bleeding|bruis|purpura/i
  };
  return Object.entries(patterns).filter(([slotId, pattern]) => facts[slotId] && pattern.test(String(question || ""))).map(([slotId], index) => ({
    eventId: `srv-${sequence}-history-${slotId}-${index}`, type: "slot_answered", slotId, stageNo: 1, at, text: String(question).slice(0, 240), metadata: { validated: true }
  }));
}

function validateStage(caseData, stageKey, submission) {
  const at = new Date().toISOString();
  const sequence = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (stageKey === "diagnosis") return validateDiagnosis(caseData, submission, at, sequence);
  if (["treatment", "perioperative"].includes(stageKey)) return validateTreatment(caseData, submission, at, sequence);
  if (stageKey === "debrief" && meaningful(submission.debriefReflection, 30)) return { events: [{ eventId: `srv-${sequence}-reflection`, type: "reflection_submitted", actionId: "quality", stageNo: 7, at, text: submission.debriefReflection, metadata: { validated: true } }], warnings: [] };
  return { events: [], warnings: meaningful(JSON.stringify(submission), 8) ? [] : ["作答内容不足，暂未形成可验证的临床证据。"] };
}

module.exports = { isCorrectDiagnosis, matchHistoryQuestion, meaningful, normalize, validateDiagnosis, validateStage, validateTreatment };
