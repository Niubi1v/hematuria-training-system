export const canonicalSlotIds = [
  "chief_complaint",
  "hematuria_visibility",
  "hematuria_onset",
  "hematuria_frequency",
  "hematuria_phase",
  "urine_color",
  "clots",
  "pain",
  "dysuria",
  "flank_pain",
  "renal_colic",
  "radiating_pain",
  "urinary_frequency",
  "urinary_urgency",
  "voiding_difficulty",
  "retention",
  "fever_chills",
  "glomerular_features",
  "recent_uri",
  "triggers",
  "stone_history",
  "uti_history",
  "tumor_history",
  "urinary_procedure_history",
  "surgery_history",
  "anticoagulant",
  "antiplatelet",
  "medications",
  "smoking",
  "alcohol",
  "occupation_exposure",
  "gynecologic_contamination",
  "family_history",
  "bleeding_tendency",
  "past_history",
  "prior_care",
  "general_condition"
] as const;

export type CanonicalSlotId = typeof canonicalSlotIds[number];

const { asksIndependentGeneralPain, matchPriorityCanonicalIntents } = require("./patientIntentCatalog.js") as {
  asksIndependentGeneralPain(question: string, language: "zh" | "en"): boolean;
  matchPriorityCanonicalIntents(question: string, language: "zh" | "en"): Array<{ intentKey: string; sourceSlotId: CanonicalSlotId }>;
};

type SlotDefinition = {
  id: CanonicalSlotId;
  zh: RegExp;
  en: RegExp;
  labelZh: string;
  labelEn: string;
};

export const canonicalSlotDefinitions: SlotDefinition[] = [
  { id: "chief_complaint", zh: /哪里不舒服|为什么来|主诉|怎么回事|详细说说/, en: /what brings you|what is wrong|main complaint|tell me what happened/i, labelZh: "主诉", labelEn: "Chief complaint" },
  { id: "hematuria_visibility", zh: /肉眼|镜下|看得见|尿潜血|尿隐血/, en: /visible blood|see.*blood|gross hematuria|microscopic|urine test.*blood/i, labelZh: "血尿可见性", labelEn: "Visible or microscopic hematuria" },
  { id: "hematuria_onset", zh: /什么时候|多久|几天|几周|几个月|起病|开始出现/, en: /when did|how long|when.*start|onset/i, labelZh: "起病时间", labelEn: "Onset" },
  { id: "hematuria_frequency", zh: /间断|持续|每次|频率|反复|次数/, en: /intermittent|continuous|every time|how often|frequency|recurrent/i, labelZh: "频率与演变", labelEn: "Frequency and course" },
  { id: "hematuria_phase", zh: /全程|开始红|起始|终末|快尿完|最后几滴|第一杯|第三杯|一直红/, en: /throughout|whole stream|beginning.*(?:red|end)|from beginning to end|initial hematuria|terminal|end of urination|last drops/i, labelZh: "血尿时相", labelEn: "Timing within the urinary stream" },
  { id: "urine_color", zh: /鲜红|暗红|洗肉水|茶色|酱油色|什么颜色|尿色/, en: /bright red|dark red|tea.colou?r|cola.colou?r|color of.*urine|urine colou?r/i, labelZh: "尿液颜色", labelEn: "Urine color" },
  { id: "clots", zh: /血块|血凝块|凝血块|块状/, en: /blood clot|clots?/i, labelZh: "血块", labelEn: "Blood clots" },
  { id: "dysuria", zh: /尿痛|小便疼|排尿痛|烧灼/, en: /dysuria|burning.*urina|painful urination|hurt.*urinate/i, labelZh: "尿痛", labelEn: "Dysuria" },
  { id: "flank_pain", zh: /腰痛|肾区痛|肾区叩痛/, en: /flank pain|loin pain|kidney area.*pain/i, labelZh: "腰痛", labelEn: "Flank pain" },
  { id: "renal_colic", zh: /肾绞痛|绞痛/, en: /renal colic|colicky pain/i, labelZh: "肾绞痛", labelEn: "Renal colic" },
  { id: "radiating_pain", zh: /放射痛|放射到/, en: /radiat.*pain|pain.*groin/i, labelZh: "放射痛", labelEn: "Radiating pain" },
  { id: "pain", zh: /疼不疼|有没有痛|疼痛/, en: /\bpain\b|does it hurt|any pain/i, labelZh: "疼痛", labelEn: "Pain" },
  { id: "urinary_frequency", zh: /尿频|小便次数多/, en: /urinary frequency|frequent urination|urinate often/i, labelZh: "尿频", labelEn: "Urinary frequency" },
  { id: "urinary_urgency", zh: /尿急|憋不住/, en: /\burgency\b|urgent need|cannot hold urine/i, labelZh: "尿急", labelEn: "Urinary urgency" },
  { id: "voiding_difficulty", zh: /排尿困难|尿线细|尿流中断|尿不尽|排尿费力/, en: /difficulty urinating|weak stream|thin stream|interrupted stream|incomplete emptying|straining/i, labelZh: "排尿困难", labelEn: "Voiding difficulty" },
  { id: "retention", zh: /尿潴留|尿不出来/, en: /urinary retention|cannot pass urine/i, labelZh: "尿潴留", labelEn: "Urinary retention" },
  { id: "fever_chills", zh: /发热|发烧|寒战|畏寒|体温/, en: /fever|chills?|rigors?|temperature/i, labelZh: "发热寒战", labelEn: "Fever and chills" },
  { id: "glomerular_features", zh: /泡沫尿|水肿|眼睑肿|下肢肿|血压高/, en: /foamy urine|frothy urine|edema|oedema|swelling|high blood pressure/i, labelZh: "肾小球线索", labelEn: "Glomerular features" },
  { id: "recent_uri", zh: /感冒|咽痛|扁桃体炎|上感/, en: /cold|sore throat|tonsillitis|upper respiratory/i, labelZh: "近期上感", labelEn: "Recent respiratory infection" },
  { id: "triggers", zh: /运动|劳累|受凉|外伤|性生活|导尿|尿路操作|诱因/, en: /exercise|exertion|cold exposure|trauma|sexual activity|catheter|urinary procedure|trigger/i, labelZh: "诱因", labelEn: "Triggers" },
  { id: "stone_history", zh: /结石史|以前.*结石|得过.*结石/, en: /stone history|kidney stones?|urinary stones?|stones before/i, labelZh: "结石史", labelEn: "Stone history" },
  { id: "uti_history", zh: /感染史|以前.*尿路感染|反复.*感染/, en: /uti history|urinary tract infection|recurrent infection/i, labelZh: "尿路感染史", labelEn: "UTI history" },
  { id: "tumor_history", zh: /肿瘤史|以前.*肿瘤|得过.*癌/, en: /cancer history|tumou?r history|previous cancer/i, labelZh: "肿瘤史", labelEn: "Cancer history" },
  { id: "urinary_procedure_history", zh: /导尿|膀胱镜|尿路操作|泌尿.*手术/, en: /catheterization|cystoscopy|urinary procedure|urologic surgery/i, labelZh: "泌尿操作史", labelEn: "Urinary procedure history" },
  { id: "surgery_history", zh: /手术史|做过.*手术|开过刀/, en: /surgery history|previous surgery|operation/i, labelZh: "手术史", labelEn: "Surgical history" },
  { id: "anticoagulant", zh: /抗凝|华法林|利伐沙班|达比加群|阿哌沙班/, en: /anticoag|warfarin|rivaroxaban|dabigatran|apixaban/i, labelZh: "抗凝药", labelEn: "Anticoagulants" },
  { id: "antiplatelet", zh: /抗血小板|阿司匹林|氯吡格雷/, en: /antiplatelet|aspirin|clopidogrel/i, labelZh: "抗血小板药", labelEn: "Antiplatelet medication" },
  { id: "medications", zh: /吃什么药|用药史|长期用药|平时.*药/, en: /medications?|what.*medicine|regular drugs?|what.*take/i, labelZh: "用药史", labelEn: "Medication history" },
  { id: "smoking", zh: /吸烟|抽烟|烟龄|包年|每天.*(?:支|包)/, en: /smok|cigarette|pack.year/i, labelZh: "吸烟史", labelEn: "Smoking history" },
  { id: "alcohol", zh: /喝酒|饮酒|酒量|白酒|啤酒/, en: /alcohol|drink|beer|wine|spirits/i, labelZh: "饮酒史", labelEn: "Alcohol history" },
  { id: "occupation_exposure", zh: /职业|工作|染料|化工|橡胶|皮革|重金属|接触/, en: /occupation|job|work|dye|chemical|rubber|leather|heavy metal|exposure/i, labelZh: "职业暴露", labelEn: "Occupational exposure" },
  { id: "gynecologic_contamination", zh: /月经|阴道出血|妇科污染|怀孕|妊娠/, en: /menstru|period|vaginal bleeding|pregnan|gynecologic contamination/i, labelZh: "妇科污染", labelEn: "Gynecologic contamination" },
  { id: "family_history", zh: /家族史|家里|父母|兄弟姐妹|遗传|听力异常/, en: /family history|hereditary|relative|hearing loss/i, labelZh: "家族史", labelEn: "Family history" },
  { id: "bleeding_tendency", zh: /鼻出血|牙龈出血|瘀斑|紫癜|出血倾向/, en: /nosebleed|gum bleeding|bruis|purpura|bleeding tendency/i, labelZh: "全身出血倾向", labelEn: "Systemic bleeding tendency" },
  { id: "past_history", zh: /高血压|糖尿病|冠心病|房颤|肝炎|结核|既往史/, en: /hypertension|diabetes|coronary|atrial fibrillation|hepatitis|tuberculosis|past history/i, labelZh: "既往史", labelEn: "Past medical history" },
  { id: "prior_care", zh: /看过医生|治疗过|外院|吃过什么|做过哪些处理/, en: /seen a doctor|previous treatment|treated before|outside hospital/i, labelZh: "诊治经过", labelEn: "Previous care" },
  { id: "general_condition", zh: /胃口|食欲|睡眠|大便|体重|消瘦|一般情况/, en: /appetite|sleep|bowel|stool|weight loss|lost weight|general condition/i, labelZh: "一般情况", labelEn: "General condition" }
];

export function matchCanonicalSlots(question: string, language: "zh" | "en") {
  const priority = matchPriorityCanonicalIntents(question, language);
  const matches = canonicalSlotDefinitions.filter((definition) => (language === "en" ? definition.en : definition.zh).test(question));
  const ids = [...priority.map((item) => item.sourceSlotId), ...matches.map((definition) => definition.id)];
  if (priority.some((item) => item.sourceSlotId === "dysuria") && !asksIndependentGeneralPain(question, language)) {
    return [...new Set(ids.filter((id) => id !== "pain"))];
  }
  return [...new Set(ids)];
}

/** 仅供导入迁移：旧HX编号在这里结合标签转换，业务逻辑不读取裸编号含义。 */
export function canonicalSlotFromLegacy(label: string, possibleQuestion = ""): CanonicalSlotId | null {
  const source = `${label} ${possibleQuestion}`;
  return canonicalSlotDefinitions.find((definition) => definition.zh.test(source) || definition.en.test(source))?.id || null;
}
