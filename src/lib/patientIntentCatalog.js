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
    key: "urinary_frequency", sourceSlotId: "urinary_frequency", labelZh: "尿频", labelEn: "Urinary frequency",
    aliases: Object.freeze({
      zh: Object.freeze(["尿频", "小便次数多", "老想上厕所", "总是去小便", "比以前尿得勤", "一会儿就想尿", "白天小便次数增多", "老是跑厕所"]),
      en: Object.freeze(["urinary frequency", "frequent urination", "urinate often", "urinate more often", "pee more often", "go to the toilet often", "passing urine more frequently"])
    }),
    confusableWith: Object.freeze(["urinary_urgency", "nocturia"])
  }),
  Object.freeze({
    key: "urinary_urgency", sourceSlotId: "urinary_urgency", labelZh: "尿急", labelEn: "Urinary urgency",
    aliases: Object.freeze({
      zh: Object.freeze(["尿急", "一有尿意就憋不住", "突然特别想尿", "来不及上厕所", "尿意很急", "突然就要尿", "有尿就憋不住"]),
      en: Object.freeze(["urinary urgency", "urgency", "urgent need to urinate", "sudden urge to pee", "cannot hold urine", "can't hold my urine", "need to rush to the toilet"])
    }),
    confusableWith: Object.freeze(["urinary_frequency", "urinary_incontinence"])
  }),
  Object.freeze({
    key: "blood_clots", sourceSlotId: "clots", labelZh: "尿中血块", labelEn: "Blood clots",
    aliases: Object.freeze({
      zh: Object.freeze(["血块", "血凝块", "凝血块", "尿里有块", "小便里有块", "尿里有血疙瘩"]),
      en: Object.freeze(["blood clots", "clots in the urine", "clots when you pee", "lumps of blood in urine"])
    }),
    confusableWith: Object.freeze(["clot_shape", "urine_color"])
  }),
  Object.freeze({
    key: "flank_pain", sourceSlotId: "flank_pain", labelZh: "腰/肾区疼痛", labelEn: "Flank pain",
    aliases: Object.freeze({
      zh: Object.freeze(["腰痛", "腰疼", "腰部痛", "腰部疼", "肾区痛", "肾区疼", "后腰痛", "侧腰痛"]),
      en: Object.freeze(["flank pain", "loin pain", "pain in the side", "pain around the kidney", "side of your back hurt"])
    }),
    confusableWith: Object.freeze(["abdominal_pain", "suprapubic_pain", "renal_colic"])
  }),
  Object.freeze({
    key: "fever", sourceSlotId: "fever_chills", labelZh: "发热", labelEn: "Fever",
    aliases: Object.freeze({
      zh: Object.freeze(["发热", "发烧", "体温高", "烧起来", "有没有烧", "量过体温"]),
      en: Object.freeze(["fever", "high temperature", "running a temperature", "feel feverish"])
    }),
    confusableWith: Object.freeze(["chills"])
  }),
  Object.freeze({
    key: "foamy_urine", sourceSlotId: "glomerular_features", labelZh: "泡沫尿", labelEn: "Foamy urine",
    aliases: Object.freeze({
      zh: Object.freeze(["泡沫尿", "尿里泡沫多", "小便很多泡", "尿起泡", "泡泡很多", "尿液有泡沫"]),
      en: Object.freeze(["foamy urine", "frothy urine", "bubbles in the urine", "urine looks foamy"])
    }),
    confusableWith: Object.freeze(["edema", "proteinuria"])
  }),
  Object.freeze({
    key: "edema", sourceSlotId: "glomerular_features", labelZh: "水肿", labelEn: "Edema",
    aliases: Object.freeze({
      zh: Object.freeze(["水肿", "眼睑肿", "眼皮肿", "下肢肿", "腿肿", "脚肿", "脸肿"]),
      en: Object.freeze(["edema", "oedema", "swelling around the eyes", "leg swelling", "swollen ankles", "puffy eyes"])
    }),
    confusableWith: Object.freeze(["foamy_urine", "weight_gain"])
  }),
  Object.freeze({
    key: "weak_stream", sourceSlotId: "voiding_difficulty", labelZh: "尿线细/尿流弱", labelEn: "Weak urinary stream",
    aliases: Object.freeze({
      zh: Object.freeze(["尿线细", "尿线变细", "尿流弱", "尿得没劲", "小便流得细", "尿柱细"]),
      en: Object.freeze(["weak stream", "weak urine flow", "thin urinary stream", "poor urine stream", "urine flow is weak"])
    }),
    confusableWith: Object.freeze(["hesitancy", "incomplete_emptying", "urinary_retention"])
  }),
  Object.freeze({
    key: "incomplete_emptying", sourceSlotId: "voiding_difficulty", labelZh: "尿不尽", labelEn: "Incomplete emptying",
    aliases: Object.freeze({
      zh: Object.freeze(["尿不尽", "没尿干净", "尿完还想尿", "总觉得还有尿", "排不干净"]),
      en: Object.freeze(["incomplete emptying", "not empty completely", "still feel urine left", "bladder does not feel empty"])
    }),
    confusableWith: Object.freeze(["urinary_frequency", "urinary_retention"])
  }),
  Object.freeze({
    key: "urinary_retention", sourceSlotId: "retention", labelZh: "尿潴留", labelEn: "Urinary retention",
    aliases: Object.freeze({
      zh: Object.freeze(["尿潴留", "尿不出来", "一点尿不出", "憋着尿不出", "完全排不出尿"]),
      en: Object.freeze(["urinary retention", "cannot pass urine", "unable to urinate", "cannot pee at all", "unable to pass urine"])
    }),
    confusableWith: Object.freeze(["weak_stream", "incomplete_emptying"])
  }),
  Object.freeze({
    key: "nocturia", sourceSlotId: "voiding_difficulty", labelZh: "夜尿", labelEn: "Nocturia",
    aliases: Object.freeze({
      zh: Object.freeze(["夜尿", "晚上起夜", "夜里起来尿", "夜间小便", "一晚上尿几次"]),
      en: Object.freeze(["nocturia", "get up at night to urinate", "pee at night", "pass urine during the night", "night-time urination"])
    }),
    confusableWith: Object.freeze(["urinary_frequency"])
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
        "all of the urine red", "blood throughout the entire stream", "red throughout", "whole stream red",
        "red from the start to the end of urination", "not only red at the end"
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
      en: Object.freeze(["initial hematuria", "blood only at the beginning", "red only at the beginning", "red at the beginning", "start red and then clear"])
    }),
    confusableWith: Object.freeze(["whole_stream_hematuria", "terminal_hematuria"])
  }),
  Object.freeze({
    key: "terminal_hematuria",
    sourceSlotId: "hematuria_phase",
    labelZh: "终末血尿",
    labelEn: "Terminal hematuria",
    aliases: Object.freeze({
      zh: Object.freeze(["终末血尿", "快尿完的时候红", "最后才红", "最后红", "最后一段红", "最后几滴红", "只有最后红"]),
      en: Object.freeze(["terminal hematuria", "red only at the end", "blood only at the end", "red at the end", "only red at the end", "turn red near the end", "last drops red"])
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
      ? /(?:小便|排尿|尿尿|撒尿|解小便|尿)(?:的?时候|时)?(?:会不会|有没有|有无|是不是|会|有)?(?:痛不痛|疼不疼|烧不烧|不痛|不疼|痛|疼|刺痛|烧灼|烧得慌|不舒服)/.test(compacted)
      : /(?:hurt|pain|painful|burn|burning|sting)(?:\s+\w+){0,4}\s+(?:to\s+pee|when\s+(?:you\s+)?(?:urinate|pee)|during\s+urination|passing\s+urine)|(?:pee|urinating|urination|passing\s+urine)(?:\s+\w+){0,4}\s+(?:hurt|pain|painful|burn|burning|sting)/i.test(normalized);
  }
  if (intentKey === "whole_stream_hematuria") {
    return language === "zh"
      ? /(?:全程|从头到尾|从开始(?:尿)?到最后|整个(?:小便|排尿|尿尿)?过程|一开始到尿完|整泡尿).*(?:红|血)/.test(compacted)
      : /(?:red|blood).*(?:throughout|starttofinish|starttotheend|wholestream|entirestream)|(?:throughout|wholestream|entirestream).*(?:red|blood)|notonlyred.*(?:end|last)/i.test(compacted);
  }
  if (intentKey === "initial_hematuria") {
    return language === "zh"
      ? /(?:起始血尿|刚开始(?:尿)?(?:时|的时候)?红|只有一开始红|刚尿出来就红)/.test(compacted)
      : /(?:initialhematuria|(?:blood|red).*(?:only)?atthebeginning|startred.*clear)/i.test(compacted);
  }
  if (intentKey === "terminal_hematuria") {
    return language === "zh"
      ? /(?:终末血尿|快尿完(?:的时候)?红|最后(?:才|一段|几滴)红|只有最后红)/.test(compacted)
      : /(?:terminalhematuria|(?:blood|red).*(?:only)?attheend|onlyred.*attheend|turnred.*neartheend|lastdrops.*red)/i.test(compacted);
  }
  if (intentKey === "urinary_frequency") {
    return language === "zh"
      ? /(?:小便|尿|厕所).*(?:次数多|次数增多|尿得勤|老想|总想|经常|频繁)|(?:老是|总是|总|一会儿就).*(?:小便|尿|厕所)/.test(compacted)
      : /(?:urinate|urinating|pee|passurine).*(?:moreoften|frequently|alot)|(?:frequent|often).*(?:urination|urinate|pee)/i.test(compacted);
  }
  if (intentKey === "urinary_urgency") {
    return language === "zh"
      ? /(?:尿意|想尿|尿来了).*(?:很急|突然|憋不住|等不了)|(?:突然|马上|来不及).*(?:想尿|厕所)|有尿.*憋不住/.test(compacted)
      : /(?:sudden|urgent).*(?:urge|need).*(?:urinate|pee)|(?:cannot|can't).*(?:hold|wait).*(?:urine|pee)|rush.*(?:bathroom|toilet)|(?:urinaryfrequency|dysuria|painwhenurinating).*urgency|urgency.*(?:urinaryfrequency|dysuria|painwhenurinating)/i.test(compacted);
  }
  if (intentKey === "blood_clots") {
    return language === "zh"
      ? /(?:尿|小便).*(?:血块|血凝块|凝血块|血疙瘩)|(?:血块|血凝块|凝血块|血疙瘩).*(?:尿|小便)/.test(compacted)
      : /(?:blood)?clots?.*(?:urine|pee)|(?:urine|pee).*(?:blood)?clots?|lumps?ofblood.*(?:urine|pee)/i.test(compacted);
  }
  if (intentKey === "flank_pain") {
    return language === "zh"
      ? /(?:腰侧|侧腰|后腰|腰部|腰背|肾区).*(?:痛|疼)|(?:痛|疼).*(?:腰侧|侧腰|后腰|腰部|腰背|肾区)/.test(compacted)
      : /(?:flank|loin|sideof.*back|kidneyarea).*(?:pain|hurt)|(?:pain|hurt).*(?:flank|loin|sideof.*back|kidneyarea)/i.test(compacted);
  }
  if (intentKey === "fever") {
    return language === "zh"
      ? /(?:发热|发烧|高烧|体温).*(?:有无|有没有|高不高|升高|多少)?/.test(compacted)
      : /(?:fever|feverish|hightemperature|runningatemperature)/i.test(compacted);
  }
  if (intentKey === "foamy_urine") {
    return language === "zh"
      ? /(?:尿|小便).*(?:泡沫|起泡|很多泡|泡泡)|(?:泡沫|起泡|很多泡|泡泡).*(?:尿|小便)/.test(compacted)
      : /(?:foamy|frothy|bubbles|bubbly).*(?:urine|pee)|(?:urine|pee).*(?:foamy|frothy|bubbles|bubbly)/i.test(compacted);
  }
  if (intentKey === "edema") {
    return language === "zh"
      ? /(?:眼皮|眼睑|脸|腿脚|腿|下肢|脚|脚踝).*(?:肿|水肿)|(?:肿|水肿).*(?:眼皮|眼睑|脸|腿脚|腿|下肢|脚|脚踝)/.test(compacted)
      : /(?:swollen|swelling|puffy|puffiness).*(?:eyes?|eyelids?|legs?|feet|ankles?)|(?:eyes?|eyelids?|legs?|feet|ankles?).*(?:swollen|swelling|puffy|puffiness)|\b(?:edema|oedema)\b/i.test(normalized);
  }
  if (intentKey === "weak_stream") {
    return language === "zh"
      ? /(?:尿线|尿流|尿柱|小便流).*(?:细|弱|没劲|变弱)|(?:尿得|小便).*(?:没劲|无力)/.test(compacted)
      : /(?:urine|urinary).*(?:stream|flow).*(?:weak|thin|poor)|(?:stream|flow).*(?:of)?(?:urine|urinary).*(?:weak|thin|poor)|(?:weak|thin|poor).*(?:urine|urinary).*(?:stream|flow)/i.test(compacted);
  }
  if (intentKey === "incomplete_emptying") {
    return language === "zh"
      ? /(?:尿完|小便后).*(?:还有尿|还觉得有尿|还想尿|没排干净|没排空|尿不尽)|(?:小便|尿|膀胱).*(?:排不干净|不能排干净|没排空)|尿不尽/.test(compacted)
      : /(?:bladder).*(?:still|doesn't|doesnot).*(?:full|empty).*(?:after|finish)|(?:incomplete|notcompletely).*(?:empty|emptying)|stillfeel.*urineleft|stillfeel.*(?:need|have)to(?:go|pee).*(?:after|finish)/i.test(compacted);
  }
  if (intentKey === "urinary_retention") {
    return language === "zh"
      ? /(?:完全|一点|憋着|憋得|想尿).*(?:尿不出来|尿不出|排不出尿)|尿潴留/.test(compacted)
      : /(?:unable|cannot|can't|inabilityto).*(?:passurine|urinate|pee)|urinaryretention/i.test(compacted);
  }
  if (intentKey === "nocturia") {
    return language === "zh"
      ? /(?:晚上|夜里|夜间|一晚上).*(?:起夜|起来尿|小便|尿几次|尿几回)|夜尿/.test(compacted)
      : /(?:getup|wakeup|wake).*(?:atnight|duringthenight|overnight).*(?:urinate|pee)|(?:urinate|pee).*(?:atnight|duringthenight|overnight)|nocturia/i.test(compacted);
  }
  return false;
}

function matchPriorityCanonicalIntents(question, language = "zh") {
  return priorityIntentDefinitions.flatMap((definition) => {
    const matchedAlias = definition.aliases[language].find((alias) => flexibleAliasMatch(question, alias, language));
    const naturalPatternMatched = !matchedAlias && matchesNaturalPattern(question, definition.key, language);
    if (!matchedAlias && !naturalPatternMatched) return [];
    return [{
      intentKey: definition.key,
      sourceSlotId: definition.sourceSlotId,
      confidence: 1,
      matchedAlias: matchedAlias || "",
      matcherType: matchedAlias ? "canonical_alias" : "natural_pattern"
    }];
  });
}

function asksIndependentGeneralPain(question, language = "zh") {
  const normalized = normalizeIntentQuestion(question);
  if (language === "en") {
    const standalonePainInList = /\b(?:have|with)\s+pain(?:\s+(?:and|or|urinary|frequency|urgency|dysuria|fever|weight)|$)/i.test(normalized);
    const unqualifiedAnyPain = /\bany pain\b(?!\s+(?:passing|when|while|during|on)\b)/i.test(normalized);
    return standalonePainInList
      || unqualifiedAnyPain
      || /\bany other pain\b|\bother pain\b|\bpain elsewhere\b|\bgeneral pain\b/i.test(normalized);
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
