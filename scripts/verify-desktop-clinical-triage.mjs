import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPackPath = "D:\\HematuriaReview\\desktop-clinical-content-review-pack-triaged.zip";
const packPath = path.resolve(process.env.HEMATURIA_TRIAGED_REVIEW_PACK || defaultPackPath);
const runtimePath = path.join(repoRoot, "desktop", "clinical-content-triage-runtime.json");
const writeRuntime = process.argv.includes("--write-runtime");

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

function sourceLeaves(source, existingSource = "") {
  const leaves = [
    source?.clinicalSource?.physicalExam,
    source?.clinicalSource?.specialTests,
    source?.urineTestResult,
    ...(Array.isArray(source?.investigations) ? source.investigations.map((item) => item?.result) : [])
  ];
  if (existingSource && !/^无独立source结果$/u.test(String(existingSource).trim())) leaves.push(existingSource);
  return [...new Set(leaves.map((item) => String(item || "").trim()).filter(Boolean))];
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
  const match = sourceLeaves(source, item.existingSource)
    .map((text) => ({ text, normalized: normalize(text) }))
    .find((candidate) => candidate.normalized.includes(core));
  if (!match) return { accepted: false, reason: "suggested_result_not_directly_located_in_source" };
  return {
    accepted: true,
    sourceMatchSha256: sha256(Buffer.from(match.text, "utf8")),
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
const rubrics = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "event_rubrics.json"), "utf8"));
const configuredExamKeys = new Set(examResults
  .filter((item) => item.studentVisibleAfterSelection)
  .map((item) => `${item.caseId}:${item.examId}`));
const rubricExamKeys = new Set(rubrics.flatMap((row) => row.dimensions.flatMap((dimension) => dimension.requirements
  .filter((requirement) => requirement.eventType === "physical_exam_performed" && requirement.key)
  .map((requirement) => `${row.caseId}:${requirement.key}`))));

const sourceProjection = [];
const sourceProjectionRejected = [];
for (const item of categories.auto_apply_after_source_match) {
  const verification = verifySourceProjection(item, sourceByCase.get(item.caseId));
  if (!verification.accepted) {
    sourceProjectionRejected.push(publicItem(item, { reason: verification.reason }));
    continue;
  }
  sourceProjection.push(publicItem(item, {
    result: item.suggestedResult,
    provenance: "case_source_projection",
    scoringEligible: false,
    affectsScore: false,
    diagnosticEligible: true,
    expertApproved: false,
    sourceMatchSha256: verification.sourceMatchSha256,
    matchMethod: verification.matchMethod
  }));
}

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

console.log(JSON.stringify({
  packSha256: EXPECTED_PACK_SHA256,
  triageCounts: EXPECTED_COUNTS,
  sourceProjectionApplied: sourceProjection.length,
  sourceProjectionRejected: sourceProjectionRejected.length,
  safeSimulatedNormalApplied: safeSimulatedNormal.length,
  safeSimulatedNormalRejected: safeSimulatedNormalRejected.length,
  noSpecimenOrNotIndicated: runtime.noSpecimenOrNotIndicated.length,
  noReportOrNotIndicated: runtime.noReportOrNotIndicated.length,
  caseSpecificMedicalReview: EXPECTED_COUNTS.needs_case_specific_medical_review,
  sourceProjectionMatchFailedPending: rejectedSourceProjectionPending.length,
  medicalReviewPendingTotal: runtime.medicalReviewPending.length,
  medicalConflicts: runtime.medicalConflicts.length,
  runtimePath
}));
