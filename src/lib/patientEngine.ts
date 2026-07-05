import { EMPTY_COLLECTED } from "./keyPoints";
import interviewSlotsJson from "@/data/interview_slots.json";
import type { CaseData, CollectedMap, InterviewSlot, KeyPointId } from "./types";

type ReplyResult = {
  replyText: string;
  matchedSlotIds: string[];
  revealedFields: string[];
  blockedTeacherFields: string[];
  safetyFlags: string[];
};

const interviewSlots = interviewSlotsJson as InterviewSlot[];

const genericFallbacks = [
  "医生，您能问得再具体一点吗？我不太明白您想问哪方面。",
  "主要是尿的问题，您可以具体问颜色、疼痛、有没有血块这些。",
  "这个我说不太清楚，您可以换个更具体的问题问我。"
];

const diagnosisQuestionWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];
const reportQuestionWords = [
  "ct", "ctu", "彩超", "超声", "b超", "膀胱镜", "病理", "尿常规", "尿检", "肌酐", "egfr", "psa",
  "培养", "药敏", "肾活检", "报告", "检查结果", "片子", "影像"
];

const forbiddenPatientPhrases = [
  "根据原始病史",
  "根据病例资料",
  "根据病史",
  "原始病史",
  "病例提示",
  "未诉",
  "未主动诉",
  "需主动询问",
  "需追问",
  "教师提示",
  "评分点",
  "扣分",
  "高危错误",
  "考虑",
  "提示",
  "诊断",
  "最终诊断"
];

const forbiddenLeakWords = [
  "CT", "CTU", "彩超", "超声提示", "膀胱镜", "病理", "占位", "癌栓", "淋巴结", "骨转移", "骨质破坏",
  "TURBT", "肾活检", "尿常规", "肌酐", "eGFR", "PSA", "尿培养", "药敏", "恶性肿瘤", "膀胱癌",
  "输尿管癌", "肾盂癌", "肾癌", "前列腺癌", "IgA肾病", "急性肾小球肾炎"
];

const slotToKeyPoint: Record<string, KeyPointId> = {
  HX001: "historyBundle",
  HX002: "hematuriaType",
  HX003: "onset",
  HX004: "onset",
  HX005: "hematuriaPhase",
  HX006: "hematuriaPhase",
  HX007: "colorClots",
  HX008: "colorClots",
  HX009: "irritativeSymptoms",
  HX010: "irritativeSymptoms",
  HX011: "voidingDifficulty",
  HX012: "flankPain",
  HX013: "fever",
  HX014: "infectionHistory",
  HX015: "infectionHistory",
  HX016: "infectionHistory",
  HX017: "historyBundle",
  HX018: "historyBundle",
  HX019: "trauma",
  HX020: "historyBundle",
  HX021: "anticoagulants",
  HX022: "historyBundle",
  HX023: "smoking",
  HX024: "tumorFamilyHistory",
  HX025: "historyBundle"
};

function normalize(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

function hasAny(text: string, words: string[]) {
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function cleanValue(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/^根据原始病史[:：]?\s*/g, "")
    .replace(/^根据病例资料[:：]?\s*/g, "")
    .replace(/未诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/需主动询问[，。；;]?/g, "")
    .replace(/需追问[，。；;]?/g, "")
    .trim();
}

function isNonPatientUnknown(value?: string) {
  return !value || /未诉|需追问|主动询问|未主动诉/.test(value);
}

function splitSentences(text: string) {
  return cleanValue(text)
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripTeacherAndReports(text: string) {
  let next = cleanValue(text);
  forbiddenPatientPhrases.forEach((word) => {
    next = next.replace(new RegExp(word, "gi"), "");
  });
  const sentences = splitSentences(next).filter((sentence) => !forbiddenLeakWords.some((word) => sentence.includes(word)));
  return sentences.join("。").trim();
}

function containsForbidden(text: string) {
  return [...forbiddenPatientPhrases, ...forbiddenLeakWords].filter((word) => text.includes(word));
}

function concise(text: string, maxLength = 80) {
  const clean = stripTeacherAndReports(text);
  if (!clean) return "";
  return clean.length > maxLength ? `${clean.slice(0, maxLength).replace(/[，,。；;、]\s*$/g, "")}。` : clean;
}

function asBullets(lines: string[]) {
  const cleanLines = lines
    .map((line) => concise(line, 80))
    .filter(Boolean)
    .slice(0, 3);
  if (!cleanLines.length) return "- 这个我没有特别注意到。";
  return cleanLines.map((line) => `- ${line.replace(/^[-•]\s*/, "")}`).join("\n");
}

function rawSlotAnswer(caseData: CaseData, slotId: string) {
  return caseData.interviewAnswers?.[slotId]?.patientAnswer || "";
}

function answerFromSlot(caseData: CaseData, slotId: string, question: string) {
  const raw = rawSlotAnswer(caseData, slotId);
  const illness = caseData.presentIllness;
  const risk = caseData.riskFactors;

  switch (slotId) {
    case "HX001":
      return [caseData.studentChiefComplaint || caseData.chiefComplaint || "主要是小便颜色不太正常。"];
    case "HX002":
      return [raw || illness.hematuriaType || "我能看到尿的颜色不太正常。"];
    case "HX003":
      return [raw || illness.onset || caseData.studentChiefComplaint || "已经有一段时间了。"];
    case "HX004":
      return [raw || illness.duration || "不是每次都一样，具体您再问我。"];
    case "HX005":
    case "HX006":
      return [raw || illness.hematuriaPhase || "我没有特别分清是开始红还是最后红。"];
    case "HX007":
      return [raw || caseData.patientAnswers?.color || illness.color || "尿液颜色看起来偏红。"];
    case "HX008": {
      const answer = raw || caseData.patientAnswers?.clots || illness.clots;
      if (isNonPatientUnknown(answer)) return ["我没有注意到明显血块。"];
      return [answer];
    }
    case "HX009":
      return [raw || illness.dysuria || "小便时没有明显疼痛或烧灼感。"];
    case "HX010":
      return [raw || [illness.urinaryFrequency, illness.urgency].filter(Boolean).join("，") || "没有明显尿频、尿急。"];
    case "HX011":
      return [raw || illness.voidingDifficulty || "排尿没有特别费劲。"];
    case "HX012":
      return [raw || caseData.patientAnswers?.pain || illness.flankPain || illness.pain || "没有明显腰痛。"];
    case "HX013":
      return [raw || caseData.patientAnswers?.fever || illness.fever || "没有发热，也没有寒战。"];
    case "HX014":
      return [raw || "没有明显恶心、呕吐。"];
    case "HX015":
      return [raw || caseData.patientAnswers?.glomerularClues || "没有明显泡沫尿或水肿。"];
    case "HX016":
      return [raw || risk.infectionHistory || "最近没有明显感冒、咽痛。"];
    case "HX017":
      return [raw || "胃口、体重没有特别明显变化。"];
    case "HX018":
      return [raw || "这个情况我不太适用，或者没有这方面问题。"];
    case "HX019":
      return [raw || risk.trauma || "没有明显外伤或相关操作。"];
    case "HX020":
      return [raw || caseData.pastHistory || "以前身体情况没有特别的。"];
    case "HX021": {
      const med = raw || risk.anticoagulants || caseData.medication;
      if (isNonPatientUnknown(med)) return ["平时没有长期吃特殊药。"];
      return [med];
    }
    case "HX022":
      return [raw || "没有特别明确的药物过敏、手术或输血情况。"];
    case "HX023": {
      const source = raw || [risk.smoking, risk.alcohol, risk.occupation].filter(Boolean).join("，");
      if (hasAny(question, ["抽烟", "吸烟", "烟龄", "几包", "包年"])) return [isNonPatientUnknown(risk.smoking) ? "我平时不吸烟。" : risk.smoking];
      if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return [isNonPatientUnknown(risk.alcohol) ? "我平时不怎么喝酒。" : risk.alcohol];
      if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "油漆", "接触"])) return [isNonPatientUnknown(risk.occupation) ? "工作上没有接触特别的化学东西。" : risk.occupation];
      if (isNonPatientUnknown(source)) return ["吸烟、饮酒和工作接触情况没有特别的。"];
      return [source || "吸烟、饮酒和工作接触情况没有特别的。"];
    }
    case "HX024":
      return [raw || risk.familyHistory || "家里没有听说类似情况。"];
    case "HX025":
      return [raw || "饮食、睡眠和大便大致还可以。"];
    default:
      return [raw];
  }
}

function matchByStrongRules(question: string) {
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return ["HX007"];
  if (hasAny(question, ["血块", "血凝块", "凝血块", "块状"])) return ["HX008"];
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红", "第一杯", "第三杯", "一开始", "从头到尾"])) return ["HX005"];
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return ["HX010"];
  if (hasAny(question, ["排尿困难", "尿线", "尿不出来", "费力", "尿潴留"])) return ["HX011"];
  if (hasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) return ["HX009"];
  if (hasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛", "肾区"])) return ["HX012"];
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "高热", "体温"])) return ["HX013"];
  if (hasAny(question, ["泡沫尿", "水肿", "眼睑肿", "下肢肿", "高血压"])) return ["HX015"];
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎", "上呼吸道"])) return ["HX016"];
  if (hasAny(question, ["月经", "阴道", "污染", "怀孕", "妊娠"])) return ["HX018"];
  if (hasAny(question, ["外伤", "运动", "导尿", "操作", "手术"])) return ["HX019"];
  if (hasAny(question, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "吃药", "用药"])) return ["HX021"];
  if (hasAny(question, ["高血压", "糖尿病", "冠心病", "房颤", "以前", "既往", "肾病", "结石史"])) return ["HX020"];
  if (hasAny(question, ["抽烟", "吸烟", "烟龄", "几包", "包年", "喝酒", "饮酒", "职业", "工作", "染料", "化工", "橡胶", "油漆"])) return ["HX023"];
  if (hasAny(question, ["家族", "遗传", "家里", "亲属"])) return ["HX024"];
  if (hasAny(question, ["怎么不舒服", "哪里不舒服", "为什么来", "主诉"])) return ["HX001"];
  if (hasAny(question, ["多久", "什么时候", "几天", "几周", "几个月", "开始", "起病"])) return ["HX003"];
  if (hasAny(question, ["持续", "间断", "每次", "频率"])) return ["HX004"];
  if (hasAny(question, ["肉眼", "镜下", "看得见", "尿检发现"])) return ["HX002"];
  return [];
}

function matchBySlotDictionary(question: string) {
  const normalized = normalize(question);
  return interviewSlots
    .map((slot) => {
      const candidates = [slot.label, slot.recommendedQuestion, ...slot.triggers].map(normalize).filter((item) => item.length >= 2);
      const score = candidates.reduce((sum, item) => {
        if (normalized.includes(item)) return sum + item.length + 3;
        if (item.includes(normalized) && normalized.length >= 2) return sum + normalized.length;
        return sum;
      }, 0);
      return { slotId: slot.slotId, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((item) => item.slotId);
}

function matchSlots(caseData: CaseData, question: string) {
  const strong = matchByStrongRules(question).filter((slotId) => caseData.interviewAnswers?.[slotId] || slotId in slotToKeyPoint);
  if (strong.length) return strong.slice(0, 1);
  return matchBySlotDictionary(question).filter((slotId) => caseData.interviewAnswers?.[slotId]).slice(0, 1);
}

function broadHistoryReply(caseData: CaseData) {
  const lines = [
    "主要是发现尿的颜色不太正常。",
    caseData.presentIllness.color ? `颜色大概是${cleanValue(caseData.presentIllness.color)}。` : "颜色看起来发红。",
    caseData.presentIllness.pain ? cleanValue(caseData.presentIllness.pain) : "小便时不一定疼。"
  ];
  return asBullets(lines);
}

export function generatePatientReply({
  caseData,
  userQuestion
}: {
  caseData: CaseData;
  userQuestion: string;
  stage?: string;
  mode?: string;
}): ReplyResult {
  const question = userQuestion.trim();
  const blockedTeacherFields: string[] = [];
  const safetyFlags: string[] = [];

  if (hasAny(question, diagnosisQuestionWords)) {
    return {
      replyText: asBullets(["这个我不清楚，需要医生判断。"]),
      matchedSlotIds: [],
      revealedFields: [],
      blockedTeacherFields: ["diagnosis", "teacherHint"],
      safetyFlags: ["blocked_diagnosis_request"]
    };
  }

  if (hasAny(question, reportQuestionWords)) {
    return {
      replyText: asBullets(["我做过的检查具体结果我说不清楚，您需要查看检查报告。"]),
      matchedSlotIds: [],
      revealedFields: [],
      blockedTeacherFields: ["imaging_finding", "urine_test_result", "pathology", "order_results"],
      safetyFlags: ["blocked_report_request"]
    };
  }

  if (hasAny(question, ["详细说说", "怎么回事", "整个经过", "详细讲", "这次情况"])) {
    return {
      replyText: broadHistoryReply(caseData),
      matchedSlotIds: ["HX001"],
      revealedFields: ["chiefComplaint"],
      blockedTeacherFields,
      safetyFlags
    };
  }

  const matchedSlotIds = matchSlots(caseData, question);
  if (!matchedSlotIds.length) {
    return {
      replyText: asBullets([genericFallbacks[Math.floor(Math.random() * genericFallbacks.length)]]),
      matchedSlotIds: [],
      revealedFields: [],
      blockedTeacherFields,
      safetyFlags: ["no_slot_match"]
    };
  }

  const slotId = matchedSlotIds[0];
  const rawAnswer = answerFromSlot(caseData, slotId, question).join("。");
  const blocked = containsForbidden(rawAnswer);
  if (blocked.length) blockedTeacherFields.push(...blocked);
  const replyText = asBullets([rawAnswer]);
  const leaked = containsForbidden(replyText);
  if (leaked.length) safetyFlags.push(...leaked.map((item) => `filtered:${item}`));

  return {
    replyText,
    matchedSlotIds,
    revealedFields: [slotId],
    blockedTeacherFields: [...new Set(blockedTeacherFields)],
    safetyFlags: [...new Set(safetyFlags)]
  };
}

export function askPatient(caseData: CaseData, question: string): { answer: string; matchedKeys: KeyPointId[]; matchedSlots: string[] } {
  const result = generatePatientReply({ caseData, userQuestion: question });
  const matchedKeys = [...new Set(result.matchedSlotIds.map((slotId) => slotToKeyPoint[slotId]).filter(Boolean))] as KeyPointId[];
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
