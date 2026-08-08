import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import clinicalResultSemantics from "../shared/clinicalResultSemantics.js";
import dataAgentPresentation from "../shared/dataAgentPresentation.js";

const { assessClinicalResult, clinicalResultFingerprint, projectClinicalResult } = clinicalResultSemantics;
const { buildStudentOrderCatalog, sourceOrderId } = dataAgentPresentation;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPackPath = "D:\\HematuriaReview\\desktop-clinical-content-review-pack-triaged.zip";
const packPath = path.resolve(process.env.HEMATURIA_TRIAGED_REVIEW_PACK || defaultPackPath);
const runtimePath = path.join(repoRoot, "desktop", "clinical-content-triage-runtime.json");
const writeRuntime = process.argv.includes("--write-runtime");
const auditOutputIndex = process.argv.indexOf("--audit-output");
const auditOutput = auditOutputIndex >= 0 ? path.resolve(String(process.argv[auditOutputIndex + 1] || "")) : "";
if (auditOutputIndex >= 0 && !process.argv[auditOutputIndex + 1]) throw new Error("audit_output_directory_required");

const EXPECTED_PACK_SHA256 = "832cd6c0935a129258b5844db403f12a471949cabc36caecd6120173e8b68a46";
const EXPECTED_COUNTS = Object.freeze({
  auto_apply_after_source_match: 125,
  policy_safe_simulated_normal_candidate: 75,
  no_specimen_or_not_indicated: 552,
  no_report_or_not_indicated: 952,
  needs_case_specific_medical_review: 902,
  blocked_medical_conflict: 1
});

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const minimumEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  assert(eocdOffset >= 0, "triage_pack_eocd_missing");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), centralSignature, "triage_pack_central_directory_invalid");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/");
    assert.equal(buffer.readUInt32LE(localOffset), localSignature, `triage_pack_local_header_invalid:${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
    assert(content, `triage_pack_compression_unsupported:${method}:${name}`);
    assert.equal(content.length, uncompressedSize, `triage_pack_size_mismatch:${name}`);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function jsonEntry(entries, name) {
  const content = entries.get(name);
  assert(content, `triage_pack_entry_missing:${name}`);
  return JSON.parse(content.toString("utf8"));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("μ", "u")
    .replaceAll("µ", "u")
    .replaceAll("×", "*")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function sourceLeafEntries(source, existingSource = "") {
  const leaves = [
    { location: "clinicalSource.physicalExam", text: source?.clinicalSource?.physicalExam },
    { location: "clinicalSource.specialTests", text: source?.clinicalSource?.specialTests },
    { location: "urineTestResult", text: source?.urineTestResult },
    ...(Array.isArray(source?.investigations) ? source.investigations.map((item, index) => ({ location: `investigations[${index}].result`, text: item?.result })) : [])
  ];
  if (existingSource && !/^无独立source结果$/u.test(String(existingSource).trim())) leaves.push({ location: "existingSource", text: existingSource });
  const seen = new Set();
  return leaves.flatMap((item) => {
    const text = String(item.text || "").trim();
    if (!text || seen.has(text)) return [];
    seen.add(text);
    return [{ location: item.location, text }];
  });
}

function sourceLeaves(source, existingSource = "") {
  return sourceLeafEntries(source, existingSource).map((item) => item.text);
}

const neutralPrefixes = [
  "尿沉渣镜检",
  "尿常规",
  "中段尿培养+药敏",
  "血糖/糖化血红蛋白",
  "肾功能/eGFR"
];

function sourceProjectionCore(item) {
  let core = normalize(item.suggestedResult);
  for (const prefix of [item.displayName, ...neutralPrefixes].map(normalize).filter(Boolean)) {
    if (core.startsWith(prefix) && core.length > prefix.length + 3) {
      core = core.slice(prefix.length);
      break;
    }
  }
  return core;
}

function verifySourceProjection(item, source) {
  const result = String(item.suggestedResult || "").trim();
  const core = sourceProjectionCore(item);
  if (core.length < 5) return { accepted: false, reason: "result_too_short" };
  if (/建议|必要时|无需立即|持续则|按需|需评估|需排除|进一步评估|若伴|通常|多无|可提示/u.test(result)) {
    return { accepted: false, reason: "recommendation_or_hypothesis_not_report" };
  }
  const match = sourceLeafEntries(source, item.existingSource)
    .map((candidate) => ({ ...candidate, normalized: normalize(candidate.text) }))
    .find((candidate) => candidate.normalized.includes(core));
  if (!match) return { accepted: false, reason: "suggested_result_not_directly_located_in_source" };
  return {
    accepted: true,
    sourceMatchSha256: sha256(Buffer.from(match.text, "utf8")),
    sourceLocation: match.location,
    matchMethod: "normalized_direct_source_substring"
  };
}

function hasUnnegatedMatch(sourceText, pattern) {
  for (const match of sourceText.matchAll(pattern)) {
    const before = sourceText.slice(Math.max(0, match.index - 8), match.index);
    if (!/无|未|阴性|不明显|正常/u.test(before)) return true;
  }
  return false;
}

const safeExamConflictPatterns = Object.freeze({
  PE104: /膀胱充盈|尿潴留|耻骨上.{0,6}(?:膨隆|包块)/gu,
  PE105: /(?:腰部|肾区|腹部).{0,10}(?:包块|饱满)/gu,
  PE201: /(?:外生殖器|尿道口).{0,10}(?:滴血|出血|红肿|分泌物|异常)/gu,
  PE402: /(?:皮疹|紫癜|关节).{0,10}(?:红肿|压痛|疼痛|异常)/gu
});

function verifySafeNormal(item, source, runtimeCandidate, configuredExamKeys, rubricExamKeys) {
  if (item.domain !== "physical_exam") return { accepted: false, reason: "not_physical_exam" };
  if (!runtimeCandidate || runtimeCandidate.result !== item.suggestedResult) return { accepted: false, reason: "runtime_candidate_mismatch" };
  if (runtimeCandidate.provenance !== "simulated_normal"
    || runtimeCandidate.scoringEligible !== false
    || runtimeCandidate.affectsDiagnosis !== false
    || runtimeCandidate.affectsScore !== false
    || runtimeCandidate.expertApproved !== false) {
    return { accepted: false, reason: "runtime_candidate_policy_flags_invalid" };
  }
  const key = `${item.caseId}:${item.itemId}`;
  if (configuredExamKeys.has(key)) return { accepted: false, reason: "configured_source_result_exists" };
  if (rubricExamKeys.has(key)) return { accepted: false, reason: "explicit_scoring_requirement" };
  if (!/无|未|阴性|正常/u.test(String(item.suggestedResult || ""))) return { accepted: false, reason: "not_a_normal_negative_result" };
  const pattern = safeExamConflictPatterns[item.itemId];
  const text = sourceLeaves(source, item.existingSource).join("；");
  if (!pattern || hasUnnegatedMatch(text, pattern)) return { accepted: false, reason: pattern ? "case_source_conflict" : "item_not_policy_allowlisted" };
  return { accepted: true, conflictCheck: "case_source_no_unnegated_target_abnormality" };
}

function publicItem(item, extra = {}) {
  return {
    caseId: item.caseId,
    domain: item.domain,
    itemId: item.itemId,
    displayName: item.displayName,
    ...extra
  };
}

function assertGovernanceRow(item, category) {
  assert.equal(item.triageCategory, category, `triage_category_mismatch:${item.caseId}:${item.itemId}`);
  assert.equal(item.expertApproved, false, `triage_must_not_claim_expert_approval:${item.caseId}:${item.itemId}`);
  assert.equal(String(item.decision || ""), "", `triage_decision_must_stay_blank:${item.caseId}:${item.itemId}`);
  assert.equal(String(item.reviewer || ""), "", `triage_reviewer_must_stay_blank:${item.caseId}:${item.itemId}`);
  assert.equal(String(item.reviewDate || ""), "", `triage_review_date_must_stay_blank:${item.caseId}:${item.itemId}`);
}

const packBuffer = await fs.readFile(packPath);
assert.equal(sha256(packBuffer), EXPECTED_PACK_SHA256, "triage_pack_sha256_mismatch");
const entries = readZipEntries(packBuffer);
const categories = Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((category) => [
  category,
  jsonEntry(entries, `triage/${category}.json`)
]));
for (const [category, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
  assert.equal(categories[category].length, expectedCount, `triage_count_mismatch:${category}`);
  for (const item of categories[category]) assertGovernanceRow(item, category);
}

const allKeys = Object.values(categories).flat().map((item) => `${item.caseId}:${item.domain}:${item.itemId}`);
assert.equal(new Set(allKeys).size, allKeys.length, "triage_item_classification_must_be_unique");

const proposedRuntime = jsonEntry(entries, "triage/runtime-safe-candidates.proposed.json");
const proposedByKey = new Map(proposedRuntime.map((item) => [`${item.caseId}:${item.domain}:${item.itemId}`, item]));
const sourceByCase = new Map();
for (const item of Object.values(categories).flat()) {
  if (!sourceByCase.has(item.caseId)) {
    sourceByCase.set(item.caseId, jsonEntry(entries, `minimum-source/case-sources/${item.caseId}.json`));
  }
}

const examResults = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "physical_exam_results.json"), "utf8"));
const structuredOrderResults = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "order_results_structured.json"), "utf8"));
const rubrics = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "event_rubrics.json"), "utf8"));
const configuredExamKeys = new Set(examResults
  .filter((item) => item.studentVisibleAfterSelection)
  .map((item) => `${item.caseId}:${item.examId}`));
const rubricExamKeys = new Set(rubrics.flatMap((row) => row.dimensions.flatMap((dimension) => dimension.requirements
  .filter((requirement) => requirement.eventType === "physical_exam_performed" && requirement.key)
  .map((requirement) => `${row.caseId}:${requirement.key}`))));

const sourceProjection = [];
const sourceProjectionRejected = [];
const sourceProjectionSemanticAudit = [];
const fingerprintOwnersByCase = new Map();
for (const result of structuredOrderResults.filter((item) => item.status === "final")) {
  const projected = projectClinicalResult(result).result;
  const ownerAssessment = assessClinicalResult({
    domain: String(result.orderId || "").startsWith("LAB-") ? "laboratory" : "",
    itemId: result.orderId,
    result: projected
  });
  if (ownerAssessment.compatible !== true) continue;
  const fingerprint = clinicalResultFingerprint(projected);
  if (!fingerprint) continue;
  const owners = fingerprintOwnersByCase.get(result.caseId) || new Map();
  if (!owners.has(fingerprint)) owners.set(fingerprint, { itemId: result.orderId, source: "configured_order_result" });
  fingerprintOwnersByCase.set(result.caseId, owners);
}
for (const item of categories.auto_apply_after_source_match) {
  const verification = verifySourceProjection(item, sourceByCase.get(item.caseId));
  if (!verification.accepted) {
    sourceProjectionRejected.push(publicItem(item, { reason: verification.reason }));
    continue;
  }
  const assessment = assessClinicalResult({
    domain: item.domain,
    itemId: item.itemId,
    displayName: item.displayName,
    result: item.suggestedResult,
    projection: true
  });
  const fingerprint = clinicalResultFingerprint(assessment.normalizedResult);
  const owners = fingerprintOwnersByCase.get(item.caseId) || new Map();
  const duplicateOwner = owners.get(fingerprint);
  const duplicate = Boolean(fingerprint && duplicateOwner && duplicateOwner.itemId !== item.itemId);
  const reason = duplicate ? "cross_order_duplicate_result" : assessment.reason;
  const retained = !duplicate && assessment.compatible;
  const auditRecord = {
    caseId: item.caseId,
    orderId: item.itemId,
    orderDisplayName: item.displayName,
    domain: item.domain,
    existingSource: item.existingSource,
    projectedResult: item.suggestedResult,
    sourceFile: item.sourceFile,
    sourceLocation: verification.sourceLocation,
    sourceMatchSha256: verification.sourceMatchSha256,
    semanticallyCompatible: assessment.compatible,
    mixedResult: assessment.reason === "cross_domain_or_mixed_order_content",
    duplicate,
    duplicateOf: duplicate ? duplicateOwner : null,
    empty: assessment.reason === "empty_result",
    couldAffectDiagnosisOrTreatment: item.affectsDiagnosisOrScoring === true,
    retained,
    reason
  };
  sourceProjectionSemanticAudit.push(auditRecord);
  assert(auditRecord.caseId && auditRecord.orderId && auditRecord.orderDisplayName && auditRecord.domain, `semantic_audit_identity_missing:${item.caseId}:${item.itemId}`);
  assert(auditRecord.existingSource && auditRecord.projectedResult && auditRecord.sourceFile && auditRecord.sourceLocation, `semantic_audit_source_missing:${item.caseId}:${item.itemId}`);
  assert.equal(typeof auditRecord.semanticallyCompatible, "boolean", `semantic_audit_compatibility_missing:${item.caseId}:${item.itemId}`);
  if (fingerprint && !owners.has(fingerprint)) owners.set(fingerprint, { itemId: item.itemId, source: "source_projection_candidate" });
  fingerprintOwnersByCase.set(item.caseId, owners);
  if (!retained) {
    sourceProjectionRejected.push(publicItem(item, {
      reason,
      ...(duplicate ? { coveredByOrderId: duplicateOwner.itemId } : {})
    }));
    continue;
  }
  sourceProjection.push(publicItem(item, {
    result: assessment.normalizedResult,
    provenance: "case_source_projection",
    scoringEligible: false,
    affectsScore: false,
    diagnosticEligible: true,
    expertApproved: false,
    sourceMatchSha256: verification.sourceMatchSha256,
    matchMethod: verification.matchMethod
  }));
}
assert.equal(sourceProjectionSemanticAudit.length, 66, "all_previously_applied_source_projections_must_receive_semantic_audit");
const sourceProjectionWithdrawalReasons = Object.fromEntries([...new Set(sourceProjectionSemanticAudit.filter((item) => !item.retained).map((item) => item.reason))]
  .sort()
  .map((reason) => [reason, sourceProjectionSemanticAudit.filter((item) => !item.retained && item.reason === reason).length]));

const safeSimulatedNormal = [];
const safeSimulatedNormalRejected = [];
for (const item of categories.policy_safe_simulated_normal_candidate) {
  const verification = verifySafeNormal(
    item,
    sourceByCase.get(item.caseId),
    proposedByKey.get(`${item.caseId}:${item.domain}:${item.itemId}`),
    configuredExamKeys,
    rubricExamKeys
  );
  if (!verification.accepted) {
    safeSimulatedNormalRejected.push(publicItem(item, { reason: verification.reason }));
    continue;
  }
  safeSimulatedNormal.push(publicItem(item, {
    result: item.suggestedResult,
    provenance: "simulated_normal",
    scoringEligible: false,
    affectsDiagnosis: false,
    affectsScore: false,
    diagnosticEligible: false,
    reviewerStatus: "not_required_after_policy_conflict_check",
    expertApproved: false,
    conflictCheck: verification.conflictCheck
  }));
}

const disposition = (category, status, provenance, possibleUnnecessary) => categories[category].map((item) => publicItem(item, {
  status,
  provenance,
  scoringEligible: false,
  affectsDiagnosis: false,
  affectsScore: false,
  diagnosticEligible: false,
  possibleUnnecessary,
  expertApproved: false
}));

const rejectedSourceProjectionPending = sourceProjectionRejected.map((item) => ({
  ...item,
  status: "medical_review_pending",
  provenance: "source_projection_match_failed",
  scoringEligible: false,
  affectsDiagnosis: false,
  affectsScore: false,
  diagnosticEligible: false,
  possibleUnnecessary: false,
  expertApproved: false
}));

const runtime = {
  schemaVersion: 1,
  desktopOnly: true,
  sourcePack: {
    fileName: path.basename(packPath),
    sha256: EXPECTED_PACK_SHA256,
    triageCounts: EXPECTED_COUNTS
  },
  sourceProjection,
  sourceProjectionRejected,
  safeSimulatedNormal,
  safeSimulatedNormalRejected,
  noSpecimenOrNotIndicated: disposition("no_specimen_or_not_indicated", "no_specimen", "source_not_collected", true),
  noReportOrNotIndicated: disposition("no_report_or_not_indicated", "no_indication", "source_not_performed", true),
  medicalReviewPending: [
    ...disposition("needs_case_specific_medical_review", "medical_review_pending", "medical_review_pending", false),
    ...rejectedSourceProjectionPending
  ],
  medicalConflicts: disposition("blocked_medical_conflict", "medical_review_pending", "medical_conflict", false)
};

const serialized = `${JSON.stringify(runtime, null, 2)}\n`;
if (writeRuntime) {
  await fs.writeFile(runtimePath, serialized, "utf8");
} else {
  const committed = await fs.readFile(runtimePath, "utf8");
  assert.equal(committed, serialized, "desktop_triage_runtime_is_stale");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""').replaceAll("\r", "").replaceAll("\n", "\\n")}"`;
}

function rowKey(caseId, itemId) {
  return `${caseId}:${itemId}`;
}

const cases = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "cases.json"), "utf8"));
const catalogFiles = ["order_catalog_labs.json", "order_catalog_imaging.json", "order_catalog_procedures.json", "order_catalog_perioperative.json"];
const studentCatalog = buildStudentOrderCatalog((await Promise.all(catalogFiles.map(async (file) => JSON.parse(await fs.readFile(path.join(repoRoot, "data", file), "utf8"))))).flat());
const exactResults = new Map(structuredOrderResults.map((item) => [rowKey(item.caseId, item.orderId), item]));
const triageCandidates = new Map(Object.values(categories).flat().filter((item) => item.domain !== "physical_exam").map((item) => [rowKey(item.caseId, item.itemId), item]));
const semanticAudits = new Map(sourceProjectionSemanticAudit.map((item) => [rowKey(item.caseId, item.orderId), item]));
const runtimeRows = new Map([
  ...runtime.sourceProjection.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "source_projection" }]),
  ...runtime.sourceProjectionRejected.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "source_projection_rejected" }]),
  ...runtime.noSpecimenOrNotIndicated.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "no_specimen" }]),
  ...runtime.noReportOrNotIndicated.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "no_indication" }]),
  ...runtime.medicalReviewPending.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "medical_review_pending" }]),
  ...runtime.medicalConflicts.map((item) => [rowKey(item.caseId, item.itemId), { ...item, classification: "medical_conflict" }])
]);

const auditCases = cases.filter((item) => /^P\d{3}$/u.test(String(item.displayCaseId || "")));
const auditRows = auditCases.flatMap((caseData) => studentCatalog.map((order) => {
  const studentOrderId = String(order.catalogId || order.orderId);
  const sourceId = sourceOrderId(order);
  const key = rowKey(caseData.id, sourceId);
  const exact = exactResults.get(key);
  const triage = runtimeRows.get(key);
  const candidate = triageCandidates.get(key);
  const semanticAudit = semanticAudits.get(key);
  const candidateText = projectClinicalResult(exact || { value: candidate?.suggestedResult || "" }, order.displayName).result;
  const exactAssessment = exact?.status === "final" ? assessClinicalResult({
    domain: String(order.primaryCategory || "") === "检验" ? "laboratory" : "",
    itemId: sourceId,
    displayName: order.displayName,
    result: candidateText
  }) : null;
  let recommendedAction = "NO_SOURCE_RESULT";
  let reason = triage?.reason || candidate?.triageCategory || exact?.status || "no_case_source_result";
  let semanticCompatibility = exactAssessment?.compatible === true ? "compatible" : exactAssessment ? "incompatible" : "not_applicable";
  if (exact?.status === "final" && exactAssessment?.compatible === true) {
    recommendedAction = "SAFE_EXISTING_MAPPING";
  } else if (triage?.classification === "source_projection") {
    recommendedAction = "SAFE_EXISTING_MAPPING";
    semanticCompatibility = "compatible";
  } else if (triage?.reason === "cross_order_duplicate_result" && triage.coveredByOrderId) {
    const owner = exactResults.get(rowKey(caseData.id, triage.coveredByOrderId));
    const ownerText = projectClinicalResult(owner || {}).result;
    const ownerAssessment = owner ? assessClinicalResult({ itemId: triage.coveredByOrderId, result: ownerText }) : null;
    if (owner?.status === "final" && ownerAssessment?.compatible === true) {
      recommendedAction = "SHARED_PANEL_MAPPING";
      semanticCompatibility = "compatible";
      reason = `same_source_fingerprint_as:${triage.coveredByOrderId}`;
    } else {
      recommendedAction = "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW";
    }
  } else if (exact?.status === "final"
    || triage?.classification === "medical_conflict"
    || candidate?.triageCategory === "needs_case_specific_medical_review"
    || (semanticAudit && semanticAudit.reason !== "suggested_result_not_directly_located_in_source")) {
    recommendedAction = "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW";
  }
  return {
    caseId: caseData.displayCaseId,
    studentOrderId,
    displayName: order.displayName,
    sourceOrderId: sourceId,
    sourceResultCandidate: candidateText || candidate?.suggestedResult || "",
    currentStatus: exact?.status || triage?.classification || "missing",
    semanticCompatibility,
    reason,
    recommendedAction,
    expectedReportType: order.resultShouldInclude || "",
    sourceLocation: semanticAudit?.sourceLocation || candidate?.existingSource || "",
    currentDiagnosticEligible: false,
    currentScoringEligible: false
  };
}));

assert.equal(auditCases.length, 42, "mapping_audit_requires_42_cases");
assert.equal(auditRows.length, 42 * studentCatalog.length, "mapping_audit_requires_every_case_order_pair");
assert(auditRows.every((item) => ["SAFE_EXISTING_MAPPING", "SHARED_PANEL_MAPPING", "NO_SOURCE_RESULT", "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW"].includes(item.recommendedAction)));

if (auditOutput) {
  await fs.mkdir(auditOutput, { recursive: false });
  const headers = ["caseId", "studentOrderId", "displayName", "sourceOrderId", "sourceResultCandidate", "currentStatus", "semanticCompatibility", "reason", "recommendedAction"];
  const csv = (rows) => `\uFEFF${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
  const ambiguous = auditRows.filter((item) => item.recommendedAction === "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW");
  const shared = auditRows.filter((item) => item.recommendedAction === "SHARED_PANEL_MAPPING");
  const counts = Object.fromEntries(["SAFE_EXISTING_MAPPING", "SHARED_PANEL_MAPPING", "NO_SOURCE_RESULT", "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW"].map((action) => [action, auditRows.filter((item) => item.recommendedAction === action).length]));
  await Promise.all([
    fs.writeFile(path.join(auditOutput, "order-result-audit.csv"), csv(auditRows), "utf8"),
    fs.writeFile(path.join(auditOutput, "needs-source-review.csv"), csv(ambiguous), "utf8"),
    fs.writeFile(path.join(auditOutput, "shared-panel-mapping.csv"), csv(shared), "utf8"),
    fs.writeFile(path.join(auditOutput, "summary.md"), `# R5 medical result mapping audit\n\n- Cases: 42\n- Student orders: ${studentCatalog.length}\n- Rows: ${auditRows.length}\n- SAFE_EXISTING_MAPPING: ${counts.SAFE_EXISTING_MAPPING}\n- SHARED_PANEL_MAPPING: ${counts.SHARED_PANEL_MAPPING}\n- NO_SOURCE_RESULT: ${counts.NO_SOURCE_RESULT}\n- AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW: ${counts.AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW}\n- Medical facts changed: no\n- data/** changed: no\n`, "utf8"),
    fs.writeFile(path.join(auditOutput, "medical-result-human-review.md"), `# Medical result human review\n\nOnly AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW items are listed. No new value, unit, range, normal result, or negative result was generated.\n\n${ambiguous.map((item, index) => `## ${index + 1}. ${item.caseId} / ${item.displayName}\n\n- caseId: ${item.caseId}\n- 学生检查名称: ${item.displayName}\n- source order/result候选: ${item.sourceOrderId}\n- source中的原文/原值: ${item.sourceResultCandidate || "未安全定位"}\n- 为什么当前无法归属: ${item.reason}\n- 当前代码期待的报告类型: ${item.expectedReportType || "未声明"}\n- 是否会影响诊断: 当前不会（保持隔离）\n- 是否会影响评分: 当前不会（保持隔离）\n- source位置: ${item.sourceLocation || "未安全定位"}\n`).join("\n")}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({
  packSha256: EXPECTED_PACK_SHA256,
  triageCounts: EXPECTED_COUNTS,
  sourceProjectionAuditedBeforeSemanticReview: sourceProjectionSemanticAudit.length,
  sourceProjectionApplied: sourceProjection.length,
  sourceProjectionWithdrawnAfterSemanticReview: sourceProjectionSemanticAudit.filter((item) => !item.retained).length,
  sourceProjectionWithdrawalReasons,
  sourceProjectionRejected: sourceProjectionRejected.length,
  safeSimulatedNormalApplied: safeSimulatedNormal.length,
  safeSimulatedNormalRejected: safeSimulatedNormalRejected.length,
  noSpecimenOrNotIndicated: runtime.noSpecimenOrNotIndicated.length,
  noReportOrNotIndicated: runtime.noReportOrNotIndicated.length,
  caseSpecificMedicalReview: EXPECTED_COUNTS.needs_case_specific_medical_review,
  sourceProjectionMatchFailedPending: rejectedSourceProjectionPending.length,
  medicalReviewPendingTotal: runtime.medicalReviewPending.length,
  medicalConflicts: runtime.medicalConflicts.length,
  runtimePath,
  mappingAudit: {
    cases: 42,
    studentOrders: studentCatalog.length,
    rows: auditRows.length,
    ambiguous: auditRows.filter((item) => item.recommendedAction === "AMBIGUOUS_SOURCE_NEEDS_HUMAN_REVIEW").length,
    shared: auditRows.filter((item) => item.recommendedAction === "SHARED_PANEL_MAPPING").length,
    output: auditOutput || null
  }
}));
