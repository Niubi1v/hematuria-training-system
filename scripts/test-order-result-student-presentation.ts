import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "order-result-student-presentation-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "100000";
process.env.HEMATURIA_RUNTIME_TARGET = "desktop";

const handler = require("../api/training-action.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

let requestCounter = 0;
async function call(body: Record<string, unknown>, token = "") {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const req = {
    method: "POST",
    body: { ...body, requestId: body.requestId || `student-result-${++requestCounter}` },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `student-result-${requestCounter}` }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function stageTwo(language: "zh" | "en") {
  const attemptId = `r5-order-result-${language}-${Date.now()}-${requestCounter}`;
  let response = await call({ action: "init-attempt", caseId: "P005", attemptId, mode: "free", language });
  response = await call({
    action: "stage-feedback", caseId: "P005", attemptId, mode: "free", language,
    stageKey: "history", submission: {}
  }, response.token);
  return { attemptId, token: response.token };
}

const forbiddenStudentText = /等待医学审核|待审核|等待审核元数据|当前不进入诊断、治疗或评分证据|awaiting medical review|awaiting review|awaiting reviewed metadata|\b(?:source|provenance|reviewerStatus|medical_review_pending|needs_review|not_available|diagnosticEligible|scoringEligible)\b/iu;
const fiveOrders = "尿常规；尿沉渣镜检；尿抗酸杆菌/结核分枝杆菌检查；PSA；彩超泌尿系（双肾、输尿管及膀胱）+残余尿";

async function main() {
resetMemoryAttemptStore();
const zh = await stageTwo("zh");
const first = await call({ action: "order", caseId: "P005", attemptId: zh.attemptId, mode: "free", language: "zh", input: fiveOrders }, zh.token);
assert.equal(first.statusCode, 200);
assert.equal(first.payload.recognizedOrderCount, 5);
assert.doesNotMatch(JSON.stringify(first.payload), forbiddenStudentText);

const firstResults = first.payload.results as Array<{ resultId: string; coveredOrderIds?: string[]; unit?: string; referenceRange?: string }>;
assert.equal(firstResults.length, 1, "one source panel must be stored and rendered once");
assert.deepEqual(firstResults[0].coveredOrderIds, ["LAB-UR-001", "LAB-UR-002"]);
assert.equal(firstResults[0].unit, undefined, "missing source unit must be omitted");
assert.equal(firstResults[0].referenceRange, undefined, "missing source range must be omitted");
assert.equal(first.payload.newReportCount, 1);
assert.equal(first.payload.existingReportCount, 0);
assert.equal(first.payload.unavailableResultCount, 3);

const outcomes = first.payload.orderOutcomes as Array<{ orderId: string; status: string; message: string }>;
assert.equal(outcomes.length, 5);
assert.equal(outcomes.find((item) => item.orderId === "LAB-UR-002")?.status, "reported");
assert.ok(outcomes.filter((item) => item.status === "unavailable").length === 3);

const repeated = await call({ action: "order", caseId: "P005", attemptId: zh.attemptId, mode: "free", language: "zh", input: fiveOrders }, first.token);
assert.equal(repeated.statusCode, 200);
assert.doesNotMatch(JSON.stringify(repeated.payload), forbiddenStudentText);
assert.equal(repeated.payload.newReportCount, 0);
assert.equal(repeated.payload.existingReportCount, 1);
assert.equal((repeated.payload.results as unknown[]).length, 1, "duplicate order must resurface the one existing panel");
assert.match(String(repeated.payload.message), /已有结果/u);

const stored = await loadAttempt({ caseId: "P005", attemptId: zh.attemptId, token: repeated.token, requestId: "inspect-student-result", requestDigest: digest("inspect-student-result") });
assert.equal(stored.state.events.filter((event: { type: string }) => event.type === "result_returned").length, 1, "resurfacing must not create duplicate evidence");

const sequential = await stageTwo("zh");
const urinalysis = await call({ action: "order", caseId: "P005", attemptId: sequential.attemptId, mode: "free", language: "zh", input: "LAB-UR-001" }, sequential.token);
const sediment = await call({ action: "order", caseId: "P005", attemptId: sequential.attemptId, mode: "free", language: "zh", input: "LAB-UR-002" }, urinalysis.token);
assert.equal((sediment.payload.orderOutcomes as Array<{ status: string }>)[0].status, "existing_report");
assert.equal((sediment.payload.results as unknown[]).length, 1, "a later shared-panel order must resurface the existing report");
const sequentialStored = await loadAttempt({ caseId: "P005", attemptId: sequential.attemptId, token: sediment.token, requestId: "inspect-sequential-result", requestDigest: digest("inspect-sequential-result") });
assert.equal(sequentialStored.state.events.filter((event: { type: string }) => event.type === "result_returned").length, 1, "a later shared-panel order must not duplicate evidence");

const en = await stageTwo("en");
const english = await call({
  action: "order", caseId: "P005", attemptId: en.attemptId, mode: "free", language: "en",
  input: "LAB-UR-001;LAB-UR-002;LAB-UR-009;LAB-BL-015;IMG-US-001"
}, en.token);
assert.equal(english.statusCode, 200);
assert.doesNotMatch(JSON.stringify(english.payload), forbiddenStudentText);

console.log("R5-ORDER-RESULT-STUDENT-PRESENTATION passed: P005 five-order replay, shared panel, duplicate resurfacing, bilingual boundary");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
