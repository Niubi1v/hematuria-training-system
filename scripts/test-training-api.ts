import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const handler = require("../api/training-action.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initSession } = require("../api/lib/patientSession.js");

async function call(body: Record<string, unknown>) {
  let statusCode = 200;
  let payload: unknown;
  const req = { method: "POST", body, headers: {}, socket: { remoteAddress: `test-${Math.random()}` } };
  const res = {
    setHeader() {},
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload as Record<string, unknown> };
}

async function main() {
const attemptId = `api-test-${Date.now()}`;
const cbc = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", previousOrderIds: [], language: "zh" });
assert.equal(cbc.statusCode, 200);
assert.deepEqual((cbc.payload.matchedOrders as Array<{ orderId: string }>).map((item) => item.orderId), ["LAB-BL-001"]);
assert.equal((cbc.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-001"), true);
const duplicateCbc = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", previousOrderIds: [], language: "zh" });
assert.deepEqual(duplicateCbc.payload.duplicateOrderIds, ["LAB-BL-001"]);
assert.equal((duplicateCbc.payload.results as unknown[]).length, 0);

const renal = await call({ action: "order", caseId: "P008", attemptId, input: "肾功能/eGFR", previousOrderIds: [], language: "zh" });
assert.equal((renal.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-003"), true);

const ctu = await call({ action: "order", caseId: "P008", attemptId, input: "CTU评估上尿路", previousOrderIds: ["FORGED-ORDER"], language: "zh" });
assert.equal((ctu.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "IMG-CT-002"), true);

const path = await call({ action: "order", caseId: "P008", attemptId, input: "TURBT病理", previousOrderIds: [], language: "zh" });
const pathText = JSON.stringify(path.payload);
assert.doesNotMatch(pathText, /乳果糖|肠道准备|前列腺体积/);

const formal = await call({ action: "score", caseId: "P008", mode: "osce", events: [] });
assert.equal(formal.statusCode, 403);

process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
const session = await initSession({ caseId: "P008", mode: "training", language: "zh" });
assert.equal("completedPatientFacingProfile" in session, false);
assert.equal("teacherOnlyData" in session, false);
assert.equal(typeof session.sessionId, "string");

console.log("Training API exact release, approval gate, and session minimization passed.");
}

void main();
