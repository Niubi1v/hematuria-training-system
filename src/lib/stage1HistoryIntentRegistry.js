"use strict";

const { patientFactOntology } = require("./patientIntentCatalog.js");

const detailLevel = Object.freeze({
  chief_complaint: "presenting_clue",
  hematuria_onset: "duration",
  intermittent_hematuria: "frequency",
  smoking_history: "existence",
  smoking_amount: "amount",
  smoking_duration: "duration",
  alcohol_history: "existence",
  alcohol_amount: "amount",
  alcohol_frequency: "frequency",
  medication_use: "existence",
  medication_list: "name_list",
  medication_name: "name_list",
  medication_dosage: "dose",
  medication_frequency: "frequency",
  prior_medical_visit: "performed",
  prior_investigations: "performed",
  prior_investigation_results_patient_aware: "result",
  prior_diagnosis_patient_aware: "patient_aware_diagnosis",
  prior_treatment: "treatment",
  prior_medication_for_current_problem: "treatment_medication",
  treatment_response: "response"
});

const followUps = Object.freeze({
  smoking_history: ["smoking_amount", "smoking_duration"],
  alcohol_history: ["alcohol_amount", "alcohol_frequency"],
  medication_list: ["medication_name", "medication_dosage", "medication_frequency"],
  medication_name: ["medication_dosage", "medication_frequency"],
  prior_investigations: ["prior_investigation_results_patient_aware"],
  prior_treatment: ["prior_medication_for_current_problem", "treatment_response"],
  prior_medication_for_current_problem: ["treatment_response"]
});

const presenceIntents = new Set([
  "gross_hematuria", "microscopic_hematuria", "pain", "dysuria", "urinary_frequency",
  "urinary_urgency", "blood_clots", "flank_pain", "fever", "foamy_urine", "edema",
  "hesitancy", "weak_stream", "incomplete_emptying", "urinary_retention", "nocturia",
  "smoking_history", "alcohol_history", "medication_use"
]);

const quantificationGranularities = new Set(["amount", "duration", "frequency", "dose"]);

const quantityUnknownReplies = Object.freeze({
  urinary_frequency: Object.freeze({
    zh: "小便是比以前勤，具体一天几次我没数过。",
    en: "I do urinate more often, but I have not counted how many times a day."
  }),
  nocturia: Object.freeze({
    zh: "晚上是会起夜，具体几次我没数清。",
    en: "I do get up at night to urinate, but I have not counted how many times."
  })
});

function semanticDepth(intent, granularity) {
  if (presenceIntents.has(intent) || granularity === "existence") return 1;
  if (quantificationGranularities.has(granularity)) return 3;
  return 2;
}

function questionSemanticDepth(intent, question = "", language = "zh") {
  const text = String(question || "");
  if (language === "en") {
    if (/\b(?:how many|how much|how often|how long|what dose|dosage|times? (?:a|per))\b/i.test(text)) return 3;
    if (/\b(?:what kind|what colour|what color|where|which part|what pattern)\b/i.test(text)) return 2;
  } else {
    if (/多少|几次|几回|多久|多长|多大剂量|每天(?:几|多少)|一[天晚周月年](?:几|多少)/u.test(text)) return 3;
    if (/什么样|什么颜色|哪(?:里|个部位)|什么性质|什么规律/u.test(text)) return 2;
  }
  return stage1HistoryIntent(intent)?.semanticDepth || 2;
}

function neutralUnknownPresenceReply(language = "zh") {
  return language === "en" ? "I have not really paid attention to that." : "这个我之前没太留意。";
}

function patientizeOccupationalExposure(parts) {
  const detail = parts.join(" ")
    .replace(/^(?:工作中接触过)?职业暴露[：:]\s*/u, "")
    .replace(/\//g, "或");
  const duration = detail.match(/(?:\d+|[一二三四五六七八九十两]+)(?:余|多)?年/u)?.[0] || "";
  const exposure = detail
    .replace(duration, "")
    .replace(/接触|相关(?:职业|化工)?暴露|化工暴露/gu, "")
    .trim();
  return `工作中接触过${exposure}${duration ? `，有${duration}了` : ""}。`;
}

const sourceProjections = Object.freeze({
  gross_hematuria: Object.freeze({
    separators: /[+，,；;。！？!?]+/u,
    include: Object.freeze({
      zh: /肉眼(?:可见|血尿|淡红|红尿)|小便.*(?:看见|看出).*红/u,
      en: /\bi could see\b.*(?:red|pink|tea|cola|blood)/i
    }),
    renderIncluded: Object.freeze({
      zh: (parts) => /茶色|酱油色|烟熏色|淡红|粉红/u.test(parts.join(" "))
        ? "我自己能看出尿色有变化。"
        : "小便能看出红色。",
      en: () => "I could see that the color of my urine had changed."
    }),
    missingReply: Object.freeze({
      zh: "小便外观看不看得出血，我之前没太留意。",
      en: "I have not really paid attention to whether blood was visible in my urine."
    })
  }),
  microscopic_hematuria: Object.freeze({
    separators: /[+，,；;。！？!?]+/u,
    include: Object.freeze({
      zh: /镜下|尿检.*(?:血尿|红细胞|发现血)|红细胞.*(?:尿检|升高)/u,
      en: /urine test|urinalysis|red blood cells/i
    }),
    renderIncluded: Object.freeze({
      zh: () => "尿检的时候才知道尿里有血。",
      en: () => "A urine test showed blood in my urine."
    }),
    missingReply: Object.freeze({
      zh: "尿检有没有发现血，我之前没太留意。",
      en: "I have not really paid attention to whether a urine test found blood."
    })
  }),
  urine_color: Object.freeze({
    separators: /[，,；;。！？!?]+/u,
    include: Object.freeze({
      zh: /颜色|尿色|红|茶色|酱油色|洗肉水/u,
      en: /colou?r|red|tea|cola|pink/i
    }),
    childIntents: Object.freeze(["foamy_urine"]),
    spillPattern: Object.freeze({ zh: /泡沫/u, en: /foam/i })
  }),
  hesitancy: Object.freeze({
    separators: /[、，,；;。！？!?]+/u,
    include: Object.freeze({
      zh: /踌躇|起尿|开始尿|等一会/u,
      en: /hesitan|wait.*start|difficulty starting/i
    }),
    childIntents: Object.freeze(["weak_stream", "urinary_frequency", "nocturia", "urinary_retention"]),
    spillPattern: Object.freeze({
      zh: /尿线|尿分叉|尿频|夜尿|尿潴留|尿不出来/u,
      en: /weak stream|split stream|frequen|nocturia|retention|cannot pass urine/i
    }),
    missingReply: Object.freeze({
      zh: "小便开始时要不要等一会，我之前没太留意。",
      en: "I have not paid close attention to whether I have to wait before urination starts."
    })
  }),
  occupational_exposure: Object.freeze({
    separators: /[。.！？!?]+/u,
    include: Object.freeze({ zh: /./u, en: /./u }),
    renderIncluded: Object.freeze({
      zh: patientizeOccupationalExposure,
      en: (parts) => `${parts.join(" ").replace(/^occupational exposure[：:]?\s*/iu, "I was exposed to ")}.`
    })
  })
});

function sourceField(definition) {
  if (definition.domain === "structured_history") {
    return definition.historyKey
      ? `data/cases.json:structuredHistory.${definition.historyKey}`
      : "data/cases.json:structuredHistory";
  }
  if (definition.domain === "patient_knowledge") {
    return `server/patientKnowableAllowlist.js:${definition.key}`;
  }
  if (definition.domain === "safe_missing") return null;
  return `data/patient_slots_bilingual.json:${definition.sourceSlotId}`;
}

function governancePolicy(domain) {
  if (domain === "structured_history") return "structured_review_and_conflict_fail_closed";
  if (domain === "patient_knowledge") return "exact_source_allowlist_only";
  if (domain === "safe_missing") return "missing_only_no_negative_inference";
  return "bilingual_source_and_medical_quarantine";
}

function naturalForms(definition, language) {
  const label = String(language === "en" ? definition.labelEn : definition.labelZh || "").trim();
  const aliases = definition.aliases?.[language] || [];
  const templates = language === "en"
    ? [
        `${label}?`, `Any ${label}?`, `Do you have ${label}?`, `What about ${label}?`,
        `Have you had ${label}?`, `Could you tell me about ${label}?`
      ]
    : [
        `${label}吗？`, `有没有${label}？`, `${label}这方面怎么样？`, `平时${label}有吗？`,
        `${label}有还是没有？`, `想问下${label}。`
      ];
  const candidates = definition.domain === "patient_knowledge" ? [...aliases, ...templates] : [...templates, ...aliases];
  return Object.freeze([...new Set(candidates.map((value) => String(value).trim()).filter(Boolean))].slice(0, 6));
}

// `prior_care` is the legacy canonical alias of the governed
// `prior_medical_visit` patient-knowledge intent, not a second history fact.
const stage1HistoryIntentDefinitions = Object.freeze(patientFactOntology
  .filter((definition) => definition.key !== "prior_care")
  .map((definition) => Object.freeze({
  intent: definition.key,
  sourceSlotId: definition.sourceSlotId || null,
  ontologyDomain: definition.domain,
  aliases: definition.aliases,
  naturalForms: Object.freeze({
    zh: naturalForms(definition, "zh"),
    en: naturalForms(definition, "en")
  }),
  sourceField: sourceField(definition),
  disclosureGranularity: detailLevel[definition.key] || "direct_fact",
  semanticDepth: semanticDepth(definition.key, detailLevel[definition.key] || "direct_fact"),
  quantityUnknownReply: quantityUnknownReplies[definition.key] || null,
  followUpIntents: Object.freeze(followUps[definition.key] || []),
  governancePolicy: governancePolicy(definition.domain),
  compoundBehavior: "preserve_each_grounded_clause",
  sourceProjection: sourceProjections[definition.key] || null,
  semanticIntentFallback: definition.domain !== "safe_missing",
  ontology: definition
})));

const stage1HistoryIntentRegistry = new Map(
  stage1HistoryIntentDefinitions.map((definition) => [definition.intent, definition])
);

function stage1HistoryIntent(intent) {
  const key = String(intent || "");
  return stage1HistoryIntentRegistry.get(key === "prior_care" ? "prior_medical_visit" : key) || null;
}

module.exports = {
  neutralUnknownPresenceReply,
  questionSemanticDepth,
  stage1HistoryIntent,
  stage1HistoryIntentDefinitions,
  stage1HistoryIntentRegistry
};
