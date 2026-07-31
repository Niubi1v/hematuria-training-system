"use strict";

const path = require("node:path");

const runtimeFile = path.join(__dirname, "..", "desktop", "clinical-content-triage-runtime.json");
let cachedRuntime;

function enabled() {
  return process.env.HEMATURIA_RUNTIME_TARGET === "desktop";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function runtime() {
  if (!enabled()) return null;
  if (cachedRuntime) return cachedRuntime;
  const loaded = require(runtimeFile);
  if (loaded?.schemaVersion !== 1 || loaded?.desktopOnly !== true) {
    throw new Error("desktop_clinical_triage_runtime_invalid");
  }
  const expected = loaded?.sourcePack?.triageCounts || {};
  if (expected.auto_apply_after_source_match !== 125
    || expected.policy_safe_simulated_normal_candidate !== 75
    || expected.no_specimen_or_not_indicated !== 552
    || expected.no_report_or_not_indicated !== 952
    || expected.needs_case_specific_medical_review !== 902
    || expected.blocked_medical_conflict !== 1) {
    throw new Error("desktop_clinical_triage_counts_invalid");
  }
  cachedRuntime = loaded;
  return cachedRuntime;
}

function matches(item, caseId, itemIds, displayName) {
  if (item.caseId !== caseId) return false;
  const identifiers = new Set((itemIds || []).map(String).filter(Boolean));
  if (identifiers.has(String(item.itemId))) return true;
  const requestedDisplay = normalize(displayName);
  return Boolean(requestedDisplay) && normalize(item.displayName) === requestedDisplay;
}

function findIn(rows, caseId, itemIds, displayName) {
  return (rows || []).find((item) => matches(item, caseId, itemIds, displayName)) || null;
}

function desktopClinicalContent({ caseId, itemIds = [], displayName = "" }) {
  const loaded = runtime();
  if (!loaded) return null;
  const groups = [
    ["source_projection", loaded.sourceProjection],
    ["simulated_normal", loaded.safeSimulatedNormal],
    ["no_specimen", loaded.noSpecimenOrNotIndicated],
    ["no_indication", loaded.noReportOrNotIndicated],
    ["medical_conflict", loaded.medicalConflicts],
    ["medical_review_pending", loaded.medicalReviewPending]
  ];
  for (const [classification, rows] of groups) {
    const found = findIn(rows, caseId, itemIds, displayName);
    if (found) return { ...found, classification };
  }
  return null;
}

function desktopClinicalTriageSummary() {
  const loaded = runtime();
  if (!loaded) return null;
  return {
    sourcePackSha256: loaded.sourcePack.sha256,
    sourceProjectionApplied: loaded.sourceProjection.length,
    sourceProjectionRejected: loaded.sourceProjectionRejected.length,
    safeSimulatedNormalApplied: loaded.safeSimulatedNormal.length,
    noSpecimenOrNotIndicated: loaded.noSpecimenOrNotIndicated.length,
    noReportOrNotIndicated: loaded.noReportOrNotIndicated.length,
    medicalReviewPending: loaded.medicalReviewPending.length,
    medicalConflicts: loaded.medicalConflicts.length
  };
}

module.exports = {
  desktopClinicalContent,
  desktopClinicalTriageSummary
};
