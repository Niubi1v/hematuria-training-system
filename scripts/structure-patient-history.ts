import fs from "node:fs";
import path from "node:path";
import type { CaseData, StructuredAlcoholHistory, StructuredHistory, StructuredMedication, StructuredPatientFact, StructuredSmokingHistory } from "../src/lib/types";

type MutableCase = CaseData & Record<string, unknown>;
type QcRow = { caseId: string; field: string; before: string; after: string; reason: string; provenance: string; teacherReviewRequired: boolean };

const dataDir = path.join(process.cwd(), "data");
const placeholders = /未诉|需主动询问|需追问|不详|没有特别注意|原表未记录|训练中若被问及|未提供/;
const medicineNames = ["缬沙坦", "阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "达比加群", "阿哌沙班", "达格列净", "二甲双胍", "胰岛素", "氨氯地平", "硝苯地平", "贝那普利", "厄贝沙坦", "氯沙坦", "他汀", "非那雄胺", "坦索罗辛", "抗生素", "降压药"];
const medicationNamesEn: Record<string, string> = { 缬沙坦: "valsartan", 阿司匹林: "aspirin", 氯吡格雷: "clopidogrel", 华法林: "warfarin", 利伐沙班: "rivaroxaban", 达比加群: "dabigatran", 阿哌沙班: "apixaban", 达格列净: "dapagliflozin", 二甲双胍: "metformin", 胰岛素: "insulin", 氨氯地平: "amlodipine", 硝苯地平: "nifedipine", 贝那普利: "benazepril", 厄贝沙坦: "irbesartan", 氯沙坦: "losartan", 他汀: "a statin", 非那雄胺: "finasteride", 坦索罗辛: "tamsulosin", 抗生素: "an antibiotic", 降压药: "an antihypertensive" };

function read<T>(file: string): T { return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")); }
function write(file: string, value: unknown) { fs.writeFileSync(path.join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clean(value: unknown) { return String(value || "").replace(/吸烟：吸烟：/g, "吸烟：").replace(/饮酒：饮酒：/g, "饮酒：").replace(/手术术/g, "手术").replace(/ng\/m(?!L)/g, "ng/mL").replace(/\s+/g, " ").trim(); }
type SourceFacts = { pastHistory: string; personalHistory: string; familyHistory: string; medication: string; riskFactors: CaseData["riskFactors"]; patientFacingProfile: unknown };
function immutableSource(c: MutableCase): SourceFacts {
  if (c.sourceFacts && typeof c.sourceFacts === "object") return c.sourceFacts as SourceFacts;
  const source = { pastHistory: clean(c.pastHistory), personalHistory: clean(c.personalHistory), familyHistory: clean(c.familyHistory), medication: clean(c.medication), riskFactors: JSON.parse(JSON.stringify(c.riskFactors || {})), patientFacingProfile: JSON.parse(JSON.stringify(c.patientFacingProfile || {})) };
  c.sourceFacts = source;
  return source;
}
function sourceText(c: MutableCase) {
  const source = immutableSource(c);
  return clean([source.pastHistory, source.personalHistory, source.familyHistory, source.medication, JSON.stringify(source.riskFactors || {}), JSON.stringify(source.patientFacingProfile || {}), ...Object.values(c.interviewAnswers || {}).map((v: any) => v?.patientAnswer || "")].join("；"));
}
function relevantClause(rawValue: unknown, pattern: RegExp) {
  const raw = clean(rawValue);
  const clauses = raw.split(/[。；;]/).map((item) => item.trim()).filter(Boolean);
  return clauses.findLast((clause) => pattern.test(clause)) || raw;
}
function authoredFact(zh: string, en: string): StructuredPatientFact { return { status: "absent", patientAnswerZh: zh, patientAnswerEn: en, provenance: "author_added_for_simulation", teacherReviewRequired: true }; }
function factFromText(corpus: string, term: RegExp, zhName: string, enName: string): StructuredPatientFact {
  const clauses = corpus.split(/[。；]/).filter((clause) => new RegExp(term.source).test(clause));
  const explicitPositive = clauses.some((clause) => new RegExp(`(?:患有|确诊(?:为)?|得过)(?:${term.source})|(?:${term.source})(?:病史)?\\s*\\d+(?:余)?年|(?:既往史[:：])?(?:${term.source})病史?`).test(clause) && !/(否认|没有|无)[^，,]{0,20}$/.test(clause));
  if (explicitPositive) return { status: "present", patientAnswerZh: `有${zhName}。`, patientAnswerEn: `I have ${enName}.`, provenance: "source", teacherReviewRequired: false };
  const negative = clauses.some((clause) => new RegExp(`(?:否认|无|没有)[^，,]{0,36}(?:${term.source})|(?:${term.source})[^，,]{0,16}(?:无|否认|线索)`).test(clause));
  if (negative) return { status: "absent", patientAnswerZh: `没有${zhName}。`, patientAnswerEn: `I do not have ${enName}.`, provenance: "source", teacherReviewRequired: false };
  if (clauses.some((clause) => !/未诉|需主动询问|线索/.test(clause))) return { status: "present", patientAnswerZh: `有${zhName}。`, patientAnswerEn: `I have ${enName}.`, provenance: "source", teacherReviewRequired: false };
  return authoredFact(`没有${zhName}。`, `I do not have ${enName}.`);
}
function detailedFact(raw: string, positive: RegExp, negative: RegExp, positiveZh: string, negativeZh: string, positiveEn: string, negativeEn: string): StructuredPatientFact {
  const value = clean(raw);
  if (value && !placeholders.test(value)) {
    if (negative.test(value)) return { status: "absent", patientAnswerZh: negativeZh, patientAnswerEn: negativeEn, provenance: "source", teacherReviewRequired: false };
    if (positive.test(value)) return { status: "present", patientAnswerZh: positiveZh, patientAnswerEn: positiveEn, provenance: "source", teacherReviewRequired: false };
  }
  return authoredFact(negativeZh, negativeEn);
}

function familyAnswerEn(zh: string) {
  if (/兄弟.*前列腺癌/.test(zh)) return "One of my brothers had prostate cancer. There is no known hereditary kidney disease or similar hematuria in my family.";
  if (/母亲.*膀胱癌/.test(zh)) return "My mother had bladder cancer.";
  if (/父亲.*膀胱癌/.test(zh)) return "My father had bladder cancer.";
  if (/家族性肾病|类似血尿/.test(zh) && /否认|无|没有/.test(zh)) return "There is no known similar hematuria or hereditary kidney disease in my family.";
  return "There is a family medical history, but I do not know all the details.";
}

function surgeryFact(corpus: string): StructuredPatientFact {
  if (/冠脉[^。；]{0,20}支架|冠状动脉[^。；]{0,20}支架/.test(corpus)) return { status: "present", patientAnswerZh: "我以前做过冠脉支架介入治疗，不是泌尿系统操作。", patientAnswerEn: "I previously had a coronary stent procedure, not a urinary procedure.", provenance: "source", teacherReviewRequired: false };
  if (/胆囊切除/.test(corpus)) return { status: "present", patientAnswerZh: "我以前做过胆囊切除手术。", patientAnswerEn: "I previously had my gallbladder removed.", provenance: "source", teacherReviewRequired: false };
  if (/换(?:过)?(?:机械)?瓣膜|支架植入|切除术|做过[^。；]{0,20}手术/.test(corpus)) return { status: "present", patientAnswerZh: "我以前做过手术或介入治疗。", patientAnswerEn: "I have had surgery or an interventional procedure before.", provenance: "source", teacherReviewRequired: false };
  if (/没有做过手术|否认手术/.test(corpus)) return { status: "absent", patientAnswerZh: "我以前没有做过手术。", patientAnswerEn: "I have never had surgery.", provenance: "source", teacherReviewRequired: false };
  return authoredFact("我以前没有做过手术。", "I have never had surgery.");
}

function transfusionFact(corpus: string): StructuredPatientFact {
  if (/(?:有|曾有|接受过|进行过|且有)输血|输血史明确/.test(corpus)) return { status: "present", patientAnswerZh: "我以前输过血。", patientAnswerEn: "I have had a blood transfusion before.", provenance: "source", teacherReviewRequired: false };
  if (/没有(?:输过血|输血)|否认输血/.test(corpus)) return { status: "absent", patientAnswerZh: "我以前没有输过血。", patientAnswerEn: "I have never had a blood transfusion.", provenance: "source", teacherReviewRequired: false };
  return authoredFact("我以前没有输过血。", "I have never had a blood transfusion.");
}
function smoking(c: MutableCase, corpus: string): StructuredSmokingHistory {
  const source = immutableSource(c);
  const raw = relevantClause(source.riskFactors?.smoking, /吸烟|抽烟|烟龄|包年/);
  const usable = raw && !placeholders.test(raw);
  const negative = /不吸烟|从不吸烟|无吸烟|否认吸烟/.test(raw || corpus);
  const years = Number((raw.match(/(\d+)\s*(?:余)?年/) || [])[1] || 0);
  const halfPack = /每天半包|半包\/?(?:天|日|每天)/.test(raw);
  const cigarettesPerDay = halfPack ? 10 : Number((raw.match(/每天\s*(\d+)\s*支/) || [])[1] || ((raw.match(/(\d+(?:\.\d+)?)\s*包\/?(?:天|日|每天)|(?:每天)\s*(\d+(?:\.\d+)?)\s*包/) || [])[1] ? Number((raw.match(/(\d+(?:\.\d+)?)\s*包/) || [])[1]) * 20 : 0));
  const statedPackYears = Number((raw.match(/(\d+(?:\.\d+)?)\s*包年/) || [])[1] || 0);
  const former = /已戒|戒烟/.test(raw);
  if (usable && !negative) {
    const amount = cigarettesPerDay ? `每天约${cigarettesPerDay}支` : statedPackYears ? "具体每天多少支记不准" : "每天都吸";
    const duration = years ? `，吸了${years}年` : "";
    const packYears = statedPackYears || Math.round((cigarettesPerDay / 20) * years * 10) / 10;
    const packYearText = packYears ? `，累计约${packYears}包年` : "";
    return { status: former ? "former" : "current", cigarettesPerDay, years, quitYears: Number((raw.match(/戒烟(\d+)年/) || [])[1] || 0), packYears, patientAnswerZh: former ? `以前吸烟，${amount}${duration}${packYearText}，现在已经戒了。` : `吸烟，${amount}${duration}${packYearText}。`, patientAnswerEn: former ? "I used to smoke but have quit." : `I smoke${cigarettesPerDay ? ` about ${cigarettesPerDay} cigarettes a day` : ""}${years ? ` for ${years} years` : ""}${packYears ? `, about ${packYears} pack-years in total` : ""}.`, provenance: "source", teacherReviewRequired: false };
  }
  return { status: "never", cigarettesPerDay: 0, years: 0, quitYears: 0, packYears: 0, patientAnswerZh: "我不吸烟。", patientAnswerEn: "I do not smoke.", provenance: usable && negative ? "source" : "author_added_for_simulation", teacherReviewRequired: !(usable && negative) };
}
function alcohol(c: MutableCase): StructuredAlcoholHistory {
  const source = immutableSource(c);
  const clause = relevantClause(source.riskFactors?.alcohol, /饮酒|喝酒|酗酒|白酒|啤酒|红酒|黄酒/);
  const raw = clause.split(/[，,]/).findLast((item) => /饮酒|喝酒|酗酒|白酒|啤酒|红酒|黄酒/.test(item)) || clause;
  const usable = raw && !placeholders.test(raw);
  const negative = /不喝酒|不饮酒|无饮酒|无酗酒|不酗酒|否认[^。；]{0,16}(?:饮酒|喝酒|酗酒)/.test(raw);
  const positive = /饮酒|喝酒|白酒|啤酒|红酒|黄酒/.test(raw);
  const years = Number((raw.match(/(\d+)\s*(?:余)?年/) || [])[1] || 0);
  const type = (raw.match(/白酒|啤酒|红酒|黄酒/) || [""])[0];
  const amount = (raw.match(/(?:每天|每次)[^，。；]*|\d+\s*(?:两|毫升|ml)/i) || [""])[0];
  const frequency = /每天/.test(raw) ? "daily" : /偶尔|少量|应酬/.test(raw) ? "occasional" : "regular";
  const typeEn = ({ 白酒: "Chinese spirits", 啤酒: "beer", 红酒: "wine", 黄酒: "yellow rice wine" } as Record<string, string>)[type] || "alcohol";
  const numericAmount = (amount.match(/\d+(?:-\d+)?\s*(?:ml|毫升|两)/i) || [""])[0]
    .replace(/毫升/g, "mL").replace(/两/g, " liang");
  const amountEn = numericAmount ? `${numericAmount}${frequency === "daily" ? " a day" : " at a time"}` : "";
  if (usable && !negative && positive) return { status: /已戒|戒酒/.test(raw) ? "former" : "current", type, amount, frequency, years, patientAnswerZh: `喝酒，${[type, amount || (/偶尔|少量|应酬/.test(raw) ? "偶尔少量" : "")].filter(Boolean).join("，") || "平时会喝一些"}。`, patientAnswerEn: frequency === "occasional" ? "I drink alcohol occasionally in small amounts." : `I drink ${typeEn}${amountEn ? `, about ${amountEn}` : ""}.`, provenance: "source", teacherReviewRequired: false };
  return { status: "never", type: "", amount: "0", frequency: "never", years: 0, patientAnswerZh: "我平时不喝酒。", patientAnswerEn: "I do not drink alcohol.", provenance: usable && negative ? "source" : "author_added_for_simulation", teacherReviewRequired: !(usable && negative) };
}
function extractMedications(corpus: string, medicationSource: string): StructuredMedication[] {
  const found = medicineNames.filter((name) => corpus.includes(name)).filter((name) => name !== "降压药" || !medicineNames.some((specific) => specific !== "降压药" && /缬沙坦|氨氯地平|硝苯地平|贝那普利|厄贝沙坦|氯沙坦/.test(specific) && corpus.includes(specific)));
  return [...new Set(found)].map((name) => {
    if (name === "降压药") return { name, dose: "", frequency: "每日", indication: "高血压", provenance: "source", teacherReviewRequired: false };
    const clause = medicationSource.split(/[。；]/).find((part) => part.includes(name)) || "";
    const doseMatch = clause.match(new RegExp(`${name}[（(]([^（）()、，,]{1,20})[）)]`));
    const dose = doseMatch?.[1]?.trim() || "";
    return { name, dose, frequency: /qd|每日|每天/i.test(clause) ? "每日" : "", indication: name === "缬沙坦" ? "高血压" : name === "阿司匹林" ? "抗血小板" : "", provenance: "source", teacherReviewRequired: false };
  });
}
function createHistory(c: MutableCase): StructuredHistory {
  const corpus = sourceText(c);
  const source = immutableSource(c);
  const meds = extractMedications(corpus, source.medication);
  const medZh = meds.length ? `我长期服用${meds.map((m) => `${m.name}${m.dose ? `（${m.dose}）` : ""}`).join("、")}。` : "我没有长期服药。";
  const medEn = meds.length ? `I regularly take ${meds.map((m) => medicationNamesEn[m.name] || m.name).join(" and ")}.` : "I do not take any long-term medication.";
  const sh = smoking(c, corpus);
  const ah = alcohol(c);
  const occupationRaw = clean(source.riskFactors?.occupation);
  const exposureNames = [
    [/染料/, "dyes"], [/芳香胺/, "aromatic amines"], [/橡胶/, "rubber"], [/皮革/, "leather"],
    [/化工/, "industrial chemicals"], [/重金属/, "heavy metals"], [/苯/, "benzene"]
  ].filter(([pattern]) => (pattern as RegExp).test(occupationRaw)).map(([, label]) => label as string);
  const exposureYears = Number((occupationRaw.match(/(\d+)\s*(?:余)?年/) || [])[1] || 0);
  const exposureEn = exposureNames.length
    ? `My work involved exposure to ${exposureNames.join(" and ")}${exposureYears ? ` for about ${exposureYears} years` : ""}.`
    : "I have not worked with dyes, rubber, leather, industrial chemicals, or heavy metals.";
  const occupation = occupationRaw && !placeholders.test(occupationRaw)
    ? { status: "present", patientAnswerZh: /职业暴露/.test(occupationRaw) ? "我的工作会接触一些化工材料。" : `我的工作是${occupationRaw.replace(/^职业[:：]?/, "")}。`, patientAnswerEn: exposureNames.length ? "I worked in an industry with chemical exposure." : "I have a regular job.", provenance: "source", teacherReviewRequired: false } as StructuredPatientFact
    : authoredFact("我做普通工作。", "I have a regular job.");
  const exposure = detailedFact(occupationRaw, /染料|橡胶|皮革|化工|重金属|芳香胺|职业暴露/, /无|否认|未接触/, `工作中接触过${occupationRaw}。`, "工作中没有接触染料、橡胶、皮革、化工或重金属。", exposureEn, "I have not worked with dyes, rubber, leather, industrial chemicals, or heavy metals.");
  const antiPlatelet = meds.some((m) => /阿司匹林|氯吡格雷/.test(m.name));
  const anticoagulant = meds.some((m) => /华法林|利伐沙班|达比加群|阿哌沙班/.test(m.name));
  const simple = (term: RegExp, zh: string, en: string) => factFromText(corpus, term, zh, en);
  const allergyNames = [...new Set(["青霉素", "磺胺类药物", "清开灵", "头孢"].filter((name) => corpus.includes(name)))];
  const allergyHistory: StructuredPatientFact = allergyNames.length
    ? { status: "present", patientAnswerZh: `我对${allergyNames.join("、")}过敏。`, patientAnswerEn: `I am allergic to ${allergyNames.map((name) => ({ 青霉素: "penicillin", 磺胺类药物: "sulfonamides", 清开灵: "Qingkailing", 头孢: "cephalosporins" }[name] || "a medication")).join(" and ")}.`, provenance: "source", teacherReviewRequired: false }
    : /否认(?:药物)?过敏|无(?:药物)?过敏|过敏未发现/.test(corpus)
      ? { status: "absent", patientAnswerZh: "我没有药物或食物过敏。", patientAnswerEn: "I have no known drug or food allergies.", provenance: "source", teacherReviewRequired: false }
      : authoredFact("我没有已知药物或食物过敏。", "I have no known drug or food allergies.");
  const familyClause = source.familyHistory.split(/[。；]/).find((clause) => /父母|子女|兄弟|姐妹/.test(clause))
    || corpus.split(/[。；]/).find((clause) => /父母|子女|兄弟|姐妹/.test(clause));
  const familyHistory: StructuredPatientFact = familyClause
    ? { status: "present", patientAnswerZh: `${familyClause.replace(/^家族史[：:]?/, "")}。`, patientAnswerEn: familyAnswerEn(familyClause), provenance: "source", teacherReviewRequired: false }
    : authoredFact("家里没有人得过类似血尿或遗传性肾病。", "No one in my family has had similar hematuria or hereditary kidney disease.");
  return {
    smokingHistory: sh, alcoholHistory: ah, occupation, occupationalExposure: exposure,
    hypertension: simple(/高血压/, "高血压", "hypertension"), diabetes: simple(/糖尿病/, "糖尿病", "diabetes"), coronaryDisease: simple(/冠心病|冠脉|冠状动脉|心绞痛|心肌梗死|心脏病/, "冠心病", "coronary heart disease"), stroke: simple(/脑梗|脑卒中|中风/, "脑卒中", "stroke"), liverDisease: simple(/肝炎|乙肝|丙肝|肝病/, "肝病", "liver disease"), tuberculosis: simple(/结核/, "结核病", "tuberculosis"),
    stoneHistory: detailedFact(clean(source.riskFactors?.stoneHistory), /结石/, /否认|无|没有|(?:[:：]否$)/, "以前得过泌尿系结石。", "以前没有得过泌尿系结石。", "I have had urinary stones before.", "I have never had urinary stones."),
    urinaryInfectionHistory: detailedFact(clean(source.riskFactors?.infectionHistory), /感染|膀胱炎|肾盂肾炎/, /否认|无|没有|(?:[:：]否$)/, "以前得过尿路感染。", "以前没有反复尿路感染。", "I have had a urinary tract infection before.", "I have no history of recurrent urinary tract infection."),
    malignancyHistory: detailedFact(clean(source.riskFactors?.tumorHistory), /肿瘤|癌/, /否认|无|没有|(?:[:：]否$)/, "以前得过肿瘤。", "以前没有得过肿瘤。", "I have a history of cancer.", "I have no previous history of cancer."),
    traumaHistory: detailedFact(clean(source.riskFactors?.trauma), /外伤|撞伤|跌伤/, /否认|无|没有|(?:[:：]否$)/, "以前有过相关外伤。", "近期没有相关外伤。", "I have had relevant trauma.", "I have not had relevant trauma."),
    urinaryProcedureHistory: detailedFact(clean(source.riskFactors?.trauma), /导尿|膀胱镜|尿路操作|泌尿手术/, /否认|无|没有/, "以前做过泌尿系统操作。", "以前没有做过导尿、膀胱镜等泌尿操作。", "I have had a urinary procedure before.", "I have not had catheterization, cystoscopy, or other urinary procedures."),
    surgeryHistory: surgeryFact(corpus),
    transfusionHistory: transfusionFact(corpus),
    allergyHistory,
    anticoagulantUse: anticoagulant ? { status: "present", patientAnswerZh: `我在服用${meds.filter((m) => /华法林|利伐沙班|达比加群|阿哌沙班/.test(m.name)).map((m) => m.name).join("、")}。`, patientAnswerEn: "I take an anticoagulant.", provenance: "source", teacherReviewRequired: false } : authoredFact("我没有服用华法林、利伐沙班等抗凝药。", "I do not take anticoagulants."),
    antiplateletUse: antiPlatelet ? { status: "present", patientAnswerZh: `我在服用${meds.filter((m) => /阿司匹林|氯吡格雷/.test(m.name)).map((m) => m.name).join("、")}。`, patientAnswerEn: "I take antiplatelet medication.", provenance: "source", teacherReviewRequired: false } : authoredFact("我没有服用阿司匹林或氯吡格雷。", "I do not take antiplatelet medication."),
    familyHistory,
    menstrualHistory: c.sex === "女" ? authoredFact("月经情况正常，这次尿色异常不是在月经期。", "My periods are regular, and this episode did not occur during menstruation.") : { status: "absent", patientAnswerZh: "我是男性，不涉及月经。", patientAnswerEn: "I am male, so menstruation does not apply.", provenance: "source", teacherReviewRequired: false },
    pregnancyHistory: c.sex === "女" ? authoredFact("目前没有怀孕。", "I am not currently pregnant.") : { status: "absent", patientAnswerZh: "我是男性，不涉及怀孕。", patientAnswerEn: "I am male, so pregnancy does not apply.", provenance: "source", teacherReviewRequired: false },
    medicationList: meds, medicationAnswerZh: medZh, medicationAnswerEn: medEn
  };
}

const qc: QcRow[] = [];
for (const file of ["cases.json", "cases_42.json"]) {
  const cases = read<MutableCase[]>(file).map((c) => {
    const before = JSON.stringify(c.structuredHistory || {});
    c.structuredHistory = createHistory(c);
    c.schemaVersion = "2.2.0";
    c.caseVersion = `${String(c.caseVersion || (c.id.startsWith("HX-ADD") ? "HX-ADD" : "V2")).replace(/-2\.1$/, "")}-2.2`;
    c.medication = c.structuredHistory.medicationAnswerZh.replace(/^我长期服用/, "").replace(/。$/, "") || c.medication;
    c.personalHistory = [c.structuredHistory.smokingHistory.patientAnswerZh, c.structuredHistory.alcoholHistory.patientAnswerZh, c.structuredHistory.occupationalExposure.patientAnswerZh].join("；");
    c.familyHistory = c.structuredHistory.familyHistory.patientAnswerZh;
    if (c.structuredHistory.surgeryHistory.status === "present") c.pastHistory = clean(c.pastHistory)
      .replace(/没有做过手术[、，]输血病史/g, "否认输血史")
      .replace(/(?:没有做过手术|否认手术史?)[、，]?/g, "")
      .replace(/否认糖尿病、心脏病、肝炎/g, "否认糖尿病、肝炎");
    if (c.structuredHistory.allergyHistory.status === "present") c.pastHistory = clean(c.pastHistory).replace(/(?:否认药物过敏史?|无药物过敏史?)[、，]?/g, "");
    Object.entries(c.structuredHistory).forEach(([field, value]) => {
      if (value && typeof value === "object" && "teacherReviewRequired" in value && value.teacherReviewRequired) qc.push({ caseId: c.id, field, before: before || "缺失", after: (value as StructuredPatientFact).patientAnswerZh, reason: "原始病例未提供明确患者答案，按教学模拟补全", provenance: "author_added_for_simulation", teacherReviewRequired: true });
    });
    return c;
  });
  write(file, cases);
}
write("case_history_qc_report.json", qc);
const grouped = new Map<string, QcRow[]>();
qc.forEach((row) => grouped.set(row.caseId, [...(grouped.get(row.caseId) || []), row]));
const md = ["# 42例结构化病史QC报告", "", `生成版本：${process.env.CASE_LIBRARY_BUILD_ID || "deterministic"}`, "", "说明：source 表示原病例明确记载；author_added_for_simulation 表示为保证标准化病人可回答而补全，必须由教师复核。", "", "| 病例 | 修改字段 | 修改后患者答案 | 原因 | 教师复核 |", "|---|---|---|---|---|", ...qc.map((r) => `| ${r.caseId} | ${r.field} | ${r.after.replace(/\|/g, "、")} | ${r.reason} | 是 |`)];
fs.writeFileSync(path.join(process.cwd(), "CASE_DATA_QC_REPORT.md"), `${md.join("\n")}\n`, "utf8");
console.log(`Structured histories generated for 42 cases; ${qc.length} authored facts require teacher review.`);
