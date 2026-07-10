import { EMPTY_COLLECTED } from "./keyPoints";
import questionSlotsJson from "../../data/question_slots.json";
import type { CaseData, CollectedMap, InterviewAnswer, InterviewSlot, KeyPointId } from "./types";
import { matchStructuredPatientQuestion } from "./structuredPatientReply";

export type PatientReplyResult = {
  replyText: string;
  matchedSlotIds: string[];
  revealedFields: string[];
  blockedTeacherFields: string[];
  safetyFlags: string[];
  matchedFacts?: string[];
  answerSource?: "source" | "author_added_for_simulation" | "mixed" | "rule";
  confidence?: number;
  fallbackReason?: string;
};

const questionSlots = questionSlotsJson as InterviewSlot[];

const blockedPatientTerms = [
  "根据原始病史",
  "根据病例资料",
  "根据病史",
  "原始病史",
  "病例显示",
  "病例提示",
  "未主动诉",
  "未诉",
  "需追问",
  "需主动询问",
  "教师提示",
  "评分点",
  "扣分",
  "高危错误",
  "需警惕",
  "考虑",
  "提示",
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "癌栓",
  "淋巴结",
  "骨转移",
  "骨质破坏",
  "占位",
  "肿瘤",
  "恶性",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "围术期",
  "TURBT",
  "尿检以",
  "24小时尿蛋白",
  "尿蛋白",
  "畸形红细胞",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "药敏",
  "肾活检"
];

const reportQuestionWords = [
  "ct",
  "ctu",
  "彩超",
  "超声",
  "b超",
  "膀胱镜",
  "病理",
  "尿常规",
  "尿检",
  "肌酐",
  "egfr",
  "psa",
  "培养",
  "药敏",
  "肾活检",
  "报告",
  "检查结果",
  "片子",
  "影像"
];

const diagnosisQuestionWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];

const semanticToKeyPoint: Record<string, KeyPointId | undefined> = {
  onset: "onset",
  visibility: "hematuriaType",
  phase: "hematuriaPhase",
  color: "colorClots",
  clots: "colorClots",
  dysuria: "irritativeSymptoms",
  luts: "irritativeSymptoms",
  voiding: "voidingDifficulty",
  flankPain: "flankPain",
  fever: "fever",
  smoking: "smoking",
  alcohol: "historyBundle",
  occupation: "occupation",
  stone: "stoneHistory",
  infection: "infectionHistory",
  trauma: "trauma",
  medication: "anticoagulants",
  family: "tumorFamilyHistory",
  past: "historyBundle",
  glomerular: "historyBundle"
};

const slotIdToKeyPoint: Record<string, KeyPointId | undefined> = {
  HX001: "historyBundle",
  HX002: "onset",
  HX003: "hematuriaType",
  HX004: "hematuriaPhase",
  HX005: "colorClots",
  HX006: "colorClots",
  HX007: "irritativeSymptoms",
  HX008: "flankPain",
  HX009: "irritativeSymptoms",
  HX010: "voidingDifficulty",
  HX011: "fever",
  HX012: "historyBundle",
  HX013: "historyBundle",
  HX014: "infectionHistory",
  HX015: "trauma",
  HX016: "stoneHistory",
  HX017: "historyBundle",
  HX018: "smoking",
  HX019: "historyBundle",
  HX020: "occupation",
  HX021: "anticoagulants",
  HX022: "tumorFamilyHistory",
  HX023: "historyBundle",
  HX024: "historyBundle",
  HX025: "historyBundle",
  HX026: "historyBundle"
};

function normalize(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

export function patientHasAny(text: string, words: string[]) {
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function cleanValue(value?: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^根据原始病史[:：]?\s*/g, "")
    .replace(/^根据病例资料[:：]?\s*/g, "")
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未诉\/?需主动询问/g, "")
    .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
    .replace(/需追问[^，。；;]*[，。；;]?/g, "")
    .replace(/提交前隐藏[^，。；;]*[，。；;]?/g, "")
    .trim();
}

function splitSentences(value?: string) {
  return cleanValue(value)
    .split(/[。；;\n]/)
    .flatMap((line) => line.split(/[，,]/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function containsBlocked(text: string) {
  return blockedPatientTerms.filter((term) => text.includes(term));
}

function stripBlockedSentences(value?: string) {
  const sentences = splitSentences(value).filter((line) => !containsBlocked(line).length);
  return sentences.join("。").trim();
}

function isNotUsable(value?: string) {
  const clean = cleanValue(value);
  return !clean || /未诉|需追问|需主动询问|不详|提交前隐藏|评分/.test(clean);
}

function firstUsable(...values: Array<string | undefined>) {
  for (const value of values) {
    const clean = stripBlockedSentences(value);
    if (clean && !isNotUsable(clean)) return clean;
  }
  return "";
}

function asBullets(lines: string[]) {
  const cleaned = lines
    .map((line) => stripBlockedSentences(line))
    .filter(Boolean)
    .flatMap((line) => splitSentences(line))
    .filter((line) => !containsBlocked(line).length)
    .slice(0, 2)
    .map((line) => {
      const trimmed = line.replace(/^[-•\s]*/, "").trim();
      return trimmed.length > 80 ? `${trimmed.slice(0, 80).replace(/[，。；;\s]*$/g, "")}。` : trimmed;
    });
  return cleaned.length ? cleaned.join("") : "这个我没有特别注意到。";
}

function sentenceWith(value: string | undefined, words: string[]) {
  return splitSentences(value).find((sentence) => words.some((word) => sentence.includes(word)) && !containsBlocked(sentence).length) || "";
}

function getInterviewEntries(caseData: CaseData) {
  return Object.values(caseData.interviewAnswers || {}) as InterviewAnswer[];
}

function findSlotByKeywords(caseData: CaseData, keywords: string[]) {
  const entries = getInterviewEntries(caseData);
  const scored = entries
    .map((entry) => {
      const haystack = `${entry.slotId} ${entry.label} ${entry.possibleQuestion}`;
      const score = keywords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.entry;
}

function findSlotByQuestion(caseData: CaseData, question: string) {
  const normalizedQuestion = normalize(question);
  const caseSlots = getInterviewEntries(caseData)
    .map((slot) => {
      const candidates = [slot.label, slot.possibleQuestion]
        .flatMap((item) => String(item || "").split(/[|/、，,；;\s]+/))
        .map(normalize)
        .filter((item) => item.length >= 2);
      const score = candidates.reduce((sum, item) => {
        if (normalizedQuestion.includes(item)) return sum + item.length + 3;
        if (item.includes(normalizedQuestion) && normalizedQuestion.length >= 2) return sum + normalizedQuestion.length;
        return sum;
      }, 0);
      return { slot, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (caseSlots[0]) return caseSlots[0].slot;

  const globalSlot = questionSlots
    .map((slot) => {
      const candidates = [slot.label, slot.recommendedQuestion, ...(slot.triggers || [])]
        .map(normalize)
        .filter((item) => item.length >= 2);
      const score = candidates.reduce((sum, item) => (normalizedQuestion.includes(item) ? sum + item.length : sum), 0);
      return { slot, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.slot;

  if (!globalSlot) return undefined;
  return findSlotByKeywords(caseData, [globalSlot.label, globalSlot.slotId]);
}

type Semantic =
  | "chief"
  | "visibility"
  | "onset"
  | "frequency"
  | "phase"
  | "color"
  | "clots"
  | "dysuria"
  | "flankPain"
  | "luts"
  | "voiding"
  | "fever"
  | "glomerular"
  | "uri"
  | "trigger"
  | "stone"
  | "infection"
  | "past"
  | "medication"
  | "smoking"
  | "alcohol"
  | "occupation"
  | "female"
  | "family"
  | "bleeding"
  | "priorCare";

function semanticFromQuestion(question: string): Semantic | "diagnosis" | "report" | undefined {
  if (patientHasAny(question, diagnosisQuestionWords)) return "diagnosis";
  if (patientHasAny(question, reportQuestionWords)) return "report";
  if (patientHasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红", "第一杯", "第三杯", "从头到尾"])) return "phase";
  if (patientHasAny(question, ["血块", "血凝块", "凝血块", "块状"])) return "clots";
  if (patientHasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return "color";
  if (patientHasAny(question, ["肉眼", "镜下", "看得见", "尿潜血", "尿本身红"])) return "visibility";
  if (patientHasAny(question, ["多久", "什么时候", "几天", "几周", "几个月", "开始", "起病"])) return "onset";
  if (patientHasAny(question, ["频率", "间断", "持续", "每次都有", "反复", "次数"])) return "frequency";
  if (patientHasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) return "dysuria";
  if (patientHasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛", "肾区"])) return "flankPain";
  if (patientHasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return "luts";
  if (patientHasAny(question, ["排尿困难", "尿线", "尿流中断", "尿不出来", "费力", "尿潴留"])) return "voiding";
  if (patientHasAny(question, ["发热", "发烧", "寒战", "畏寒", "高热", "体温"])) return "fever";
  if (patientHasAny(question, ["泡沫尿", "水肿", "眼睑肿", "下肢肿"])) return "glomerular";
  if (patientHasAny(question, ["感冒", "咽痛", "扁桃体炎", "上呼吸道"])) return "uri";
  if (patientHasAny(question, ["运动", "劳累", "受凉", "外伤", "性生活", "导尿", "尿路操作"])) return "trigger";
  if (patientHasAny(question, ["结石史", "以前结石", "肾结石", "输尿管结石"])) return "stone";
  if (patientHasAny(question, ["感染史", "尿路感染", "膀胱炎", "肾盂肾炎"])) return "infection";
  if (patientHasAny(question, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "止痛药", "吃药", "用药"])) return "medication";
  if (patientHasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年"])) return "smoking";
  if (patientHasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return "alcohol";
  if (patientHasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属", "接触"])) return "occupation";
  if (patientHasAny(question, ["月经", "阴道", "污染", "怀孕", "妊娠", "妇科"])) return "female";
  if (patientHasAny(question, ["家族", "遗传", "家里", "亲属", "听力异常"])) return "family";
  if (patientHasAny(question, ["鼻出血", "牙龈出血", "瘀斑", "紫癜", "出血倾向"])) return "bleeding";
  if (patientHasAny(question, ["看过医生", "吃过什么", "治疗过", "外院"])) return "priorCare";
  if (patientHasAny(question, ["哪里不舒服", "为什么来", "主诉", "怎么不舒服", "怎么回事", "详细说说"])) return "chief";
  if (patientHasAny(question, ["高血压", "糖尿病", "冠心病", "房颤", "肝炎", "乙肝", "结核", "既往"])) return "past";
  return undefined;
}

function slotForSemantic(caseData: CaseData, semantic: Semantic) {
  const keywordMap: Record<Semantic, string[]> = {
    chief: ["主诉", "来诊", "哪里不舒服"],
    visibility: ["肉眼", "镜下", "可见性"],
    onset: ["起病", "持续时间", "病程"],
    frequency: ["频率", "间断", "持续"],
    phase: ["时相", "全程", "终末", "起始", "一直红"],
    color: ["尿色", "颜色", "鲜红", "暗红", "洗肉水", "茶色", "酱油"],
    clots: ["血块", "凝血块"],
    dysuria: ["尿痛", "疼痛关系", "小便疼"],
    flankPain: ["腰痛", "肾绞痛", "放射痛"],
    luts: ["尿频", "尿急", "尿路刺激"],
    voiding: ["排尿困难", "尿线", "尿潴留"],
    fever: ["发热", "寒战", "畏寒"],
    glomerular: ["泡沫尿", "水肿", "高血压"],
    uri: ["上感", "咽痛", "扁桃体炎", "感冒"],
    trigger: ["诱因", "运动", "外伤", "操作"],
    stone: ["结石史"],
    infection: ["感染史", "尿路感染"],
    past: ["既往病史", "慢性病"],
    medication: ["用药", "抗凝", "抗血小板"],
    smoking: ["吸烟史", "吸烟", "抽烟"],
    alcohol: ["饮酒史", "饮酒", "喝酒"],
    occupation: ["职业暴露", "职业", "工作"],
    female: ["女性", "月经", "阴道", "妊娠"],
    family: ["家族史", "遗传"],
    bleeding: ["出血倾向", "鼻出血", "牙龈出血"],
    priorCare: ["诊治经过", "院前诊治", "看过医生"]
  };
  return findSlotByKeywords(caseData, keywordMap[semantic]);
}

function answerFromStructuredFields(caseData: CaseData, semantic: Semantic, question: string) {
  const pfp = (caseData as unknown as { patientFacingProfile?: Record<string, string> }).patientFacingProfile || {};
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};

  switch (semantic) {
    case "chief":
      return firstUsable(pfp.chiefComplaint, caseData.patientAnswers?.opening, caseData.studentChiefComplaint, caseData.chiefComplaint);
    case "visibility":
      return firstUsable(pfp.hematuriaType, illness.hematuriaType);
    case "phase":
      return firstUsable(pfp.hematuriaPhase, caseData.patientAnswers?.phase, illness.hematuriaPhase);
    case "color":
      return firstUsable(pfp.urineColor, caseData.patientAnswers?.color, illness.color);
    case "clots":
      return firstUsable(pfp.clots, caseData.patientAnswers?.clots, illness.clots);
    case "dysuria":
      return firstUsable(
        sentenceWith(pfp.luts, ["尿痛", "疼", "痛", "烧灼"]),
        sentenceWith(caseData.patientAnswers?.irritativeSymptoms, ["尿痛", "疼", "痛", "烧灼"]),
        sentenceWith(illness.dysuria, ["尿痛", "疼", "痛", "烧灼"]),
        caseData.patientAnswers?.pain,
        illness.pain
      );
    case "flankPain":
      return firstUsable(pfp.flankPain, illness.flankPain, caseData.patientAnswers?.stoneClues, illness.pain);
    case "luts":
      return firstUsable(pfp.luts, caseData.patientAnswers?.irritativeSymptoms, illness.urinaryFrequency, illness.urgency, illness.dysuria);
    case "voiding":
      return firstUsable(sentenceWith(pfp.luts, ["排尿困难", "尿线", "尿潴留"]), illness.voidingDifficulty);
    case "fever":
      return firstUsable(pfp.fever, caseData.patientAnswers?.fever, illness.fever);
    case "glomerular":
      return firstUsable(pfp.glomerularClues, caseData.patientAnswers?.glomerularClues);
    case "trigger":
      return firstUsable(illness.trigger, risk.trauma);
    case "stone":
      return firstUsable(risk.stoneHistory, sentenceWith(pfp.knownPastHistory, ["结石"]));
    case "infection":
      return firstUsable(risk.infectionHistory, sentenceWith(pfp.knownPastHistory, ["感染"]));
    case "medication":
      return firstUsable(pfp.knownMedication, risk.anticoagulants, caseData.medication);
    case "smoking":
      return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["吸烟"]), sentenceWith(pfp.knownPastHistory, ["吸烟"]), risk.smoking);
    case "alcohol":
      return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["饮酒", "喝酒"]), sentenceWith(pfp.knownPastHistory, ["饮酒", "喝酒"]), risk.alcohol);
    case "occupation":
      return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["职业", "染料", "化工", "橡胶", "皮革", "重金属"]), risk.occupation);
    case "family":
      return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["家族"]), risk.familyHistory, caseData.familyHistory);
    case "past":
      if (patientHasAny(question, ["高血压"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["高血压"]), sentenceWith(caseData.pastHistory, ["高血压"]));
      if (patientHasAny(question, ["糖尿病"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["糖尿病"]), sentenceWith(caseData.pastHistory, ["糖尿病"]));
      if (patientHasAny(question, ["肝炎", "乙肝"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["肝炎", "乙肝"]), sentenceWith(caseData.pastHistory, ["肝炎", "乙肝"]));
      if (patientHasAny(question, ["结核"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["结核"]), sentenceWith(caseData.pastHistory, ["结核"]));
      return firstUsable(pfp.knownPastHistory, caseData.pastHistory);
    default:
      return "";
  }
}

function defaultAnswerForSemantic(semantic: Semantic) {
  const defaults: Record<Semantic, string> = {
    chief: "主要是小便颜色不太正常。",
    visibility: "我是自己能看到尿色变红。",
    onset: "已经有一段时间了，具体可以再问我。",
    frequency: "不是每次都完全一样，有时明显一些。",
    phase: "我没有特别分清是刚开始红还是最后红。",
    color: "尿液颜色看起来偏红。",
    clots: "我没有注意到明显血块。",
    dysuria: "小便时不疼，也没有明显尿道烧灼感。",
    flankPain: "没有明显腰痛或肚子绞痛。",
    luts: "没有明显尿频、尿急、尿痛。",
    voiding: "排尿没有特别费力。",
    fever: "没有发热，也没有寒战。",
    glomerular: "没有明显泡沫尿或水肿。",
    uri: "最近没有明显感冒、咽痛。",
    trigger: "没有明显外伤、剧烈运动或尿路操作诱因。",
    stone: "以前没有明确结石史。",
    infection: "以前没有反复尿路感染史。",
    past: "以前身体情况没有特别的。",
    medication: "平时没有长期吃特殊药。",
    smoking: "我平时不吸烟。",
    alcohol: "我平时不怎么喝酒。",
    occupation: "工作上没有接触特别的化学东西。",
    female: "这个情况对我不太适用，或没有这方面问题。",
    family: "家里没有听说类似血尿或遗传性肾病。",
    bleeding: "没有鼻出血、牙龈出血或皮肤瘀斑。",
    priorCare: "此前没有系统诊治。"
  };
  return defaults[semantic];
}

function semanticReply(caseData: CaseData, semantic: Semantic, question: string) {
  const slot = slotForSemantic(caseData, semantic) || findSlotByQuestion(caseData, question);
  const slotAnswer = slot?.patientAnswer;
  const structured = answerFromStructuredFields(caseData, semantic, question);
  const safeSlotAnswer = slotAnswer && containsBlocked(slotAnswer).length === 0 ? slotAnswer : "";
  const answer = firstUsable(structured, safeSlotAnswer, defaultAnswerForSemantic(semantic));
  return {
    replyText: asBullets([answer]),
    matchedSlotIds: slot ? [slot.slotId] : [],
    revealedFields: slot ? [slot.slotId] : [semantic],
    blockedTeacherFields: containsBlocked(String(slotAnswer || "")),
    safetyFlags: []
  };
}

function keyPointFromSlot(caseData: CaseData, slotId: string): KeyPointId | undefined {
  if (slotId === "LIFE_SMOKING") return "smoking";
  if (slotId === "LIFE_OCCUPATION" || slotId === "LIFE_EXPOSURE") return "occupation";
  if (slotId === "PAST_STONE") return "stoneHistory";
  if (slotId === "PAST_UTI") return "infectionHistory";
  if (slotId === "PAST_TRAUMA" || slotId === "PAST_URINARY_PROCEDURE") return "trauma";
  if (slotId === "MED_ALL" || slotId === "MED_ANTICOAGULANT" || slotId === "MED_ANTIPLATELET") return "anticoagulants";
  if (slotId === "FAMILY_HISTORY") return "tumorFamilyHistory";
  if (/^(PAST_|LIFE_ALCOHOL|GYNE_)/.test(slotId)) return "historyBundle";
  const slot = caseData.interviewAnswers?.[slotId];
  const text = `${slot?.label || ""} ${slot?.possibleQuestion || ""}`;
  if (/时相|全程|终末|起始|一直红/.test(text)) return "hematuriaPhase";
  if (/尿色|颜色|血块|鲜红|暗红|洗肉水|茶色|酱油/.test(text)) return "colorClots";
  if (/肉眼|镜下|可见性/.test(text)) return "hematuriaType";
  if (/起病|病程|持续时间|多久/.test(text)) return "onset";
  if (/尿频|尿急|尿痛|尿路刺激/.test(text)) return "irritativeSymptoms";
  if (/腰痛|肾绞痛|放射痛/.test(text)) return "flankPain";
  if (/发热|寒战|畏寒/.test(text)) return "fever";
  if (/排尿困难|尿线|尿潴留/.test(text)) return "voidingDifficulty";
  if (/吸烟/.test(text)) return "smoking";
  if (/职业/.test(text)) return "occupation";
  if (/结石/.test(text)) return "stoneHistory";
  if (/感染/.test(text)) return "infectionHistory";
  if (/外伤|操作|运动/.test(text)) return "trauma";
  if (/用药|抗凝|抗血小板/.test(text)) return "anticoagulants";
  if (/家族|遗传/.test(text)) return "tumorFamilyHistory";
  return slotIdToKeyPoint[slotId];
}

function broadHistoryReply(caseData: CaseData) {
  return asBullets([
    firstUsable((caseData as unknown as { patientFacingProfile?: Record<string, string> }).patientFacingProfile?.chiefComplaint, caseData.studentChiefComplaint, caseData.chiefComplaint),
    firstUsable(caseData.patientAnswers?.color, caseData.presentIllness?.color, "尿液颜色不太正常。"),
    "具体细节您可以一项一项问我。"
  ]);
}

export function generatePatientReply({
  caseData,
  userQuestion,
  language = "zh"
}: {
  caseData: CaseData;
  userQuestion: string;
  stage?: string;
  mode?: string;
  language?: "zh" | "en";
}): PatientReplyResult {
  const question = userQuestion.trim();
  const structured = matchStructuredPatientQuestion(caseData, question, language);
  if (structured) return { ...structured, revealedFields: structured.matchedFacts, blockedTeacherFields: [] };
  const semantic = semanticFromQuestion(question);

  if (semantic === "diagnosis") {
    return {
      replyText: asBullets(["这个我不清楚，需要医生判断。"]),
      matchedSlotIds: [],
      revealedFields: [],
      blockedTeacherFields: ["diagnosis", "teacherOnlyData"],
      safetyFlags: ["blocked_diagnosis_request"]
    };
  }

  if (semantic === "report") {
    return {
      replyText: asBullets(["我做过的检查具体结果说不清楚，您需要查看检查报告。"]),
      matchedSlotIds: [],
      revealedFields: [],
      blockedTeacherFields: ["imaging_finding", "urine_test_result", "pathology", "order_results"],
      safetyFlags: ["blocked_report_request"]
    };
  }

  if (semantic) return semanticReply(caseData, semantic, question);

  const slot = findSlotByQuestion(caseData, question);
  if (slot) {
    return {
      replyText: asBullets([slot.patientAnswer]),
      matchedSlotIds: [slot.slotId],
      revealedFields: [slot.slotId],
      blockedTeacherFields: containsBlocked(slot.patientAnswer),
      safetyFlags: []
    };
  }

  if (patientHasAny(question, ["详细说说", "整个经过", "这次情况"])) {
    return {
      replyText: broadHistoryReply(caseData),
      matchedSlotIds: [],
      revealedFields: ["chiefComplaint"],
      blockedTeacherFields: [],
      safetyFlags: []
    };
  }

  return {
    replyText: asBullets(["医生，您能问得再具体一点吗？我不太明白您想问哪方面。"]),
    matchedSlotIds: [],
    revealedFields: [],
    blockedTeacherFields: [],
    safetyFlags: ["no_slot_match"]
  };
}

export function askPatient(caseData: CaseData, question: string): { answer: string; matchedKeys: KeyPointId[]; matchedSlots: string[] } {
  const result = generatePatientReply({ caseData, userQuestion: question });
  const matchedKeys = [
    ...new Set(
      result.revealedFields
        .map((field) => semanticToKeyPoint[field] || semanticToKeyPoint[field.replace(/^HX\d+$/, "")])
        .concat(result.matchedSlotIds.map((slotId) => keyPointFromSlot(caseData, slotId)))
        .filter(Boolean)
    )
  ] as KeyPointId[];
  return {
    answer: result.replyText,
    matchedKeys,
    matchedSlots: result.matchedSlotIds
  };
}

export function mergeCollected(current: CollectedMap, keys: KeyPointId[]): CollectedMap {
  return keys.reduce((next, key) => ({ ...next, [key]: true }), { ...current });
}

export function createEmptyCollected(): CollectedMap {
  return { ...EMPTY_COLLECTED };
}
