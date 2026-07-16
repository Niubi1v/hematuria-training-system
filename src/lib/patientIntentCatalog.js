const priorityIntentDefinitions = Object.freeze([
  Object.freeze({
    key: "dysuria",
    sourceSlotId: "dysuria",
    labelZh: "尿痛",
    labelEn: "Dysuria",
    aliases: Object.freeze({
      zh: Object.freeze([
        "尿痛", "小便痛", "小便疼", "排尿痛", "排尿疼", "尿的时候痛", "尿的时候疼",
        "解小便时痛", "撒尿痛", "撒尿疼", "小便时刺痛", "排尿时烧灼感", "尿道烧得慌",
        "小便有没有不舒服", "小便不痛", "小便不疼", "尿的时候会不会痛", "有还是没有尿痛"
      ]),
      en: Object.freeze([
        "dysuria", "painful urination", "pain when urinating", "burning when i pee", "does it hurt to pee",
        "any pain passing urine", "burning when urinating", "urination painful", "sting when you pee"
      ])
    }),
    confusableWith: Object.freeze(["pain", "flank_pain", "suprapubic_pain"])
  }),
  Object.freeze({
    key: "whole_stream_hematuria",
    sourceSlotId: "hematuria_phase",
    labelZh: "全程血尿",
    labelEn: "Whole-stream hematuria",
    aliases: Object.freeze({
      zh: Object.freeze([
        "全程血尿", "全程都是红", "小便全程都是红", "小便从头红到尾", "从头到尾都红",
        "从开始尿到最后都红", "整个小便过程都是红", "整个排尿过程都是红", "每次尿全程都红",
        "一开始到尿完都红", "整泡尿都红", "不是只有最后才红"
      ]),
      en: Object.freeze([
        "blood throughout urination", "red from start to finish", "red during the whole stream",
        "all of the urine red", "blood throughout the entire stream", "red throughout", "whole stream red"
      ])
    }),
    confusableWith: Object.freeze(["initial_hematuria", "terminal_hematuria"])
  }),
  Object.freeze({
    key: "initial_hematuria",
    sourceSlotId: "hematuria_phase",
    labelZh: "起始血尿",
    labelEn: "Initial hematuria",
    aliases: Object.freeze({
      zh: Object.freeze(["起始血尿", "刚开始尿的时候红", "只有一开始红", "刚尿出来就红", "刚开始红"]),
      en: Object.freeze(["initial hematuria", "blood only at the beginning", "red only at the beginning", "start red and then clear"])
    }),
    confusableWith: Object.freeze(["whole_stream_hematuria", "terminal_hematuria"])
  }),
  Object.freeze({
    key: "terminal_hematuria",
    sourceSlotId: "hematuria_phase",
    labelZh: "终末血尿",
    labelEn: "Terminal hematuria",
    aliases: Object.freeze({
      zh: Object.freeze(["终末血尿", "快尿完的时候红", "最后才红", "最后一段红", "最后几滴红", "只有最后红"]),
      en: Object.freeze(["terminal hematuria", "red only at the end", "blood only at the end", "turn red near the end", "last drops red"])
    }),
    confusableWith: Object.freeze(["whole_stream_hematuria", "initial_hematuria"])
  })
]);

function normalizeIntentQuestion(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalizeIntentQuestion(value).replace(/\s+/g, "");
}

function flexibleAliasMatch(question, alias, language) {
  const normalizedQuestion = language === "zh" ? compact(question) : normalizeIntentQuestion(question);
  const normalizedAlias = language === "zh" ? compact(alias) : normalizeIntentQuestion(alias);
  return normalizedQuestion.includes(normalizedAlias);
}

function matchesNaturalPattern(question, intentKey, language) {
  const normalized = normalizeIntentQuestion(question);
  const compacted = normalized.replace(/\s+/g, "");
  if (intentKey === "dysuria") {
    return language === "zh"
      ? /(?:小便|排尿|尿尿|撒尿|解小便|尿)(?:的?时候|时)?(?:会不会|有没有|有无|痛不痛|疼不疼|不痛|不疼|会?痛|会?疼|有?刺痛|烧不烧|有?烧灼|烧得慌|不舒服)/.test(compacted)
      : /(?:hurt|pain|painful|burn|burning|sting).*(?:pee|urina|passingurine)|(?:pee|urina|passingurine).*(?:hurt|pain|painful|burn|burning|sting)/i.test(compacted);
  }
  if (intentKey === "whole_stream_hematuria") {
    return language === "zh"
      ? /(?:全程|从头到尾|从开始(?:尿)?到最后|整个(?:小便|排尿|尿尿)?过程|一开始到尿完|整泡尿).*(?:红|血)/.test(compacted)
      : /(?:red|blood).*(?:throughout|starttofinish|wholestream|entirestream)|(?:throughout|wholestream|entirestream).*(?:red|blood)/i.test(compacted);
  }
  if (intentKey === "initial_hematuria") {
    return language === "zh"
      ? /(?:起始血尿|刚开始(?:尿)?(?:时|的时候)?红|只有一开始红|刚尿出来就红)/.test(compacted)
      : /(?:initialhematuria|(?:blood|red).*onlyatthebeginning|startred.*clear)/i.test(compacted);
  }
  if (intentKey === "terminal_hematuria") {
    return language === "zh"
      ? /(?:终末血尿|快尿完(?:的时候)?红|最后(?:才|一段|几滴)红|只有最后红)/.test(compacted)
      : /(?:terminalhematuria|(?:blood|red).*onlyattheend|turnred.*neartheend|lastdrops.*red)/i.test(compacted);
  }
  return false;
}

function matchPriorityCanonicalIntents(question, language = "zh") {
  const candidates = priorityIntentDefinitions.filter((definition) =>
    definition.aliases[language].some((alias) => flexibleAliasMatch(question, alias, language))
      || matchesNaturalPattern(question, definition.key, language)
  );
  return candidates.map((definition) => ({
    intentKey: definition.key,
    sourceSlotId: definition.sourceSlotId,
    confidence: 1
  }));
}

function asksIndependentGeneralPain(question, language = "zh") {
  const normalized = normalizeIntentQuestion(question);
  if (language === "en") {
    return /\bpain\s+(?:and|or|urinary|frequency|urgency|dysuria|fever|weight)\b|\bany (?:other )?pain\b|\bother pain\b|\bpain elsewhere\b/i.test(normalized);
  }
  const compacted = normalized.replace(/\s+/g, "");
  return /(?:其他|别的|平时|全身|别处|哪里)[^，。；?？]*(?:痛|疼)|(?:有没有|有无)疼痛(?:、|和|或|还有)/.test(compacted);
}

function priorityAliasCount() {
  return priorityIntentDefinitions.reduce((sum, definition) => sum + definition.aliases.zh.length + definition.aliases.en.length, 0);
}

module.exports = {
  asksIndependentGeneralPain,
  matchPriorityCanonicalIntents,
  normalizeIntentQuestion,
  priorityAliasCount,
  priorityIntentDefinitions
};
