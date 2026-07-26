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
        "小便有没有不舒服", "小便不痛", "小便不疼", "尿的时候会不会痛", "有还是没有尿痛",
        "拉尿痛", "解小便痛", "尿尿时疼", "小便时烧灼", "小便时不舒服", "没有尿痛吧"
      ]),
      en: Object.freeze([
        "dysuria", "painful urination", "pain when urinating", "burning when i pee", "does it hurt to pee",
        "any pain passing urine", "burning when urinating", "urination painful", "sting when you pee",
        "burning when urinating", "does it hurt when you pee"
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

function defineOntologyFact(definition) {
  const aliasesZh = [...new Set(definition.aliases?.zh || [])];
  const aliasesEn = [...new Set(definition.aliases?.en || [])];
  return Object.freeze({
    ...definition,
    aliases: Object.freeze({
      zh: Object.freeze(aliasesZh),
      en: Object.freeze(aliasesEn)
    }),
    lexicon: Object.freeze({
      zhMedical: Object.freeze(definition.lexicon?.zhMedical || [definition.labelZh].filter(Boolean)),
      zhPatient: Object.freeze(definition.lexicon?.zhPatient || aliasesZh),
      zhRegional: Object.freeze(definition.lexicon?.zhRegional || []),
      enMedical: Object.freeze(definition.lexicon?.enMedical || [definition.labelEn].filter(Boolean)),
      enPatient: Object.freeze(definition.lexicon?.enPatient || aliasesEn),
      negatedZh: Object.freeze(definition.lexicon?.negatedZh || []),
      negatedEn: Object.freeze(definition.lexicon?.negatedEn || []),
      choiceZh: Object.freeze(definition.lexicon?.choiceZh || []),
      choiceEn: Object.freeze(definition.lexicon?.choiceEn || []),
      typosZh: Object.freeze(definition.lexicon?.typosZh || []),
      confusableWith: Object.freeze(definition.confusableWith || [])
    })
  });
}

const canonicalLegacyIntentDefinitions = [
  {
    key: "chief_complaint", sourceSlotId: "chief_complaint", domain: "canonical_legacy", labelZh: "主诉", labelEn: "Chief complaint",
    aliases: { zh: ["哪里不舒服", "为什么来", "主诉", "怎么回事"], en: ["what brings you", "main complaint", "what is wrong"] },
    pattern: /哪里不舒服|为什么来|主诉|怎么回事|用自己的话.*(?:不舒服|经过|为什么)|what brings you|what is wrong|main complaint|main problem.*brought you|in your own words.*(?:why|what happened)|describe.*(?:main problem|what happened).*(?:brought you|in your own words)|why you came/i
  },
  {
    key: "gross_hematuria", sourceSlotId: "hematuria_visibility", domain: "canonical_legacy", labelZh: "肉眼血尿", labelEn: "Gross hematuria",
    aliases: { zh: ["肉眼血尿", "看得见血", "尿是红的", "小便红"], en: ["gross hematuria", "visible blood in urine", "urine looks red"] },
    pattern: /肉眼|看得见|尿(?:是|变)?红|小便(?:是|变)?红|visible blood|gross hematuria|urine looks red/i,
    confusableWith: ["microscopic_hematuria", "urine_color"]
  },
  {
    key: "microscopic_hematuria", sourceSlotId: "hematuria_visibility", domain: "canonical_legacy", labelZh: "镜下血尿", labelEn: "Microscopic hematuria",
    aliases: { zh: ["镜下血尿", "尿潜血", "尿检发现血"], en: ["microscopic hematuria", "blood found on urine test", "urine test showed blood"] },
    pattern: /镜下|尿潜血|尿检.*(?:血|异常)|microscopic|urine test.*blood|urinalysis.*blood/i,
    confusableWith: ["gross_hematuria"]
  },
  {
    key: "hematuria_onset", sourceSlotId: "hematuria_onset", domain: "canonical_legacy", labelZh: "血尿起病时间", labelEn: "Hematuria onset",
    aliases: { zh: ["血尿多久", "什么时候开始", "几天了", "起病时间"], en: ["when did the hematuria start", "how long has the blood been present", "hematuria onset"] },
    pattern: /什么时候|多久|几天|几周|几个月|起病|今天才.*(?:出现|开始)|血尿.*外伤后|when did|how long|when.*start|onset|(?:only )?started today|blood.*after.*injur/i
  },
  {
    key: "intermittent_hematuria", sourceSlotId: "hematuria_frequency", domain: "canonical_legacy", labelZh: "间歇性血尿", labelEn: "Intermittent hematuria",
    aliases: { zh: ["间断血尿", "一阵有一阵没有", "反复尿红", "时有时无"], en: ["intermittent hematuria", "blood comes and goes", "red urine on and off"] },
    pattern: /间断|持续|每次|频率|反复|时有时无|intermittent|continuous|every time|how often|frequency|keep(?:s)? coming back|come(?:s)? back|recur/i,
    confusableWith: ["hematuria_onset"]
  },
  {
    key: "urine_color", sourceSlotId: "urine_color", domain: "canonical_legacy", labelZh: "尿液颜色", labelEn: "Urine color",
    aliases: { zh: ["尿什么颜色", "小便什么色", "尿色", "鲜红", "暗红", "洗肉水", "茶色", "酱油色"], en: ["urine color", "what color is the urine", "bright red urine", "tea-colored urine"] },
    pattern: /鲜红|暗红|洗肉水|茶色|酱油色|什么颜色|什么色|尿色|小便.*(?:颜色|色)|bright red|dark red|tea.colou?r|cola.colou?r|(?:urine|pee).*colou?r|what colou?r.*(?:urine|pee)/i
  },
  {
    key: "hesitancy", sourceSlotId: "voiding_difficulty", domain: "canonical_legacy", labelZh: "排尿踌躇", labelEn: "Urinary hesitancy",
    aliases: { zh: ["排尿踌躇", "尿要等一会", "想尿却要等", "起尿慢"], en: ["urinary hesitancy", "wait before urine starts", "difficulty starting urination"] },
    pattern: /排尿踌躇|尿.*等一会|想尿.*等|起尿慢|urinary hesitancy|wait.*(?:urine|pee).*start|difficulty starting urination/i,
    confusableWith: ["weak_stream", "urinary_retention"]
  },
  {
    key: "renal_colic", sourceSlotId: "renal_colic", domain: "canonical_legacy", labelZh: "肾绞痛", labelEn: "Renal colic",
    aliases: { zh: ["肾绞痛", "阵发性绞痛"], en: ["renal colic", "colicky flank pain"] },
    pattern: /肾绞痛|绞痛|renal colic|colicky pain/i
  },
  {
    key: "radiating_pain", sourceSlotId: "radiating_pain", domain: "canonical_legacy", labelZh: "放射痛", labelEn: "Radiating pain",
    aliases: { zh: ["放射痛", "疼到腹股沟"], en: ["radiating pain", "pain radiates to the groin"] },
    pattern: /放射痛|放射到|radiat.*pain|pain.*groin/i
  },
  {
    key: "pain", sourceSlotId: "pain", domain: "canonical_legacy", labelZh: "一般疼痛", labelEn: "Pain",
    aliases: { zh: ["疼不疼", "有没有痛", "疼痛"], en: ["any pain", "does it hurt"] },
    pattern: /疼不疼|有没有痛|疼痛|\bpain\b|does it hurt|any pain/i,
    confusableWith: ["dysuria", "flank_pain"]
  },
  {
    key: "voiding_difficulty", sourceSlotId: "voiding_difficulty", domain: "canonical_legacy", labelZh: "排尿困难", labelEn: "Voiding difficulty",
    aliases: { zh: ["排尿困难", "排尿费力", "尿流中断"], en: ["difficulty urinating", "straining to urinate"] },
    pattern: /排尿困难|尿流中断|排尿费力|排尿费不费劲|膀胱.*没排空|difficulty urinating|straining/i
  },
  {
    key: "recent_uri", sourceSlotId: "recent_uri", domain: "canonical_legacy", labelZh: "近期上呼吸道感染", labelEn: "Recent upper respiratory infection",
    aliases: { zh: ["最近感冒", "咽痛", "扁桃体炎"], en: ["recent cold", "sore throat", "tonsillitis"] },
    pattern: /感冒|咽痛|扁桃体炎|cold|sore throat|tonsillitis|upper respiratory/i
  },
  {
    key: "triggers", sourceSlotId: "triggers", domain: "canonical_legacy", labelZh: "诱因", labelEn: "Triggers",
    aliases: { zh: ["运动后", "劳累后", "受凉后", "外伤后"], en: ["after exercise", "after exertion", "after trauma"] },
    pattern: /运动|劳累|受凉|外伤|性生活|导尿|尿路操作|exercise|exertion|trauma|sexual activity|catheter|urinary procedure/i
  },
  {
    key: "prior_care", sourceSlotId: "prior_care", domain: "canonical_legacy", labelZh: "既往就诊", labelEn: "Prior care",
    aliases: { zh: ["以前看过医生", "之前治疗过"], en: ["seen a doctor before", "previous treatment"] },
    pattern: /以前看过医生|之前看过医生|之前治疗过|接受过治疗|seen a doctor before|previous treatment|treated for this before/i
  },
  {
    key: "general_condition", sourceSlotId: "general_condition", domain: "canonical_legacy", labelZh: "一般情况", labelEn: "General condition",
    aliases: { zh: ["胃口", "食欲", "睡眠", "大便", "体重", "消瘦"], en: ["appetite", "sleep", "bowel", "weight loss"] },
    pattern: /胃口|食欲|睡眠|大便|体重|消瘦|appetite|sleep|bowel|stool|weight loss|lost weight/i
  },
  {
    key: "bleeding_tendency", sourceSlotId: "bleeding_tendency", domain: "canonical_legacy", labelZh: "出血倾向", labelEn: "Bleeding tendency",
    aliases: { zh: ["鼻出血", "牙龈出血", "瘀斑", "紫癜"], en: ["nosebleed", "gum bleeding", "bruising"] },
    pattern: /鼻出血|牙龈出血|瘀斑|紫癜|nosebleed|gum bleeding|bruis|purpura/i
  }
].map(defineOntologyFact);

const structuredHistoryIntentDefinitions = [
  ["smoking_history", "smokingHistory", "LIFE_SMOKING", "吸烟史", "Smoking history", /吸烟|抽烟|烟龄|每天.*(?:支|根|包)|一天抽多少|包年|smok|cigarettes?.*(?:day|daily)|how many cigarettes/i],
  ["alcohol_history", "alcoholHistory", "LIFE_ALCOHOL", "饮酒史", "Alcohol history", /喝酒|饮酒|酒量|白酒|啤酒|alcohol|drink/i],
  ["occupation", "occupation", "LIFE_OCCUPATION", "职业", "Occupation", /什么工作|做什么工作|职业|occupation|job|what do you do for a living/i],
  ["occupational_exposure", "occupationalExposure", "LIFE_EXPOSURE", "职业暴露", "Occupational exposure", /染料|染发剂|油漆|橡胶|皮革|化工|重金属|芳香胺|职业暴露|(?:work|job|occupation|expos).*(?:chemical|dye|paint|rubber|leather)|(?:chemical|dye|paint|rubber|leather).*(?:work|job|occupation|expos)/i],
  ["hypertension_history", "hypertension", "PAST_HYPERTENSION", "高血压史", "Hypertension history", /高血压|hypertension/i],
  ["diabetes_history", "diabetes", "PAST_DIABETES", "糖尿病史", "Diabetes history", /糖尿病|diabetes/i],
  ["coronary_history", "coronaryDisease", "PAST_CORONARY", "冠心病史", "Coronary history", /冠心病|心脏病|心肌梗死|心绞痛|coronary|heart disease/i],
  ["stroke_history", "stroke", "PAST_STROKE", "脑卒中史", "Stroke history", /脑梗|脑卒中|中风|stroke/i],
  ["liver_disease_history", "liverDisease", "PAST_LIVER", "肝病史", "Liver disease history", /肝炎|乙肝|丙肝|肝病|hepatitis|liver disease/i],
  ["tuberculosis_history", "tuberculosis", "PAST_TB", "结核史", "Tuberculosis history", /结核|tuberculosis|\bTB\b/i],
  ["previous_stone", "stoneHistory", "PAST_STONE", "既往结石", "Previous urinary stones", /结石史|以前.*结石|得过.*结石|结石或者|stone history|stones before|had.*stones/i],
  ["previous_urinary_infection", "urinaryInfectionHistory", "PAST_UTI", "既往尿路感染", "Previous urinary infection", /感染史|以前.*尿路感染|反复.*感染|尿路感染或者|UTI history|urinary infection/i],
  ["previous_malignancy", "malignancyHistory", "PAST_MALIGNANCY", "既往肿瘤", "Previous malignancy", /肿瘤史|以前.*肿瘤|得过.*癌|结石或者肿瘤|cancer history|previous cancer|cancer before/i],
  ["trauma_history", "traumaHistory", "PAST_TRAUMA", "外伤史", "Trauma history", /外伤史|受过(?:外)?伤|以前[^，。！？?]*外伤|既往[^，。！？?]*外伤|撞伤|跌伤|trauma history|have you had[^?.!]*trauma|previous trauma/i],
  ["urinary_procedure_history", "urinaryProcedureHistory", "PAST_URINARY_PROCEDURE", "泌尿操作史", "Urinary procedure history", /导尿|导过尿|膀胱镜|尿路操作|泌尿.*手术|catheter|cystoscopy|urinary procedure/i],
  ["surgery_history", "surgeryHistory", "PAST_SURGERY", "手术史", "Surgery history", /手术史|做过.*手术|开过刀|surgery|operation/i],
  ["transfusion_history", "transfusionHistory", "PAST_TRANSFUSION", "输血史", "Transfusion history", /输血史|输过血|blood transfusion/i],
  ["allergy_history", "allergyHistory", "PAST_ALLERGY", "过敏史", "Allergy history", /过敏|allerg/i],
  ["anticoagulant_use", "anticoagulantUse", "MED_ANTICOAGULANT", "抗凝药使用", "Anticoagulant use", /抗凝|让血变稀|稀释血液|华法林|利伐沙班|达比加群|阿哌沙班|依度沙班|anticoag|blood thinner|warfarin|rivaroxaban|dabigatran|apixaban|edoxaban/i],
  ["antiplatelet_use", "antiplateletUse", "MED_ANTIPLATELET", "抗血小板药使用", "Antiplatelet use", /抗血小板|阿司匹林|氯吡格雷|antiplatelet|aspirin|clopidogrel/i],
  ["family_history", "familyHistory", "FAMILY_HISTORY", "家族史", "Family history", /家族史|家里|父母|兄弟姐妹|遗传|family history|hereditary/i],
  ["menstrual_history", "menstrualHistory", "GYNE_MENSTRUAL", "月经史", "Menstrual history", /月经|经期|阴道出血|menstru|period/i],
  ["pregnancy_history", "pregnancyHistory", "GYNE_PREGNANCY", "妊娠史", "Pregnancy history", /怀孕|妊娠|pregnan/i],
  ["medication_list", "medicationList", "MED_ALL", "用药史", "Medication history", /长期.*(?:吃|服|用).*药|平时.*(?:吃|服|用).*药|都吃什么药|用药史|长期用药|regular medication|medications do you take/i]
].map(([key, historyKey, sourceSlotId, labelZh, labelEn, pattern]) => defineOntologyFact({
  key,
  historyKey,
  sourceSlotId,
  domain: "structured_history",
  labelZh,
  labelEn,
  aliases: { zh: [labelZh], en: [labelEn] },
  pattern
}));

const safeMissingIntentDefinitions = [
  defineOntologyFact({
    key: "previous_kidney_disease",
    sourceSlotId: null,
    domain: "safe_missing",
    labelZh: "既往肾病",
    labelEn: "Previous kidney disease",
    aliases: { zh: ["以前得过肾病", "既往肾病", "有过肾脏病"], en: ["previous kidney disease", "history of kidney disease", "had kidney disease before"] },
    pattern: /以前.*肾病|既往.*肾病|得过.*肾病|有过.*肾脏病|previous kidney disease|history of kidney disease|had kidney disease before/i
  })
];

const patientFactOntology = Object.freeze([
  ...priorityIntentDefinitions.map((definition) => defineOntologyFact({
    ...definition,
    domain: "canonical_priority",
    classifierEligible: true,
    lexicon: definition.key === "dysuria" ? {
      zhMedical: ["尿痛", "排尿疼痛", "排尿烧灼感"],
      zhPatient: ["小便痛", "小便疼", "尿尿时疼", "小便时刺痛", "小便时烧灼", "小便时不舒服"],
      zhRegional: ["拉尿痛", "撒尿痛", "解小便痛"],
      enMedical: ["dysuria", "painful urination"],
      enPatient: ["does it hurt to pee", "burning when urinating", "sting when you pee"],
      negatedZh: ["没有尿痛吧", "小便不痛吗", "小便不疼吗"],
      negatedEn: ["no dysuria, right", "it does not hurt to pee, right"],
      choiceZh: ["小便痛还是不痛", "有还是没有尿痛"],
      choiceEn: ["does it hurt or not when you pee"],
      typosZh: ["尿疼", "小便剌痛"]
    } : undefined
  })),
  ...canonicalLegacyIntentDefinitions,
  ...structuredHistoryIntentDefinitions,
  ...safeMissingIntentDefinitions
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

function aliasMatchIndex(question, alias, language) {
  const normalizedQuestion = language === "zh" ? compact(question) : normalizeIntentQuestion(question);
  const normalizedAlias = language === "zh" ? compact(alias) : normalizeIntentQuestion(alias);
  return normalizedQuestion.indexOf(normalizedAlias);
}

function matchesNaturalPattern(question, intentKey, language) {
  const normalized = normalizeIntentQuestion(question);
  const compacted = normalized.replace(/\s+/g, "");
  if (intentKey === "dysuria") {
    return language === "zh"
      ? /(?:排尿|小便|解小便|拉尿|撒尿|尿尿|尿)(?:的?时候|时)?(?:会不会|有没有|有无|是不是|会|有)?(?:痛不痛|疼不疼|烧不烧|不痛|不疼|刺痛|灼痛|烧灼感|烧灼|烧得慌|不舒服|痛|疼)/.test(compacted)
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
  const definitions = patientFactOntology.filter((definition) => definition.domain === "canonical_priority");
  return definitions.flatMap((definition, definitionOrder) => {
    const matchedAlias = definition.aliases[language].find((alias) => flexibleAliasMatch(question, alias, language));
    const naturalPatternMatched = !matchedAlias && matchesNaturalPattern(question, definition.key, language);
    if (!matchedAlias && !naturalPatternMatched) return [];
    return [{
      intentKey: definition.key,
      sourceSlotId: definition.sourceSlotId,
      confidence: 1,
      matchedAlias: matchedAlias || "",
      matcherType: matchedAlias ? "canonical_alias" : "natural_pattern",
      matchIndex: matchedAlias ? aliasMatchIndex(question, matchedAlias, language) : Number.MAX_SAFE_INTEGER - definitions.length + definitionOrder
    }];
  }).sort((left, right) => left.matchIndex - right.matchIndex);
}

function matchPatientFactOntology(question, language = "zh", domains = []) {
  const allowedDomains = new Set(Array.isArray(domains) ? domains : [domains]);
  const text = String(question || "");
  return patientFactOntology.flatMap((definition, definitionOrder) => {
    if (allowedDomains.size && !allowedDomains.has(definition.domain)) return [];
    const matchedAlias = definition.aliases[language]?.find((alias) => flexibleAliasMatch(text, alias, language));
    const patternIndex = definition.pattern instanceof RegExp ? text.search(definition.pattern) : -1;
    const naturalPatternMatched = definition.domain === "canonical_priority"
      && !matchedAlias
      && matchesNaturalPattern(text, definition.key, language);
    if (!matchedAlias && patternIndex < 0 && !naturalPatternMatched) return [];
    return [{
      ...definition,
      intentKey: definition.key,
      matchedAlias: matchedAlias || "",
      matcherType: matchedAlias ? "ontology_alias" : naturalPatternMatched ? "natural_pattern" : "ontology_pattern",
      matchIndex: matchedAlias
        ? aliasMatchIndex(text, matchedAlias, language)
        : patternIndex >= 0 ? patternIndex : Number.MAX_SAFE_INTEGER - patientFactOntology.length + definitionOrder,
      definitionOrder
    }];
  }).sort((left, right) => left.matchIndex - right.matchIndex || left.definitionOrder - right.definitionOrder);
}

function recentConversationTopic(conversationHistory = [], language = "zh") {
  const entries = Array.isArray(conversationHistory) ? conversationHistory.slice(-8).reverse() : [];
  for (const entry of entries) {
    const text = String(entry?.text || "");
    const priority = matchPriorityCanonicalIntents(text, language)[0];
    if (priority) return priority.intentKey;
    if (language === "en") {
      if (/(?:blood|red).*(?:urine|pee)|hematuria/i.test(text)) return "gross_hematuria";
      if (/(?:urine test|urinalysis).*(?:blood|abnormal)|microscopic hematuria/i.test(text)) return "microscopic_hematuria";
      if (/\b(?:injury|trauma)\b/i.test(text)) return "trauma";
    } else {
      if (/小便.*红|尿.*红|血尿|尿血/.test(text)) return "gross_hematuria";
      if (/尿检|尿潜血|镜下血尿/.test(text)) return "microscopic_hematuria";
      if (/外伤|受伤|撞伤|跌伤/.test(text)) return "trauma";
    }
  }
  return "";
}

function resolveContextualPatientQuestion(question, conversationHistory = [], language = "zh") {
  const original = String(question || "").trim();
  const explicitPriority = matchPriorityCanonicalIntents(original, language);
  const topic = recentConversationTopic(conversationHistory, language);
  if (!original || !topic) {
    return { question: original, inherited: false, reason: "", sourceIntent: "" };
  }
  const compacted = compact(original);
  const isHematuriaTopic = ["gross_hematuria", "microscopic_hematuria", "whole_stream_hematuria", "initial_hematuria", "terminal_hematuria"].includes(topic);
  const durationFollowup = language === "en"
    ? /^(?:about )?(?:how long|since when|when did (?:it|that) start)\??$/i.test(original)
    : /^(?:那|这个|这种情况)?(?:多少天|多久(?:了)?|从什么时候开始|什么时候开始)[呢吗]?[？?]?$/.test(compacted);
  if (durationFollowup && (isHematuriaTopic || topic === "trauma")) {
    return {
      question: language === "en"
        ? (topic === "trauma" ? "How long ago did the injury happen?" : "How long has the blood in the urine been present?")
        : (topic === "trauma" ? "外伤是多久以前发生的？" : "血尿多久了？"),
      inherited: true,
      reason: "contextual_duration",
      sourceIntent: topic
    };
  }
  const painFollowup = language === "en"
    ? /^(?:and |what about )?(?:does (?:it|that) hurt|is (?:it|that) painful)\??$/i.test(original)
    : /^(?:那|这个|这种情况)?(?:疼吗|痛吗|疼不疼|痛不痛)[？?]?$/.test(compacted);
  if (painFollowup && isHematuriaTopic) {
    return {
      question: language === "en" ? "Does it hurt when you urinate?" : "小便时疼吗？",
      inherited: true,
      reason: "contextual_pain",
      sourceIntent: topic
    };
  }
  const continuityFollowup = language === "en"
    ? /^(?:is|has) (?:it|that) (?:always|continuous|like this all the time)\??$/i.test(original)
    : /^(?:那|这个|这种情况)?(?:是)?一直这样吗[？?]?$/.test(compacted);
  if (continuityFollowup && isHematuriaTopic) {
    return {
      question: language === "en" ? "Is the blood in the urine continuous or intermittent?" : "血尿是持续还是间断的？",
      inherited: true,
      reason: "contextual_course",
      sourceIntent: topic
    };
  }
  const previousFollowup = language === "en"
    ? /^(?:has|did) (?:it|this|that) happen before\??$/i.test(original)
    : /^(?:那|这个|这种情况)?以前有过吗[？?]?$/.test(compacted);
  if (previousFollowup && isHematuriaTopic) {
    return {
      question: language === "en" ? "Has the blood in the urine happened before or recurred?" : "血尿以前反复出现过吗？",
      inherited: true,
      reason: "contextual_previous_episode",
      sourceIntent: topic
    };
  }
  const contradictionFollowup = language === "en"
    ? /(?:earlier|before).*(?:not hurt|no pain).*(?:now|but).*(?:uncomfortable|hurt|pain)/i.test(original)
    : /(?:前面|刚才|之前).*(?:不痛|不疼).*(?:现在|又|怎么).*(?:不舒服|痛|疼)/.test(original);
  if (!explicitPriority.length && contradictionFollowup && (topic === "dysuria" || isHematuriaTopic)) {
    return {
      question: language === "en" ? `About urination: ${original}` : `关于小便时疼不疼：${original}`,
      inherited: true,
      reason: "contextual_correction",
      sourceIntent: topic
    };
  }
  return { question: original, inherited: false, reason: "", sourceIntent: topic };
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
  canonicalLegacyIntentDefinitions,
  matchPatientFactOntology,
  matchPriorityCanonicalIntents,
  normalizeIntentQuestion,
  patientFactOntology,
  priorityAliasCount,
  priorityIntentDefinitions,
  resolveContextualPatientQuestion,
  safeMissingIntentDefinitions,
  structuredHistoryIntentDefinitions
};
