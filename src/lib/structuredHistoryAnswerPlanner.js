const { FACT_STATES } = require("./patientFactState.js");

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

function selectMedicationsForQuestion(medications, question, language = "zh") {
  const scope = medicationScopeFromQuestion(question, language);
  if (scope !== "antihypertensive") return { medications, scope: "" };
  return {
    medications: medications.filter((item) => /高血压|降压/.test(`${item?.name || ""} ${item?.indication || ""}`)),
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
    const hasCategoryOnlyName = names.some((name) => categoryOnlyMedicationPattern.test(name));
    return {
      renderedAnswer: hasCategoryOnlyName
        ? (language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall the specific name.`
          : `只知道长期服用${joinedNames}，具体名称记不清。`)
        : (language === "en"
          ? `The medications I know are ${joinedNames}.`
          : `我知道的药名是${joinedNames}。`),
      factState: hasCategoryOnlyName ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE
    };
  }

  if (intent === "medication_dosage") {
    const known = medications
      .filter((item) => String(item?.dose || "").trim())
      .map((item) => language === "en"
        ? `${item.name}: ${item.dose}`
        : `${item.name}是${item.dose}`);
    const missing = medications.filter((item) => !String(item?.dose || "").trim());
    if (!known.length) {
      return {
        renderedAnswer: language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall the specific dose.`
          : `只知道长期服用${joinedNames}，具体剂量记不清。`,
        factState: FACT_STATES.PARTIALLY_KNOWN
      };
    }
    return {
      renderedAnswer: missing.length
        ? (language === "en"
          ? `${naturalList(known, language)}. I cannot recall the dose of ${naturalList(medicationNames(missing), language)}.`
          : `${naturalList(known, language)}；${naturalList(medicationNames(missing), language)}的具体剂量记不清。`)
        : (language === "en" ? `${naturalList(known, language)}.` : `${naturalList(known, language)}。`),
      factState: missing.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE
    };
  }

  if (intent === "medication_frequency") {
    const known = medications
      .filter((item) => String(item?.frequency || "").trim())
      .map((item) => medicationFrequency(item, language));
    const missing = medications.filter((item) => !String(item?.frequency || "").trim());
    if (!known.length) {
      return {
        renderedAnswer: language === "en"
          ? `I only know that I take ${joinedNames} long term; I cannot recall exactly how I take them.`
          : `只知道长期服用${joinedNames}，具体吃法记不清。`,
        factState: FACT_STATES.PARTIALLY_KNOWN
      };
    }
    return {
      renderedAnswer: missing.length
        ? (language === "en"
          ? `${naturalList(known, language)}. I cannot recall exactly how I take ${naturalList(medicationNames(missing), language)}.`
          : `${naturalList(known, language)}；${naturalList(medicationNames(missing), language)}的具体吃法记不清。`)
        : (language === "en" ? `${naturalList(known, language)}.` : `${naturalList(known, language)}。`),
      factState: missing.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.EXACT_VALUE
    };
  }

  return {
    renderedAnswer: language === "en"
      ? `The medications I remember taking are ${joinedNames}; I do not recall any others.`
      : `我记得在吃${joinedNames}，除此之外不记得还在吃其他药。`,
    factState: FACT_STATES.EXACT_VALUE
  };
}

function buildPastMedicalHistorySummary(history, language = "zh", isBlocked = () => false) {
  const known = [];
  const blocked = [];
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
  if (blocked.length) {
    renderedAnswer += language === "en"
      ? " I cannot recall the rest clearly."
      : " 其他既往病史我记不太清。";
  }
  return {
    renderedAnswer: renderedAnswer || (language === "en"
      ? "I cannot recall my other medical history clearly."
      : "其他既往病史我记不太清。"),
    factState: blocked.length
      ? (known.length ? FACT_STATES.PARTIALLY_KNOWN : FACT_STATES.NEEDS_REVIEW)
      : (known.length ? FACT_STATES.EXACT_VALUE : FACT_STATES.MISSING),
    sources: [...known, ...blocked].map((item) => item.fact),
    hasUnresolved: blocked.length > 0
  };
}

module.exports = {
  PAST_MEDICAL_FACTS,
  buildMedicationAnswerPlan,
  buildPastMedicalHistorySummary,
  medicationScopeFromQuestion,
  selectMedicationsForQuestion
};
