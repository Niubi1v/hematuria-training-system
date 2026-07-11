import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
const handler = require("../api/training-action.js");
const { initSession } = require("../api/lib/patientSession.js");
const serverCases = require("../data/cases.json") as Array<{ id: string; medicalReview?: { status?: string } }>;

async function call(body: Record<string, unknown>, token = "") {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const req = { method: "POST", body, headers: token ? { "x-training-state": token } : {}, socket: { remoteAddress: `test-${Math.random()}` } };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload as Record<string, unknown>, token: headers["x-training-state"] || token };
}

async function main() {
  const attemptId = `api-test-${Date.now()}`;
  let response = await call({ action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "zh" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.practiceOnly, true);
  assert.ok(response.token, "practice attempt must receive a signed state token");

  response = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", language: "zh" }, response.token);
  assert.deepEqual((response.payload.matchedOrders as Array<{ orderId: string }>).map((item) => item.orderId), ["LAB-BL-001"]);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-001"), true);

  response = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", previousOrderIds: [], language: "zh" }, response.token);
  assert.deepEqual(response.payload.duplicateOrderIds, ["LAB-BL-001"]);
  assert.equal((response.payload.results as unknown[]).length, 0);

  response = await call({ action: "order", caseId: "P008", attemptId, input: "肾功能/eGFR", language: "zh" }, response.token);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-003"), true);
  response = await call({ action: "order", caseId: "P008", attemptId, input: "CTU评估上尿路", previousOrderIds: ["FORGED-ORDER"], language: "zh" }, response.token);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "IMG-CT-002"), true);
  response = await call({ action: "order", caseId: "P008", attemptId, input: "TURBT病理", language: "zh" }, response.token);
  assert.doesNotMatch(JSON.stringify(response.payload), /乳果糖|肠道准备|前列腺体积/);

  const forged = await call({ action: "score", caseId: "P008", attemptId, mode: "free", events: [{ type: "diagnosis_supported", actionId: "primary", metadata: { validated: true } }] }, response.token);
  assert.ok(Number(forged.payload.total) < 360, "forged client events must not create a perfect score");

  const changedMode = await call({ action: "score", caseId: "P008", attemptId, mode: "osce" }, response.token);
  assert.equal(changedMode.statusCode, 409, "client must not change a practice attempt into formal mode");

  const formal = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-test", mode: "osce", language: "zh" });
  assert.equal(formal.statusCode, 403);

  const formalCase = serverCases.find((item) => item.id === "P008")!;
  const originalReview = formalCase.medicalReview?.status;
  formalCase.medicalReview = { ...(formalCase.medicalReview || {}), status: "approved" };
  process.env.TRAINING_DEPLOYMENT_TIER = "formal";
  let approvedFormal = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", language: "zh" });
  assert.equal(approvedFormal.statusCode, 200);
  approvedFormal = await call({ action: "stage-feedback", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", stageKey: "diagnosis", submission: {
    diagnosis: "膀胱结石，前列腺增生", diagnosticEvidence: "终末血尿、排尿中断且改变体位后恢复", differentials: "前列腺癌；膀胱颈挛缩；尿道狭窄", confirmatoryTests: "尿常规、盆腔CT和膀胱镜"
  } }, approvedFormal.token);
  assert.equal(approvedFormal.payload.standardAnswer, "", "formal attempt must not release the standard answer before completion");
  const formalDowngrade = await call({ action: "score", caseId: "P008", attemptId: "formal-approved-test", mode: "free" }, approvedFormal.token);
  assert.equal(formalDowngrade.statusCode, 409, "formal mode cannot be bypassed by changing client mode to free");
  formalCase.medicalReview = { ...(formalCase.medicalReview || {}), status: originalReview };
  process.env.TRAINING_DEPLOYMENT_TIER = "practice";

  const revisionId = `revision-${Date.now()}`;
  let revision = await call({ action: "init-attempt", caseId: "P001", attemptId: revisionId, mode: "free", language: "zh" });
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, stageKey: "diagnosis", submission: {
    diagnosis: "急性阑尾炎", diagnosticEvidence: "右下腹痛", differentials: "胃炎；胆囊炎；胰腺炎", confirmatoryTests: "腹部平片"
  } }, revision.token);
  assert.equal(revision.payload.score, 0);
  assert.equal(revision.payload.practiceOnly, true);
  assert.ok(String(revision.payload.standardAnswer).includes("膀胱"), "practice feedback may release an explicitly practice-only standard answer");
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, stageKey: "diagnosis", submission: {
    diagnosis: "膀胱恶性肿瘤", diagnosticEvidence: "反复无痛性全程肉眼血尿伴血块，符合膀胱肿瘤警示特征",
    differentials: "尿路感染；膀胱结石；上尿路尿路上皮癌", confirmatoryTests: "尿常规、CTU、膀胱镜并TURBT病理"
  } }, revision.token);
  assert.ok(Number(revision.payload.score) > 0, "a corrected resubmission should receive improved formative feedback");

  process.env.LLM_ENABLE_AI_AGENTS = "false";
  process.env.LLM_ENABLE_AI_PATIENT = "false";
  const session = await initSession({ caseId: "P008", mode: "training", language: "zh" });
  assert.equal("completedPatientFacingProfile" in session, false);
  assert.equal("teacherOnlyData" in session, false);
  assert.equal(typeof session.sessionId, "string");

  console.log("Training API signed state, exact release, anti-forgery, mode lock, and approval gate passed.");
}

void main();
