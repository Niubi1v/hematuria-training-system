import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const trainingUiSource = readFileSync(new URL("../src/components/ClinicalTrainingClient.tsx", import.meta.url), "utf8");
assert.doesNotMatch(trainingUiSource, /history-summary-/i, "learner-authored stage-1 summaries must not become selectable collected evidence");

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
  assert.deepEqual((response.payload.results as Array<{ orderId: string }>).map((item) => item.orderId).sort(), ["IMG-CT-002"]);
  assert((response.payload.orderOutcomes as Array<{ orderId: string; status: string }>).some((item) => item.orderId === "LAB-BL-003" && item.status === "medical_review_pending"));
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

  attempt = await investigationAttempt("P001");
  response = await call({
    action: "order",
    caseId: "P001",
    attemptId: attempt.attemptId,
    mode: "free",
    language: "zh",
    input: "尿常规；血常规；彩超泌尿系（双肾、输尿管及膀胱）+残余尿"
  }, attempt.token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.payload.results as Array<{ orderId: string }>).map((item) => item.orderId).sort(),
    ["IMG-US-001", "LAB-BL-001", "LAB-UR-001"]
  );
  assert.equal((response.payload.orderOutcomes as Array<{ status: string }>).filter((item) => item.status === "reported").length, 3);

  attempt = await investigationAttempt("P001");
  response = await call({
    action: "order",
    caseId: "P001",
    attemptId: attempt.attemptId,
    mode: "free",
    language: "zh",
    input: "肾功能/eGFR；X光膀胱造影"
  }, attempt.token);
  assert.equal(response.statusCode, 200);
  assert.equal((response.payload.results as unknown[]).length, 0);
  const missingOutcomes = response.payload.orderOutcomes as Array<{ displayName: string; status: string; provenance: string; message: string }>;
  assert.equal(missingOutcomes.length, 2);
  assert(missingOutcomes.every((item) => item.status === "medical_review_pending"));
  assert(missingOutcomes.every((item) => ["source_not_available", "medical_review_pending"].includes(item.provenance)));
  assert(missingOutcomes.some((item) => item.displayName === "X光膀胱造影" && /等待医学审核/.test(item.message)));

  const safeSimulation = await investigationAttempt("P001");
  response = await call({
    action: "exam",
    caseId: "P001",
    attemptId: safeSimulation.attemptId,
    mode: "free",
    language: "zh",
    input: "阴囊"
  }, safeSimulation.token);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.provenance, "simulated_normal");
  assert.equal(response.payload.affectsDiagnosis, false);
  assert.equal(response.payload.affectsScore, false);
  assert.equal(response.payload.reviewerStatus, "not_required");
  assert.match(String(response.payload.result), /未见明显异常/);

  const criticalMissing = await investigationAttempt("P001");
  response = await call({
    action: "exam",
    caseId: "P001",
    attemptId: criticalMissing.attemptId,
    mode: "free",
    language: "zh",
    input: "腰部包块"
  }, criticalMissing.token);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.provenance, "medical_review_pending");
  assert.equal(response.payload.scoringEligible, false);
  assert.equal(response.payload.result, "该项目等待医学审核，本次训练不将其作为诊断、治疗或评分依据。");

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
  assert.equal(response.payload.result, "该项目等待医学审核，本次训练不将其作为诊断、治疗或评分依据。");
  assert.equal(response.payload.provenance, "medical_review_pending");
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
  assert.equal(response.payload.provenance, "medical_review_pending");

  const perioperativeAttemptId = `ui-stage6-P001-${Date.now()}-${Math.random()}`;
  response = await call({ action: "init-attempt", caseId: "P001", attemptId: perioperativeAttemptId, mode: "free", language: "zh" });
  for (const stageKey of ["history", "orders", "diagnosis", "consult", "treatment"]) {
    response = await call({
      action: "stage-feedback",
      caseId: "P001",
      attemptId: perioperativeAttemptId,
      mode: "free",
      language: "zh",
      stageKey,
      submission: {}
    }, response.token);
    assert.equal(response.statusCode, 200);
  }
  response = await call({
    action: "stage-feedback",
    caseId: "P001",
    attemptId: perioperativeAttemptId,
    mode: "free",
    language: "zh",
    stageKey: "perioperative",
    submission: {}
  }, response.token);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.misses, ["围术期管理要点"]);
  assert.doesNotMatch(JSON.stringify(response.payload.misses), /perioperative|department|immediate/i);
  response = await call({
    action: "stage-feedback",
    caseId: "P001",
    attemptId: perioperativeAttemptId,
    mode: "free",
    language: "zh",
    stageKey: "perioperative",
    submission: { perioperativePreparation: "完成麻醉、心肺、肾功能、感染、营养、贫血、抗栓及VTE风险评估。" }
  }, response.token);
  assert.equal(response.statusCode, 200);
  assert.match(String(response.payload.standardAnswer), /病例现有管理路径参考要点/);
  assert.match(String(response.payload.standardAnswer), /尚待持证专家终签/);
  assert.match(String(response.payload.standardAnswer), /麻醉、心肺、肾功能/);

  console.log("UI clinical catalog, per-order reports, simulated-normal policy, sex visibility, and stage-6 reference tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
