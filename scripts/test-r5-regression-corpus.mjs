import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(repoRoot, "docs", "quality", "r5-regression-corpus.json");
const corpus = JSON.parse(await fs.readFile(corpusPath, "utf8"));

const REQUIRED_SLUGS = [
  "STAGE3-DEADEND",
  "RANDOM-DURABLE",
  "RENDERER-AUTOSAVE",
  "PACKAGED-TAURI-FAIL",
  "SCROLL-INHERITANCE",
  "STICKY-OCCLUSION",
  "LANGUAGE-FOCUS",
  "R4-R5-DATA",
  "UNICODE-LONG-PATH",
  "RESOURCE-MISSING",
  "MODEL-MISSING-HASH",
  "SQLITE-LOCK-CORRUPT",
  "REPREPARE-RACE",
  "SECOND-CASE-ISOLATION",
  "CLOSE-REOPEN",
  "STUDENT-INTERNAL-FIELDS",
  "RAW-360",
  "CLOUD-NONZERO",
  "FALLBACK-MISLABEL",
  "PROCESS-PORT-LEAK",
  "STALE-WEBVIEW-CACHE",
  "PRODUCT-HEAD-AUTHORITY",
  "MODEL-DIR-CONTRACT",
  "NSIS-IDENTITY",
  "MENTOR-MACHINE-PREPARE-SAVE",
  "AI-PREFERENCE-HYDRATION",
  "NSIS-RUNTIME-INJECTION-INTERMITTENT",
  "MENTOR-FULL-HUMAN-ENTRYPOINT-LOCAL-AI",
  "STAGE2-ORDER-RESULT-NOT-RETURNED",
  "MENTOR-EFFECTIVE-MODEL-MODE",
  "STAGE2-STUDENT-RESULT-PRESENTATION",
  "DIRECT-EXE-LOCAL-AI-READY",
  "PATIENT-SPOKEN-LANGUAGE-REALISM",
  "CASE-ORDER-APPLICABILITY",
  "EVERY-SELECTABLE-ORDER-HAS-REPORT",
  "PATIENT-SEMANTIC-COVERAGE",
  "PATIENT-KNOWLEDGE-GROUNDING",
  "PATIENT-VISIBLE-INTERNAL-PROTOCOL-LEAK",
  "PATIENT-UI-COMPOUND-FALSE-BLOCK",
  "PATIENT-PUBLIC-API-GOVERNANCE-LEAK",
  "SP-PROGRESSIVE-DISCLOSURE",
  "PATIENT-REPEATED-QUESTION-IDEMPOTENCY"
];
const STATUSES = new Set(["fixed", "regression_required", "open", "blocked_root_cause"]);
const ROOT_CAUSE_STATUSES = new Set(["confirmed", "unconfirmed", "not_applicable"]);
const KINDS = new Set(["historical_bug", "regression_gap", "fault_scenario", "release_blocker"]);
const GATES = new Set(["fast", "milestone", "candidate", "external_manual"]);
const TEST_STATUSES = new Set(["existing", "planned"]);
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

function nonEmpty(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

function walk(value, visit, pathParts = []) {
  visit(value, pathParts);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...pathParts, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, visit, [...pathParts, key]);
  }
}

assert.equal(corpus.schemaVersion, 1, "unsupported regression corpus schemaVersion");
assert.match(corpus.baselineHead, GIT_SHA, "baselineHead must be a full git SHA");
assert.ok(Array.isArray(corpus.entries), "entries must be an array");
assert.equal(corpus.entries.length, REQUIRED_SLUGS.length, "R5 corpus must contain every required scenario");

const ids = new Set();
const slugs = new Set();
const testIds = new Set();

for (const entry of corpus.entries) {
  const label = entry?.id || "entry";
  nonEmpty(entry.id, `${label}.id`);
  nonEmpty(entry.slug, `${label}.slug`);
  assert.match(entry.id, /^R5-REG-\d{3}$/, `${label}.id must use R5-REG-NNN`);
  assert.match(entry.slug, /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, `${label}.slug must be an uppercase replay slug`);
  assert.ok(!ids.has(entry.id), `duplicate corpus id: ${entry.id}`);
  assert.ok(!slugs.has(entry.slug), `duplicate corpus slug: ${entry.slug}`);
  ids.add(entry.id);
  slugs.add(entry.slug);

  assert.ok(KINDS.has(entry.kind), `${label}.kind is invalid`);
  assert.ok(["P0", "P1", "P2"].includes(entry.severity), `${label}.severity is invalid`);
  assert.ok(STATUSES.has(entry.status), `${label}.status is invalid`);
  nonEmpty(entry.title, `${label}.title`);
  nonEmpty(entry.userVisibleSymptom, `${label}.userVisibleSymptom`);
  assert.ok(ROOT_CAUSE_STATUSES.has(entry.rootCause?.status), `${label}.rootCause.status is invalid`);
  nonEmpty(entry.rootCause?.detail, `${label}.rootCause.detail`);
  assert.ok(Array.isArray(entry.affectedLayers) && entry.affectedLayers.length > 0, `${label}.affectedLayers is required`);
  entry.affectedLayers.forEach((layer, index) => nonEmpty(layer, `${label}.affectedLayers[${index}]`));

  nonEmpty(entry.minimumReproduction?.environment, `${label}.minimumReproduction.environment`);
  assert.ok(Array.isArray(entry.minimumReproduction?.steps) && entry.minimumReproduction.steps.length > 0,
    `${label}.minimumReproduction.steps is required`);
  entry.minimumReproduction.steps.forEach((step, index) => nonEmpty(step, `${label}.minimumReproduction.steps[${index}]`));

  assert.ok(entry.originalEvidence && typeof entry.originalEvidence === "object", `${label}.originalEvidence is required`);
  if (entry.originalEvidence.head !== null) assert.match(entry.originalEvidence.head, GIT_SHA, `${label}.originalEvidence.head must be null or a full git SHA`);
  if (entry.originalEvidence.artifactSha256 !== null) assert.match(entry.originalEvidence.artifactSha256, SHA256,
    `${label}.originalEvidence.artifactSha256 must be null or SHA-256`);
  assert.ok(Array.isArray(entry.originalEvidence.references) && entry.originalEvidence.references.length > 0,
    `${label}.originalEvidence.references is required`);
  for (const [index, reference] of entry.originalEvidence.references.entries()) {
    nonEmpty(reference, `${label}.originalEvidence.references[${index}]`);
    if (!reference.startsWith("external:")) {
      assert.equal(path.isAbsolute(reference), false, `${label} evidence references must be repository-relative`);
      assert.equal(reference.includes(".."), false, `${label} evidence references must not escape the repository`);
      await fs.access(path.join(repoRoot, reference));
    }
  }

  nonEmpty(entry.legacyGap, `${label}.legacyGap`);
  assert.ok(Array.isArray(entry.regressionTests) && entry.regressionTests.length > 0, `${label}.regressionTests is required`);
  for (const regression of entry.regressionTests) {
    nonEmpty(regression.id, `${label}.regressionTests.id`);
    assert.ok(!testIds.has(regression.id), `duplicate regression test id: ${regression.id}`);
    testIds.add(regression.id);
    assert.ok(TEST_STATUSES.has(regression.status), `${regression.id}.status is invalid`);
    nonEmpty(regression.path, `${regression.id}.path`);
    assert.equal(path.isAbsolute(regression.path), false, `${regression.id}.path must be repository-relative`);
    assert.equal(regression.path.includes(".."), false, `${regression.id}.path must not escape the repository`);
    assert.ok(GATES.has(regression.gate), `${regression.id}.gate is invalid`);
    assert.ok(Array.isArray(regression.components) && regression.components.length > 0, `${regression.id}.components is required`);
    if (regression.status === "existing") {
      await fs.access(path.join(repoRoot, regression.path));
    }
  }

  nonEmpty(entry.replay?.seed, `${label}.replay.seed`);
  nonEmpty(entry.replay?.command, `${label}.replay.command`);
  assert.ok(Array.isArray(entry.replay?.actions) && entry.replay.actions.length > 0, `${label}.replay.actions is required`);
  assert.ok(GATES.has(entry.permanentGate), `${label}.permanentGate is invalid`);
  assert.ok(entry.regressionTests.some((test) => test.gate === entry.permanentGate),
    `${label} must own at least one regression in permanentGate`);

  if (entry.status === "fixed") {
    assert.equal(entry.rootCause.status, "confirmed", `${label} fixed entries require a confirmed root cause`);
    assert.match(entry.fixCommit, GIT_SHA, `${label} fixed entries require a full fixCommit`);
    assert.ok(entry.regressionTests.some((test) => test.status === "existing"), `${label} fixed entries require an existing regression`);
  } else {
    assert.equal(entry.fixCommit, null, `${label} non-fixed entries must not claim a fixCommit`);
  }
  if (entry.status === "blocked_root_cause") {
    assert.equal(entry.rootCause.status, "unconfirmed", `${label} blocked_root_cause requires an unconfirmed root cause`);
  }
  assert.ok(Array.isArray(entry.relatedCommits), `${label}.relatedCommits must be an array`);
  entry.relatedCommits.forEach((commit) => assert.match(commit, GIT_SHA, `${label}.relatedCommits must contain full SHAs`));

  assert.ok(entry.boundaries && typeof entry.boundaries === "object", `${label}.boundaries is required`);
  for (const key of ["medicalFactsChanged", "scoringContractChanged", "privacySensitiveDataStored", "dataFilesChanged"]) {
    assert.equal(entry.boundaries[key], false, `${label}.boundaries.${key} must remain false`);
  }
}

assert.deepEqual([...slugs].sort(), [...REQUIRED_SLUGS].sort(), "required regression scenarios changed");

const forbiddenKeys = /^(?:patientQuestions|prompt|reasoning|conversationHistory|tokenValue|stateTokenValue|username|userPath)$/i;
const serialized = JSON.stringify(corpus);
walk(corpus, (_value, pathParts) => {
  const key = pathParts.at(-1) || "";
  assert.doesNotMatch(key, forbiddenKeys, `privacy-sensitive field is forbidden: ${pathParts.join(".")}`);
  if (typeof _value === "string") {
    assert.doesNotMatch(_value, /^[A-Za-z0-9_-]{43}$/,
      `raw bearer-like value is forbidden: ${pathParts.join(".")}`);
    assert.doesNotMatch(_value, /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
      `training-state-like value is forbidden: ${pathParts.join(".")}`);
  }
});
assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~-]{16,}/i, "bearer values must not be stored in the corpus");
assert.doesNotMatch(serialized, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, "JWT-like values must not be stored in the corpus");
assert.doesNotMatch(serialized, /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\"]+/i,
  "full Windows user paths must not be stored in the corpus");
assert.doesNotMatch(serialized, /\/(?:home|Users)\/[^/\"]+/i, "full Unix/macOS user paths must not be stored in the corpus");

console.log(`R5 regression corpus passed: ${corpus.entries.length} scenarios, ${testIds.size} permanent regression assignments.`);
