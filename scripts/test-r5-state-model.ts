import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canOpenTrainingStage, nextTrainingStage, submittedTrainingStages, type TrainingStageNo } from "../src/lib/trainingStageState";
import { projectStudentScoreText } from "../src/lib/studentScoreProjection";

type Language = "zh" | "en";
type UiMode = "free" | "random" | "demo" | "osce" | "rct";
type Action = "init" | "ask" | "exam" | "order-result" | "submit" | "duplicate-submit" | "next" |
  "illegal-jump" | "return" | "controlled-reopen" | "refresh" | "close-restart" | "switch-language" |
  "second-case" | "return-first" | "explicit-restart" | "final-report";

type Journey = {
  active: TrainingStageNo;
  submitted: Set<number>;
  finalized: boolean;
  pendingNext: boolean;
  reviewedEvidence: number;
  unreviewedEvidence: number;
  revision: number;
};

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const seed = argument("--seed") || process.env.R5_TEST_SEED || "99c206e-r5-fast";
const runs = Number(argument("--runs") || 50);
const steps = Number(argument("--steps") || 30);
const integration = process.argv.includes("--integration");
assert(Number.isInteger(runs) && runs >= 50, "state model requires at least 50 seeds");
assert(Number.isInteger(steps) && steps >= 30, "state model requires at least 30 actions per seed");

function randomIndex(run: number, counter: number, length: number) {
  const digest = crypto.createHash("sha256").update(`${seed}:${run}:${counter}`).digest();
  return digest.readUInt32BE(0) % length;
}

function freshJourney(): Journey {
  return { active: 1, submitted: new Set(), finalized: false, pendingNext: false, reviewedEvidence: 0, unreviewedEvidence: 0, revision: 0 };
}

function durableMode(mode: UiMode) {
  return mode === "osce" || mode === "rct" ? "formal-attempt" : "public-practice";
}

class Model {
  caseId = "P001";
  language: Language = "zh";
  mode: UiMode = "free";
  journeys = new Map<string, Journey>();

  key(caseId = this.caseId, language = this.language, mode = this.mode) {
    return `${caseId}:${language}:${mode}`;
  }

  get journey() {
    const key = this.key();
    if (!this.journeys.has(key)) this.journeys.set(key, freshJourney());
    return this.journeys.get(key)!;
  }

  act(action: Action) {
    const current = this.journey;
    if (action === "init" || action === "refresh" || action === "close-restart") return;
    if (action === "switch-language") { this.language = this.language === "zh" ? "en" : "zh"; return; }
    if (action === "second-case") { this.caseId = "P003"; return; }
    if (action === "return-first") { this.caseId = "P001"; return; }
    if (action === "explicit-restart") { this.journeys.set(this.key(), freshJourney()); return; }
    if (action === "duplicate-submit") return;
    if (action === "controlled-reopen") {
      if (current.active === 3 && current.reviewedEvidence < 2 && current.submitted.has(1) && current.submitted.has(2)) {
        current.submitted = new Set([1]);
        current.active = 2;
        current.pendingNext = false;
        current.finalized = false;
        current.revision += 1;
      }
      return;
    }
    if (action === "next") {
      if (current.pendingNext) {
        const next = nextTrainingStage(current.active);
        if (next) current.active = next;
        current.pendingNext = false;
      }
      return;
    }
    if (action === "illegal-jump") {
      const candidate = 7 as TrainingStageNo;
      if (canOpenTrainingStage(candidate, current.submitted, current.finalized)) current.active = candidate;
      return;
    }
    if (action === "return") {
      const candidate = Math.max(1, current.active - 1) as TrainingStageNo;
      if (canOpenTrainingStage(candidate, current.submitted, current.finalized)) {
        current.active = candidate;
        current.pendingNext = current.submitted.has(candidate);
      }
      return;
    }
    if (action === "ask" && current.active === 1 && !current.pendingNext) current.reviewedEvidence += 1;
    if (action === "exam" && current.active === 2 && !current.pendingNext) current.reviewedEvidence += 1;
    if (action === "order-result" && current.active === 2 && !current.pendingNext) {
      if (randomIndex(current.revision, current.reviewedEvidence + current.unreviewedEvidence, 2) === 0) current.reviewedEvidence += 1;
      else current.unreviewedEvidence += 1;
    }
    if (action === "submit" && !current.pendingNext && !current.finalized) {
      current.submitted.add(current.active);
      current.revision += 1;
      if (current.active === 7) current.finalized = true;
      else current.pendingNext = true;
    }
    if (action === "final-report" && current.active === 7 && current.submitted.has(7)) current.finalized = true;
  }
}

const actions: Action[] = ["init", "ask", "exam", "order-result", "submit", "duplicate-submit", "next", "illegal-jump", "return", "controlled-reopen", "refresh", "close-restart", "switch-language", "second-case", "return-first", "explicit-restart", "final-report"];

function assertInvariants(model: Model, before?: { key: string; revision: number }, action?: Action) {
  const state = model.journey;
  const submitted = [...state.submitted].sort((a, b) => a - b);
  assert.deepEqual(submitted, submitted.length ? Array.from({ length: submitted.at(-1)! }, (_, index) => index + 1) : [], "submitted stages must be a prefix");
  assert(canOpenTrainingStage(state.active, state.submitted, state.finalized), "active stage must remain legally open");
  assert(state.reviewedEvidence >= 0 && state.unreviewedEvidence >= 0, "evidence counts cannot regress below zero");
  assert.equal(durableMode("random"), "public-practice");
  assert.equal(durableMode("demo"), "public-practice");
  assert.equal(durableMode("free"), "public-practice");
  assert.equal(durableMode("osce"), "formal-attempt");
  assert.equal(durableMode("rct"), "formal-attempt");
  if (state.finalized) assert.deepEqual(submitted, [1, 2, 3, 4, 5, 6, 7], "final report requires all seven stages");
  if (state.pendingNext) assert(nextTrainingStage(state.active), "a submitted non-final stage has exactly one primary next stage");
  if (state.active === 3 && state.reviewedEvidence < 2 && !state.pendingNext) {
    assert(state.submitted.has(1) && state.submitted.has(2), "sparse stage 3 must retain prerequisites");
  }
  if (before && action === "duplicate-submit" && before.key === model.key()) assert.equal(state.revision, before.revision, "duplicate submit must be idempotent");
}

const fixedSequences: Record<string, Action[]> = {
  "R5-REG-001/STAGE3-DEADEND": ["init", "ask", "submit", "next", "submit", "next", "controlled-reopen", "exam", "submit", "next"],
  "R5-REG-002/RANDOM-DURABLE": ["init", "submit", "duplicate-submit", "refresh", "close-restart"],
  "R5-REG-003/RENDERER-AUTOSAVE": ["init", "ask", "refresh", "close-restart", "submit"],
  "R5-REG-013/REPREPARE-RACE": ["init", "explicit-restart", "init", "submit", "duplicate-submit"],
  "R5-REG-014/SECOND-CASE-ISOLATION": ["ask", "second-case", "submit", "return-first", "submit"],
  "R5-REG-015/CLOSE-REOPEN": ["ask", "submit", "close-restart", "next"],
  "R5-REG-021/STALE-WEBVIEW-CACHE": ["ask", "explicit-restart", "refresh", "init"],
  "R5-REG-005/SCROLL-INHERITANCE": ["submit", "next", "return", "next", "refresh"],
  "R5-REG-006/STICKY-OCCLUSION": ["submit", "next", "exam", "order-result"],
  "R5-REG-007/LANGUAGE-FOCUS": ["ask", "switch-language", "ask", "switch-language", "close-restart"],
  "R5-REG-017/RAW-360": ["submit", "next", "submit", "next", "submit", "next", "submit", "next", "submit", "next", "submit", "next", "submit", "final-report"]
};

for (const [name, sequence] of Object.entries(fixedSequences)) {
  const model = new Model();
  if (name.includes("RANDOM-DURABLE")) model.mode = "random";
  for (const action of sequence) {
    const before = { key: model.key(), revision: model.journey.revision };
    model.act(action);
    assertInvariants(model, before, action);
  }
  if (name.includes("STAGE3-DEADEND")) assert.equal(model.journey.active, 3, "stage 3 recovery must return through stage 2 without a dead end");
  if (name.includes("SECOND-CASE")) assert.equal(model.journeys.size, 2, "case state must remain isolated");
}

for (let run = 0; run < runs; run += 1) {
  const model = new Model();
  model.mode = (["free", "random", "demo", "osce", "rct"] as UiMode[])[randomIndex(run, 1000, 5)];
  for (let step = 0; step < steps; step += 1) {
    const action = actions[randomIndex(run, step, actions.length)];
    const before = { key: model.key(), revision: model.journey.revision };
    model.act(action);
    assertInvariants(model, before, action);
  }
}

assert.equal(nextTrainingStage(7), null);
assert.deepEqual([...submittedTrainingStages({ 1: { status: "submitted" }, 2: null })], [1]);
assert.doesNotMatch(projectStudentScoreText("360分制；240/360 points", "zh"), /360/);
assert.doesNotMatch(projectStudentScoreText("360-point scale; 240/360 points", "en"), /360/);

async function runSqliteIntegration() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "r5-phase2-state-model-"));
  process.env.TRAINING_STATE_SECRET = "phase2-state-model-secret-with-adequate-length";
  process.env.TRAINING_ATTEMPT_STORE_MODE = "sqlite";
  process.env.TRAINING_DEPLOYMENT_TIER = "practice";
  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = path.join(directory, "state.sqlite3");
  const handler = require("../api/training-action.js");
  const { closeDesktopSqliteStore } = require("../server/desktopSqliteStore.js");
  const { verifyAttemptState } = require("../server/trainingState.js");
  let token = "";
  const call = async (body: Record<string, unknown>, suppliedToken = token) => {
    let statusCode = 200;
    let payload: Record<string, unknown> = {};
    const headers: Record<string, string> = {};
    const req = { method: "POST", body, headers: { origin: "https://phase2.example.test", host: "phase2.example.test", "x-forwarded-proto": "https", "x-idempotency-key": String(body.requestId), ...(suppliedToken ? { "x-training-state": suppliedToken } : {}) }, socket: { remoteAddress: "phase2" } };
    const res = { setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; }, status(code: number) { statusCode = code; return this; }, json(value: Record<string, unknown>) { payload = value; return this; }, end() { return this; } };
    await handler(req, res);
    token = headers["x-training-state"] || suppliedToken;
    return { statusCode, payload, token };
  };
  try {
    const attemptId = `phase2-${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 12)}`;
    let response = await call({ action: "init-attempt", caseId: "P001", attemptId, mode: "random", language: "zh", requestId: `${attemptId}-init` }, "");
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.mode, "public-practice", "random must reach durable storage as public practice");
    response = await call({ action: "history-log", caseId: "P001", attemptId, mode: "random", language: "zh", question: "什么时候开始？", requestId: `${attemptId}-history` });
    assert.equal(response.statusCode, 200);
    const stage1Token = response.token;
    response = await call({ action: "stage-feedback", caseId: "P001", attemptId, mode: "random", language: "zh", stageKey: "history", submission: {}, requestId: `${attemptId}-stage-1` });
    assert.equal(response.statusCode, 200);
    const firstStageResponse = response;
    const duplicate = await call({ action: "stage-feedback", caseId: "P001", attemptId, mode: "random", language: "zh", stageKey: "history", submission: {}, requestId: `${attemptId}-stage-1` }, stage1Token);
    assert.equal(duplicate.statusCode, 200);
    assert.deepEqual(duplicate.payload, firstStageResponse.payload, "same request ID must replay the committed response");
    token = firstStageResponse.token;
    response = await call({ action: "stage-feedback", caseId: "P001", attemptId, mode: "random", language: "zh", stageKey: "orders", submission: {}, requestId: `${attemptId}-stage-2` });
    assert.equal(response.statusCode, 200);
    assert.equal(verifyAttemptState(response.token, { caseId: "P001", attemptId }).currentStage, 3);
    response = await call({ action: "stage-feedback", caseId: "P001", attemptId, mode: "random", language: "zh", stageKey: "history", submission: {}, requestId: `${attemptId}-reopen` });
    assert.equal(response.statusCode, 200, "sparse stage 3 must retain a controlled reopen path");
    assert.equal(verifyAttemptState(response.token, { caseId: "P001", attemptId }).currentStage, 2);
    closeDesktopSqliteStore();
    response = await call({ action: "validate-attempt", caseId: "P001", attemptId, mode: "random", language: "zh", requestId: `${attemptId}-resume` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.currentStage, 2, "SQLite reopen must preserve authoritative stage");
    const wrongLanguage = await call({ action: "validate-attempt", caseId: "P001", attemptId, mode: "random", language: "en", requestId: `${attemptId}-wrong-language` });
    assert.equal(wrongLanguage.statusCode, 409, "language state must not cross an attempt boundary");
  } finally {
    closeDesktopSqliteStore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

void (async () => {
  if (integration) await runSqliteIntegration();
  process.stdout.write(`R5 stage-state model passed (seed=${seed}, runs=${runs}, steps=${steps}, integration=${integration})\n`);
})();
