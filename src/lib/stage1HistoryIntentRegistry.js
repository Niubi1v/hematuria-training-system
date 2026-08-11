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

const sourceProjections = Object.freeze({
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
  stage1HistoryIntent,
  stage1HistoryIntentDefinitions,
  stage1HistoryIntentRegistry
};
