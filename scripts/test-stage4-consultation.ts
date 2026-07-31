import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "desktop-stage4-consultation-test-secret-2026";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";

const handler = require("../api/training-action.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

type Response = {
  statusCode: number;
  payload: any;
  token: string;
};

let requestSequence = 0;

async function call(body: Record<string, unknown>, token = ""): Promise<Response> {
  let statusCode = 200;
  let payload: unknown = {};
  const responseHeaders: Record<string, string> = {};
  const requestBody = {
    ...body,
    requestId: String(body.requestId || `stage4-consultation-${++requestSequence}`)
  };
  const req = {
    method: "POST",
    body: requestBody,
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `stage4-consultation-${requestSequence}` }
  };
  const res = {
    setHeader(name: string, value: string) { responseHeaders[name.toLowerCase()] = String(value); },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: responseHeaders["x-training-state"] || token };
}

async function advance(token: string, stageKey: string, submission: Record<string, unknown>) {
  const response = await call({
    action: "stage-feedback",
    caseId: "P001",
    attemptId: "stage4-consultation-contract",
    mode: "free",
    language: "zh",
    stageKey,
    submission
  }, token);
  assert.equal(response.statusCode, 200, `${stageKey} should advance`);
  return response;
}

async function main() {
  resetMemoryAttemptStore();
  let response = await call({
    action: "init-attempt",
    caseId: "P001",
    attemptId: "stage4-consultation-contract",
    mode: "free",
    language: "zh"
  });
  assert.equal(response.statusCode, 200);

  response = await advance(response.token, "history", { askedQuestions: ["哪里不舒服？", "多久了？"] });
  response = await advance(response.token, "orders", { selectedOrders: ["尿常规"] });
  response = await advance(response.token, "diagnosis", {
    diagnosis: "待结合证据判断",
    diagnosticEvidence: "已采集病史与检查证据",
    differentials: "感染；结石；肾小球疾病",
    confirmatoryTests: "尿常规；影像检查"
  });

  const mdt = await call({
    action: "mdt",
    caseId: "P001",
    attemptId: "stage4-consultation-contract",
    mode: "free",
    language: "zh",
    departments: ["泌尿外科", "影像科", "肾内科"],
    purpose: "围绕当前已采集证据明确下一步问题",
    consultRequests: [
      {
        department: "泌尿外科",
        purpose: "主体科室自会诊不应被接受",
        question: "主体科室自会诊不应被接受",
        evidence: ["已采集病史"]
      },
      {
        department: "影像科",
        purpose: "评估现有影像证据",
        question: "现有影像证据能否回答分期问题？",
        evidence: ["已采集病史", "已释放检查报告"]
      },
      {
        department: "肾内科",
        purpose: "评估是否需要肾内科参与",
        question: "当前证据是否提示需要肾内科会诊？",
        evidence: ["已采集病史"]
      },
      {
        department: "影",
        purpose: "验证科室名称必须精确匹配",
        question: "短子串不得伪装成有效会诊科室",
        evidence: ["已采集病史"]
      }
    ]
  }, response.token);
  assert.equal(mdt.statusCode, 200);
  assert.equal(mdt.payload.length, 3, "primary urology self-consultation must be filtered while invalid external requests remain auditable");
  assert.equal(mdt.payload.some((item: any) => /泌尿外科|urology/i.test(item.department)), false);
  for (const item of mdt.payload) {
    assert.ok(item.opinion && item.neededInfo && item.necessity && item.mdtIntegration);
    assert.doesNotMatch(JSON.stringify(item), /undefined|请提供当前阶段已获得的证据/);
    assert.equal(Array.isArray(item.questions), true);
  }
  assert.match(mdt.payload.find((item: any) => item.department === "影像科").necessity, /相关|建议会诊/);
  assert.match(mdt.payload.find((item: any) => item.department === "肾内科").necessity, /并非常规必需|触发条件/);
  assert.match(mdt.payload.find((item: any) => item.department === "影").necessity, /并非常规必需|触发条件/, "department substrings must not receive validated necessity");

  const feedback = await advance(mdt.token, "consult", {
    consultNeeded: "需要会诊",
    consultDepartments: ["影像科", "肾内科"],
    consultPurpose: "围绕当前证据明确影像分期问题",
    consultQuestions: "现有影像证据能否回答分期问题？",
    consultSummary: "已提供已采集病史和已释放检查报告"
  });
  assert.doesNotMatch(String(feedback.payload.standardAnswer || ""), /泌尿外科|urology/i, "stage 4 reference must not recommend self-consultation");

  console.log("Stage 4 consultation tests passed: structured requests, no urology self-consult, case-related feedback.");
}

main();
