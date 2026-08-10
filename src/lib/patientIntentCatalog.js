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
    confusableWith: Object.freeze(["pain", "abdominal_pain", "suprapubic_pain", "renal_colic"])
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
        "red from the start to the end of urination", "red from beginning to end", "not only red at the end"
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
  const baseAliasesZh = [...new Set(definition.aliases?.zh || [])];
  const baseAliasesEn = [...new Set(definition.aliases?.en || [])];
  const lexicon = {
    zhMedical: definition.lexicon?.zhMedical || [definition.labelZh].filter(Boolean),
    zhPatient: definition.lexicon?.zhPatient || baseAliasesZh,
    zhRegional: definition.lexicon?.zhRegional || [],
    enMedical: definition.lexicon?.enMedical || [definition.labelEn].filter(Boolean),
    enPatient: definition.lexicon?.enPatient || baseAliasesEn,
    negatedZh: definition.lexicon?.negatedZh || (definition.labelZh ? [`没有${definition.labelZh}吧`] : []),
    negatedEn: definition.lexicon?.negatedEn || (definition.labelEn ? [`No ${definition.labelEn}, right`] : []),
    choiceZh: definition.lexicon?.choiceZh || (definition.labelZh ? [`有${definition.labelZh}还是没有${definition.labelZh}`] : []),
    choiceEn: definition.lexicon?.choiceEn || (definition.labelEn ? [`${definition.labelEn} or not`] : []),
    typosZh: definition.lexicon?.typosZh || [],
    confusableWith: definition.confusableWith || []
  };
  const aliasesZh = [...new Set([
    ...baseAliasesZh,
    ...lexicon.zhMedical,
    ...lexicon.zhPatient,
    ...lexicon.zhRegional,
    ...lexicon.negatedZh,
    ...lexicon.choiceZh,
    ...lexicon.typosZh
  ])];
  const aliasesEn = [...new Set([
    ...baseAliasesEn,
    ...lexicon.enMedical,
    ...lexicon.enPatient,
    ...lexicon.negatedEn,
    ...lexicon.choiceEn
  ])];
  return Object.freeze({
    ...definition,
    aliases: Object.freeze({
      zh: Object.freeze(aliasesZh),
      en: Object.freeze(aliasesEn)
    }),
    lexicon: Object.freeze({
      zhMedical: Object.freeze(lexicon.zhMedical),
      zhPatient: Object.freeze(lexicon.zhPatient),
      zhRegional: Object.freeze(lexicon.zhRegional),
      enMedical: Object.freeze(lexicon.enMedical),
      enPatient: Object.freeze(lexicon.enPatient),
      negatedZh: Object.freeze(lexicon.negatedZh),
      negatedEn: Object.freeze(lexicon.negatedEn),
      choiceZh: Object.freeze(lexicon.choiceZh),
      choiceEn: Object.freeze(lexicon.choiceEn),
      typosZh: Object.freeze(lexicon.typosZh),
      confusableWith: Object.freeze(lexicon.confusableWith)
    })
  });
}

const canonicalLegacyIntentDefinitions = [
  {
    key: "chief_complaint", sourceSlotId: "chief_complaint", domain: "canonical_legacy", labelZh: "主诉", labelEn: "Chief complaint",
    aliases: { zh: ["哪里不舒服", "为什么来", "为什么来看病", "主诉", "怎么了", "怎么回事"], en: ["what brings you", "what brought you in", "main complaint", "what is wrong"] },
    pattern: /哪里不舒服|为什么来(?:看病)?|主诉|怎么了|怎么回事|用自己的话.*(?:不舒服|经过|为什么)|what brings you|what brought you(?: in)?|what is wrong|main complaint|main problem.*brought you|in your own words.*(?:why|what happened)|describe.*(?:main problem|what happened).*(?:brought you|in your own words)|why you came/i
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
    pattern: /间断|持续|每次|反复|时有时无|intermittent|continuous|every time|(?:血尿|尿红|尿血).{0,8}频率|频率.{0,8}(?:血尿|尿红|尿血)|how often.*(?:blood|red urine|hematuria)|(?:blood|red urine|hematuria).*(?:how often|frequency)|keep(?:s)? coming back|come(?:s)? back|recur/i,
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
  ["smoking_amount", "smokingHistory", "LIFE_SMOKING", "每日吸烟量", "Smoking amount", /一天(?:抽|吸)(?:多少|几)(?:支|根|包)?|每天(?:抽|吸)(?:多少|几)(?:支|根|包)?|烟量|多少支烟|how many cigarettes|cigarettes? per day/i],
  ["smoking_duration", "smokingHistory", "LIFE_SMOKING", "吸烟时长", "Smoking duration", /抽烟(?:抽了)?多少年|吸烟(?:有)?多久|烟龄(?:多久|多少年)?|几年烟龄|how long.*smok|years?.*smok/i],
  ["alcohol_history", "alcoholHistory", "LIFE_ALCOHOL", "饮酒史", "Alcohol history", /喝酒|饮酒|酒量|白酒|啤酒|alcohol|drink/i],
  ["alcohol_amount", "alcoholHistory", "LIFE_ALCOHOL", "饮酒量", "Alcohol amount", /喝多少(?:酒)?|酒量(?:多大|多少|怎么样)?|一次喝多少|白酒啤酒喝多少|how much.*(?:alcohol|drink)|amount.*alcohol/i],
  ["alcohol_frequency", "alcoholHistory", "LIFE_ALCOHOL", "饮酒频率", "Alcohol frequency", /多久喝一次|多长时间喝一次|每天喝吗|一周喝几次|平时多常喝|喝得勤吗|how often.*(?:drink|alcohol)|drink.*frequency/i],
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
  ["past_medical_history_summary", null, "PAST_ALL", "其他疾病", "Other medical conditions", /有没有其他(?:疾病|病)|还有(?:没有)?(?:什么)?其他(?:疾病|病)|有(?:没有)?基础病|以前有(?:没有|什么|哪些)?(?:疾病|病|毛病)|平时身体还有什么毛病|其他(?:疾病|病史)|any other (?:diseases?|medical conditions?)|any (?:other )?medical problems?|other medical conditions?/i],
  ["medication_use", "medicationList", "MED_ALL", "是否长期用药", "Regular medication use", /平时(?:有没(?:有)?|是否)(?:吃|服|用)药|长期(?:有没(?:有)?|是否)(?:吃|服|用)药|有没(?:有)?长期用药|有没有常吃的药|现在吃药吗|do you take (?:any )?(?:regular )?(?:medication|medicine)|are you on (?:any )?(?:regular )?(?:medication|medicine)/i],
  ["medication_list", "medicationList", "MED_ALL", "用药史", "Medication history", /长期.*(?:吃|服|用).*药|平时.*(?:吃|服|用).*药|(?:吃|服|用)(?:的)?什么药|都吃什么药|现在在吃哪些药|常吃的药|用药史|长期用药|regular medications?|what (?:medications?|medicines?) do you take|(?:medications?|medicines?) do you take/i],
  ["medication_name", "medicationList", "MED_ALL", "药物名称", "Medication name", /高血压.*(?:吃|服|用).*什么药|(?:吃|服|用)(?:的)?什么降压药|什么降压药|具体(?:的)?药名|药(?:物)?(?:的)?(?:具体)?名(?:称|字)|叫什么药|what (?:is|are) the (?:specific )?(?:medication|medicine|drug)(?: name)?|name of (?:the )?(?:medication|medicine|drug)|what.*(?:take|taking).*(?:hypertension|high blood pressure)/i],
  ["medication_dosage", "medicationList", "MED_ALL", "用药剂量", "Medication dose", /(?:具体)?剂量(?:是)?多少|(?:药|服用|每次).*(?:剂量|多少毫克|吃多少)|(?:剂量|多少毫克).*(?:药|服用)|medication dose|medicine dose|drug dose|how many milligrams|what(?:'s| is)? the dose|what dose/i],
  ["medication_frequency", "medicationList", "MED_ALL", "用药频次", "Medication frequency", /一天(?:吃|服|用)?(?:几次|多少次)|多久(?:吃|服|用)一次|(?:药|服药).*(?:频次|频率|吃法|怎么吃)|how often.*(?:medication|medicine|drug)|times? (?:a|per) day|medication frequency/i],
  ["other_medications", "medicationList", "MED_ALL", "其他用药", "Other medications", /还有(?:没有|什么|哪些).*(?:药|用药)|其他(?:药|用药)|any other medications?|other medicines?/i]
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

const patientKnowledgeIntentDefinitions = [
  {
    key: "prior_medical_visit", sourceSlotId: "PATIENT_PRIOR_VISIT", labelZh: "本次问题既往就诊", labelEn: "Prior visit for this problem",
    aliases: { zh: ["之前去过医院吗", "以前看过医生吗", "为这个去门诊了吗", "这次症状看过医生吗", "之前就诊过吗", "去医院看了吗", "找医生看过没有", "来这里前看过吗", "有没有去急诊", "以前为尿血看过吗"], en: ["did you see a doctor before", "did you visit a clinic for this", "have you been to hospital for this", "any prior medical visit", "did you go to the emergency department", "was this checked by a doctor before", "did you seek care earlier", "have you consulted anyone about this", "did you see your doctor for this", "were you seen elsewhere"] },
    pattern: /(?:之前|以前|此前|来这里前).*(?:去过医院|看过医生|找过医生|就诊|门诊|急诊|医院)|(?:去|看|找).*(?:医院|门诊|急诊|医生).*(?:了吗|没有|过吗)|see.*doctor.*before|prior.*(?:visit|care)|visit.*(?:clinic|hospital)|seek.*care/i
  },
  {
    key: "prior_investigations", sourceSlotId: "PATIENT_PRIOR_INVESTIGATIONS", labelZh: "既往检查项目", labelEn: "Prior investigations",
    confusableWith: ["prior_medical_visit"],
    aliases: { zh: ["有没有做什么检查", "做检查了吗", "做过哪些检查", "之前查过什么", "去医院查什么了", "都做了什么检查", "有没有验过", "以前检查过吗", "医院给你查了吗", "为这个做过检查没有"], en: ["what tests have you had", "did you have any tests", "were any investigations done", "what did the hospital check", "have you been tested for this", "which examinations were performed", "did they run any tests", "what tests were done before", "have you had investigations", "did the clinic test anything"] },
    pattern: /(?:做|查|验)(?:了|过)?(?:什么|哪些)(?:检查|检验|项目)|(?:做|查|验).{0,8}(?:检查|检验|项目).{0,8}(?:吗|了|没有|过)|(?:以前|之前|医院).{0,12}(?:做了哪些查看|查看过)|(?:有没(?:有)?|是否)?(?:做|查|验)(?:了|过)?(?:尿|血|CTU?|MRI|磁共振|B超|彩超|超声)(?:吗|没有)?|还有没有做其他检查|有没有(?:做过检查|查过|验过|检查过)|(?:以前|之前|医院).{0,8}(?:检查过|查过|验过|给你查)|(?:什么|哪些).*(?:检查|检验).*(?:做|查)|what tests|which (?:tests|examinations)|any (?:tests|investigations)|tests? (?:were|was|have been) done/i
  },
  {
    key: "prior_investigation_results_patient_aware", sourceSlotId: "PATIENT_PRIOR_RESULTS", labelZh: "患者知晓的既往检查结果", labelEn: "Patient-aware prior results",
    confusableWith: ["prior_medical_visit"],
    aliases: { zh: ["检查结果怎么样", "结果出来了吗", "查出来什么", "报告怎么说", "尿检怎么样", "查尿结果呢", "B超结果呢", "CT结果呢", "医生说检查有什么", "检查发现什么了"], en: ["what did the tests show", "what were the results", "what did the report say", "how was the urine test", "what did the urine test show", "what was the ultrasound result", "what did the CT show", "did the results show anything", "what was found on testing", "what did the doctor say about the tests"] },
    pattern: /(?:检查|检验|尿检|尿常规|查尿|验尿|B超|彩超|超声|CT|CTU|MRI|磁共振|膀胱镜|病理|活检|报告).*(?:结果|怎么样|怎么说|发现|查出|显示|提示|有什么)|(?:结果|报告).*(?:什么|怎么|出来)|what did.*(?:test|scan|report).*(?:show|say)|what (?:were|was).*(?:result|finding)|what.*found.*(?:test|scan)/i
  },
  {
    key: "prior_diagnosis_patient_aware", sourceSlotId: "PATIENT_PRIOR_DIAGNOSIS", labelZh: "患者知晓的既往诊断", labelEn: "Patient-aware prior diagnosis",
    confusableWith: ["prior_medical_visit"],
    aliases: { zh: ["之前医生说是什么", "以前诊断过什么", "医生有没有说什么病", "之前被诊断过吗", "医院当时怎么说", "医生说你得了什么", "以前说是什么问题", "看病时说什么原因", "之前有没有明确说法", "外院给过诊断吗"], en: ["what did the doctor diagnose before", "were you given a diagnosis", "what did they say it was", "did the hospital name the condition", "what diagnosis were you told", "were you diagnosed with anything", "what did your previous doctor call it", "did they explain the cause", "was a diagnosis made earlier", "what were you told was wrong"] },
    pattern: /(?:之前|以前|当时|外院|医院).*(?:医生.{0,12})?(?:诊断|说是)|医生.*(?:诊断|说是|什么病|什么问题|什么原因)|(?:被诊断|诊断过).*(?:什么|吗)|previous.*diagnos|given a diagnosis|what did.*doctor.*(?:say|call)|what were you told.*wrong/i
  },
  {
    key: "prior_treatment", sourceSlotId: "PATIENT_PRIOR_TREATMENT", labelZh: "本次问题既往处理", labelEn: "Prior treatment",
    confusableWith: ["prior_medical_visit"],
    aliases: { zh: ["之前怎么治疗的", "为这个治过吗", "医院给你处理了吗", "以前接受过治疗吗", "这次症状治过没有", "之前做过什么处理", "医生给你怎么治", "去医院后怎么处理", "有没有输液治疗", "之前采取过什么办法"], en: ["how was this treated before", "did you receive treatment", "what treatment did they give you", "was anything done for this", "how did the hospital treat it", "did you have treatment for this problem", "what was done previously", "were you treated at the clinic", "did you receive an infusion", "what did the doctor do for it"] },
    pattern: /(?:之前|以前|此前|当时|医院|医生).*(?:治疗|处理|怎么治|输液)|(?:为|因|这次).*(?:治过|治疗过|处理过)|how was.*treated|receive.*treatment|what treatment|what was done.*(?:before|previous)|doctor do.*for it/i
  },
  {
    key: "prior_medication_for_current_problem", sourceSlotId: "PATIENT_CURRENT_PROBLEM_MEDICATION", labelZh: "本次问题既往用药", labelEn: "Medication for the current problem",
    confusableWith: ["gross_hematuria", "medication_list"],
    aliases: { zh: ["为这个吃过药吗", "这次有没有用药", "之前吃了什么药", "尿血后吃药了吗", "医生给你开药了吗", "有没有服过药", "为这次症状用什么药", "来之前吃药没有", "之前打针吃药了吗", "这次问题用过药吗"], en: ["did you take medicine for this", "what medication did you take for this problem", "were you prescribed anything", "did you take any drugs before coming", "have you used medicine for these symptoms", "what did you take after the bleeding started", "did the doctor give you medication", "were you on treatment medicine", "did you take tablets for this", "any medication for the current episode"] },
    pattern: /(?:为|因|这次|本次|尿血|尿红|症状|发作以后|来之前).*(?:吃药|用药|服药|什么药|开药)|(?:吃|服|用|开).*(?:什么)?药.*(?:这次|本次|尿血|尿红|症状|发作以后|来之前|来院前)|(?:医生|医院|大夫).*(?:开|给|让).{0,6}药|medicine.*(?:for this|current|symptom)|medication.*(?:for this|current|episode)|prescribed.*(?:anything|medicine)|take.*(?:drug|medicine).*before/i
  },
  {
    key: "treatment_response", sourceSlotId: "PATIENT_TREATMENT_RESPONSE", labelZh: "既往治疗反应", labelEn: "Treatment response",
    confusableWith: ["prior_treatment"],
    aliases: { zh: ["治疗后怎么样", "吃药后好点了吗", "用药有效果吗", "后来缓解了吗", "处理后有没有好转", "治了以后还发吗", "药吃了管用吗", "输液后怎么样", "治疗反应如何", "后来症状有变化吗"], en: ["did treatment help", "did you get better after medicine", "how did you respond to treatment", "what happened after treatment", "did the symptoms improve", "was the medication effective", "did it come back after treatment", "how were you after the infusion", "did treatment change anything", "did you feel better afterward"] },
    pattern: /(?:治疗|吃药|用药|服药|处理|输液|打针).*(?:后|以后).*(?:怎么样|好转|缓解|有效|管用|复发|加重)|(?:后来|之后).*(?:好点|缓解|复发|加重)|treatment.*(?:help|response|after|improve)|(?:better|improve|effective|come back).*(?:after|medicine|treatment)/i
  }
].map((definition) => defineOntologyFact({ ...definition, domain: "patient_knowledge", classifierEligible: true }));

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
  ...patientKnowledgeIntentDefinitions,
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

function suppressConfusableFact(question, intentKey, language = "zh") {
  const normalized = normalizeIntentQuestion(question);
  const compacted = normalized.replace(/\s+/g, "");
  if (intentKey === "hematuria_onset") {
    return language === "zh"
      ? /抽烟|吸烟|烟龄|喝酒|喝.{0,6}酒|饮酒|酒量|用药|吃药|服药|药物|病史|高血压|糖尿病/.test(String(question))
      : /smok|cigarette|alcohol|drink|medicat|medicine|drug|medical history|hypertension|diabetes/i.test(String(question));
  }
  if (intentKey === "urinary_frequency") {
    return language === "zh"
      ? /(?:尿完|排完|小便后|膀胱).*(?:还有尿|还想尿|没排干净|没排空)|总觉得还有尿/.test(compacted)
      : /(?:after|finish).*(?:stillfeel|bladder).*(?:full|needtogo|urineleft)|incompleteemptying/i.test(compacted);
  }
  if (intentKey === "intermittent_hematuria") {
    return language === "zh"
      ? /(?:每次尿|每次小便).*(?:全程|从头到尾).*(?:红|血)/.test(compacted)
      : /everytime.*(?:throughout|wholestream|starttofinish).*(?:red|blood)/i.test(compacted);
  }
  if (intentKey === "hypertension_history") {
    return language === "zh"
      ? /高血压[^，。！？?]*(?:吃|服|用)(?:的)?什么药/.test(String(question))
      : /what[^,.!?]*(?:take|taking)[^,.!?]*(?:hypertension|high blood pressure)|(?:hypertension|high blood pressure)[^,.!?]*what[^,.!?]*(?:medicine|medication|drug)/i.test(String(question));
  }
  if (intentKey === "triggers") {
    return language === "zh"
      ? /外伤史|(?:以前|既往|曾经).{0,8}外伤|受过.{0,4}伤/.test(String(question))
      : /(?:history of|previous|prior).{0,12}(?:injury|trauma)|injur(?:y|ies).{0,8}(?:before|previously)/i.test(String(question));
  }
  if (intentKey === "occupation") {
    return /职业暴露|occupational exposure|expos.*(?:work|job|occupation)/i.test(String(question));
  }
  if (intentKey === "prior_treatment") {
    return language === "zh"
      ? /(?:治疗|用药|吃药|服药|处理|输液).*(?:后|以后).*(?:怎么样|好转|缓解|有效|管用|复发|加重)/.test(compacted)
      : /(?:treatment|medicine|medication).*(?:after|help|better|improv|effective|response|come back)/i.test(normalized);
  }
  return false;
}

function matchPriorityCanonicalIntents(question, language = "zh") {
  const definitions = patientFactOntology.filter((definition) => definition.domain === "canonical_priority");
  return definitions.flatMap((definition, definitionOrder) => {
    if (suppressConfusableFact(question, definition.key, language)) return [];
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
    if (suppressConfusableFact(text, definition.key, language)) return [];
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
    const structured = matchPatientFactOntology(text, language, ["structured_history"])[0];
    if (structured) return structured.intentKey;
    const patientKnowledge = matchPatientFactOntology(text, language, ["patient_knowledge"])[0];
    if (patientKnowledge) return patientKnowledge.intentKey;
    if (language === "en") {
      if (/(?:blood|red).*(?:urine|pee)|(?:urine|pee).*(?:blood|red)|hematuria/i.test(text)) return "gross_hematuria";
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

function resolveContextualPatientQuestion(question, conversationHistory = [], language = "zh", conversationState = null) {
  const original = String(question || "").trim();
  const explicitPriority = matchPriorityCanonicalIntents(original, language);
  const historyTopic = recentConversationTopic(conversationHistory, language);
  const stateTopic = String(conversationState?.currentTopic || "");
  const stateEntity = historyTopic ? "" : String(conversationState?.currentEntity || "");
  const stateContextEntities = Array.isArray(conversationState?.contextEntities)
    ? conversationState.contextEntities.map(String).filter(Boolean)
    : [];
  const pastMedicalIntents = new Set([
    "hypertension_history", "diabetes_history", "coronary_history", "stroke_history",
    "liver_disease_history", "tuberculosis_history", "previous_stone",
    "previous_urinary_infection", "previous_malignancy"
  ]);
  const recentPatientReply = [...(Array.isArray(conversationHistory) ? conversationHistory : [])]
    .reverse()
    .find((entry) => entry?.role === "patient")?.text || "";
  const historyContextEntities = matchPatientFactOntology(recentPatientReply, language, ["structured_history"])
    .map((definition) => definition.intentKey)
    .filter((intent) => pastMedicalIntents.has(intent));
  const pastMedicalContextEntities = stateContextEntities.length ? stateContextEntities : [...new Set(historyContextEntities)];
  const topic = historyTopic || stateTopic;
  if (!original || !topic) {
    return { question: original, inherited: false, reason: "", sourceIntent: "" };
  }
  const compacted = compact(original);
  const durationFollowup = language === "en"
    ? /^(?:about )?(?:how long|since when|when did (?:it|that) start)\??$/i.test(original)
    : /^(?:那|这个|这种情况)?(?:多少天|多久(?:了)?|从什么时候开始|什么时候开始)[呢吗]?[？?]?$/.test(compacted);
  if (durationFollowup && pastMedicalContextEntities.length) {
    if (pastMedicalContextEntities.length > 1) return {
      question: original,
      inherited: true,
      reason: "contextual_past_medical_history_clarification",
      sourceIntent: "past_medical_history_summary",
      clarification: "multiple_past_medical_conditions",
      contextEntities: pastMedicalContextEntities
    };
    const label = ({
      hypertension_history: language === "en" ? "hypertension" : "高血压",
      diabetes_history: language === "en" ? "diabetes" : "糖尿病",
      coronary_history: language === "en" ? "coronary heart disease" : "冠心病",
      stroke_history: language === "en" ? "stroke" : "脑卒中",
      liver_disease_history: language === "en" ? "liver disease" : "肝病",
      tuberculosis_history: language === "en" ? "tuberculosis" : "结核",
      previous_stone: language === "en" ? "urinary stones" : "泌尿系结石",
      previous_urinary_infection: language === "en" ? "urinary infection" : "尿路感染",
      previous_malignancy: language === "en" ? "cancer" : "肿瘤"
    })[pastMedicalContextEntities[0]];
    if (label) return {
      question: language === "en" ? `How long have you had ${label}?` : `${label}多久了？`,
      inherited: true,
      reason: "contextual_past_medical_history_duration",
      sourceIntent: pastMedicalContextEntities[0],
      contextEntities: pastMedicalContextEntities
    };
  }
  if (["smoking_history", "smoking_amount", "smoking_duration"].includes(topic)) {
    const amountFollowup = language === "en"
      ? /^(?:and )?(?:how much|how many|how many a day)\??$/i.test(original)
      : /^(?:那|然后)?(?:多少|一天多少|每天多少|抽多少|多少支)[呢吗？?]*$/.test(compacted);
    if (amountFollowup) return {
      question: language === "en" ? "How many cigarettes do you smoke each day?" : "每天大约抽多少支烟？",
      inherited: true,
      reason: "contextual_smoking_amount",
      sourceIntent: "smoking_amount"
    };
    const smokingDurationFollowup = language === "en"
      ? /^(?:and )?(?:how long|for how many years)\??$/i.test(original)
      : /^(?:那|然后)?(?:多久|多少年|几年)[呢吗了？?]*$/.test(compacted);
    if (smokingDurationFollowup) return {
      question: language === "en" ? "How many years have you smoked?" : "抽烟多少年了？",
      inherited: true,
      reason: "contextual_smoking_duration",
      sourceIntent: "smoking_duration"
    };
  }
  if (["alcohol_history", "alcohol_amount", "alcohol_frequency"].includes(topic)) {
    const amountFollowup = language === "en"
      ? /^(?:and )?(?:how much|what kind)\??$/i.test(original)
      : /^(?:那|然后)?(?:多少|喝多少|酒量呢|什么酒)[呢吗？?]*$/.test(compacted);
    if (amountFollowup) return {
      question: language === "en" ? "How much alcohol do you drink?" : "平时喝多少酒？",
      inherited: true,
      reason: "contextual_alcohol_amount",
      sourceIntent: "alcohol_amount"
    };
    const frequencyFollowup = language === "en"
      ? /^(?:and )?(?:how often|every day)\??$/i.test(original)
      : /^(?:那|然后)?(?:多久一次|多久喝一次|每天吗|一周几次|多常喝)[呢吗？?]*$/.test(compacted);
    if (frequencyFollowup) return {
      question: language === "en" ? "How often do you drink alcohol?" : "多久喝一次酒？",
      inherited: true,
      reason: "contextual_alcohol_frequency",
      sourceIntent: "alcohol_frequency"
    };
  }
  if (["prior_medical_visit", "prior_investigations", "prior_investigation_results_patient_aware"].includes(topic)) {
    const investigationFollowup = language === "en"
      ? /^(?:and )?(?:then what|what tests|what did they check|anything else)\??$/i.test(original)
      : /^(?:那|然后|后来)?(?:呢|查了什么|做了什么检查|还有吗)[？?]?$/.test(compacted);
    if (investigationFollowup) return {
      question: language === "en" ? "What tests did you have before?" : "之前做过哪些检查？",
      inherited: true,
      reason: "contextual_prior_investigations",
      sourceIntent: topic
    };
    const resultFollowup = language === "en"
      ? /^(?:and )?(?:what were the results|what did it show|what did the doctor say)\??$/i.test(original)
      : /^(?:那|然后|后来)?(?:结果呢|结果怎么样|查出什么|检查怎么说|那个检查结果呢|医生怎么(?:跟你)?说(?:的)?)[？?]?$/.test(compacted);
    if (resultFollowup) return {
      question: language === "en" ? "What did the previous tests show?" : "之前检查结果怎么样？",
      inherited: true,
      reason: "contextual_prior_investigation_results",
      sourceIntent: topic
    };
  }
  if (["prior_treatment", "prior_medication_for_current_problem"].includes(topic)) {
    const medicationFollowup = language === "en"
      ? /^(?:and )?(?:did you take medicine|did they give you medicine)\??$/i.test(original)
      : /^(?:那|然后|后来)?(?:吃过药吗|用过药吗|给药了吗)[？?]?$/.test(compacted);
    if (medicationFollowup) return {
      question: language === "en" ? "Did you take medicine for this problem?" : "为这个吃过药吗？",
      inherited: true,
      reason: "contextual_current_problem_medication",
      sourceIntent: topic
    };
    const responseFollowup = language === "en"
      ? /^(?:and )?(?:did it help|did you get better|what happened afterward)\??$/i.test(original)
      : /^(?:那|然后|后来)?(?:有效吗|管用吗|好点了吗|缓解了吗|怎么样了)[？?]?$/.test(compacted);
    if (responseFollowup) return {
      question: language === "en" ? "Did the previous treatment help?" : "之前治疗后好转了吗？",
      inherited: true,
      reason: "contextual_treatment_response",
      sourceIntent: topic
    };
  }
  const isHematuriaTopic = ["gross_hematuria", "microscopic_hematuria", "whole_stream_hematuria", "initial_hematuria", "terminal_hematuria"].includes(topic);
  const isMedicationTopic = [
    "medication_list",
    "medication_name",
    "medication_dosage",
    "medication_frequency",
    "other_medications",
    "anticoagulant_use",
    "antiplatelet_use",
    "hypertension_history"
  ].includes(topic);
  if (isMedicationTopic) {
    const antihypertensiveContext = [
      original,
      ...(Array.isArray(conversationHistory) ? conversationHistory.slice(-8).map((entry) => entry?.text || "") : [])
    ]
      .some((value) => language === "en"
        ? /hypertension|high blood pressure|antihypertensive/i.test(String(value))
        : /高血压|降压药/.test(String(value)));
    const medicationNameFollowup = language === "en"
      ? /^(?:(?:what is|what's) (?:the )?(?:specific )?name|what.*(?:take|taking).*(?:hypertension|high blood pressure)|what (?:medicine|medication) do you take)\??$/i.test(original)
      : /^(?:(?:那|这个|这种药)?具体(?:的)?(?:药)?名(?:称|字)?(?:是什么|叫什么)?|高血压.*(?:吃|服|用).*什么药|(?:吃|服|用)(?:的)?什么(?:降压)?药)[呢吗]?[？?]?$/.test(compacted);
    if (medicationNameFollowup) {
      return {
        question: language === "en"
          ? (antihypertensiveContext ? "What is the specific antihypertensive medication name?" : "What is the specific medication name?")
          : (antihypertensiveContext ? "吃的什么降压药？" : "具体药名是什么？"),
        inherited: true,
        reason: "contextual_medication_name",
        sourceIntent: topic
      };
    }
    const medicationDoseFollowup = language === "en"
      ? /^(?:what|how much)(?: is)? the dose\??$/i.test(original)
      : /^(?:那|这个|这种药)?(?:具体)?剂量(?:是)?多少[呢吗]?[？?]?$/.test(compacted);
    if (medicationDoseFollowup) {
      return {
        question: language === "en" ? "What is the medication dose?" : "药的具体剂量是多少？",
        inherited: true,
        reason: "contextual_medication_dosage",
        sourceIntent: topic
      };
    }
    const medicationFrequencyFollowup = language === "en"
      ? /^(?:how often|how many times (?:a|per) day|how (?:do|should) (?:i|you) take (?:it|this medicine))\??$/i.test(original)
      : /^(?:那|这个药?|这种药)?(?:(?:一天)?(?:吃|服|用)?(?:几次|多少次)|怎么吃|如何服用)[呢吗]?[？?]?$/.test(compacted);
    if (medicationFrequencyFollowup) {
      return {
        question: language === "en"
          ? (antihypertensiveContext ? "How often do you take the antihypertensive medication?" : "How often do you take the medication?")
          : (antihypertensiveContext ? "降压药怎么吃？" : "这种药一天吃几次？"),
        inherited: true,
        reason: "contextual_medication_frequency",
        sourceIntent: topic
      };
    }
    const otherMedicationFollowup = language === "en"
      ? /^(?:do (?:i|you) take|are there) any other medications?\??$/i.test(original)
      : /^(?:还有|还)(?:没有)?(?:吃|服|用)?(?:什么|哪些)?其他药[呢吗]?[？?]?$/.test(compacted);
    if (otherMedicationFollowup) {
      return {
        question: language === "en" ? "Do you take any other medications?" : "还有没有吃其他药？",
        inherited: true,
        reason: "contextual_other_medications",
        sourceIntent: topic
      };
    }
  }
  if (durationFollowup && (
    isHematuriaTopic
    || topic === "trauma"
    || topic === "chief_complaint"
    || ["hematuria", "health_check_finding", "chief_complaint_finding"].includes(stateEntity)
  )) {
    return {
      question: language === "en"
        ? (topic === "trauma" ? "How long ago did the injury happen?" : "How long has the blood in the urine been present?")
        : (topic === "trauma"
          ? "外伤是多久以前发生的？"
          : stateEntity === "health_check_finding" ? "体检发现尿异常多久了？" : "血尿多久了？"),
      inherited: true,
      reason: "contextual_duration",
      sourceIntent: topic
    };
  }
  const discoveryFollowup = language === "en"
    ? /^(?:how (?:was|did) (?:it|that).*(?:found|discover)|how did you notice (?:it|that))\??$/i.test(original)
    : /^(?:那|这个|这种情况)?(?:是)?怎么(?:发现|知道|注意到)的[呢吗]?[？?]?$/.test(compacted);
  if (discoveryFollowup && (
    isHematuriaTopic
    || topic === "chief_complaint"
    || ["hematuria", "health_check_finding", "chief_complaint_finding"].includes(stateEntity)
  )) {
    return {
      question: language === "en" ? "What brought you here and how was it found?" : "为什么来看，是怎么发现的？",
      inherited: true,
      reason: "contextual_discovery",
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
    : /^(?:那|这个|这种情况)?以前(?:有过|出现过)吗[？?]?$/.test(compacted);
  if (previousFollowup && (
    isHematuriaTopic
    || topic === "chief_complaint"
    || ["hematuria", "health_check_finding", "chief_complaint_finding"].includes(stateEntity)
  )) {
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
  patientKnowledgeIntentDefinitions,
  priorityAliasCount,
  priorityIntentDefinitions,
  resolveContextualPatientQuestion,
  safeMissingIntentDefinitions,
  structuredHistoryIntentDefinitions
};
