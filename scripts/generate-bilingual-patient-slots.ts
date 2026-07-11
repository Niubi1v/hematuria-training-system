import fs from "node:fs";
import path from "node:path";
import casesJson from "../data/cases.json";
import casesEnJson from "../data/cases_en.json";
import { canonicalSlotFromLegacy, canonicalSlotIds, type CanonicalSlotId } from "../src/lib/canonicalSlots";
import type { CaseData } from "../src/lib/types";

type BilingualAnswer = { patientAnswerZh: string; patientAnswerEn: string; provenance: string; teacherReviewRequired: boolean };
type Output = Record<string, Partial<Record<CanonicalSlotId, BilingualAnswer>>>;

const cases = casesJson as CaseData[];
const englishCases = casesEnJson as Array<Record<string, string>>;
const no = (text: string) => /否认|没有|无明显|未见|不吸烟|不饮酒|不喝酒|不痛|不疼|正常/.test(text);
const value = (...items: unknown[]) => items.map((item) => String(item || "").trim()).find(Boolean) || "";
const durationEn = (text: string) => {
  const match = text.match(/([半\d一二两三四五六七八九十]+)(?:个)?(小时|天|日|周|月|年)(余|多|左右)?/);
  if (!match) return "for some time";
  const numbers: Record<string, string> = { 半: "half", 一: "one", 二: "two", 两: "two", 三: "three", 四: "four", 五: "five", 六: "six", 七: "seven", 八: "eight", 九: "nine", 十: "ten" };
  const units: Record<string, string> = { 小时: "hour", 天: "day", 日: "day", 周: "week", 月: "month", 年: "year" };
  const amount = numbers[match[1]] || match[1];
  const plural = amount === "one" ? "" : "s";
  return `for about ${amount} ${units[match[2]]}${plural}`;
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
  const zh: Partial<Record<CanonicalSlotId, string>> = {
    chief_complaint: value(pfp.chiefComplaint, caseData.studentChiefComplaint, caseData.chiefComplaint),
    hematuria_visibility: value(pfp.hematuriaType, illness.hematuriaType), hematuria_onset: value(illness.onset, illness.duration, caseData.studentChiefComplaint),
    hematuria_frequency: value(extended.presentIllness.frequency, illness.duration), hematuria_phase: value(pfp.hematuriaPhase, illness.hematuriaPhase, caseData.patientAnswers?.phase),
    urine_color: value(pfp.urineColor, illness.color, caseData.patientAnswers?.color), clots: value(pfp.clots, illness.clots, caseData.patientAnswers?.clots),
    pain: value(caseData.patientAnswers?.pain, illness.pain, illness.flankPain), dysuria: dysuriaZh,
    flank_pain: value(pfp.flankPain, illness.flankPain), renal_colic: value(illness.flankPain, illness.pain), radiating_pain: value(illness.flankPain, illness.pain),
    urinary_frequency: frequencyZh, urinary_urgency: urgencyZh, voiding_difficulty: value(illness.voidingDifficulty, pfp.luts), retention: value(illness.voidingDifficulty, pfp.luts),
    fever_chills: value(pfp.fever, illness.fever, caseData.patientAnswers?.fever), glomerular_features: glomerularZh,
    recent_uri: recentUriZh, triggers: value(illness.trigger, risk.trauma),
    stone_history: sh?.stoneHistory?.patientAnswerZh, uti_history: sh?.urinaryInfectionHistory?.patientAnswerZh, tumor_history: sh?.malignancyHistory?.patientAnswerZh,
    urinary_procedure_history: sh?.urinaryProcedureHistory?.patientAnswerZh, surgery_history: sh?.surgeryHistory?.patientAnswerZh,
    anticoagulant: sh?.anticoagulantUse?.patientAnswerZh, antiplatelet: sh?.antiplateletUse?.patientAnswerZh, medications: sh?.medicationAnswerZh,
    smoking: sh?.smokingHistory?.patientAnswerZh, alcohol: sh?.alcoholHistory?.patientAnswerZh, occupation_exposure: sh?.occupationalExposure?.patientAnswerZh,
    gynecologic_contamination: sh?.menstrualHistory?.patientAnswerZh, family_history: sh?.familyHistory?.patientAnswerZh,
    bleeding_tendency: value(extended.patientAnswers?.bleedingTendency), past_history: pastSummaryZh,
    prior_care: value(extended.patientAnswers?.priorCare, extended.presentIllness.priorCare), general_condition: value(extended.patientAnswers?.generalCondition)
  };
  if (language === "zh") return zh[slot] || "这个我不太清楚。";

  const source = zh[slot] || "";
  const negative = no(source);
  const en: Partial<Record<CanonicalSlotId, string>> = {
    chief_complaint: englishCase?.chiefComplaint || `My urine has looked red ${durationEn(source)}.`,
    hematuria_visibility: /镜下|潜血|隐血/.test(source) ? "I could not see red urine; blood was found on a urine test." : "I could see that my urine was red.",
    hematuria_onset: `It started ${durationEn(source)}.`, hematuria_frequency: /间断|反复|时有时无/.test(source) ? "It has been intermittent rather than present every time." : "It has been present continuously.",
    hematuria_phase: /终末/.test(source) ? "It becomes red near the end of urination." : /起始|开始/.test(source) ? "It is red mainly at the beginning." : /全程|开始到结束/.test(source) ? "It is red throughout the whole urinary stream." : "I did not notice which part of urination was red.",
    urine_color: /茶|酱油|可乐/.test(source) ? "It looks tea- or cola-colored." : /鲜红/.test(source) ? "It looks bright red." : /暗红/.test(source) ? "It looks dark red." : /洗肉水/.test(source) ? "It looks pink-red, like water used to rinse meat." : "It looks reddish.",
    clots: negative ? "I have not noticed any blood clots." : /血块/.test(source) ? "I have noticed blood clots in the urine." : "I have not noticed any blood clots.",
    pain: negative ? "I do not have pain with it." : "I have pain with it.", dysuria: negative ? "It does not hurt or burn when I urinate." : "It hurts or burns when I urinate.",
    flank_pain: negative ? "I do not have flank pain." : "I have pain in my flank.", renal_colic: negative ? "I have not had severe colicky flank pain." : "I have had severe colicky flank pain.",
    radiating_pain: /放射|腹股沟|会阴/.test(source) ? "The pain radiates toward my lower abdomen or groin." : "The pain does not radiate elsewhere.",
    urinary_frequency: /尿频/.test(source) && !/无尿频|否认尿频/.test(source) ? "I have been urinating more often." : "I have not been urinating more often than usual.",
    urinary_urgency: /尿急/.test(source) && !/无尿急|否认尿急/.test(source) ? "I often have a sudden urgent need to urinate." : "I do not have urinary urgency.",
    voiding_difficulty: negative ? "I do not have difficulty urinating." : "I have some difficulty or straining when I urinate.", retention: /潴留|尿不出来/.test(source) && !negative ? "At times I cannot pass urine." : "I have not had urinary retention.",
    fever_chills: negative ? "I have not had fever or chills." : `I have had fever and chills${source.match(/\d{2}\.\d/) ? `, up to ${source.match(/\d{2}\.\d/)?.[0]} degrees Celsius` : ""}.`,
    glomerular_features: `${foamyPositive ? "I have noticed unusually foamy urine." : "I have not noticed foamy urine."}\n${edemaPositive ? "I have had swelling around my eyes or legs." : "I have not noticed swelling around my eyes or legs."}`, recent_uri: negative ? "I have not had a recent cold or sore throat." : "This followed a recent cold or sore throat.",
    triggers: negative ? "I did not notice exercise, trauma, sexual activity, or a urinary procedure as a trigger." : "There was a possible trigger before this started.",
    stone_history: sh?.stoneHistory?.patientAnswerEn, uti_history: sh?.urinaryInfectionHistory?.patientAnswerEn, tumor_history: sh?.malignancyHistory?.patientAnswerEn,
    urinary_procedure_history: sh?.urinaryProcedureHistory?.patientAnswerEn, surgery_history: sh?.surgeryHistory?.patientAnswerEn,
    anticoagulant: sh?.anticoagulantUse?.patientAnswerEn, antiplatelet: sh?.antiplateletUse?.patientAnswerEn,
    medications: translateMedication(sh?.medicationAnswerZh || ""), smoking: sh?.smokingHistory?.patientAnswerEn, alcohol: sh?.alcoholHistory?.patientAnswerEn,
    occupation_exposure: sh?.occupationalExposure?.patientAnswerEn, gynecologic_contamination: sh?.menstrualHistory?.patientAnswerEn,
    family_history: sh?.familyHistory?.patientAnswerEn, bleeding_tendency: negative ? "I have not had nosebleeds, gum bleeding, unusual bruising, or purpura." : "I have had bleeding or bruising elsewhere.",
    past_history: pastSummaryEn, prior_care: negative ? "I have not received specific treatment for this yet." : "I have already seen a doctor about this, but I do not remember all the details.",
    general_condition: /体重.*(?:下降|减轻)|消瘦/.test(source) ? "I have lost some weight recently." : "My appetite, sleep, bowel movements, and weight have not changed significantly."
  };
  const output = en[slot] || "I am not sure about that.";
  return /[\u3400-\u9fff]/.test(output) ? "I am not sure about that." : output;
}

const output: Output = {};
for (const caseData of cases) {
  const entries = Object.values(caseData.interviewAnswers || {});
  const legacyProvenance = new Map<CanonicalSlotId, string>();
  for (const entry of entries) {
    const canonical = canonicalSlotFromLegacy(entry.label, entry.possibleQuestion);
    if (canonical) legacyProvenance.set(canonical, "source");
  }
  output[caseData.id] = {};
  for (const slot of canonicalSlotIds) {
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
console.log(`Generated bilingual patient slots for ${Object.keys(output).length} cases x ${canonicalSlotIds.length} slots.`);
