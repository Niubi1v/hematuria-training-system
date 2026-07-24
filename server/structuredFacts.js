const factMatchers = [
  ["smokingHistory", "LIFE_SMOKING", /吸烟|抽烟|烟龄|每天.*(?:支|根|包)|一天抽多少|包年|smok|cigarettes?.*(?:day|daily)|how many cigarettes/i],
  ["alcoholHistory", "LIFE_ALCOHOL", /喝酒|饮酒|酒量|白酒|啤酒|alcohol|drink/i],
  ["occupation", "LIFE_OCCUPATION", /什么工作|做什么工作|职业|occupation|job|what do you do for a living/i],
  ["occupationalExposure", "LIFE_EXPOSURE", /染料|染发剂|油漆|橡胶|皮革|化工|重金属|芳香胺|职业暴露|(?:work|job|occupation|expos).*(?:chemical|dye|paint|rubber|leather)|(?:chemical|dye|paint|rubber|leather).*(?:work|job|occupation|expos)/i],
  ["hypertension", "PAST_HYPERTENSION", /高血压|hypertension/i],
  ["diabetes", "PAST_DIABETES", /糖尿病|diabetes/i],
  ["coronaryDisease", "PAST_CORONARY", /冠心病|心脏病|心肌梗死|心绞痛|coronary|heart disease/i],
  ["stroke", "PAST_STROKE", /脑梗|脑卒中|中风|stroke/i],
  ["liverDisease", "PAST_LIVER", /肝炎|乙肝|丙肝|肝病|hepatitis|liver disease/i],
  ["tuberculosis", "PAST_TB", /结核|tuberculosis|\bTB\b/i],
  ["stoneHistory", "PAST_STONE", /结石史|以前.*结石|得过.*结石|stone history|stones before/i],
  ["urinaryInfectionHistory", "PAST_UTI", /感染史|以前.*尿路感染|反复.*感染|UTI history|urinary infection/i],
  ["malignancyHistory", "PAST_MALIGNANCY", /肿瘤史|以前.*肿瘤|得过.*癌|cancer history|previous cancer|cancer before/i],
  [
    "traumaHistory",
    "PAST_TRAUMA",
    /外伤史|受过(?:外)?伤|以前[^，。！？?]*外伤|既往[^，。！？?]*外伤|撞伤|跌伤|trauma history|have you had[^?.!]*trauma|previous trauma/i
  ],
  ["urinaryProcedureHistory", "PAST_URINARY_PROCEDURE", /导尿|导过尿|膀胱镜|尿路操作|泌尿.*手术|catheter|cystoscopy|urinary procedure/i],
  ["surgeryHistory", "PAST_SURGERY", /手术史|做过.*手术|开过刀|surgery|operation/i],
  ["transfusionHistory", "PAST_TRANSFUSION", /输血史|输过血|blood transfusion/i],
  ["allergyHistory", "PAST_ALLERGY", /过敏|allerg/i],
  ["anticoagulantUse", "MED_ANTICOAGULANT", /抗凝|让血变稀|稀释血液|华法林|利伐沙班|达比加群|阿哌沙班|依度沙班|anticoag|blood thinner|warfarin|rivaroxaban|dabigatran|apixaban|edoxaban/i],
  ["antiplateletUse", "MED_ANTIPLATELET", /抗血小板|阿司匹林|氯吡格雷|antiplatelet|aspirin|clopidogrel/i],
  ["familyHistory", "FAMILY_HISTORY", /家族史|家里|父母|兄弟姐妹|遗传|family history|hereditary/i],
  ["menstrualHistory", "GYNE_MENSTRUAL", /月经|经期|阴道出血|menstru|period/i],
  ["pregnancyHistory", "GYNE_PREGNANCY", /怀孕|妊娠|pregnan/i]
];
const broadMedication = /长期.*(?:吃|服|用).*药|平时.*(?:吃|服|用).*药|都吃什么药|用药史|长期用药|regular medication|medications do you take/i;

function matchStructuredFacts(caseData, question, language = "zh") {
  const history = caseData?.structuredHistory;
  if (!history) return null;
  const text = String(question || "");
  const matches = factMatchers
    .map((entry, sourceOrder) => ({ entry, sourceOrder, index: text.search(entry[2]) }))
    .filter((item) => item.index >= 0);
  const medicationIndex = text.search(broadMedication);
  const wantsAllMedication = medicationIndex >= 0;
  const answers = [];
  const matchedFacts = [];
  const matchedSlotIds = [];
  const sources = [];
  const clauses = [
    ...matches.map((item) => ({
      kind: "fact",
      index: item.index,
      sourceOrder: item.sourceOrder,
      entry: item.entry
    })),
    ...(wantsAllMedication ? [{
      kind: "allMedication",
      index: medicationIndex,
      sourceOrder: factMatchers.length,
      entry: null
    }] : [])
  ].sort((left, right) => left.index - right.index || left.sourceOrder - right.sourceOrder);
  for (const clause of clauses) {
    if (clause.kind === "allMedication") {
      answers.push(language === "en" ? history.medicationAnswerEn : history.medicationAnswerZh);
      matchedFacts.push("medicationList");
      matchedSlotIds.push("MED_ALL");
      sources.push(...(history.medicationList || []));
      continue;
    }
    const [key, slotId] = clause.entry;
    const fact = history[key];
    if (!fact) continue;
    answers.push(language === "en" ? fact.patientAnswerEn : fact.patientAnswerZh);
    matchedFacts.push(key);
    matchedSlotIds.push(slotId);
    sources.push(fact);
  }
  if (!answers.length) return null;
  const provenance = new Set(sources.map((item) => item.provenance));
  return {
    replyText: [...new Set(answers)].join("\n"),
    matchedSlotIds: [...new Set(matchedSlotIds)],
    matchedFacts: [...new Set(matchedFacts)],
    governanceSlotIds: [...new Set(matchedSlotIds)],
    collectableSlotIds: [...new Set(matchedSlotIds)],
    collectableFacts: [...new Set(matchedFacts)],
    answerSource: provenance.size > 1 ? "mixed" : ([...provenance][0] || "source"),
    confidence: sources.some((item) => item.provenance === "author_added_for_simulation") ? 0.82 : 0.99,
    safetyFlags: [],
    fallbackReason: ""
  };
}

module.exports = { matchStructuredFacts };
