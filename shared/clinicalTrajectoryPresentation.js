"use strict";

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function sanitizeClinicalEntry(item, language) {
  if (!item || typeof item !== "object") return null;
  const action = text(item.action);
  const canonical = text(item.canonical);
  let result = text(item.result);
  if (/[:：]\s*$/u.test(result)) result = "";
  if (!action && !canonical && !result) return null;
  return {
    ...item,
    action: action || canonical,
    canonical,
    result: result || (language === "en" ? "Result temporarily unavailable" : "结果暂不可用")
  };
}

function sanitizeClinicalTrajectory(trajectory, language = "zh") {
  if (!trajectory || typeof trajectory !== "object") return trajectory;
  const entryGroups = [
    "questions",
    "acquiredEvidence",
    "examinationsAndOrders",
    "diagnosisFormation",
    "consultations",
    "treatmentOrders",
    "perioperativeManagement",
    "unnecessaryInvestigations"
  ];
  const sanitized = { ...trajectory };
  for (const group of entryGroups) {
    sanitized[group] = (Array.isArray(trajectory[group]) ? trajectory[group] : [])
      .map((item) => sanitizeClinicalEntry(item, language))
      .filter(Boolean);
  }
  sanitized.decisionTransitions = (Array.isArray(trajectory.decisionTransitions) ? trajectory.decisionTransitions : [])
    .filter((item) => item && typeof item === "object" && text(item.reason));
  sanitized.omissions = (Array.isArray(trajectory.omissions) ? trajectory.omissions : [])
    .filter((item) => item && typeof item === "object" && text(item.label));
  return sanitized;
}

module.exports = { sanitizeClinicalTrajectory };
