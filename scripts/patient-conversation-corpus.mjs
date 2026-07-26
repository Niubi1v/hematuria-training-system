import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { patientFactOntology } = require("../src/lib/patientIntentCatalog.js");

const priority = patientFactOntology.filter((definition) => definition.domain === "canonical_priority");

function first(values, fallback) {
  return String(values?.find(Boolean) || fallback);
}

function zhExpression(definition, index) {
  const groups = [
    definition.lexicon.zhMedical,
    definition.lexicon.zhPatient,
    definition.lexicon.zhRegional,
    definition.lexicon.negatedZh,
    definition.lexicon.choiceZh,
    definition.lexicon.typosZh
  ];
  return first(groups[index % groups.length], first(definition.lexicon.zhPatient, definition.labelZh));
}

function enExpression(definition, index) {
  const groups = [
    definition.lexicon.enMedical,
    definition.lexicon.enPatient,
    definition.lexicon.negatedEn,
    definition.lexicon.choiceEn
  ];
  return first(groups[index % groups.length], first(definition.lexicon.enPatient, definition.labelEn));
}

export function buildPatientConversationCorpus() {
  const zh = [];
  const en = [];
  for (let index = 0; index < priority.length; index += 1) {
    const current = priority[index];
    const paired = priority[(index + 1) % priority.length];
    zh.push({
      id: `zh-${current.key}-medical`,
      kind: "generated_compound",
      question: `${zhExpression(current, index)}，另外${zhExpression(paired, index + 1)}吗？`,
      conversationHistory: []
    });
    zh.push({
      id: `zh-${current.key}-patient`,
      kind: "generated_compound",
      question: `${zhExpression(current, index + 1)}，${zhExpression(paired, index + 3)}呢？`,
      conversationHistory: []
    });
    en.push({
      id: `en-${current.key}`,
      kind: "generated_compound",
      question: `${enExpression(current, index)}, and ${enExpression(paired, index + 1)}?`,
      conversationHistory: []
    });
  }

  const zhOverrides = [
    ["小便痛吗，尿频吗？", "colloquial"],
    ["拉尿的时候痛不痛，尿急吗？", "regional"],
    ["没有尿痛吧，晚上要起夜吗？", "negated"],
    ["小便痛还是不痛，尿线有没有变细？", "choice"],
    ["小便全程都是红的吗，有没有血块？", "compound"],
    ["从头到尾都红吗，腰疼不疼？", "colloquial"],
    ["尿尿时会不会疼，有没有发烧？", "colloquial"],
    ["小便剌痛吗，尿里泡沫多不多？", "typo"],
    ["尿频尿急尿痛有没有？", "compound"],
    ["以前得过结石或者肿瘤吗？", "structured_history"],
    ["以前有没有尿路感染，做过泌尿手术吗？", "structured_history"],
    ["平时吃什么药，有没有药物过敏？", "structured_history"],
    ["抽烟喝酒吗，家里有人得过类似的病吗？", "structured_history"]
  ];
  for (let index = 0; index < zhOverrides.length; index += 1) {
    zh[index] = {
      ...zh[index],
      question: zhOverrides[index][0],
      kind: zhOverrides[index][1]
    };
  }
  zh[28] = {
    id: "zh-context-duration",
    kind: "context_ellipsis",
    question: "多少天？",
    conversationHistory: [
      { role: "student", text: "哪里不舒服？" },
      { role: "patient", text: "我小便红了几天。" }
    ]
  };
  zh[29] = {
    id: "zh-context-correction",
    kind: "context_correction",
    question: "为什么前面说不痛，现在又说不舒服？",
    conversationHistory: [
      { role: "student", text: "小便时痛不痛？" },
      { role: "patient", text: "小便时不痛。" }
    ]
  };

  en[10] = {
    id: "en-history-stone-malignancy",
    kind: "structured_history",
    question: "Have you had urinary stones or cancer before?",
    conversationHistory: []
  };
  en[11] = {
    id: "en-history-medication-allergy",
    kind: "structured_history",
    question: "What regular medicines do you take, and do you have any drug allergies?",
    conversationHistory: []
  };
  en[12] = {
    id: "en-negated-dysuria",
    kind: "negated",
    question: "It does not hurt to pee, right, and do you have to rush to the bathroom?",
    conversationHistory: []
  };
  en[13] = {
    id: "en-context-duration",
    kind: "context_ellipsis",
    question: "How long?",
    conversationHistory: [
      { role: "student", text: "What brought you in?" },
      { role: "patient", text: "My urine has looked red for a few days." }
    ]
  };
  en[14] = {
    id: "en-context-correction",
    kind: "context_correction",
    question: "Earlier you said it did not hurt, but now you said it was uncomfortable. What changed?",
    conversationHistory: [
      { role: "student", text: "Does it hurt to pee?" },
      { role: "patient", text: "No, it does not hurt when I pee." }
    ]
  };

  if (zh.length !== 30 || en.length !== 15) throw new Error("patient_conversation_corpus_size_drift");
  return { zh, en };
}
