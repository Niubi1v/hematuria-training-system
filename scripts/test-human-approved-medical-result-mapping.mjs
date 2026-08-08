import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.TRAINING_STATE_SECRET = "human-approved-medical-result-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "100000";
process.env.HEMATURIA_RUNTIME_TARGET = "desktop";

const handler = require("../api/training-action.js");
const cases = require("../data/cases.json");
const decisions = require("../desktop/human-approved-result-mappings.json");
const medicalAuthor = require("../desktop/medical-author-approved-stage2-results.json");
const structuredResults = require("../data/order_results_structured.json");
const { desktopClinicalTriageSummary, humanDecisionSourceValid } = require("../server/desktopClinicalContentProjection.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

let requestCounter = 0;
async function call(body, token = "") {
  let statusCode = 200;
  let payload = {};
  const headers = {};
  const req = {
    method: "POST",
    body: { ...body, requestId: body.requestId || `human-result-${++requestCounter}` },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `human-result-${requestCounter}` }
  };
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function stageTwo(caseId) {
  const runtimeCaseId = cases.find((item) => item.displayCaseId === caseId)?.id || caseId;
  const attemptId = `human-${caseId}-${Date.now()}-${requestCounter}`;
  let response = await call({ action: "init-attempt", caseId: runtimeCaseId, attemptId, mode: "free", language: "zh" });
  assert.equal(response.statusCode, 200);
  response = await call({ action: "stage-feedback", caseId: runtimeCaseId, attemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, response.token);
  assert.equal(response.statusCode, 200);
  return { attemptId, runtimeCaseId, response };
}

async function order(caseId, input) {
  const started = await stageTwo(caseId);
  const response = await call({ action: "order", caseId: started.runtimeCaseId, attemptId: started.attemptId, mode: "free", language: "zh", input }, started.response.token);
  assert.equal(response.statusCode, 200, `${caseId}/${input}:${JSON.stringify(response.payload)}`);
  return { ...started, response };
}

function report(response, orderId) {
  return (response.payload.results || []).find((item) => item.orderId === orderId)
    || (response.payload.results || []).find((item) => item.coveredOrderIds?.includes(orderId));
}

function assertPublic(payload) {
  assert.doesNotMatch(JSON.stringify(payload), /human.?review|medical.?review|approved|simulated|sourceMatch|sourceSha|fingerprint|provenance|diagnosticEligible|scoringEligible|affectsDiagnosis|affectsScore/iu);
}

resetMemoryAttemptStore();
assert.deepEqual(desktopClinicalTriageSummary(), {
  sourcePackSha256: "832cd6c0935a129258b5844db403f12a471949cabc36caecd6120173e8b68a46",
  sourceProjectionApplied: 4,
  sourceProjectionRejected: 121,
  safeSimulatedNormalApplied: 75,
  noSpecimenOrNotIndicated: 552,
  noReportOrNotIndicated: 952,
  medicalReviewPending: 1023,
  medicalConflicts: 1,
  humanApprovedMappings: 21,
  humanRejectedMappings: 4,
  humanInvalidMappings: 0,
  medicalAuthorAuthoritySha256: "f846a35c3ed80899d29c535da0ec46309ef2cd810e2c6f7fe2ae99865f7707d9",
  medicalAuthorSimulatedReports: 103,
  medicalAuthorNotPerformed: 34,
  medicalAuthorSourceDerivedReports: 3
});

for (const decision of decisions.decisions) {
  const source = JSON.parse(fs.readFileSync(new URL(`../${decision.source.file}`, import.meta.url), "utf8"));
  const tokens = decision.source.jsonPath.slice(1).match(/\[\d+\]|\.[A-Za-z0-9_]+/gu);
  const sourceText = tokens.reduce((value, token) => token.startsWith("[") ? value[Number(token.slice(1, -1))] : value[token.slice(1)], source);
  assert(humanDecisionSourceValid(decision, sourceText), `${decision.id}:source_fingerprint_invalid`);
  assert.equal(humanDecisionSourceValid(decision, `${sourceText} changed`), false, `${decision.id}:changed_source_must_fail_closed`);
  const sourceCase = decision.source.file === "data/cases.json"
    ? source[Number(tokens[0].slice(1, -1))].displayCaseId
    : cases.find((item) => item.id === source[Number(tokens[0].slice(1, -1))].caseId)?.displayCaseId;
  assert.equal(sourceCase, decision.caseId, `${decision.id}:source_case_mismatch`);
}

for (const [caseId, expected, forbidden = /$a/u] of [
  ["P001", "泌尿系彩超提示：膀胱左侧壁多发占位性病变，宽基底，最大约3*3cm", /心脏|冠脉|EF65/u],
  ["P005", "泌尿系彩超提示：膀胱小梁小房形成，前列腺增大，直径56*65*47，内部回声不均匀", /心脏|冠脉|EF55/u]
]) {
  const placed = await order(caseId, "IMG-US-001");
  assert.equal(report(placed.response, "IMG-US-001")?.result, expected);
  assert.doesNotMatch(JSON.stringify(placed.response.payload), forbidden);
  assertPublic(placed.response.payload);
}

const p007 = await order("P007", "LAB-UR-001;LAB-UR-002;LAB-BL-015");
assert.equal(p007.response.payload.results.length, 2);
assert.equal(report(p007.response, "LAB-UR-001")?.result, "红细胞 78个/μl，尿白细胞 88个/μl");
assert.deepEqual(report(p007.response, "LAB-UR-001")?.coveredOrderIds, ["LAB-UR-001", "LAB-UR-002"]);
assert.equal(report(p007.response, "LAB-BL-015")?.result, "TPSA:7ng/ml\nfPSA:0.5");
assert.doesNotMatch(JSON.stringify(p007.response.payload), /fPSA:0\.5ng\/m(?:l|L)?/u);
assertPublic(p007.response.payload);

const p011 = await order("P011", "LAB-UR-001;LAB-UR-002;LAB-UR-003;LAB-BL-011");
assert.equal(report(p011.response, "LAB-UR-001")?.result, "红细胞 279个/μl，尿白细胞 3个/μl，尿蛋白+");
assert.equal(report(p011.response, "LAB-UR-002")?.result, "红细胞 279个/μl，尿白细胞 3个/μl，病理管型+");
assert.equal(report(p011.response, "LAB-UR-003")?.result, "红细胞位相：畸形红细胞 9000");
assert.equal(report(p011.response, "LAB-BL-011")?.result, "补体C3：降低\nC4：本病例资料未提供结果");
assert.doesNotMatch(JSON.stringify(p011.response.payload), /C4：(?:正常|降低|升高|\d)/u);
assertPublic(p011.response.payload);
const p011StageThree = await call({ action: "stage-feedback", caseId: p011.runtimeCaseId, attemptId: p011.attemptId, mode: "free", language: "zh", stageKey: "orders", submission: {} }, p011.response.token);
assert.equal(p011StageThree.statusCode, 200);
assert((p011StageThree.payload.evidenceOptions || []).some((item) => /补体C3：降低/u.test(item.label)), "approved C3 must enter diagnostic evidence");

const p012 = await order("P012", "LAB-UR-001;LAB-UR-002;LAB-UR-003;LAB-BL-003");
assert.equal(report(p012.response, "LAB-UR-001")?.result, "蛋白3+，潜血3+，红细胞 5689个/μl");
assert.equal(report(p012.response, "LAB-UR-002")?.result, "红细胞 5689个/μl");
assert.equal(report(p012.response, "LAB-UR-003")?.result, "红细胞位相：畸形红细胞 27000");
assert.equal(report(p012.response, "LAB-BL-003")?.result, "肾功能目前正常");
assert.doesNotMatch(report(p012.response, "LAB-BL-003")?.result || "", /Scr|BUN|eGFR|参考范围|mmol|μmol/iu);
assertPublic(p012.response.payload);

for (const [caseId, orderId, expected] of [
  ["P013", "END-001", "膀胱镜可见菜花样肿物"],
  ["P014", "END-001", "膀胱镜发现膀胱三角区乳头状肿物"],
  ["P015", "IMG-CT-002", "CTU提示左肾盂充盈缺损/占位，伴轻度积水"]
]) {
  const placed = await order(caseId, caseId === "P015" ? `LAB-BL-003;${orderId}` : orderId);
  assert.equal(report(placed.response, orderId)?.result, expected);
  assert.doesNotMatch(JSON.stringify(placed.response.payload), /需要病理|完成分期|影像\/内镜/u);
  assertPublic(placed.response.payload);
}

const p027 = await order("P027", "IMG-CT-001;IMG-US-001");
assert.equal(report(p027.response, "IMG-CT-001")?.result, "CT可见或部分低密度结石");
assert.equal(report(p027.response, "IMG-US-001")?.result, "超声可见积水");
assert.doesNotMatch(JSON.stringify(p027.response.payload), /若伴感染|CRP\/PCT|培养阳性/u);
assertPublic(p027.response.payload);

for (const [caseId, orderId] of [["P008", "IMG-CT-002"], ["P024", "IMG-US-001"], ["P040", "IMG-US-001"], ["P042", "END-001"]]) {
  const placed = await order(caseId, orderId);
  assert.equal(placed.response.payload.results.length, 0, `${caseId}/${orderId}:rejected_mapping_released`);
  assert.equal(placed.response.payload.orderOutcomes[0].status, "not_performed");
  assert.equal(placed.response.payload.orderOutcomes[0].message, medicalAuthor.items.find((item) => item.caseId === caseId && item.orderId === orderId).finalTerminalText);
  assertPublic(placed.response.payload);
}

assert.equal(medicalAuthor.items.length, 140);
let checked = 0;
let duplicateSimulationChecked = false;
let duplicateNotPerformedChecked = false;
for (const item of medicalAuthor.items) {
  const configured = structuredResults.find((row) => row.caseId === (cases.find((entry) => entry.displayCaseId === item.caseId)?.id || item.caseId) && row.orderId === item.orderId);
  const input = [...new Set([...(configured?.prerequisites || []), item.orderId])].join(";");
  const placed = await order(item.caseId, input);
  const payloadText = JSON.stringify(placed.response.payload);
  assertPublic(placed.response.payload);
  assert.doesNotMatch(payloadText, /等待医学审核|等待审核元数据/u, `${item.caseId}/${item.orderId}:waiting_copy`);
  if (item.finalTerminalType === "NOT_PERFORMED") {
    const outcome = placed.response.payload.orderOutcomes.find((row) => row.orderId === item.orderId);
    assert.equal(outcome?.status, "not_performed", `${item.caseId}/${item.orderId}:not_performed_status`);
    assert.equal(outcome?.message, item.finalTerminalText, `${item.caseId}/${item.orderId}:not_performed_text`);
    if (!duplicateNotPerformedChecked) {
      const repeated = await call({ action: "order", caseId: placed.runtimeCaseId, attemptId: placed.attemptId, mode: "free", language: "zh", input: item.orderId }, placed.response.token);
      assert.equal(repeated.payload.orderOutcomes[0].status, "not_performed");
      const stored = await loadAttempt({ caseId: placed.runtimeCaseId, attemptId: placed.attemptId, token: repeated.token, requestId: "inspect-not-performed", requestDigest: digest("inspect-not-performed") });
      assert.equal(stored.state.events.filter((event) => event.type === "order_outcome" && event.actionId === item.orderId).length, 1);
      duplicateNotPerformedChecked = true;
    }
  } else {
    const released = report(placed.response, item.orderId);
    assert.equal(released?.result, item.finalTerminalText, `${item.caseId}/${item.orderId}:report_text`);
    const stored = await loadAttempt({ caseId: placed.runtimeCaseId, attemptId: placed.attemptId, token: placed.response.token, requestId: `inspect-${item.index}`, requestDigest: digest(`inspect-${item.index}`) });
    const internal = stored.state.releasedReports.find((row) => row.orderId === item.orderId || row.coveredOrderIds?.includes(item.orderId));
    assert(internal, `${item.caseId}/${item.orderId}:internal_report_missing`);
    assert.equal(internal.scoringEligible, false);
    if (item.finalTerminalType === "SIMULATED_REPORT") {
      assert.equal(internal.provenance, "teaching_simulation_medical_author_approved");
      assert.equal(internal.diagnosticEligible, false);
      assert.equal(internal.affectsDiagnosis, false);
      assert.equal(internal.affectsScore, false);
      if (!duplicateSimulationChecked) {
        const repeated = await call({ action: "order", caseId: placed.runtimeCaseId, attemptId: placed.attemptId, mode: "free", language: "zh", input: item.orderId }, placed.response.token);
        assert.equal(repeated.payload.results[0]?.result, item.finalTerminalText);
        const repeatedStored = await loadAttempt({ caseId: placed.runtimeCaseId, attemptId: placed.attemptId, token: repeated.token, requestId: "inspect-simulation", requestDigest: digest("inspect-simulation") });
        assert.equal(repeatedStored.state.events.filter((event) => event.type === "result_returned" && event.actionId === item.orderId).length, 1);
        duplicateSimulationChecked = true;
      }
    } else {
      assert.equal(internal.provenance, "human_approved_source_projection");
      assert.equal(internal.diagnosticEligible, true);
    }
  }
  checked += 1;
}

assert.equal(checked, 140);
console.log("R5-HUMAN-APPROVED-MEDICAL-RESULT-MAPPING passed: 140/140 author decisions, 21 source mappings, 4 preserved rejections, duplicates, public boundary");
