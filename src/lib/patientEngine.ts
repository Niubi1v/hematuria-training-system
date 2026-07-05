import { EMPTY_COLLECTED } from "./keyPoints";
import questionSlotsJson from "@/data/question_slots.json";
import type { CaseData, CollectedMap, InterviewSlot, KeyPointId } from "./types";

type ReplyResult = {
  replyText: string;
  matchedSlotIds: string[];
  revealedFields: string[];
  blockedTeacherFields: string[];
  safetyFlags: string[];
};

const questionSlots = questionSlotsJson as InterviewSlot[];

const fallbackReplies = [
  "医生，您能问得再具体一点吗？我不太明白您想问哪方面。",
  "主要是尿的问题，您可以具体问颜色、疼痛、有没有血块这些。",
  "这个我说不太清楚，您可以换个更具体的问题问我。"
];

const diagnosisQuestionWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];
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
  "需警惕",
  "原始既往史",
  "考虑",
  "提示",
  "诊断",
  "最终诊断"
];

const forbiddenLeakWords = [
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "占位",
  "癌栓",
  "淋巴结",
  "骨转移",
  "骨质破坏",
  "TURBT",
  "肾活检",
  "尿常规",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "药敏",
  "恶性肿瘤",
  "膀胱癌",
  "输尿管癌",
  "肾盂癌",
  "肾癌",
  "前列腺癌",
  "IgA肾病",
  "急性肾小球肾炎"
];

const slotToKeyPoint: Record<string, KeyPointId> = {
  HX001: "historyBundle",
  HX002: "onset",
  HX003: "hematuriaType",
  HX004: "onset",
  HX005: "hematuriaPhase",
  HX006: "colorClots",
  HX007: "colorClots",
  HX008: "colorClots",
  HX009: "flankPain",
  HX010: "irritativeSymptoms",
  HX011: "voidingDifficulty",
  HX012: "fever",
  HX013: "historyBundle",
  HX014: "infectionHistory",
  HX015: "trauma",
  HX016: "stoneHistory",
  HX017: "historyBundle",
  HX018: "anticoagulants",
  HX019: "smoking",
  HX020: "occupation",
  HX021: "historyBundle",
  HX022: "historyBundle",
  HX023: "historyBundle",
  HX024: "historyBundle",
  HX025: "tumorFamilyHistory",
  HX026: "historyBundle"
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
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未诉[^，。；;]*[，。；;]?/g, "")
    .replace(/需主动询问[，。；;]?/g, "")
    .replace(/需追问[，。；;]?/g, "")
    .trim();
}

function isNonPatientUnknown(value?: string) {
  return !value || /未诉|需追问|主动询问|未主动诉|不详/.test(value);
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
  return splitSentences(next)
    .filter((sentence) => !forbiddenLeakWords.some((word) => sentence.includes(word)))
    .join("。")
    .trim();
}

function containsForbidden(text: string) {
  return [...forbiddenPatientPhrases, ...forbiddenLeakWords].filter((word) => text.includes(word));
}

function concise(text: string, maxLength = 80) {
  const clean = stripTeacherAndReports(text);
  if (!clean) return "";
  return clean.length > maxLength ? `${clean.slice(0, maxLength).replace(/[，。；;、\s]*$/g, "")}。` : clean;
}

function asBullets(lines: string[]) {
  const cleanLines = lines
    .map((line) => concise(line, 80))
    .filter(Boolean)
    .slice(0, 2);
  if (!cleanLines.length) return "- 这个我没有特别注意到。";
  return cleanLines.map((line) => `- ${line.replace(/^[-•]\s*/, "")}`).join("\n");
}

function legacyAnswer(caseData: CaseData, slotId: string) {
  return caseData.interviewAnswers?.[slotId]?.patientAnswer || "";
}

function firstUsable(...values: Array<string | undefined>) {
  return values.map(cleanValue).find((value) => value && !isNonPatientUnknown(value)) || "";
}

function answerSmokingOrDrinking(caseData: CaseData, question: string) {
  const risk = caseData.riskFactors;
  if (hasAny(question, ["抽烟", "吸烟", "烟龄", "几包", "包年"])) {
    return firstUsable(risk.smoking, caseData.patientAnswers?.smoking) || "我平时不吸烟。";
  }
  if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) {
    return firstUsable(risk.alcohol, caseData.patientAnswers?.alcohol) || "我平时不怎么喝酒。";
  }
  return firstUsable(risk.smoking, risk.alcohol) || "抽烟、饮酒方面没有特别的。";
}

function answerPain(caseData: CaseData, question: string) {
  const illness = caseData.presentIllness;
  if (hasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) {
    return firstUsable(legacyAnswer(caseData, "HX009"), illness.dysuria) || "小便时不疼，也没有明显尿道烧灼感。";
  }
  if (hasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛", "肾区"])) {
    return firstUsable(legacyAnswer(caseData, "HX012"), illness.flankPain, illness.pain, caseData.patientAnswers?.pain) || "没有明显腰痛或肚子绞痛。";
  }
  return firstUsable(legacyAnswer(caseData, "HX009"), legacyAnswer(caseData, "HX012"), illness.pain) || "没有明显疼痛。";
}

function answerFromSlot(caseData: CaseData, slotId: string, question: string) {
  const illness = caseData.presentIllness;
  const risk = caseData.riskFactors;

  switch (slotId) {
    case "HX001":
      return [caseData.patientAnswers?.opening || caseData.studentChiefComplaint || caseData.chiefComplaint || "主要是小便颜色不太正常。"];
    case "HX002":
      return [firstUsable(legacyAnswer(caseData, "HX003"), caseData.studentChiefComplaint, caseData.chiefComplaint) || "发现小便变红已经有一段时间了。"];
    case "HX003":
      return [firstUsable(legacyAnswer(caseData, "HX002"), illness.hematuriaType) || "我是自己能看到尿色变红，不只是化验发现。"];
    case "HX004":
      return [firstUsable(legacyAnswer(caseData, "HX003"), illness.onset) || "开始得比较突然，具体诱因我说不清。"];
    case "HX005":
      return [firstUsable(legacyAnswer(caseData, "HX005"), legacyAnswer(caseData, "HX006"), caseData.patientAnswers?.phase, illness.hematuriaPhase) || "我没有特别分清是刚开始红还是最后红。"];
    case "HX006":
      return [firstUsable(legacyAnswer(caseData, "HX007"), caseData.patientAnswers?.color, illness.color) || "尿液颜色看起来偏红。"];
    case "HX007":
      return [firstUsable(legacyAnswer(caseData, "HX008"), caseData.patientAnswers?.clots, illness.clots) || "我没有注意到明显血块。"];
    case "HX008":
      return [firstUsable(legacyAnswer(caseData, "HX004"), illness.duration) || "不是每次都完全一样，有时明显一些。"];
    case "HX009":
      return [answerPain(caseData, question)];
    case "HX010":
      return [firstUsable(legacyAnswer(caseData, "HX010"), illness.urinaryFrequency, illness.urgency, illness.dysuria, caseData.patientAnswers?.irritativeSymptoms) || "没有明显尿频、尿急、尿痛。"];
    case "HX011":
      return [firstUsable(legacyAnswer(caseData, "HX011"), illness.voidingDifficulty) || "排尿没有特别费力。"];
    case "HX012":
      return [firstUsable(legacyAnswer(caseData, "HX013"), caseData.patientAnswers?.fever, illness.fever) || "没有发热，也没有寒战。"];
    case "HX013":
      return [firstUsable(legacyAnswer(caseData, "HX015"), caseData.patientAnswers?.glomerularClues) || "没有明显泡沫尿或水肿。"];
    case "HX014":
      return [firstUsable(legacyAnswer(caseData, "HX016"), risk.infectionHistory) || "最近没有明显感冒、咽痛。"];
    case "HX015":
      return [firstUsable(legacyAnswer(caseData, "HX019"), illness.trigger, risk.trauma) || "没有明显外伤、剧烈运动或尿路操作诱因。"];
    case "HX016":
      return [firstUsable(legacyAnswer(caseData, "HX020"), risk.stoneHistory, risk.infectionHistory, risk.tumorHistory, caseData.pastHistory) || "以前没有特别明确的泌尿系病史。"];
    case "HX017":
      return [firstUsable(caseData.pastHistory, legacyAnswer(caseData, "HX020")) || "以前身体情况没有特别的。"];
    case "HX018":
      return [firstUsable(legacyAnswer(caseData, "HX021"), risk.anticoagulants, caseData.medication) || "平时没有长期吃特殊药。"];
    case "HX019":
      return [answerSmokingOrDrinking(caseData, question)];
    case "HX020":
      return [firstUsable(risk.occupation) || "工作上没有接触特别的化学东西。"];
    case "HX021":
      return [firstUsable(legacyAnswer(caseData, "HX018")) || "这个情况对我不太适用，或没有这方面问题。"];
    case "HX022":
      return ["我在外院看过或做过一些检查，具体报告需要医生查看。"];
    case "HX023":
      return [firstUsable(legacyAnswer(caseData, "HX017"), legacyAnswer(caseData, "HX025")) || "胃口、体重和精神状态没有特别明显变化。"];
    case "HX024":
      return ["没有鼻出血、牙龈出血或皮肤瘀斑。"];
    case "HX025":
      return [firstUsable(legacyAnswer(caseData, "HX024"), risk.familyHistory, caseData.familyHistory) || "家里没有听说类似血尿或遗传性肾病。"];
    case "HX026":
      return ["可以，医生您问得具体一点，我尽量回忆。"];
    default:
      return [];
  }
}

function matchByStrongRules(question: string) {
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return ["HX006"];
  if (hasAny(question, ["血块", "血凝块", "凝血块", "块状"])) return ["HX007"];
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红", "第一杯", "第三杯", "一开始", "从头到尾"])) return ["HX005"];
  if (hasAny(question, ["肉眼", "镜下", "看得见", "尿检发现", "尿本身红"])) return ["HX003"];
  if (hasAny(question, ["多久", "什么时候", "几天", "几周", "几个月", "开始", "起病"])) return ["HX002"];
  if (hasAny(question, ["突然", "诱因", "怎么开始", "无明显诱因"])) return ["HX004"];
  if (hasAny(question, ["出血量", "多少血", "频率", "间断", "持续", "每次都有"])) return ["HX008"];
  if (hasAny(question, ["尿痛", "小便疼", "疼", "腰痛", "肾绞痛", "腹痛", "放射痛", "烧灼", "肾区"])) return ["HX009"];
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return ["HX010"];
  if (hasAny(question, ["排尿困难", "尿线", "尿流中断", "尿不出来", "费力", "尿潴留"])) return ["HX011"];
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "高热", "体温"])) return ["HX012"];
  if (hasAny(question, ["泡沫尿", "水肿", "眼睑肿", "下肢肿", "高血压"])) return ["HX013"];
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎", "上呼吸道"])) return ["HX014"];
  if (hasAny(question, ["运动", "劳累", "受凉", "外伤", "性生活", "导尿", "尿路操作", "膀胱镜"])) return ["HX015"];
  if (hasAny(question, ["结石史", "尿路感染", "前列腺", "泌尿系手术", "以前血尿", "泌尿病"])) return ["HX016"];
  if (hasAny(question, ["糖尿病", "冠心病", "房颤", "慢性病", "既往"])) return ["HX017"];
  if (hasAny(question, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "止痛药", "肾毒性", "吃药", "用药"])) return ["HX018"];
  if (hasAny(question, ["抽烟", "吸烟", "烟龄", "几包", "包年", "喝酒", "饮酒"])) return ["HX019"];
  if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属", "油漆", "接触"])) return ["HX020"];
  if (hasAny(question, ["月经", "阴道", "污染", "怀孕", "妊娠", "妇科"])) return ["HX021"];
  if (hasAny(question, ["看过医生", "吃过什么", "治疗过", "做过检查", "外院"])) return ["HX022"];
  if (hasAny(question, ["胃口", "体重", "乏力", "食欲", "大便", "精神"])) return ["HX023"];
  if (hasAny(question, ["鼻出血", "牙龈出血", "瘀斑", "紫癜", "出血倾向"])) return ["HX024"];
  if (hasAny(question, ["家族", "遗传", "家里", "亲属", "听力异常"])) return ["HX025"];
  if (hasAny(question, ["哪里不舒服", "为什么来", "主诉", "怎么不舒服"])) return ["HX001"];
  return [];
}

function matchBySlotDictionary(question: string) {
  const normalized = normalize(question);
  return questionSlots
    .map((slot) => {
      const candidates = [slot.label, slot.recommendedQuestion, ...(slot.triggers || [])]
        .map(normalize)
        .filter((item) => item.length >= 2);
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

function matchSlots(question: string) {
  const strong = matchByStrongRules(question);
  if (strong.length) return strong.slice(0, 1);
  return matchBySlotDictionary(question).slice(0, 1);
}

function broadHistoryReply(caseData: CaseData) {
  return asBullets([
    "主要是发现小便颜色不太正常。",
    firstUsable(caseData.patientAnswers?.color, caseData.presentIllness.color) || "尿液看起来发红。",
    "具体细节您可以一项一项问我。"
  ]);
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

  const matchedSlotIds = matchSlots(question);
  if (!matchedSlotIds.length) {
    return {
      replyText: asBullets([fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)]]),
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
