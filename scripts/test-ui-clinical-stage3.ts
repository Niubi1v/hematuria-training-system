import assert from "node:assert/strict";
import { createRequire } from "node:module";
import imaging from "../data/order_catalog_imaging.json";
import labs from "../data/order_catalog_labs.json";
import perioperative from "../data/order_catalog_perioperative.json";
import procedures from "../data/order_catalog_procedures.json";
import {
  buildStudentOrderCatalog,
  orderApplicableForSex
} from "../shared/dataAgentPresentation.js";

process.env.TRAINING_STATE_SECRET = "ui-clinical-stage3-test-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "100000";

const require = createRequire(import.meta.url);
const trainingHandler = require("../api/training-action.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

type ApiResponse = {
  statusCode: number;
  payload: Record<string, unknown>;
  token: string;
};

async function call(body: Record<string, unknown>, token = ""): Promise<ApiResponse> {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const req = {
    method: "POST",
    body: { ...body, requestId: body.requestId || `ui-stage3-${body.action}-${Date.now()}-${Math.random()}` },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `ui-stage3-${Math.random()}` }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { payload = value; return this; },
    end() { return this; }
  };
  await trainingHandler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function investigationAttempt(caseId: string) {
  const attemptId = `ui-stage3-${caseId}-${Date.now()}-${Math.random()}`;
  let response = await call({ action: "init-attempt", caseId, attemptId, mode: "free", language: "zh" });
  assert.equal(response.statusCode, 200);
  response = await call({
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language: "zh",
    stageKey: "history",
    submission: { askedQuestions: [], historySummary: "已完成重点病史采集。" }
  }, response.token);
  assert.equal(response.statusCode, 200);
  return { attemptId, token: response.token };
}

const catalog = buildStudentOrderCatalog([...labs, ...imaging, ...procedures, ...perioperative]);
const names = (category: string) => catalog.filter((item) => item.secondaryCategory === category).map((item) => item.displayName);

assert.deepEqual(names("CT"), [
  "双肾+输尿管CT平扫",
  "双肾+输尿管CT平扫+增强",
  "双肾+输尿管CT平扫+增强+CTA",
  "双肾+输尿管CT平扫+增强+CTA+CTV",
  "盆腔CT平扫",
  "盆腔CT平扫+增强",
  "盆腔CT平扫+增强+CTA",
  "盆腔CT平扫+增强+CTA+CTV",
  "胸部CT平扫",
  "胸部CT平扫+增强",
  "双肾CTU平扫+增强"
]);
assert.deepEqual(names("MRI"), [
  "双肾+输尿管MR平扫",
  "双肾+输尿管MR平扫+增强",
  "盆腔MR平扫",
  "盆腔MR平扫+增强",
  "前列腺MR平扫",
  "前列腺MR平扫+增强"
]);
assert.deepEqual(names("核医学"), ["全身骨扫描", "PET/CT", "核素肾图"]);
assert.deepEqual(names("病理"), ["常规石蜡病理", "冰冻病理", "尿脱落细胞学", "穿刺活检病理"]);
assert.equal(catalog.some((item) => item.displayName === "CT膀胱造影"), false);
assert.equal(catalog.some((item) => item.secondaryCategory === "X线" && item.displayName === "X光膀胱造影"), true);
assert.equal(catalog.some((item) => item.displayName === "CTU评估上尿路"), false);
assert.equal(catalog.some((item) => item.displayName === "泌尿系超声+残余尿"), false);
assert.equal(catalog.some((item) => item.displayName === "TURBT病理"), false);

const maleOnly = catalog.filter((item) => item.applicableSex?.includes("男"));
const femaleOnly = catalog.filter((item) => item.applicableSex?.includes("女"));
assert(maleOnly.some((item) => item.displayName === "前列腺MR平扫"));
assert(maleOnly.every((item) => orderApplicableForSex(item, "男") && !orderApplicableForSex(item, "女")));
assert(femaleOnly.some((item) => item.displayName === "彩超女性生殖系统"));
assert(femaleOnly.every((item) => orderApplicableForSex(item, "女") && !orderApplicableForSex(item, "男")));

async function main() {
  resetMemoryAttemptStore();
  let attempt = await investigationAttempt("P008");
  let response = await call({
  action: "order",
  caseId: "P008",
  attemptId: attempt.attemptId,
  mode: "free",
  language: "zh",
  input: "肾功能/eGFR；双肾CTU平扫+增强"
}, attempt.token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.payload.results as Array<{ orderId: string }>).map((item) => item.orderId).sort(), ["IMG-CT-002", "LAB-BL-003"]);
  assert((response.payload.matchedOrders as Array<{ displayName: string }>).some((item) => item.displayName === "双肾CTU平扫+增强"));

  attempt = await investigationAttempt("P008");
  response = await call({
  action: "order",
  caseId: "P008",
  attemptId: attempt.attemptId,
  mode: "free",
  language: "zh",
  input: "肾功能/eGFR；CTUCT"
}, attempt.token);
  assert.equal(response.statusCode, 200);
  assert((response.payload.results as Array<{ orderId: string }>).some((item) => item.orderId === "IMG-CT-002"));

  const female = await investigationAttempt("P002");
  response = await call({
  action: "exam",
  caseId: "P002",
  attemptId: female.attemptId,
  mode: "free",
  language: "zh",
  input: "直肠指检/前列腺"
}, female.token);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.examId, undefined);
  assert.equal(response.payload.result, "该病例未提供此项结果，暂不能据此判断。");
  assert.equal(response.payload.provenance, "not_provided");
  assert.notEqual(response.payload.provenance, "simulated_normal");
  assert.doesNotMatch(String(response.payload.result), /\d|正常|阴性/);

  const male = await investigationAttempt("P001");
  response = await call({
  action: "exam",
  caseId: "P001",
  attemptId: male.attemptId,
  mode: "free",
  language: "zh",
  input: "妇科查体/阴道出血"
}, male.token);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.examId, undefined);
  assert.equal(response.payload.provenance, "not_provided");

  console.log("UI clinical catalog, aliases, sex visibility, exact report binding, and fail-closed missing-result tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
