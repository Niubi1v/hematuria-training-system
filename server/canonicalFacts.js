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

function classifyBinaryPair(answerZh, answerEn, rules) {
  const zh = String(answerZh || "").replace(/\s+/g, "");
  const en = String(answerEn || "").toLowerCase();
  if (rules.zhUnknown?.test(zh) || rules.enUnknown?.test(en)) return "unknown";
  const zhValue = rules.zhNegative.test(zh) ? false : rules.zhPositive.test(zh) ? true : "unknown";
  const enValue = rules.enNegative.test(en) ? false : rules.enPositive.test(en) ? true : "unknown";
  return zhValue === enValue ? zhValue : "unknown";
}

function classifyPriorityIntent(intentKey, slot) {
  const answerZh = slot?.patientAnswerZh;
  const answerEn = slot?.patientAnswerEn;
  if (intentKey === "dysuria") return classifyDysuria(answerZh, answerEn);
  if (["whole_stream_hematuria", "initial_hematuria", "terminal_hematuria"].includes(intentKey)) {
    return classifyHematuriaPhase(answerZh, answerEn);
  }
  const rules = {
    urinary_frequency: {
      zhUnknown: /没(?:有)?特别注意|未注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*尿频|小便次数(?:和平时一样|没有增多)/, zhPositive: /尿频|小便次数(?:多|增多)|尿得勤|一会儿就想尿|半小时.*(?:尿|解手)|\d+分钟.*(?:尿|次)/,
      enNegative: /not been urinating more often|do not urinate more often|no urinary frequency/, enPositive: /have been urinating more often|frequent urination|urinate more often/
    },
    urinary_urgency: {
      zhUnknown: /没(?:有)?特别注意|未注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*尿急|不憋不住/, zhPositive: /尿急|憋不住|急迫|来不及上厕所/,
      enNegative: /no urinary urgency|do not have urgency|can hold (?:my )?urine/, enPositive: /sudden urgent need|urinary urgency|cannot hold (?:my )?urine|need to rush/
    },
    blood_clots: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*血块/, zhPositive: /血块|血凝块|凝血块|血疙瘩/,
      enNegative: /no blood clots|do not have (?:any )?blood clots/, enPositive: /have noticed blood clots|blood clots in/
    },
    flank_pain: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*(?:腰痛|腰背部.*痛|肾区痛)/, zhPositive: /腰痛|腰疼|腰部.*(?:痛|疼)|肾区.*(?:痛|疼)|腰背部.*(?:痛|疼)/,
      enNegative: /do not have flank pain|no flank pain|without flank pain/, enPositive: /have pain in my flank|flank pain|loin pain/
    },
    fever: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*(?:发热|发烧|寒战)/, zhPositive: /发热|发烧|高热|体温.*(?:高|度)|寒战/,
      enNegative: /not had fever|no fever|without fever/, enPositive: /have had fever|fever|high temperature/
    },
    foamy_urine: {
      zhUnknown: /没(?:有)?注意|未注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*泡沫尿/, zhPositive: /泡沫尿|尿.*泡沫|尿起泡/,
      enNegative: /no foamy urine|urine is not foamy/, enPositive: /noticed unusually foamy urine|foamy urine|frothy urine/
    },
    edema: {
      zhUnknown: /没(?:有)?注意|未注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*(?:水肿|眼睑肿|下肢肿|腿肿)/, zhPositive: /水肿|眼睑肿|眼皮肿|下肢肿|腿肿|脚肿/,
      enNegative: /no (?:edema|oedema|swelling)|not swollen/, enPositive: /have had swelling|edema|oedema|swollen|puffy eyes/
    },
    weak_stream: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*(?:尿线细|尿流弱)|尿线正常/, zhPositive: /尿线(?:变)?细|尿流弱|尿得没劲|尿柱细/,
      enNegative: /no weak stream|urine flow is normal/, enPositive: /weak (?:urinary )?stream|thin stream|poor urine flow/
    },
    incomplete_emptying: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*尿不尽|排尿很干净/, zhPositive: /尿不尽|没尿干净|排不干净|尿完还想尿/,
      enNegative: /no incomplete emptying|bladder feels empty/, enPositive: /incomplete emptying|does not feel empty|still feel urine left/
    },
    urinary_retention: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*尿潴留|没有尿不出来/, zhPositive: /尿潴留|尿不出来|完全排不出尿/,
      enNegative: /not had urinary retention|no urinary retention/, enPositive: /cannot pass urine|unable to (?:pass urine|urinate)|urinary retention/
    },
    nocturia: {
      zhUnknown: /未诉|需追问|没(?:有)?注意|不详/, enUnknown: /not noticed|not sure|do not know/,
      zhNegative: /(?:无|没有|否认)[^。；,，]*夜尿|晚上不起夜/, zhPositive: /夜尿\d|夜尿[^。；,，]*(?:次|增多)|晚上起夜|夜间小便/,
      enNegative: /no nocturia|do not get up at night/, enPositive: /nocturia|get up at night|urinate during the night|night-time urination/
    }
  }[intentKey];
  return rules ? classifyBinaryPair(answerZh, answerEn, rules) : "unknown";
}

function unknownFactReason(slot) {
  const zh = String(slot?.patientAnswerZh || "");
  const en = String(slot?.patientAnswerEn || "");
  if (/未诉|需追问|提交前隐藏|评分/.test(zh)) return "unsafe_deterministic_answer";
  if (/没(?:有)?注意|未注意|not noticed|not sure|do not know/i.test(`${zh} ${en}`)) return "patient_not_observed";
  if (/非典型|不按起始|可表现|多为|可伴|不详/.test(zh)) return "source_ambiguous";
  return "bilingual_value_mismatch";
}

function naturalDysuriaAnswer(value, language) {
  if (value === true) return language === "en" ? "Yes, it hurts when I urinate." : "有，尿的时候会痛。";
  if (value === false) return language === "en" ? "No, it does not hurt when I urinate." : "没有，小便时不痛。";
  return language === "en" ? "I have not been able to say for sure whether urination hurts." : "小便时是否疼，我现在说不准。";
}

const booleanAnswerTemplates = {
  urinary_frequency: { zh: ["有，小便次数比平时多。", "没有，小便次数和平时差不多。", "具体小便次数我没有数清。"], en: ["Yes, I urinate more often than usual.", "No, I do not urinate more often than usual.", "I have not kept a clear count of how often I urinate."] },
  urinary_urgency: { zh: ["有，尿意来时会比较急。", "没有，没有突然憋不住尿。", "有没有尿急，我之前没特别留意。"], en: ["Yes, I sometimes get a sudden urgent need to urinate.", "No, I do not get a sudden urgent need to urinate.", "I have not paid enough attention to whether I get urinary urgency."] },
  blood_clots: { zh: ["有，我在尿里看到过血块。", "没有，我没有看到血块。", "尿里有没有血块，我之前没仔细看。"], en: ["Yes, I have seen blood clots in my urine.", "No, I have not seen blood clots in my urine.", "I did not look closely enough to tell whether there were blood clots."] },
  flank_pain: { zh: ["有，腰侧会疼。", "没有，没有明显腰痛。", "腰侧有没有疼，我现在说不准。"], en: ["Yes, I have pain in my flank.", "No, I do not have flank pain.", "I cannot say for sure whether I have flank pain."] },
  fever: { zh: ["有，出现过发热。", "没有，没有发热。", "有没有发热，我之前没有量清楚。"], en: ["Yes, I have had a fever.", "No, I have not had a fever.", "I did not measure clearly enough to know whether I had a fever."] },
  foamy_urine: { zh: ["有，小便里的泡沫比较明显。", "没有，没有明显泡沫尿。", "尿里泡沫多不多，我之前没特别注意。"], en: ["Yes, my urine has looked unusually foamy.", "No, I have not had noticeably foamy urine.", "I have not paid close attention to whether my urine was foamy."] },
  edema: { zh: ["有，眼皮或腿脚出现过肿胀。", "没有，没有明显水肿。", "有没有水肿，我之前没特别注意。"], en: ["Yes, I have had swelling around my eyes or legs.", "No, I have not had noticeable swelling.", "I have not paid close attention to whether I had swelling."] },
  weak_stream: { zh: ["有，小便的尿线比较细。", "没有，尿线没有变细。", "尿线是不是变细，我之前没特别留意。"], en: ["Yes, my urine stream has become weak.", "No, my urine stream has not become weak.", "I have not paid close attention to whether my urine stream became weak."] },
  incomplete_emptying: { zh: ["有，尿完后还会觉得没排干净。", "没有，尿完后没有尿不尽的感觉。", "尿完是否排干净，我之前没特别留意。"], en: ["Yes, I still feel that my bladder has not emptied after urinating.", "No, I do not feel that urine is left after I finish.", "I have not paid close attention to whether my bladder felt completely empty."] },
  urinary_retention: { zh: ["有，出现过想尿却尿不出来。", "没有，没有发生过尿不出来。", "有没有完全尿不出来过，我现在说不准。"], en: ["Yes, there have been times when I could not pass urine.", "No, I have not had urinary retention.", "I cannot say for sure whether I ever had complete urinary retention."] },
  nocturia: { zh: ["有，晚上需要起夜小便。", "没有，晚上不用起夜小便。", "一晚起夜几次，我没有数过。"], en: ["Yes, I get up at night to urinate.", "No, I do not get up at night to urinate.", "I have not counted how often I get up at night to urinate."] }
};

function naturalBooleanAnswer(intentKey, value, language) {
  const templates = booleanAnswerTemplates[intentKey]?.[language];
  if (!templates) return language === "en" ? "I am not sure about that." : "这项情况我现在说不准。";
  return value === true ? templates[0] : value === false ? templates[1] : templates[2];
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
  if (!["whole_stream_hematuria", "initial_hematuria", "terminal_hematuria"].includes(intentKey)) return classification;
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
  if (prioritySourceSlots.has("urinary_frequency")) {
    const hematuriaFrequencyIndex = matchedSlotIds.indexOf("hematuria_frequency");
    const explicitlyAsksHematuriaFrequency = /血尿.*(?:频率|多久一次|每次)|(?:how often|frequency).*(?:blood|hematuria)/i.test(String(question || ""));
    if (hematuriaFrequencyIndex >= 0 && !explicitlyAsksHematuriaFrequency) matchedSlotIds.splice(hematuriaFrequencyIndex, 1);
  }
  if (prioritySourceSlots.has("dysuria") && !asksIndependentGeneralPain(question, language)) {
    const painIndex = matchedSlotIds.indexOf("pain");
    if (painIndex >= 0) matchedSlotIds.splice(painIndex, 1);
  }
  const hasSpecificPain = matchedSlotIds.some((slotId) => ["flank_pain", "renal_colic", "radiating_pain"].includes(slotId));
  const explicitlyAsksGeneralPain = asksIndependentGeneralPain(question, language);
  const slotIds = hasSpecificPain && !explicitlyAsksGeneralPain
    ? matchedSlotIds.filter((slotId) => slotId !== "pain")
    : matchedSlotIds;
  if (!slotIds.length) return null;
  const factValues = {};
  const factValueReasons = {};
  const phaseValue = prioritySourceSlots.has("hematuria_phase")
    ? classifyHematuriaPhase(caseSlots.hematuria_phase?.patientAnswerZh, caseSlots.hematuria_phase?.patientAnswerEn)
    : "unknown";
  for (const item of priorityMatches) {
    const classification = item.sourceSlotId === "hematuria_phase"
      ? phaseValue
      : classifyPriorityIntent(item.intentKey, caseSlots[item.sourceSlotId]);
    factValues[item.intentKey] = factValueForIntent(item.intentKey, classification);
    factValueReasons[item.intentKey] = factValues[item.intentKey] === "unknown"
      ? unknownFactReason(caseSlots[item.sourceSlotId])
      : "known";
  }
  const answers = slotIds.map((slotId) => {
    if (slotId === "dysuria" && prioritySourceSlots.has(slotId)) return naturalDysuriaAnswer(factValues.dysuria, language);
    if (slotId === "hematuria_phase" && prioritySourceSlots.has(slotId)) {
      return naturalPhaseAnswer(phaseValue, language, priorityMatches.map((item) => item.intentKey), question);
    }
    if (prioritySourceSlots.has(slotId)) {
      return priorityMatches
        .filter((item) => item.sourceSlotId === slotId)
        .map((item) => naturalBooleanAnswer(item.intentKey, factValues[item.intentKey], language))
        .join("\n");
    }
    return caseSlots[slotId]?.[language === "en" ? "patientAnswerEn" : "patientAnswerZh"];
  }).filter(Boolean);
  if (!answers.length) return null;
  const matchedFacts = [
    ...priorityMatches.map((item) => item.intentKey),
    ...slotIds.filter((slotId) => !prioritySourceSlots.has(slotId))
  ];
  const collectableFacts = [
    ...priorityMatches.filter((item) => factValues[item.intentKey] !== "unknown").map((item) => item.intentKey),
    ...slotIds.filter((slotId) => !prioritySourceSlots.has(slotId))
  ];
  const collectableSlotIds = [...new Set([
    ...priorityMatches.filter((item) => factValues[item.intentKey] !== "unknown").map((item) => item.sourceSlotId),
    ...slotIds.filter((slotId) => !prioritySourceSlots.has(slotId))
  ])];
  const unresolvedReasons = Object.values(factValueReasons).filter((reason) => reason !== "known");
  return {
    replyText: [...new Set(answers)].join("\n"),
    matchedSlotIds: slotIds,
    matchedFacts: [...new Set(matchedFacts)],
    governanceSlotIds: slotIds,
    collectableSlotIds,
    collectableFacts: [...new Set(collectableFacts)],
    factValues,
    factValueReasons,
    unresolvedReason: unresolvedReasons.includes("unsafe_deterministic_answer") ? "unsafe_deterministic_answer" : unresolvedReasons.length ? "canonical_fact_unknown" : "",
    answerSource: "case_bilingual_slot",
    confidence: Object.values(factValues).some((value) => value === "unknown") ? 0.5 : 0.99,
    safetyFlags: [],
    fallbackReason: ""
  };
}

module.exports = { matchCanonicalPatientFacts };
