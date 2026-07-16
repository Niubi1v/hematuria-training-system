const bilingualSlots = require("../data/patient_slots_bilingual.json");
const { asksIndependentGeneralPain, matchPriorityCanonicalIntents } = require("../src/lib/patientIntentCatalog.js");

const matchers = [
  ["chief_complaint", /哪里不舒服|为什么来|主诉|怎么回事|what brings you|what is wrong|main complaint/i],
  ["hematuria_visibility", /肉眼|镜下|看得见|尿潜血|visible blood|gross hematuria|microscopic|urine test.*blood/i],
  ["hematuria_onset", /什么时候|多久|几天|几周|几个月|起病|when did|how long|when.*start|onset/i],
  ["hematuria_frequency", /间断|持续|每次|频率|反复|intermittent|continuous|every time|how often|frequency/i],
  ["hematuria_phase", /全程|开始红|起始|终末|快尿完|最后几滴|一直红|throughout|whole stream|beginning.*(?:red|end)|from beginning to end|terminal|end of urination|last drops/i],
  ["urine_color", /鲜红|暗红|洗肉水|茶色|酱油色|什么颜色|尿色|bright red|dark red|tea.colou?r|cola.colou?r|urine colou?r/i],
  ["clots", /血块|血凝块|凝血块|blood clots?/i],
  ["dysuria", /尿痛|小便疼|排尿痛|烧灼|dysuria|burning.*urina|painful urination|hurt.*urinate/i],
  ["flank_pain", /腰痛|肾区痛|flank pain|loin pain/i],
  ["renal_colic", /肾绞痛|绞痛|renal colic|colicky pain/i],
  ["radiating_pain", /放射痛|放射到|radiat.*pain|pain.*groin/i],
  ["pain", /疼不疼|有没有痛|疼痛|\bpain\b|does it hurt|any pain/i],
  ["urinary_frequency", /尿频|小便次数多|urinary frequency|frequent urination|urinate often|urinat(?:e|ing) more often/i],
  ["urinary_urgency", /尿急|憋不住|\burgency\b|urgent need|cannot hold urine/i],
  ["voiding_difficulty", /排尿困难|尿线细|尿流中断|尿不尽|排尿费力|difficulty urinating|weak stream|incomplete emptying|straining/i],
  ["retention", /尿潴留|尿不出来|urinary retention|cannot pass urine|unable to pass urine/i],
  ["fever_chills", /发热|发烧|寒战|畏寒|体温|fever|chills?|rigors?|temperature/i],
  ["glomerular_features", /泡沫尿|水肿|眼睑肿|下肢肿|foamy urine|frothy urine|edema|oedema|swelling/i],
  ["recent_uri", /感冒|咽痛|扁桃体炎|cold|sore throat|tonsillitis|upper respiratory/i],
  ["triggers", /运动|劳累|受凉|外伤|性生活|导尿|尿路操作|exercise|exertion|trauma|sexual activity|catheter|urinary procedure/i],
  ["prior_care", /以前看过医生|之前看过医生|之前治疗过|接受过治疗|seen a doctor before|previous treatment|treated for this before/i],
  ["general_condition", /胃口|食欲|睡眠|大便|体重|消瘦|appetite|sleep|bowel|stool|weight loss|lost weight/i],
  ["bleeding_tendency", /鼻出血|牙龈出血|瘀斑|紫癜|nosebleed|gum bleeding|bruis|purpura/i]
];

function classifyDysuria(answerZh, answerEn) {
  const zh = String(answerZh || "").replace(/\s+/g, "");
  const en = String(answerEn || "").toLowerCase();
  const zhValue = /无痛性|无排尿不适|(?:无|没有|否认)[^。；,，]*(?:尿痛|小便痛|排尿痛|烧灼)|(?:小便|排尿)(?:时)?不(?:痛|疼)/.test(zh)
    ? false
    : /尿痛|小便(?:时)?(?:刺痛|疼|痛)|排尿(?:时)?(?:烧灼|疼|痛)/.test(zh) ? true : "unknown";
  const enValue = /does not hurt|doesn't hurt|not hurt|not painful|no dysuria|without dysuria|do not have dysuria/.test(en)
    ? false
    : /hurt|painful|dysuria|burn|sting/.test(en) ? true : "unknown";
  return zhValue === enValue ? zhValue : "unknown";
}

function classifyHematuriaPhase(answerZh, answerEn) {
  const zh = String(answerZh || "").replace(/\s+/g, "");
  const en = String(answerEn || "").toLowerCase();
  const ambiguousZh = /需追问|非典型|不按起始|可表现|多为|可伴/.test(zh);
  const zhValue = ambiguousZh ? "unknown"
    : /^全程血尿$|全程(?:尿色)?(?:变红|发红|红)|从头到尾/.test(zh) ? "whole"
      : /^终末血尿$|终末血尿为主|快尿完.*红|最后(?:一段|几滴|才).*红/.test(zh) ? "terminal"
        : /^起始血尿$|起始血尿为主|刚开始.*红/.test(zh) ? "initial" : "unknown";
  const enValue = /throughout|whole (?:urinary )?stream|start to finish/.test(en) ? "whole"
    : /near the end|terminal|last drops|only at the end/.test(en) ? "terminal"
      : /initial|only at the beginning|start.*then clear/.test(en) ? "initial" : "unknown";
  return zhValue === enValue ? zhValue : "unknown";
}

function naturalDysuriaAnswer(value, language) {
  if (value === true) return language === "en" ? "Yes, it hurts when I urinate." : "有，尿的时候会痛。";
  if (value === false) return language === "en" ? "No, it does not hurt when I urinate." : "没有，小便时不痛。";
  return language === "en" ? "I have not been able to say for sure whether urination hurts." : "小便时是否疼，我现在说不准。";
}

function naturalPhaseAnswer(phase, language, intentKeys, question) {
  const asked = new Set(intentKeys);
  const asksSingle = asked.size === 1;
  const asksInitial = asked.has("initial_hematuria");
  const asksTerminal = asked.has("terminal_hematuria");
  const negatedTerminalAssumption = /不是只有最后|not only.*(?:end|last)/i.test(String(question || ""));
  if (phase === "whole") {
    if (asksSingle && asksInitial) return language === "en"
      ? "No, it is not limited to the beginning; it stays red from start to finish."
      : "不是只在刚开始红，从开始尿到最后颜色都红。";
    if (asksSingle && asksTerminal) return language === "en"
      ? "No, it is not limited to the end; it stays red from start to finish."
      : "不是只在最后一段红，从开始尿到最后颜色都红。";
    return language === "en" ? "Yes, it is red from the start to the end of urination." : "是的，从开始尿到最后颜色都红。";
  }
  if (phase === "terminal") {
    if (negatedTerminalAssumption) return language === "en"
      ? "No, it is mainly the last part of urination that turns red."
      : "不是，主要就是快尿完的那一段发红。";
    if (asksSingle && asksTerminal) return language === "en"
      ? "Yes, it mainly turns red near the end of urination."
      : "是的，主要是快尿完的时候发红。";
    if (asksSingle && asksInitial) return language === "en"
      ? "No, it is not red at the beginning; it mainly turns red near the end."
      : "不是刚开始红，主要是快尿完的时候发红。";
    return language === "en" ? "No, it is not red throughout; it mainly turns red near the end." : "不是全程红，主要是快尿完的时候发红。";
  }
  if (phase === "initial") {
    if (asksSingle && asksInitial) return language === "en"
      ? "Yes, it is mainly red at the beginning of urination."
      : "是的，主要是刚开始尿的时候发红。";
    if (asksSingle && asksTerminal) return language === "en"
      ? "No, it is not red at the end; it is mainly red at the beginning."
      : "不是最后才红，主要是刚开始尿的时候发红。";
    return language === "en" ? "No, it is not red throughout; it is mainly red at the beginning." : "不是全程红，主要是刚开始尿的时候发红。";
  }
  return language === "en" ? "I did not clearly notice which part of urination was red." : "我没仔细看清是刚开始、最后，还是全程都红。";
}

function factValueForIntent(intentKey, classification) {
  if (intentKey === "dysuria") return classification;
  if (classification === "unknown") return "unknown";
  if (intentKey === "whole_stream_hematuria") return classification === "whole";
  if (intentKey === "initial_hematuria") return classification === "initial";
  if (intentKey === "terminal_hematuria") return classification === "terminal";
  return "unknown";
}

function matchCanonicalPatientFacts(caseId, question, language = "zh") {
  const caseSlots = bilingualSlots[caseId];
  if (!caseSlots) return null;
  const priorityMatches = matchPriorityCanonicalIntents(question, language);
  const prioritySourceSlots = new Set(priorityMatches.map((item) => item.sourceSlotId));
  const legacyMatchedSlotIds = matchers.filter(([, pattern]) => pattern.test(question)).map(([slotId]) => slotId);
  const matchedSlotIds = [...new Set([...prioritySourceSlots, ...legacyMatchedSlotIds])];
  if (prioritySourceSlots.has("dysuria") && !asksIndependentGeneralPain(question, language)) {
    const painIndex = matchedSlotIds.indexOf("pain");
    if (painIndex >= 0) matchedSlotIds.splice(painIndex, 1);
  }
  const hasSpecificPain = matchedSlotIds.some((slotId) => ["flank_pain", "renal_colic", "radiating_pain"].includes(slotId));
  const explicitlyAsksGeneralPain = /疼不疼|有没有痛|有无疼痛|其他.*痛|别的.*痛|any (?:other )?pain|other pain|pain elsewhere|general pain|does it hurt/i.test(question);
  const slotIds = hasSpecificPain && !explicitlyAsksGeneralPain
    ? matchedSlotIds.filter((slotId) => slotId !== "pain")
    : matchedSlotIds;
  if (!slotIds.length) return null;
  const factValues = {};
  let dysuriaValue = "unknown";
  let phaseValue = "unknown";
  if (prioritySourceSlots.has("dysuria")) {
    dysuriaValue = classifyDysuria(caseSlots.dysuria?.patientAnswerZh, caseSlots.dysuria?.patientAnswerEn);
  }
  if (prioritySourceSlots.has("hematuria_phase")) {
    phaseValue = classifyHematuriaPhase(caseSlots.hematuria_phase?.patientAnswerZh, caseSlots.hematuria_phase?.patientAnswerEn);
  }
  for (const item of priorityMatches) {
    factValues[item.intentKey] = factValueForIntent(item.intentKey, item.sourceSlotId === "dysuria" ? dysuriaValue : phaseValue);
  }
  const answers = slotIds.map((slotId) => {
    if (slotId === "dysuria" && prioritySourceSlots.has(slotId)) return naturalDysuriaAnswer(dysuriaValue, language);
    if (slotId === "hematuria_phase" && prioritySourceSlots.has(slotId)) {
      return naturalPhaseAnswer(phaseValue, language, priorityMatches.map((item) => item.intentKey), question);
    }
    return caseSlots[slotId]?.[language === "en" ? "patientAnswerEn" : "patientAnswerZh"];
  }).filter(Boolean);
  if (!answers.length) return null;
  const matchedFacts = [
    ...priorityMatches.map((item) => item.intentKey),
    ...slotIds.filter((slotId) => !prioritySourceSlots.has(slotId))
  ];
  return {
    replyText: [...new Set(answers)].join("\n"),
    matchedSlotIds: slotIds,
    matchedFacts: [...new Set(matchedFacts)],
    factValues,
    answerSource: "case_bilingual_slot",
    confidence: Object.values(factValues).some((value) => value === "unknown") ? 0.5 : 0.99,
    safetyFlags: [],
    fallbackReason: ""
  };
}

module.exports = { matchCanonicalPatientFacts };
