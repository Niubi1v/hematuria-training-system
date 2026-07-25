import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import casesJson from "../data/cases.json";
import casesEnJson from "../data/cases_en.json";
import existingSlotsJson from "../data/patient_slots_bilingual.json";
import { canonicalSlotFromLegacy, canonicalSlotIds, type CanonicalSlotId } from "../src/lib/canonicalSlots";
import type { CaseData } from "../src/lib/types";

type BilingualAnswer = { patientAnswerZh: string; patientAnswerEn: string; provenance: string; teacherReviewRequired: boolean };
type Output = Record<string, Partial<Record<CanonicalSlotId, BilingualAnswer>>>;

const require = createRequire(import.meta.url);
const { isBilingualConflict } = require("../server/bilingualConflictQuarantine.js") as {
  isBilingualConflict(caseId: string, field: string): boolean;
};
const cases = casesJson as CaseData[];
const englishCases = casesEnJson as Array<Record<string, string>>;
const existingSlots = existingSlotsJson as Output;
const value = (...items: unknown[]) => items.map((item) => String(item || "").trim()).find(Boolean) || "";
const compact = (text: string) => String(text || "").replace(/\s+/g, "");
const genericUnknown = (text: string) => /不太清楚|没(?:有)?特别注意|没留意|记不(?:太)?清|记不准确|说不准|一时记不全|未诉|未主动诉|需追问|需主动询问|不详|未提供|无法确认|有没有.+记/.test(compact(text));

type Polarity = "positive" | "negative" | "unknown";

const negativePatterns: Partial<Record<CanonicalSlotId, RegExp>> = {
  clots: /^(?:否|无)$|(?:无|没有|未见|否认)[^。；]*血块/,
  pain: /无痛性|^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:疼痛|痛|疼)/,
  dysuria: /无痛性|小便时不痛|^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:尿痛|烧灼|小便疼|排尿疼)/,
  flank_pain: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:腰痛|腰部疼痛|腰背部.*疼痛|肾区痛)/,
  renal_colic: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:绞痛|腰痛|腰部疼痛|腰背部.*疼痛)/,
  radiating_pain: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:放射|腰痛|腰部疼痛|腰背部.*疼痛)|不向[^。；]*放射/,
  urinary_frequency: /^(?:否|无)$|(?:无|没有|否认)[^。；]*尿频|次数没有增多/,
  urinary_urgency: /^(?:否|无)$|(?:无|没有|否认)[^。；]*尿急/,
  voiding_difficulty: /^(?:否|无)$|(?:无|没有|否认)[^。；]*排尿困难|排尿不费力/,
  retention: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:尿潴留|尿不出来)/,
  fever_chills: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:发热|发烧|寒战)/,
  recent_uri: /^(?:否|无)$|(?:无|没有|否认)[^。；]*(?:近期感冒|最近感冒|咽痛|扁桃体炎|上呼吸道感染)/,
  triggers: /^(?:否|无)$|无明显诱因|(?:无|没有|否认)[^。；]*(?:外伤|剧烈运动|性生活|尿路操作|诱因)/,
  stone_history: /(?:无|没有|否认|从未)[^。；]*(?:结石|肾结石|输尿管结石)/,
  uti_history: /(?:无|没有|否认|从未)[^。；]*(?:尿路感染|膀胱炎|肾盂肾炎|反复感染)/,
  tumor_history: /(?:无|没有|否认|从未)[^。；]*(?:肿瘤|癌|放化疗)/,
  urinary_procedure_history: /(?:无|没有|否认|从未)[^。；]*(?:导尿|尿管|膀胱镜|泌尿操作|尿路操作)/,
  surgery_history: /(?:无|没有|否认|从未)[^。；]*(?:手术|开刀|介入)/,
  anticoagulant: /(?:无|没有|否认|从未)[^。；]*(?:抗凝|华法林|利伐沙班|达比加群|阿哌沙班)/,
  antiplatelet: /(?:无|没有|否认|从未)[^。；]*(?:抗血小板|阿司匹林|氯吡格雷)/,
  smoking: /不吸烟|从不吸烟|(?:无|没有|否认)[^。；]*吸烟/,
  alcohol: /不喝酒|不饮酒|从不饮酒|(?:无|没有|否认)[^。；]*(?:喝酒|饮酒)/,
  occupation_exposure: /(?:无|没有|否认)[^。；]*(?:接触|暴露)/,
  gynecologic_contamination: /男性|不涉及月经|不在月经期|不是[^。；]*(?:月经|阴道)|(?:无|没有|否认)[^。；]*阴道出血/,
  bleeding_tendency: /(?:无|没有|否认)[^。；]*(?:鼻出血|牙龈出血|瘀斑|紫癜|出血倾向)/
};

const positivePatterns: Partial<Record<CanonicalSlotId, RegExp>> = {
  clots: /(?:有|出现|伴)[^。；]*血块|血块/,
  pain: /(?:疼痛|腰痛|腹痛|憋胀|酸胀痛|绞痛|痛感)/,
  dysuria: /尿痛|小便[^。；]*(?:疼|痛)|排尿[^。；]*(?:疼|痛)|烧灼/,
  flank_pain: /腰痛|腰部[^。；]*(?:疼痛|酸胀|不适)|腰背部[^。；]*(?:疼痛|酸胀)|肾区痛/,
  renal_colic: /绞痛/,
  radiating_pain: /放射|腹股沟|会阴/,
  urinary_frequency: /尿频|次数增多/,
  urinary_urgency: /尿急|憋不住|急迫性尿失禁/,
  voiding_difficulty: /排尿[^。；]*(?:困难|费力)|尿线变细|尿流中断/,
  retention: /尿潴留|尿不出来/,
  fever_chills: /发热|发烧|寒战|高热/,
  recent_uri: /(?:感冒|咽痛|扁桃体炎|上呼吸道感染|上感)(?:后|之后)/,
  triggers: /(?:剧烈运动|外伤|性生活|导尿|膀胱镜|尿路操作)(?:后|之后|诱发)/,
  stone_history: /(?:有|曾|既往|以前)[^。；]*(?:结石|肾结石|输尿管结石)/,
  uti_history: /(?:有|曾|既往|以前|反复)[^。；]*(?:尿路感染|膀胱炎|肾盂肾炎)/,
  tumor_history: /(?:有|曾|既往|以前)[^。；]*(?:肿瘤|癌|放化疗)/,
  urinary_procedure_history: /(?:做过|接受过|插过)[^。；]*(?:导尿|尿管|膀胱镜|泌尿操作|尿路操作)/,
  surgery_history: /(?:做过|接受过|有过)[^。；]*(?:手术|开刀|介入)|(?:切除|支架植入|换瓣)/,
  anticoagulant: /(?:服用|吃|用)[^。；]*(?:抗凝|华法林|利伐沙班|达比加群|阿哌沙班)/,
  antiplatelet: /(?:服用|吃|用)[^。；]*(?:抗血小板|阿司匹林|氯吡格雷)/,
  smoking: /吸烟|抽烟|每天[^。；]*(?:支|根|包)|包年/,
  alcohol: /喝酒|饮酒|白酒|啤酒/,
  occupation_exposure: /接触[^。；]*(?:染料|橡胶|皮革|化工|芳香胺|重金属)|职业暴露/,
  gynecologic_contamination: /月经期|阴道出血/,
  bleeding_tendency: /鼻出血|牙龈出血|瘀斑|紫癜|出血倾向/
};

function polarity(slot: CanonicalSlotId, text: string): Polarity {
  const source = compact(text);
  if (!source || genericUnknown(source)) return "unknown";
  if (negativePatterns[slot]?.test(source)) return "negative";
  if (positivePatterns[slot]?.test(source)) return "positive";
  return "unknown";
}

function unknownAnswer(slot: CanonicalSlotId, language: "zh" | "en") {
  const observationSlots = new Set<CanonicalSlotId>([
    "clots", "pain", "dysuria", "flank_pain", "renal_colic", "radiating_pain", "urinary_frequency",
    "urinary_urgency", "voiding_difficulty", "retention", "fever_chills", "recent_uri", "triggers",
    "bleeding_tendency", "hematuria_frequency", "hematuria_phase", "prior_care", "general_condition"
  ]);
  if (language === "en") {
    return observationSlots.has(slot)
      ? "I did not pay close attention to that before."
      : "I cannot recall that clearly.";
  }
  return observationSlots.has(slot)
    ? "这个我之前没特别注意。"
    : "这点我记不太清了。";
}

const durationEn = (text: string) => {
  const match = text.match(/([半\d一二两三四五六七八九十]+)(?:个)?(小时|天|日|周|月|年)(余|多|左右)?/);
  if (!match) return "for some time";
  const numbers: Record<string, string> = { 半: "half", 一: "one", 二: "two", 两: "two", 三: "three", 四: "four", 五: "five", 六: "six", 七: "seven", 八: "eight", 九: "nine", 十: "ten" };
  const units: Record<string, string> = { 小时: "hour", 天: "day", 日: "day", 周: "week", 月: "month", 年: "year" };
  const amount = numbers[match[1]] || (match[1] === "1" ? "one" : match[1]);
  const plural = amount === "one" ? "" : "s";
  return `about ${amount} ${units[match[2]]}${plural} ago`;
};
const medicationNames: Record<string, string> = {
  缬沙坦: "valsartan", 阿司匹林: "aspirin", 氯吡格雷: "clopidogrel", 华法林: "warfarin", 利伐沙班: "rivaroxaban",
  达比加群: "dabigatran", 阿哌沙班: "apixaban", 二甲双胍: "metformin", 胰岛素: "insulin", 非那雄胺: "finasteride", 坦索罗辛: "tamsulosin"
};
function translateMedication(text: string) {
  let translated = text;
  for (const [zh, en] of Object.entries(medicationNames)) translated = translated.replaceAll(zh, en);
  const names = Object.values(medicationNames).filter((name) => translated.toLowerCase().includes(name));
  return names.length ? `I regularly take ${[...new Set(names)].join(" and ")}.` : "I am not taking any regular medication that I know of.";
}

function answer(caseData: CaseData, slot: CanonicalSlotId, language: "zh" | "en") {
  const extended = caseData as unknown as CaseData & {
    patientFacingProfile?: Record<string, string>;
    presentIllness: CaseData["presentIllness"] & { frequency?: string; priorCare?: string };
    patientAnswers?: CaseData["patientAnswers"] & { bleedingTendency?: string; priorCare?: string; generalCondition?: string };
  };
  const pfp = extended.patientFacingProfile || {};
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};
  const sh = caseData.structuredHistory;
  const chronicFacts = sh ? [sh.hypertension, sh.diabetes, sh.coronaryDisease, sh.stroke, sh.liverDisease, sh.tuberculosis]
    .filter((fact) => fact && fact.status === "present") : [];
  const pastSummaryZh = chronicFacts.length
    ? chronicFacts.slice(0, 3).map((fact) => fact.patientAnswerZh).join("；")
    : "以前没有明确的高血压、糖尿病、心脏病、肝炎或结核病史。";
  const pastSummaryEn = chronicFacts.length
    ? chronicFacts.slice(0, 3).map((fact) => fact.patientAnswerEn).join(" ")
    : "I have no known history of hypertension, diabetes, heart disease, hepatitis, or tuberculosis.";
  const combined = value(pfp.luts, caseData.patientAnswers?.irritativeSymptoms, illness.dysuria, illness.urinaryFrequency, illness.urgency);
  const dysuriaZh = [illness.dysuria, caseData.patientAnswers?.pain, illness.pain, combined].map((item) => String(item || "").trim()).find((item) => /尿痛|小便.*(?:疼|痛)|排尿.*(?:疼|痛)|烧灼|无痛/.test(item)) || "我没有特别注意到小便疼痛或烧灼感。";
  const frequencyZh = /尿频/.test(combined) ? combined : "我没有特别注意到小便次数明显增多。";
  const urgencyZh = /尿急|憋不住/.test(combined) ? combined : "我没有特别注意到尿急或憋不住尿。";
  const glomerularSource = value(pfp.glomerularClues, caseData.patientAnswers?.glomerularClues);
  const foamyPositive = /泡沫尿/.test(glomerularSource) && !/(?:无|否认|没有)[^；，。]{0,8}泡沫尿/.test(glomerularSource);
  const edemaPositive = /水肿|眼睑肿|下肢肿/.test(glomerularSource) && !/(?:无|否认|没有)[^；，。]{0,8}(?:水肿|眼睑肿|下肢肿)/.test(glomerularSource);
  const glomerularZh = `${foamyPositive ? "我有注意到尿里泡沫比较多。" : "我没有注意到明显泡沫尿。"}\n${edemaPositive ? "我有眼睑或下肢水肿。" : "我没有注意到眼睑或下肢水肿。"}`;
  const uriMatch = glomerularSource.split(/[；，。\n]/).find((item) => /感冒|咽痛|扁桃体炎|上感/.test(item));
  const recentUriZh = uriMatch || "最近没有明显感冒、咽痛或扁桃体炎。";
  const englishCase = englishCases.find((item) => item.id === caseData.id);
  const rawPhase = value(pfp.hematuriaPhase, illness.hematuriaPhase, caseData.patientAnswers?.phase);
  const rawFrequency = value(extended.presentIllness.frequency, illness.duration);
  const rawClots = value(pfp.clots, illness.clots, caseData.patientAnswers?.clots);
  const rawFlankPain = value(pfp.flankPain, illness.flankPain);
  const rawVoiding = value(illness.voidingDifficulty, pfp.luts);
  const rawRecentUri = recentUriZh;
  const rawTrigger = value(illness.trigger, risk.trauma);
  const rawFamily = sh?.familyHistory?.patientAnswerZh || "";
  const familyAnswersSpecificQuestion = /血尿|肾病|肾炎|肿瘤|癌|遗传|类似/.test(rawFamily);
  const zh: Partial<Record<CanonicalSlotId, string>> = {
    chief_complaint: value(pfp.chiefComplaint, caseData.studentChiefComplaint, caseData.chiefComplaint),
    hematuria_visibility: value(pfp.hematuriaType, illness.hematuriaType), hematuria_onset: value(illness.onset, illness.duration, caseData.studentChiefComplaint),
    hematuria_frequency: /间断|反复|时有时无|持续|每次|一直/.test(rawFrequency) ? rawFrequency : unknownAnswer("hematuria_frequency", "zh"),
    hematuria_phase: /需追问|可伴|未分清|不详/.test(rawPhase) ? unknownAnswer("hematuria_phase", "zh") : rawPhase,
    urine_color: value(pfp.urineColor, illness.color, caseData.patientAnswers?.color),
    clots: polarity("clots", rawClots) === "unknown" ? unknownAnswer("clots", "zh") : rawClots,
    pain: value(caseData.patientAnswers?.pain, illness.pain, illness.flankPain), dysuria: dysuriaZh,
    flank_pain: rawFlankPain,
    renal_colic: polarity("renal_colic", rawFlankPain) === "unknown" ? unknownAnswer("renal_colic", "zh") : rawFlankPain,
    radiating_pain: polarity("radiating_pain", rawFlankPain) === "unknown" ? unknownAnswer("radiating_pain", "zh") : rawFlankPain,
    urinary_frequency: frequencyZh, urinary_urgency: urgencyZh, voiding_difficulty: rawVoiding,
    retention: polarity("retention", rawVoiding) === "unknown" ? unknownAnswer("retention", "zh") : rawVoiding,
    fever_chills: value(pfp.fever, illness.fever, caseData.patientAnswers?.fever), glomerular_features: glomerularZh,
    recent_uri: polarity("recent_uri", rawRecentUri) === "unknown" ? unknownAnswer("recent_uri", "zh") : rawRecentUri,
    triggers: polarity("triggers", rawTrigger) === "unknown" ? unknownAnswer("triggers", "zh") : rawTrigger,
    stone_history: sh?.stoneHistory?.patientAnswerZh, uti_history: sh?.urinaryInfectionHistory?.patientAnswerZh, tumor_history: sh?.malignancyHistory?.patientAnswerZh,
    urinary_procedure_history: sh?.urinaryProcedureHistory?.patientAnswerZh, surgery_history: sh?.surgeryHistory?.patientAnswerZh,
    anticoagulant: sh?.anticoagulantUse?.patientAnswerZh, antiplatelet: sh?.antiplateletUse?.patientAnswerZh, medications: sh?.medicationAnswerZh,
    smoking: sh?.smokingHistory?.patientAnswerZh, alcohol: sh?.alcoholHistory?.patientAnswerZh, occupation_exposure: sh?.occupationalExposure?.patientAnswerZh,
    gynecologic_contamination: sh?.menstrualHistory?.patientAnswerZh,
    family_history: familyAnswersSpecificQuestion ? rawFamily : unknownAnswer("family_history", "zh"),
    bleeding_tendency: value(extended.patientAnswers?.bleedingTendency) || unknownAnswer("bleeding_tendency", "zh"), past_history: pastSummaryZh,
    prior_care: value(extended.patientAnswers?.priorCare, extended.presentIllness.priorCare) || unknownAnswer("prior_care", "zh"),
    general_condition: value(extended.patientAnswers?.generalCondition) || unknownAnswer("general_condition", "zh")
  };
  if (language === "zh") return zh[slot] || "这个我不太清楚。";

  const source = zh[slot] || "";
  const sourcePolarity = polarity(slot, source);
  const negative = sourcePolarity === "negative";
  const unknown = sourcePolarity === "unknown";
  const en: Partial<Record<CanonicalSlotId, string>> = {
    chief_complaint: englishCase?.chiefComplaint || `My urine has looked red ${durationEn(source)}.`,
    hematuria_visibility: /肉眼|看得见|尿色.*(?:红|粉)/.test(source) && /镜下|潜血|隐血|红细胞/.test(source)
      ? (/擦拭|纸巾|粉红/.test(source)
        ? "I could see pink discoloration when wiping, and red blood cells were also found on a urine test."
        : "I could see that my urine looked red, and red blood cells were also found on a urine test.")
      : /肉眼|看得见|尿色.*(?:红|粉)/.test(source)
        ? "I could see that my urine looked red."
        : /镜下|潜血|隐血|红细胞/.test(source)
          ? "I could not see red urine; blood was found on a urine test."
          : unknownAnswer(slot, "en"),
    hematuria_onset: `It started ${durationEn(source)}.`,
    hematuria_frequency: /间断|反复|时有时无/.test(source)
      ? "It has been intermittent rather than present every time."
      : /持续|一直|每次/.test(source)
        ? "It has been present continuously."
        : unknownAnswer(slot, "en"),
    hematuria_phase: /终末/.test(source)
      ? "It becomes red near the end of urination."
      : /起始|开始/.test(source)
        ? "It is red mainly at the beginning."
        : /全程|开始到结束/.test(source)
          ? "It is red throughout the whole urinary stream."
          : unknownAnswer(slot, "en"),
    urine_color: /茶|酱油|可乐/.test(source) ? "It looks tea- or cola-colored." : /鲜红/.test(source) ? "It looks bright red." : /暗红/.test(source) ? "It looks dark red." : /洗肉水/.test(source) ? "It looks pink-red, like water used to rinse meat." : "It looks reddish.",
    clots: unknown ? unknownAnswer(slot, "en") : negative ? "I have not noticed any blood clots." : "I have noticed blood clots in the urine.",
    pain: unknown ? unknownAnswer(slot, "en") : negative ? "I do not have pain with it." : "I have pain with it.",
    dysuria: unknown ? unknownAnswer(slot, "en") : negative ? "It does not hurt or burn when I urinate." : "It hurts or burns when I urinate.",
    flank_pain: unknown ? unknownAnswer(slot, "en") : negative ? "I do not have flank pain." : "I have pain in my flank.",
    renal_colic: unknown ? unknownAnswer(slot, "en") : negative ? "I have not had severe colicky flank pain." : "I have had severe colicky flank pain.",
    radiating_pain: unknown ? unknownAnswer(slot, "en") : negative ? "The pain does not radiate elsewhere." : "The pain radiates toward my lower abdomen or groin.",
    urinary_frequency: unknown ? unknownAnswer(slot, "en") : negative ? "I have not been urinating more often than usual." : "I have been urinating more often.",
    urinary_urgency: unknown ? unknownAnswer(slot, "en") : negative ? "I do not have urinary urgency." : "I often have a sudden urgent need to urinate.",
    voiding_difficulty: unknown ? unknownAnswer(slot, "en") : negative ? "I do not have difficulty urinating." : "I have some difficulty or straining when I urinate.",
    retention: unknown ? unknownAnswer(slot, "en") : negative ? "I have not had urinary retention." : "At times I cannot pass urine.",
    fever_chills: unknown ? unknownAnswer(slot, "en") : negative ? "I have not had fever or chills." : `I have had fever or chills${source.match(/\d{2}\.\d/) ? `, up to ${source.match(/\d{2}\.\d/)?.[0]} degrees Celsius` : ""}.`,
    glomerular_features: `${foamyPositive ? "I have noticed unusually foamy urine." : "I have not noticed foamy urine."}\n${edemaPositive ? "I have had swelling around my eyes or legs." : "I have not noticed swelling around my eyes or legs."}`,
    recent_uri: unknown ? unknownAnswer(slot, "en") : negative ? "I have not had a recent cold or sore throat." : "This followed a recent cold or sore throat.",
    triggers: unknown ? unknownAnswer(slot, "en") : negative ? "I did not have exercise, trauma, sexual activity, or a urinary procedure before this started." : "There was a trigger before this started.",
    stone_history: sh?.stoneHistory?.patientAnswerEn, uti_history: sh?.urinaryInfectionHistory?.patientAnswerEn, tumor_history: sh?.malignancyHistory?.patientAnswerEn,
    urinary_procedure_history: sh?.urinaryProcedureHistory?.patientAnswerEn, surgery_history: sh?.surgeryHistory?.patientAnswerEn,
    anticoagulant: sh?.anticoagulantUse?.patientAnswerEn, antiplatelet: sh?.antiplateletUse?.patientAnswerEn,
    medications: translateMedication(sh?.medicationAnswerZh || ""), smoking: sh?.smokingHistory?.patientAnswerEn, alcohol: sh?.alcoholHistory?.patientAnswerEn,
    occupation_exposure: sh?.occupationalExposure?.patientAnswerEn, gynecologic_contamination: sh?.menstrualHistory?.patientAnswerEn,
    family_history: genericUnknown(source) ? unknownAnswer(slot, "en") : sh?.familyHistory?.patientAnswerEn,
    bleeding_tendency: unknown ? unknownAnswer(slot, "en") : negative ? "I have not had nosebleeds, gum bleeding, unusual bruising, or purpura." : "I have had bleeding or bruising elsewhere.",
    past_history: pastSummaryEn,
    prior_care: unknown ? unknownAnswer(slot, "en") : negative ? "I have not received specific treatment for this yet." : "I have already seen a doctor about this.",
    general_condition: genericUnknown(source) ? unknownAnswer(slot, "en") : /体重.*(?:下降|减轻)|消瘦/.test(source) ? "I have lost some weight recently." : "My appetite, sleep, bowel movements, and weight have not changed significantly."
  };
  const output = en[slot] || "I am not sure about that.";
  return /[\u3400-\u9fff]/.test(output) ? "I am not sure about that." : output;
}

const selectedCaseIds = new Set(
  String(process.env.HISTORY_RECONCILIATION_CASES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const output: Output = structuredClone(existingSlots);
for (const caseData of cases.filter((item) => !selectedCaseIds.size || selectedCaseIds.has(item.id))) {
  const entries = Object.values(caseData.interviewAnswers || {});
  const legacyProvenance = new Map<CanonicalSlotId, string>();
  for (const entry of entries) {
    const canonical = canonicalSlotFromLegacy(entry.label, entry.possibleQuestion);
    if (canonical) legacyProvenance.set(canonical, "source");
  }
  output[caseData.id] = {};
  for (const slot of canonicalSlotIds) {
    if (isBilingualConflict(caseData.id, slot) && existingSlots[caseData.id]?.[slot]) {
      output[caseData.id][slot] = existingSlots[caseData.id][slot];
      continue;
    }
    output[caseData.id][slot] = {
      patientAnswerZh: answer(caseData, slot, "zh"),
      patientAnswerEn: answer(caseData, slot, "en"),
      provenance: legacyProvenance.get(slot) || "derived_from_case_facts",
      teacherReviewRequired: caseData.medicalReview?.status !== "approved"
    };
  }
}

const target = path.resolve("data/patient_slots_bilingual.json");
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Generated bilingual patient slots for ${selectedCaseIds.size || cases.length} selected cases; output retains ${Object.keys(output).length} cases x ${canonicalSlotIds.length} slots.`);
