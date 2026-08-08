import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "r5-medical-author-persistence-"));
process.env.HEMATURIA_DESKTOP_DATABASE_PATH = path.join(directory, "state.sqlite3");
process.env.HEMATURIA_PRODUCT_HEAD = "9541ea85bb801ae5b3f6095e10f8aefd0c0a7e1c";
process.env.TRAINING_STATE_SECRET = "medical-author-stage2-persistence-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "sqlite";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "100000";
process.env.HEMATURIA_RUNTIME_TARGET = "desktop";

const handler = require("../api/training-action.js");
const { digest, loadAttempt } = require("../server/trainingAttemptStore.js");
let requestCounter = 0;

async function call(body, token = "") {
  let statusCode = 200;
  let payload = {};
  const headers = {};
  const req = { method: "POST", body: { ...body, requestId: `persistence-${++requestCounter}` }, headers: token ? { "x-training-state": token } : {}, socket: { remoteAddress: `persistence-${requestCounter}` } };
  const res = { setHeader(name, value) { headers[name.toLowerCase()] = value; }, status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; }, end() { return this; } };
  await handler(req, res);
  assert.equal(statusCode, 200, JSON.stringify(payload));
  return { payload, token: headers["x-training-state"] || token };
}

async function start(caseId, attemptId) {
  let response = await call({ action: "init-attempt", caseId, attemptId, mode: "free", language: "zh" });
  response = await call({ action: "stage-feedback", caseId, attemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, response.token);
  return response;
}

try {
  let p001 = await start("P001", "medical-author-p001");
  p001 = await call({ action: "order", caseId: "P001", attemptId: "medical-author-p001", mode: "free", language: "zh", input: "END-001;IMG-CT-001" }, p001.token);
  assert.equal(p001.payload.results[0]?.result, "膀胱镜：膀胱左侧壁见多发不规则宽基底肿物，最大约3 cm，表面血管丰富并有接触性出血；建议TURBT取材明确病理及肌层受侵情况。");
  assert.equal(p001.payload.orderOutcomes.find((item) => item.orderId === "IMG-CT-001")?.status, "not_performed");
  p001 = await call({ action: "stage-feedback", caseId: "P001", attemptId: "medical-author-p001", mode: "free", language: "zh", stageKey: "orders", submission: {} }, p001.token);

  let p003 = await start("P003", "medical-author-p003");
  p003 = await call({ action: "order", caseId: "P003", attemptId: "medical-author-p003", mode: "free", language: "zh", input: "IMG-CT-001" }, p003.token);
  assert.equal(p003.payload.results[0]?.result, "泌尿系CT提示：右肾盂内软组织病变，大小约2×3 cm。");

  const storePath = require.resolve("../server/desktopSqliteStore.js");
  require(storePath).closeDesktopSqliteStore();
  delete require.cache[storePath];
  const reopenedP001 = await loadAttempt({ caseId: "P001", attemptId: "medical-author-p001", token: p001.token, requestId: "reopen-p001", requestDigest: digest("reopen-p001") });
  const reopenedP003 = await loadAttempt({ caseId: "P003", attemptId: "medical-author-p003", token: p003.token, requestId: "reopen-p003", requestDigest: digest("reopen-p003") });
  assert.equal(reopenedP001.state.currentStage, 3);
  assert.equal(reopenedP001.state.releasedReports[0]?.result, "膀胱镜：膀胱左侧壁见多发不规则宽基底肿物，最大约3 cm，表面血管丰富并有接触性出血；建议TURBT取材明确病理及肌层受侵情况。");
  assert.equal(reopenedP003.state.releasedReports[0]?.result, "泌尿系CT提示：右肾盂内软组织病变，大小约2×3 cm。");
  assert(!JSON.stringify(reopenedP001.state).includes("右肾盂内软组织病变"));
  assert(!JSON.stringify(reopenedP003.state).includes("膀胱左侧壁见多发不规则宽基底肿物"));
  require(storePath).closeDesktopSqliteStore();
  console.log("R5-MEDICAL-AUTHOR-STAGE2-PERSISTENCE passed: real SQLite close/reopen, stage 3, case isolation");
} finally {
  try { require("../server/desktopSqliteStore.js").closeDesktopSqliteStore(); } catch {}
  fs.rmSync(directory, { recursive: true, force: true });
}
