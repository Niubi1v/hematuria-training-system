import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "evidence-graph-test-secret-with-adequate-length";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";

const require = createRequire(import.meta.url);
const handler = require("../api/training-action.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

let counter = 0;

async function call(body, token = "") {
  let statusCode = 200;
  let payload;
  const headers = {};
  const requestBody = { ...body, requestId: body.requestId || `evidence-test-${++counter}` };
  const req = {
    method: "POST",
    body: requestBody,
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `evidence-${counter}` }
  };
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function submit(response, attemptId, stageKey, submission = {}) {
  return call({ action: "stage-feedback", caseId: "P001", attemptId, mode: "free", language: "zh", stageKey, submission }, response.token);
}

resetMemoryAttemptStore();
const attemptId = `evidence-graph-${Date.now()}`;
let response = await call({ action: "init-attempt", caseId: "P001", attemptId, mode: "free", language: "zh" });
assert.equal(response.statusCode, 200);
assert.deepEqual(response.payload.evidenceOptions, []);

for (const question of ["这次是肉眼能看见尿红吗？", "尿里有没有血块？"]) {
  response = await call({ action: "history-log", caseId: "P001", attemptId, mode: "free", language: "zh", question }, response.token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.evidenceOptions, [], "stage-one evidence must not be exposed before the stage is submitted");
}
response = await submit(response, attemptId, "history", { askedQuestions: ["这次是肉眼能看见尿红吗？", "尿里有没有血块？"] });
assert.equal(response.statusCode, 200);
assert.equal(response.payload.evidenceOptions.length, 2);

response = await submit(response, attemptId, "orders", {});
const selectable = response.payload.evidenceOptions;
const visibility = selectable.find((item) => /hematuria_visibility/.test(item.label));
const clots = selectable.find((item) => /clots/.test(item.label));
assert(visibility && clots, "question-triggered canonical evidence must be selectable by evidenceId");

const forged = await submit(response, attemptId, "diagnosis", {
  diagnosis: "膀胱恶性肿瘤",
  evidenceSelections: { primary: { diagnosis: "膀胱恶性肿瘤", evidenceIds: ["EV-P001-FORGED"] }, differentials: [] }
});
assert.equal(forged.statusCode, 422);
assert.equal(forged.payload.error, "invalid_evidence_reference");

const evidenceIds = [visibility.evidenceId, clots.evidenceId];
response = await submit(response, attemptId, "diagnosis", {
  diagnosis: "膀胱恶性肿瘤",
  differentials: "尿路感染；膀胱结石；上尿路尿路上皮癌",
  differentialAnalysis: "",
  confirmatoryTests: "尿常规、CTU、膀胱镜并TURBT病理",
  evidenceSelections: {
    primary: { diagnosis: "膀胱恶性肿瘤", evidenceIds },
    differentials: [
      { diagnosis: "尿路感染", supportEvidenceIds: [clots.evidenceId], opposeEvidenceIds: [] },
      { diagnosis: "膀胱结石", supportEvidenceIds: [], opposeEvidenceIds: [visibility.evidenceId] },
      { diagnosis: "上尿路尿路上皮癌", supportEvidenceIds: [visibility.evidenceId], opposeEvidenceIds: [] }
    ]
  }
});
assert.equal(response.statusCode, 200);
assert(response.payload.feedbackEvidence.hits.some((item) => item.evidenceIds.some((id) => evidenceIds.includes(id))), "diagnosis feedback must cite selected evidence IDs");

const forgedMdt = await call({
  action: "mdt", caseId: "P001", attemptId, mode: "free", language: "zh",
  departments: ["心内科"], purpose: "评估围术期心血管风险",
  consultRequests: [{ department: "心内科", purpose: "评估围术期心血管风险", question: "如何评估抗血小板停药风险", evidenceIds: ["EV-P001-FORGED"] }]
}, response.token);
assert.equal(forgedMdt.statusCode, 422);

response = await call({
  action: "mdt", caseId: "P001", attemptId, mode: "free", language: "zh",
  departments: ["心内科"], purpose: "评估围术期心血管风险",
  consultRequests: [{ department: "心内科", purpose: "评估围术期心血管风险", question: "如何评估抗血小板停药风险", evidenceIds }]
}, response.token);
assert.equal(response.statusCode, 200);
assert.deepEqual(response.payload[0].evidenceIds, evidenceIds);

response = await submit(response, attemptId, "consult", { consultDepartments: ["心内科"], consultPurpose: "评估围术期心血管风险", consultQuestions: "如何评估抗血小板停药风险" });
response = await submit(response, attemptId, "treatment", {
  immediateTreatment: "评估生命体征并入院监测",
  admissionTreatment: "完善尿常规和感染评估，控制基础疾病",
  definitiveTreatment: "依据分期评估确定手术方案",
  followUp: "出院后按期复查",
  patientEducation: "出现大量血尿或尿潴留及时就诊"
});
response = await submit(response, attemptId, "perioperative", { perioperativePreparation: "麻醉评估；心肺风险；肾功能与液体管理；感染控制；备血；VTE预防；术后监测" });
response = await submit(response, attemptId, "debrief", { debriefReflection: "本次训练中我会把已采集证据与诊断、会诊和后续医嘱逐项关联，并复盘遗漏步骤。" });
assert.equal(response.statusCode, 200);

const score = await call({ action: "score", caseId: "P001", attemptId, mode: "free", language: "zh" }, response.token);
assert.equal(score.statusCode, 200);
assert(score.payload.clinicalTrajectory.questions.length >= 2);
assert(score.payload.clinicalTrajectory.diagnosisFormation.length >= 1);
assert(score.payload.clinicalTrajectory.decisionTransitions.length >= 6);
assert(score.payload.items.some((item) => item.rubricItems.some((rubric) => rubric.evidenceId)), "360-point details must link earned rubric items to evidence IDs");

const stored = await loadAttempt({
  caseId: "P001",
  attemptId,
  token: score.token,
  requestId: "inspect-evidence-graph",
  requestDigest: digest("inspect-evidence-graph")
});
assert(stored.state.evidenceGraph.length > 0);
for (const node of stored.state.evidenceGraph) {
  assert(node.evidenceId && node.caseId === "P001" && node.sourceStage && node.canonicalFactOrAction);
  assert(typeof node.result === "string" && typeof node.provenance === "string");
  assert(Array.isArray(node.diagnosisRelations) && Array.isArray(node.rubricMappings));
}
assert(stored.state.evidenceGraph.some((node) => node.diagnosisRelations.some((relation) => relation.source === "learner_selection")));

console.log(`EVIDENCE_GRAPH_RESULT ${JSON.stringify({ nodes: stored.state.evidenceGraph.length, selectable: selectable.length, trajectoryQuestions: score.payload.clinicalTrajectory.questions.length, invalidReferencesRejected: 2 })}`);
