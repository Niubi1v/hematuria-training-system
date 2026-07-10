import type { CaseData, StructuredHistory, StructuredPatientFact } from "./types";

export type StructuredReply = {
  replyText: string;
  matchedSlotIds: string[];
  matchedFacts: string[];
  answerSource: "source" | "author_added_for_simulation" | "mixed";
  confidence: number;
  safetyFlags: string[];
  fallbackReason: string;
};

type FactMatch = { key: keyof StructuredHistory; slotId: string; triggers: RegExp; targeted?: RegExp };

const facts: FactMatch[] = [
  { key: "smokingHistory", slotId: "LIFE_SMOKING", triggers: /吸烟|抽烟|烟龄|每天.*(?:支|包)|包年|smok/i },
  { key: "alcoholHistory", slotId: "LIFE_ALCOHOL", triggers: /喝酒|饮酒|酒量|白酒|啤酒|alcohol|drink/i },
  { key: "occupation", slotId: "LIFE_OCCUPATION", triggers: /什么工作|做什么工作|职业|occupation|job/i },
  { key: "occupationalExposure", slotId: "LIFE_EXPOSURE", triggers: /染料|橡胶|皮革|化工|重金属|芳香胺|职业暴露|chemical|dye|exposure/i },
  { key: "hypertension", slotId: "PAST_HYPERTENSION", triggers: /高血压|hypertension/i },
  { key: "diabetes", slotId: "PAST_DIABETES", triggers: /糖尿病|diabetes/i },
  { key: "coronaryDisease", slotId: "PAST_CORONARY", triggers: /冠心病|心脏病|心肌梗死|心绞痛|coronary|heart disease/i },
  { key: "stroke", slotId: "PAST_STROKE", triggers: /脑梗|脑卒中|中风|stroke/i },
  { key: "liverDisease", slotId: "PAST_LIVER", triggers: /肝炎|乙肝|丙肝|肝病|hepatitis|liver disease/i },
  { key: "tuberculosis", slotId: "PAST_TB", triggers: /结核|tuberculosis|\bTB\b/i },
  { key: "stoneHistory", slotId: "PAST_STONE", triggers: /结石史|以前.*结石|得过.*结石|stone history|stones before/i },
  { key: "urinaryInfectionHistory", slotId: "PAST_UTI", triggers: /感染史|以前.*尿路感染|反复.*感染|UTI history|urinary infection/i },
  { key: "malignancyHistory", slotId: "PAST_MALIGNANCY", triggers: /肿瘤史|以前.*肿瘤|得过.*癌|cancer history/i },
  { key: "traumaHistory", slotId: "PAST_TRAUMA", triggers: /外伤史|受过伤|撞伤|跌伤|trauma/i },
  { key: "urinaryProcedureHistory", slotId: "PAST_URINARY_PROCEDURE", triggers: /导尿|膀胱镜|尿路操作|泌尿.*手术|catheter|cystoscopy|urinary procedure/i },
  { key: "surgeryHistory", slotId: "PAST_SURGERY", triggers: /手术史|做过.*手术|开过刀|surgery|operation/i },
  { key: "transfusionHistory", slotId: "PAST_TRANSFUSION", triggers: /输血史|输过血|blood transfusion/i },
  { key: "allergyHistory", slotId: "PAST_ALLERGY", triggers: /过敏|allerg/i },
  { key: "anticoagulantUse", slotId: "MED_ANTICOAGULANT", triggers: /抗凝|华法林|利伐沙班|达比加群|阿哌沙班|anticoag|warfarin|rivaroxaban/i },
  { key: "antiplateletUse", slotId: "MED_ANTIPLATELET", triggers: /抗血小板|阿司匹林|氯吡格雷|antiplatelet|aspirin|clopidogrel/i },
  { key: "familyHistory", slotId: "FAMILY_HISTORY", triggers: /家族史|家里|父母|兄弟姐妹|遗传|family history|hereditary/i },
  { key: "menstrualHistory", slotId: "GYNE_MENSTRUAL", triggers: /月经|经期|阴道出血|menstru|period/i },
  { key: "pregnancyHistory", slotId: "GYNE_PREGNANCY", triggers: /怀孕|妊娠|pregnan/i }
];

const broadMedication = /长期.*(?:吃|服|用).*药|平时.*(?:吃|服|用).*药|都吃什么药|用药史|长期用药|regular medication|medications do you take/i;

function provenance(items: Array<StructuredPatientFact | { provenance: string }>) {
  const values = new Set(items.map((item) => item.provenance));
  return values.size > 1 ? "mixed" : (values.values().next().value || "source");
}

export function matchStructuredPatientQuestion(caseData: CaseData, question: string, language: "zh" | "en" = "zh"): StructuredReply | null {
  const history = caseData.structuredHistory;
  if (!history) return null;
  const matches = facts.filter((item) => item.triggers.test(question));
  const wantsAllMedication = broadMedication.test(question) && !matches.some((item) => item.key === "anticoagulantUse" || item.key === "antiplateletUse");
  const matchedFacts = matches.map((item) => String(item.key));
  const matchedSlotIds = matches.map((item) => item.slotId);
  const answers: string[] = [];
  const sources: Array<StructuredPatientFact | { provenance: string }> = [];

  if (wantsAllMedication) {
    answers.push(language === "en" ? history.medicationAnswerEn : history.medicationAnswerZh);
    matchedFacts.push("medicationList");
    matchedSlotIds.push("MED_ALL");
    sources.push(...history.medicationList);
  }
  for (const match of matches) {
    const fact = history[match.key] as StructuredPatientFact;
    if (!fact || typeof fact !== "object" || !("patientAnswerZh" in fact)) continue;
    answers.push(language === "en" ? fact.patientAnswerEn : fact.patientAnswerZh);
    sources.push(fact);
  }
  const uniqueAnswers = [...new Set(answers.map((item) => item.trim()).filter(Boolean))];
  if (!uniqueAnswers.length) return null;
  return {
    replyText: uniqueAnswers.join(language === "en" ? " " : ""),
    matchedSlotIds: [...new Set(matchedSlotIds)],
    matchedFacts: [...new Set(matchedFacts)],
    answerSource: provenance(sources) as StructuredReply["answerSource"],
    confidence: sources.some((item) => item.provenance === "author_added_for_simulation") ? 0.82 : 0.99,
    safetyFlags: [],
    fallbackReason: ""
  };
}
