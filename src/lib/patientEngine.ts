import { EMPTY_COLLECTED } from "./keyPoints";
import interviewSlotsJson from "@/data/interview_slots.json";
import type { CaseData, CollectedMap, InterviewSlot, KeyPointId } from "./types";

type Rule = {
  id: KeyPointId;
  priority: number;
  keywords: string[];
  topic?: "smoking" | "alcohol" | "smokingAlcohol";
  answer: (caseData: CaseData, question: string) => string;
};

const fallbackAnswers = ["这个我不太清楚。", "好像没有特别的。", "这个我没有注意到。"];
const interviewSlots = interviewSlotsJson as InterviewSlot[];

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:（）()【】[\]{}"“”'‘’]/g, "");
}

function slotToKeyPoint(slotId: string): KeyPointId | undefined {
  const map: Record<string, KeyPointId> = {
    HX001: "onset",
    HX002: "onset",
    HX003: "hematuriaType",
    HX004: "colorClots",
    HX005: "hematuriaPhase",
    HX006: "hematuriaPhase",
    HX007: "colorClots",
    HX008: "flankPain",
    HX009: "irritativeSymptoms",
    HX010: "fever",
    HX011: "infectionHistory",
    HX012: "historyBundle",
    HX013: "historyBundle",
    HX014: "anticoagulants",
    HX015: "smoking",
    HX016: "historyBundle",
    HX017: "historyBundle",
    HX018: "historyBundle",
    HX019: "voidingDifficulty",
    HX020: "voidingDifficulty",
    HX021: "flankPain",
    HX022: "fever",
    HX024: "infectionHistory",
    HX025: "infectionHistory",
    HX026: "infectionHistory",
    HX028: "trauma",
    HX029: "historyBundle",
    HX030: "historyBundle",
    HX032: "anticoagulants",
    HX034: "smoking",
    HX035: "occupation",
    HX036: "stoneHistory",
    HX037: "infectionHistory",
    HX038: "tumorFamilyHistory",
    HX039: "infectionHistory",
    HX040: "historyBundle"
  };
  return map[slotId];
}

function forcedPhaseSlots(question: string): string[] {
  const text = normalizeForMatch(question);
  const slots = new Set<string>();

  if (includesAny(text, ["刚开始红还是最后红", "开始红还是最后红", "开始还是最后", "初始还是终末", "刚尿还是快尿完"])) {
    ["HX005", "HX006"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["是不是一直红", "一直红", "整泡红", "从头到尾", "从开始到结束", "全程", "都红"])) {
    ["HX005", "HX006"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["拉到最后才红", "最后才红", "快尿完红", "终末", "最后几滴", "尿完才红"])) {
    ["HX005", "HX006"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["刚开始红", "第一杯红", "起始血尿", "初始血尿", "尿道口滴血"])) {
    ["HX005", "HX006"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["三杯尿", "分三杯", "分段尿", "哪一杯最红"])) {
    ["HX005", "HX006"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["镜下血尿", "肉眼不红", "尿检发现", "潜血"])) {
    ["HX003"].forEach((slot) => slots.add(slot));
  }
  if (includesAny(text, ["假性血尿", "月经", "阴道", "污染", "擦拭有血", "色素尿"])) {
    ["HX012"].forEach((slot) => slots.add(slot));
  }

  return [...slots];
}

function heuristicSlots(question: string): string[] {
  const text = normalizeForMatch(question);
  const slots = new Set<string>();

  if (text.includes("肉眼") || includesAny(text, ["镜下", "尿检", "体检", "检查", "潜血", "化验"])) slots.add("HX003");
  if (includesAny(text, ["多久", "什么时候", "几天", "几周", "几月", "几年", "第一次", "开始出现", "间断", "持续", "反复"])) slots.add("HX002");
  if (includesAny(text, ["颜色", "鲜红", "暗红", "洗肉水", "茶色", "浓茶"])) slots.add("HX004");
  if (includesAny(text, ["血块", "凝血块", "血丝", "条索", "蚯蚓", "块多大", "什么样的血块"])) slots.add("HX007");
  if (includesAny(text, ["疼不疼", "痛不痛", "尿痛", "刺痛", "灼热", "腰疼", "腰痛", "肾绞痛", "腹股沟放射"])) slots.add("HX008");
  if (includesAny(text, ["尿频", "尿急", "排尿困难", "尿线细", "费力", "尿不尽", "尿不出来", "尿潴留"])) slots.add("HX009");
  if (includesAny(text, ["发烧", "发热", "体温", "寒战", "冷不冷", "恶心", "呕吐"])) slots.add("HX010");
  if (includesAny(text, ["泡沫", "水肿", "眼睑肿", "眼皮肿", "下肢肿", "感冒", "上感", "咽痛", "肾小球", "高血压", "管型", "蛋白尿"])) slots.add("HX011");
  if (includesAny(text, ["月经", "经期", "阴道", "擦拭", "白带血", "怀孕", "妊娠", "假性", "污染"])) slots.add("HX012");
  if (includesAny(text, ["既往", "过去", "病史", "过敏", "手术", "输血", "结石", "感染史"])) slots.add("HX013");
  if (includesAny(text, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "药", "用药"])) slots.add("HX014");
  if (includesAny(text, ["吸烟", "抽烟", "烟龄", "包年", "职业", "染料", "橡胶", "皮革", "油漆", "化工", "芳香胺", "肿瘤", "癌", "家族"])) slots.add("HX015");
  if (includesAny(text, ["尿常规", "尿检", "院前尿检", "红细胞"])) slots.add("HX016");
  if (includesAny(text, ["影像", "彩超", "CT", "B超", "院前检查"])) slots.add("HX017");

  return [...slots];
}

function matchInterviewSlots(question: string): string[] {
  const forced = forcedPhaseSlots(question);
  if (forced.length) return forced;
  const heuristic = heuristicSlots(question);

  const normalized = normalizeForMatch(question);
  const matches = interviewSlots
    .map((slot) => {
      const candidates = [slot.label, slot.recommendedQuestion, ...slot.triggers].map(normalizeForMatch).filter((item) => item.length >= 2);
      const hits = candidates.filter((trigger) => normalized.includes(trigger) || trigger.includes(normalized));
      const score = hits.reduce((sum, hit) => sum + hit.length, 0) + (slot.isKey && hits.length ? 2 : 0);
      return { slotId: slot.slotId, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return uniqueAnswers([...heuristic, ...matches.slice(0, 2).map((item) => item.slotId)]).slice(0, 3);
}

function answerInterviewSlots(caseData: CaseData, slotIds: string[]) {
  const answers = slotIds
    .map((slotId) => caseData.interviewAnswers?.[slotId]?.patientAnswer)
    .map((answer) => answer?.trim())
    .filter(Boolean) as string[];

  if (!answers.length) return "";
  return uniqueAnswers(answers).join(" ");
}

function answerColor(caseData: CaseData, question: string) {
  const directAnswer = caseData.patientAnswers?.color;
  if (directAnswer) return directAnswer;
  const color = caseData.presentIllness.color || "就是小便颜色发红。";
  if (question.includes("鲜红")) {
    if (color.includes("鲜红")) return "是的，颜色偏鲜红。";
    return `不是特别鲜红，${color}`;
  }
  if (question.includes("浓茶")) {
    if (color.includes("浓茶")) return "是的，颜色有点像浓茶。";
    return `不像浓茶，${color}`;
  }
  if (question.includes("洗肉水")) {
    if (color.includes("洗肉水")) return "是的，像洗肉水样。";
    return `不像洗肉水，${color}`;
  }
  return color;
}

function answerClots(caseData: CaseData) {
  if (caseData.patientAnswers?.clots) return caseData.patientAnswers.clots;
  return caseData.presentIllness.clots || "我没太注意到有没有血块。";
}

function answerFever(caseData: CaseData) {
  return caseData.patientAnswers?.fever || caseData.presentIllness.fever || "没有发烧，也没有寒战。";
}

function answerTemperature(caseData: CaseData) {
  return caseData.patientAnswers?.temperature || "没有量到发热。";
}

function answerSmoking(caseData: CaseData) {
  return caseData.patientAnswers?.smoking || caseData.riskFactors.smoking || "平时不吸烟。";
}

function answerAlcohol(caseData: CaseData) {
  return caseData.patientAnswers?.alcohol || caseData.riskFactors.alcohol || "平时不怎么喝酒。";
}

function answerSmokingAlcohol(caseData: CaseData) {
  return [answerSmoking(caseData), answerAlcohol(caseData)].filter(Boolean).join(" ");
}

function uniqueAnswers(answers: string[]) {
  return [...new Set(answers.map((item) => item.trim()).filter(Boolean))];
}

const rules: Rule[] = [
  {
    id: "historyBundle",
    priority: 82,
    keywords: ["年龄", "几岁", "多大", "性别", "男的", "女的", "男患者", "女患者"],
    answer: (caseData) => `我${caseData.age}岁，${caseData.sex}性。`
  },
  {
    id: "colorClots",
    priority: 100,
    keywords: ["血块", "血丝", "凝血块", "块状"],
    answer: (caseData) => answerClots(caseData)
  },
  {
    id: "colorClots",
    priority: 95,
    keywords: ["颜色", "鲜红", "洗肉水", "浓茶", "淡红", "粉红", "红色"],
    answer: (caseData, question) => answerColor(caseData, question)
  },
  {
    id: "onset",
    priority: 80,
    keywords: ["什么时候", "多久", "几天", "几月", "开始", "起病", "出现"],
    answer: (caseData) => caseData.presentIllness.onset || caseData.studentChiefComplaint || caseData.chiefComplaint
  },
  {
    id: "hematuriaType",
    priority: 75,
    keywords: ["肉眼", "镜下", "看得见", "尿红", "潜血"],
    answer: (caseData) => caseData.presentIllness.hematuriaType || "就是尿颜色看起来不太正常。"
  },
  {
    id: "hematuriaPhase",
    priority: 70,
    keywords: ["全程", "终末", "刚尿", "快尿完", "阶段", "一开始", "最后"],
    answer: (caseData) => caseData.patientAnswers?.phase || caseData.presentIllness.hematuriaPhase || "这个我没有特别分清楚。"
  },
  {
    id: "irritativeSymptoms",
    priority: 60,
    keywords: ["尿频", "尿急", "尿痛", "刺痛", "疼不疼", "排尿痛", "灼热"],
    answer: (caseData) => caseData.patientAnswers?.irritativeSymptoms || [caseData.presentIllness.urinaryFrequency, caseData.presentIllness.urgency, caseData.presentIllness.dysuria].filter(Boolean).join(" ") || "小便刺激症状不明显。"
  },
  {
    id: "flankPain",
    priority: 55,
    keywords: ["腰痛", "腰疼", "肾绞痛", "肚子痛", "放射", "会阴", "腹股沟"],
    answer: (caseData) => caseData.patientAnswers?.pain || caseData.presentIllness.flankPain || caseData.presentIllness.pain || "没有明显腰痛。"
  },
  {
    id: "fever",
    priority: 52,
    keywords: ["最高体温", "体温", "多少度", "几度", "烧到"],
    answer: (caseData) => answerTemperature(caseData)
  },
  {
    id: "fever",
    priority: 50,
    keywords: ["发热", "发烧", "寒战", "冷不冷", "打寒战"],
    answer: (caseData) => answerFever(caseData)
  },
  {
    id: "voidingDifficulty",
    priority: 45,
    keywords: ["排尿困难", "尿不出来", "尿线", "尿分叉", "费力", "尿潴留", "尿不尽"],
    answer: (caseData) => caseData.presentIllness.voidingDifficulty || "排尿还算可以。"
  },
  {
    id: "smoking",
    priority: 42,
    keywords: ["烟酒"],
    topic: "smokingAlcohol",
    answer: (caseData) => answerSmokingAlcohol(caseData)
  },
  {
    id: "smoking",
    priority: 40,
    keywords: ["吸烟", "抽烟", "烟龄", "包年", "几包"],
    topic: "smoking",
    answer: (caseData) => answerSmoking(caseData)
  },
  {
    id: "historyBundle",
    priority: 39,
    keywords: ["饮酒", "喝酒", "白酒", "啤酒", "酒量", "酗酒"],
    topic: "alcohol",
    answer: (caseData) => answerAlcohol(caseData)
  },
  {
    id: "occupation",
    priority: 35,
    keywords: ["工作", "职业", "染料", "橡胶", "油漆", "化工", "接触"],
    answer: (caseData) => caseData.riskFactors.occupation || "没有接触过什么特殊东西。"
  },
  {
    id: "stoneHistory",
    priority: 30,
    keywords: ["结石", "肾结石", "输尿管结石", "以前犯过"],
    answer: (caseData) => caseData.patientAnswers?.stoneClues || caseData.riskFactors.stoneHistory || "以前没有明确结石史。"
  },
  {
    id: "infectionHistory",
    priority: 28,
    keywords: ["泡沫尿", "水肿", "眼皮肿", "眼睑", "蛋白尿", "上感"],
    answer: (caseData) => caseData.patientAnswers?.glomerularClues || caseData.riskFactors.infectionHistory || "没有这些情况。"
  },
  {
    id: "infectionHistory",
    priority: 25,
    keywords: ["感染", "咽痛", "扁桃体", "感冒", "尿路感染", "炎症"],
    answer: (caseData) => caseData.riskFactors.infectionHistory || "最近没有明显感染。"
  },
  {
    id: "trauma",
    priority: 20,
    keywords: ["外伤", "摔", "撞", "受伤"],
    answer: (caseData) => caseData.riskFactors.trauma || "没有外伤。"
  },
  {
    id: "anticoagulants",
    priority: 15,
    keywords: ["抗凝", "阿司匹林", "氯吡格雷", "华法林", "药", "吃什么药"],
    answer: (caseData) => caseData.riskFactors.anticoagulants || caseData.medication || "没有长期吃特殊药。"
  },
  {
    id: "tumorFamilyHistory",
    priority: 10,
    keywords: ["肿瘤", "癌", "家里", "家族", "遗传"],
    answer: (caseData) => caseData.patientAnswers?.tumorRisk || [caseData.riskFactors.tumorHistory, caseData.riskFactors.familyHistory].filter(Boolean).join(" ") || "家里没有听说类似情况。"
  },
  {
    id: "historyBundle",
    priority: 5,
    keywords: ["既往", "过去", "病史", "过敏", "手术", "输血", "个人史", "婚育"],
    answer: (caseData) => caseData.pastHistory || "以前身体情况没有特别的。"
  }
];

export function askPatient(caseData: CaseData, question: string): { answer: string; matchedKeys: KeyPointId[]; matchedSlots: string[] } {
  const normalized = question.replace(/\s+/g, "");
  const matchedSlots = matchInterviewSlots(question).filter((slotId) => caseData.interviewAnswers?.[slotId]);
  if (matchedSlots.length) {
    const answer = answerInterviewSlots(caseData, matchedSlots);
    const matchedKeys = uniqueAnswers(matchedSlots.map(slotToKeyPoint).filter(Boolean) as KeyPointId[]) as KeyPointId[];
    return {
      answer: answer || "未诉/否认。",
      matchedKeys,
      matchedSlots
    };
  }

  const matched = rules
    .filter((rule) => includesAny(normalized, rule.keywords))
    .sort((a, b) => b.priority - a.priority);

  if (!matched.length) {
    return {
      answer: fallbackAnswers[Math.floor(Math.random() * fallbackAnswers.length)],
      matchedKeys: [],
      matchedSlots: []
    };
  }

  // 问题很具体时，只回答最相关的槽位，避免主动透露太多信息。
  const asksSmoking = includesAny(normalized, ["烟酒", "吸烟", "抽烟", "烟龄", "包年", "几包"]);
  const asksAlcohol = includesAny(normalized, ["烟酒", "饮酒", "喝酒", "白酒", "啤酒", "酒量", "酗酒"]);
  const asksSmokeAlcohol = asksSmoking && asksAlcohol;
  const shouldAnswerSingleTopic = !asksSmokeAlcohol && (matched[0].priority >= 90 || normalized.length <= 12);
  const selected = asksSmokeAlcohol
    ? matched.filter((rule) => rule.topic === "smokingAlcohol" || rule.topic === "smoking" || rule.topic === "alcohol").slice(0, 2)
    : shouldAnswerSingleTopic
      ? [matched[0]]
      : matched.slice(0, 2);
  const answers = uniqueAnswers(selected.map((rule) => rule.answer(caseData, normalized)));

  return {
    answer: answers.join(" ") || "这个我不太清楚。",
    matchedKeys: uniqueAnswers(selected.map((rule) => rule.id)) as KeyPointId[],
    matchedSlots: []
  };
}

export function mergeCollected(current: CollectedMap, keys: KeyPointId[]): CollectedMap {
  return keys.reduce((next, key) => ({ ...next, [key]: true }), { ...current });
}

export function createEmptyCollected(): CollectedMap {
  return { ...EMPTY_COLLECTED };
}
