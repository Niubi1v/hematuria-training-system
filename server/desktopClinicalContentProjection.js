"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const runtimeFile = path.join(__dirname, "..", "desktop", "clinical-content-triage-runtime.json");
const approvedFile = path.join(__dirname, "..", "desktop", "human-approved-result-mappings.json");
let cachedRuntime;
let cachedDecisions;

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

function resolveJsonPath(root, jsonPath) {
  if (!/^\$(?:\[\d+\]|\.[A-Za-z0-9_]+)+$/u.test(String(jsonPath || ""))) throw new Error("human_approved_source_path_invalid");
  return String(jsonPath).slice(1).match(/\[\d+\]|\.[A-Za-z0-9_]+/gu).reduce((value, token) => (
    token.startsWith("[") ? value?.[Number(token.slice(1, -1))] : value?.[token.slice(1)]
  ), root);
}

function humanDecisionSourceValid(decision, sourceText) {
  return typeof sourceText === "string"
    && crypto.createHash("sha256").update(sourceText).digest("hex") === decision.source.sha256
    && decision.sourceFragments?.length > 0
    && decision.sourceFragments.every((fragment) => sourceText.includes(fragment));
}

function approvedDecisions() {
  if (!enabled()) return null;
  if (cachedDecisions) return cachedDecisions;
  const loaded = require(approvedFile);
  if (loaded?.schemaVersion !== 1 || loaded?.productScope !== "r5-desktop-practice" || !Array.isArray(loaded.decisions)) {
    throw new Error("human_approved_result_mappings_invalid");
  }
  const sourceCache = new Map();
  const seen = new Set();
  const decisions = loaded.decisions.map((decision) => {
    if (!decision?.id || seen.has(decision.id) || decision.humanReviewStatus !== "approved") {
      throw new Error("human_approved_result_mapping_record_invalid");
    }
    seen.add(decision.id);
    const sourceFile = String(decision.source?.file || "").replaceAll("\\", "/");
    if (!new Set(["data/cases.json", "data/order_results_structured.json"]).has(sourceFile)) {
      throw new Error("human_approved_source_file_invalid");
    }
    const absolute = path.join(__dirname, "..", ...sourceFile.split("/"));
    if (!sourceCache.has(absolute)) sourceCache.set(absolute, JSON.parse(fs.readFileSync(absolute, "utf8")));
    let sourceText = "";
    let valid = false;
    try {
      sourceText = resolveJsonPath(sourceCache.get(absolute), decision.source.jsonPath);
      valid = humanDecisionSourceValid(decision, sourceText);
    } catch {}
    return { ...decision, itemId: decision.targetOrderId, valid };
  });
  cachedDecisions = {
    approved: decisions.filter((item) => item.valid && !item.decisionType.startsWith("REJECT_")),
    rejected: decisions.filter((item) => item.valid && item.decisionType.startsWith("REJECT_")),
    invalid: decisions.filter((item) => !item.valid)
  };
  return cachedDecisions;
}

function matches(item, caseId, itemIds, displayName) {
  const caseRecord = require(path.join(__dirname, "..", "data", "cases.json")).find((candidate) => candidate.displayCaseId === item.caseId);
  if (item.caseId !== caseId && caseRecord?.id !== caseId) return false;
  const identifiers = new Set((itemIds || []).filter(Boolean).map(String));
  if ([item.itemId, item.targetOrderId, ...(item.coveredOrderIds || [])].filter(Boolean).some((id) => identifiers.has(String(id)))) return true;
  const requestedDisplay = normalize(displayName);
  return Boolean(requestedDisplay) && normalize(item.displayName) === requestedDisplay;
}

function findIn(rows, caseId, itemIds, displayName) {
  return (rows || []).find((item) => matches(item, caseId, itemIds, displayName)) || null;
}

function desktopClinicalContent({ caseId, itemIds = [], displayName = "" }) {
  const loaded = runtime();
  if (!loaded) return null;
  const decisions = approvedDecisions();
  const humanGroups = [
    ["human_mapping_invalid", decisions.invalid],
    ["human_rejected_mapping", decisions.rejected],
    ["human_approved_projection", decisions.approved]
  ];
  for (const [classification, rows] of humanGroups) {
    const found = findIn(rows, caseId, itemIds, displayName);
    if (found) return {
      ...found,
      classification,
      resultId: `HUMAN-${found.id}`,
      result: found.displayText,
      provenance: "human_approved_source_projection",
      diagnosticEligible: classification === "human_approved_projection",
      scoringEligible: false,
      affectsScore: false
    };
  }
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

function desktopClinicalSharedOwner({ caseId, itemIds = [], displayName = "" }) {
  const loaded = runtime();
  if (!loaded) return null;
  const found = findIn(loaded.sourceProjectionRejected, caseId, itemIds, displayName);
  return found?.reason === "cross_order_duplicate_result" ? found.coveredByOrderId || null : null;
}

function desktopClinicalTriageSummary() {
  const loaded = runtime();
  if (!loaded) return null;
  const decisions = approvedDecisions();
  return {
    sourcePackSha256: loaded.sourcePack.sha256,
    sourceProjectionApplied: loaded.sourceProjection.length,
    sourceProjectionRejected: loaded.sourceProjectionRejected.length,
    safeSimulatedNormalApplied: loaded.safeSimulatedNormal.length,
    noSpecimenOrNotIndicated: loaded.noSpecimenOrNotIndicated.length,
    noReportOrNotIndicated: loaded.noReportOrNotIndicated.length,
    medicalReviewPending: loaded.medicalReviewPending.length,
    medicalConflicts: loaded.medicalConflicts.length,
    humanApprovedMappings: decisions.approved.length,
    humanRejectedMappings: decisions.rejected.length,
    humanInvalidMappings: decisions.invalid.length
  };
}

module.exports = {
  desktopClinicalContent,
  desktopClinicalSharedOwner,
  desktopClinicalTriageSummary,
  humanDecisionSourceValid
};
