const bilingualSlots = require("../data/patient_slots_bilingual.json");

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

function matchCanonicalPatientFacts(caseId, question, language = "zh") {
  const caseSlots = bilingualSlots[caseId];
  if (!caseSlots) return null;
  const slotIds = [...new Set(matchers.filter(([, pattern]) => pattern.test(question)).map(([slotId]) => slotId))];
  if (!slotIds.length) return null;
  const answers = slotIds.map((slotId) => caseSlots[slotId]?.[language === "en" ? "patientAnswerEn" : "patientAnswerZh"]).filter(Boolean);
  if (!answers.length) return null;
  return {
    replyText: [...new Set(answers)].join("\n"),
    matchedSlotIds: slotIds,
    matchedFacts: slotIds,
    answerSource: "case_bilingual_slot",
    confidence: 0.99,
    safetyFlags: [],
    fallbackReason: ""
  };
}

module.exports = { matchCanonicalPatientFacts };
