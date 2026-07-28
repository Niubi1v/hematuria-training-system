const { FACT_STATES } = require("./patientFactState.js");
const {
  controlledAntihypertensiveNames,
  historySummaryRecommendations,
  hypertensionMedicationRecommendation,
  medicationRecommendations,
  normalizeRecommendedFactState
} = require("./patientRuntimeRecommendations.js");

const PAST_MEDICAL_FACTS = Object.freeze([
  ["hypertension", "高血压", "hypertension"],
  ["diabetes", "糖尿病", "diabetes"],
  ["coronaryDisease", "冠心病", "coronary heart disease"],
  ["stroke", "脑卒中", "stroke"],
  ["liverDisease", "肝病", "liver disease"],
  ["tuberculosis", "结核", "tuberculosis"],
  ["stoneHistory", "泌尿系结石", "urinary stones"],
  ["urinaryInfectionHistory", "尿路感染", "urinary tract infection"],
  ["malignancyHistory", "肿瘤", "cancer"]
]);

const categoryOnlyMedicationPattern = /^(?:降压药|降糖药|降脂药|止痛药|抗凝药|抗血小板药|利尿药|他汀(?:类)?(?:药)?|中药|保健品)$/i;

function naturalList(values, language) {
  const items = values.filter(Boolean);
  if (language !== "en") return items.join("、");
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function medicationNames(medications) {
  return [...new Set(medications.map((item) => String(item?.name || "").trim()).filter(Boolean))];
}

function medicationScopeFromQuestion(question, language = "zh") {
  const text = String(question || "");
  if (language === "en") {
    return /hypertension|high blood pressure|antihypertensive/i.test(text) ? "antihypertensive" : "";
  }
  return /高血压|降压药/.test(text) ? "antihypertensive" : "";
}

function selectMedicationsForQuestion(medications, question, language = "zh", options = {}) {
  const scope = medicationScopeFromQuestion(question, language);
  if (scope !== "antihypertensive") return { medications, scope: "" };
  const controlledNames = new Set(controlledAntihypertensiveNames(options.caseId));
  return {
    medications: medications.filter((item) => (
      /高血压|降压/.test(`${item?.name || ""} ${item?.indication || ""}`)
      || controlledNames.has(String(item?.name || "").trim())
    )),
    scope
  };
}

function medicationFrequency(item, language) {
  const frequency = String(item?.frequency || "").trim();
  if (language === "en") {
    return `${item.name}: ${frequency === "每日" ? "daily" : frequency}`;
  }
  if (frequency === "每日") return `${item.name}每天服用`;
  return `${item.name}是${frequency}`;
}

function noLongTermMedication(answer, language) {
  return language === "en"
    ? /\b(?:do not|don't|no)\b.*\b(?:regular|long[- ]term|medication|medicine)\b/i.test(answer)
    : /(?:没有|不吃|未服用|没吃).*(?:长期)?(?:药|用药)/.test(answer);
}

function buildMedicationAnswerPlan(
  history,
  intent,
  language = "zh",
  medications = history?.medicationList || [],
  options = {}
) {
  const names = medicationNames(medications);
  const allNames = medicationNames(options.allMedications || medications);
  const medicationAnswer = String(language === "en" ? history?.medicationAnswerEn : history?.medicationAnswerZh || "").trim();
  const joinedNames = naturalList(names, language);
  const hypertensionRecommendation = language === "zh" && options.scope === "antihypertensive"
    ? hypertensionMedicationRecommendation(options.caseId)
    : null;
  const runtimeRecommendation = (questionType, medicationName = "") => (
    language === "zh" && options.caseId
      ? medicationRecommendations(options.caseId, questionType, medicationName)[0] || null
      : null
  );
  const recommendationMetadata = (items) => {
    const usable = items.filter(Boolean);
    if (!usable.length) return {};
    return {
      runtimeOnly: true,
      provenance: [...new Set(usable.map((item) => item.provenance))].join("+"),
      runtimeFactStates: Object.fromEntries(
        usable.map((item) => [item.medicationName || item.targetField, normalizeRecommendedFactState(item.factState)])
      )
    };
  };

  if (intent === "medication_list") {
    const partial = /具体.*(?:记不|不太清)|cannot recall.*specific/i.test(medicationAnswer);
    return {
      renderedAnswer: medicationAnswer,
      factState: noLongTermMedication(medicationAnswer, language)
        ? FACT_STATES.KNOWN_FALSE
        : partial ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE
    };
  }

  if (!names.length) {
    if (options.scope === "antihypertensive" && allNames.length) {
      return {
        renderedAnswer: language === "en"
          ? `I remember taking ${naturalList(allNames, language)}, but I cannot tell which one is for high blood pressure.`
          : `我只记得在吃${naturalList(allNames, language)}，但哪一种是降压药说不清。`,
        factState: FACT_STATES.PARTIALLY_KNOWN
      };
    }
    if (options.scope === "antihypertensive") {
      return {
        renderedAnswer: language === "en"
          ? "I know that I have high blood pressure, but I cannot recall which medicine I take for it."
          : "我只知道自己有高血压，具体吃什么降压药记不清。",
        factState: FACT_STATES.MISSING
      };
    }
    const renderedAnswer = medicationAnswer || (language === "en"
      ? "I do not have a reliable medication list."
      : "我没有可靠的用药记录。");
    return {
      renderedAnswer,
      factState: noLongTermMedication(renderedAnswer, language)
        ? FACT_STATES.KNOWN_FALSE
        : FACT_STATES.MISSING
    };
  }

  if (intent === "medication_name") {
    if (hypertensionRecommendation && names.length) {
      return {
        renderedAnswer: hypertensionRecommendation.runtimeAnswer,
        factState: normalizeRecommendedFactState(hypertensionRecommendation.factState),
        runtimeOnly: true,
        provenance: hypertensionRecommendation.provenance,
        runtimeFactStates: {
          hypertensionMedicationLink: normalizeRecommendedFactState(hypertensionRecommendation.factState)
        }
      };
    }
    const hasCategoryOnlyName = names.some((name) => categoryOnlyMedicationPattern.test(name));
    const nameRecommendations = medications
      .map((item) => runtimeRecommendation("具体药名缺口", String(item?.name || "").trim()))
      .filter(Boolean);
    const exactNames = medications
      .filter((item) => !runtimeRecommendation("具体药名缺口", String(item?.name || "").trim()))
      .map((item) => String(item?.name || "").trim())
      .filter(Boolean);
    return {
      renderedAnswer: nameRecommendations.length
        ? [
            exactNames.length ? `我知道的药名是${naturalList(exactNames, language)}。` : "",
            ...nameRecommendations.map((item) => item.runtimeAnswer)
          ].filter(Boolean).join("")
        : hasCategoryOnlyName
        ? (language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall the specific name.`
          : `只知道长期服用${joinedNames}，具体名称记不清。`)
        : (language === "en"
          ? `The medications I know are ${joinedNames}.`
          : `我知道的药名是${joinedNames}。`),
      factState: nameRecommendations.length
        ? FACT_STATES.PARTIALLY_KNOWN
        : hasCategoryOnlyName ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE,
      ...recommendationMetadata(nameRecommendations)
    };
  }

  if (intent === "medication_dosage") {
    const known = medications
      .filter((item) => String(item?.dose || "").trim())
      .map((item) => language === "en"
        ? `${item.name}: ${item.dose}`
        : `${item.name}是${item.dose}`);
    const missing = medications.filter((item) => !String(item?.dose || "").trim());
    const missingRecommendations = missing
      .map((item) => runtimeRecommendation("用药剂量缺口", String(item?.name || "").trim()))
      .filter(Boolean);
    if (!known.length) {
      return {
        renderedAnswer: missingRecommendations.length
          ? naturalList(missingRecommendations.map((item) => item.runtimeAnswer), language)
          : language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall the specific dose.`
          : `只知道长期服用${joinedNames}，具体剂量记不清。`,
        factState: FACT_STATES.PARTIALLY_KNOWN,
        ...recommendationMetadata(missingRecommendations)
      };
    }
    return {
      renderedAnswer: missing.length
        ? (missingRecommendations.length
          ? `${naturalList(known, language)}；${naturalList(missingRecommendations.map((item) => item.runtimeAnswer), language)}`
          : language === "en"
          ? `${naturalList(known, language)}. I cannot recall the dose of ${naturalList(medicationNames(missing), language)}.`
          : `${naturalList(known, language)}；${naturalList(medicationNames(missing), language)}的具体剂量记不清。`)
        : (language === "en" ? `${naturalList(known, language)}.` : `${naturalList(known, language)}。`),
      factState: missing.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE,
      ...recommendationMetadata(missingRecommendations)
    };
  }

  if (intent === "medication_frequency") {
    const known = medications
      .filter((item) => String(item?.frequency || "").trim())
      .map((item) => medicationFrequency(item, language));
    const missing = medications.filter((item) => !String(item?.frequency || "").trim());
    const missingRecommendations = missing
      .map((item) => runtimeRecommendation("用药频次缺口", String(item?.name || "").trim()))
      .filter(Boolean);
    if (!known.length) {
      return {
        renderedAnswer: missingRecommendations.length
          ? naturalList(missingRecommendations.map((item) => item.runtimeAnswer), language)
          : language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall exactly how I take them.`
          : `只知道长期服用${joinedNames}，具体吃法记不清。`,
        factState: FACT_STATES.PARTIALLY_KNOWN,
        ...recommendationMetadata(missingRecommendations)
      };
    }
    return {
      renderedAnswer: missing.length
        ? (missingRecommendations.length
          ? `${naturalList(known, language)}；${naturalList(missingRecommendations.map((item) => item.runtimeAnswer), language)}`
          : language === "en"
          ? `${naturalList(known, language)}. I cannot recall exactly how I take ${naturalList(medicationNames(missing), language)}.`
          : `${naturalList(known, language)}；${naturalList(medicationNames(missing), language)}的具体吃法记不清。`)
        : (language === "en" ? `${naturalList(known, language)}.` : `${naturalList(known, language)}。`),
      factState: missing.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE,
      ...recommendationMetadata(missingRecommendations)
    };
  }

  return {
    renderedAnswer: language === "en"
      ? `The medications I remember taking are ${joinedNames}; I do not recall any others.`
      : `我记得在吃${joinedNames}，除此之外不记得还在吃其他药。`,
    factState: FACT_STATES.EXACT_VALUE
  };
}

function buildPastMedicalHistorySummary(history, language = "zh", isBlocked = () => false, options = {}) {
  const known = [];
  const blocked = [];
  const summaryRecommendations = language === "zh"
    ? historySummaryRecommendations(options.caseId)
    : [];
  const coveredBlockedKeys = new Set(summaryRecommendations.map((item) => item.targetField));
  for (const [key, labelZh, labelEn] of PAST_MEDICAL_FACTS) {
    const fact = history?.[key];
    if (!fact) continue;
    const item = { key, label: language === "en" ? labelEn : labelZh, fact };
    if (isBlocked(key, fact)) blocked.push(item);
    else known.push(item);
  }
  const present = known.filter((item) => item.fact.status === "present");
  const absent = known.filter((item) => item.fact.status === "absent");
  let renderedAnswer = "";
  if (present.length) {
    renderedAnswer = language === "en"
      ? `My known medical history includes ${naturalList(present.map((item) => item.label), language)}.`
      : `我已知有${naturalList(present.map((item) => item.label), language)}。`;
  }
  if (absent.length) {
    renderedAnswer = language === "en"
      ? `${renderedAnswer}${renderedAnswer ? " " : ""}I do not have ${naturalList(absent.map((item) => item.label), language)}.`
      : `${renderedAnswer}${renderedAnswer ? " " : ""}已知没有${naturalList(absent.map((item) => item.label), language)}。`;
  }
  const unresolvedBlocked = blocked.filter((item) => !coveredBlockedKeys.has(item.key));
  if (summaryRecommendations.length) {
    renderedAnswer += language === "en"
      ? " No other definite disease has been diagnosed."
      : " 除此之外没有诊断过其他明确疾病。";
  }
  if (unresolvedBlocked.length) {
    renderedAnswer += language === "en"
      ? " I cannot recall the rest clearly."
      : " 其他既往病史我记不太清。";
  }
  return {
    renderedAnswer: renderedAnswer || (language === "en"
      ? "I cannot recall my other medical history clearly."
      : "其他既往病史我记不太清。"),
    factState: unresolvedBlocked.length
      ? (known.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.NEEDS_REVIEW)
      : (known.length || summaryRecommendations.length ? FACT_STATES.EXACT_VALUE : FACT_STATES.MISSING),
    sources: [...known, ...blocked].map((item) => item.fact),
    hasUnresolved: blocked.length > 0,
    runtimeOnly: summaryRecommendations.length > 0,
    provenance: [...new Set(summaryRecommendations.map((item) => item.provenance))].join("+") || null,
    runtimeFactStates: Object.fromEntries(
      summaryRecommendations.map((item) => [item.targetField, normalizeRecommendedFactState(item.factState)])
    ),
    hasRuntimeGovernance: summaryRecommendations.length > 0,
    hasUncoveredBlocked: unresolvedBlocked.length > 0
  };
}

module.exports = {
  PAST_MEDICAL_FACTS,
  buildMedicationAnswerPlan,
  buildPastMedicalHistorySummary,
  medicationScopeFromQuestion,
  selectMedicationsForQuestion
};
