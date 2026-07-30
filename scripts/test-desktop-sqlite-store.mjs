import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-desktop-sqlite-store-"));
const databasePath = path.join(testDirectory, "desktop.sqlite");
const originalMode = process.env.TRAINING_ATTEMPT_STORE_MODE;
const originalDatabasePath = process.env.HEMATURIA_DESKTOP_DATABASE_PATH;

process.env.TRAINING_ATTEMPT_STORE_MODE = "sqlite";
process.env.HEMATURIA_DESKTOP_DATABASE_PATH = databasePath;

let store = require("../server/trainingAttemptStore.js");
let sqlite = require("../server/desktopSqliteStore.js");

function state(attemptId, overrides = {}) {
  return {
    attemptId,
    caseId: "P003",
    mode: "public-practice",
    language: "zh",
    status: "active",
    completedStages: [],
    orders: [],
    releasedReports: [],
    events: [],
    submissions: {},
    ...overrides
  };
}

function requestDigest(character) {
  return character.repeat(64);
}

async function main() {
  assert.equal(store.storeMode(), "sqlite");
  assert.equal(store.assertStoreConfigured(), "sqlite");
  assert.equal(store.durableAttemptStoreConfigured(), true);
  assert.equal(store.attemptStoreCredentialSource(), "desktop_sqlite");
  assert.equal(sqlite.getDesktopSchemaVersion(), 1);

  const schemaDatabase = new DatabaseSync(databasePath);
  const tableNames = schemaDatabase.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all().map((row) => row.name);
  for (const required of [
    "attempt_requests",
    "attempts",
    "desktop_sessions",
    "schema_meta",
    "settings",
    "training_records"
  ]) {
    assert.equal(tableNames.includes(required), true, `missing ${required}`);
  }
  assert.equal(schemaDatabase.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(schemaDatabase.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  schemaDatabase.close();

  const initialState = state("attempt-main");
  const initialPayload = { attemptId: "attempt-main", stage: 1 };
  const registered = await store.registerAttempt({
    state: initialState,
    token: "token-1",
    requestId: "register-main",
    requestDigest: requestDigest("a"),
    payload: initialPayload,
    statusCode: 201
  });
  assert.deepEqual(registered, {
    duplicate: false,
    statusCode: 201,
    payload: initialPayload,
    token: "token-1"
  });

  const duplicateRegister = await store.registerAttempt({
    state: initialState,
    token: "different-token-is-ignored",
    requestId: "register-main",
    requestDigest: requestDigest("a"),
    payload: { different: true },
    statusCode: 500
  });
  assert.deepEqual(duplicateRegister, {
    duplicate: true,
    statusCode: 201,
    payload: initialPayload,
    token: "token-1"
  });
  await assert.rejects(
    store.registerAttempt({
      state: initialState,
      token: "token-1",
      requestId: "register-main",
      requestDigest: requestDigest("b"),
      payload: initialPayload
    }),
    /idempotency_key_reused/
  );
  await assert.rejects(
    store.registerAttempt({
      state: initialState,
      token: "token-1",
      requestId: "register-another",
      requestDigest: requestDigest("c"),
      payload: initialPayload
    }),
    /attempt_already_exists/
  );

  const loaded = await store.loadAttempt({
    caseId: "P003",
    attemptId: "attempt-main",
    token: "token-1",
    requestId: "load-main",
    requestDigest: requestDigest("d")
  });
  assert.equal(loaded.duplicate, false);
  assert.deepEqual(loaded.state, initialState);

  const committedState = state("attempt-main", { completedStages: [1] });
  const commitPayload = { stage: 1, accepted: true };
  const committed = await store.commitAttempt({
    state: committedState,
    previousToken: "token-1",
    nextToken: "token-2",
    requestId: "commit-main",
    requestDigest: requestDigest("e"),
    payload: commitPayload,
    statusCode: 202
  });
  assert.deepEqual(committed, {
    duplicate: false,
    statusCode: 202,
    payload: commitPayload,
    token: "token-2"
  });

  const duplicateCommit = await store.commitAttempt({
    state: state("attempt-main", { completedStages: [99] }),
    previousToken: "wrong-token",
    nextToken: "wrong-next-token",
    requestId: "commit-main",
    requestDigest: requestDigest("e"),
    payload: { wrong: true },
    statusCode: 500
  });
  assert.deepEqual(duplicateCommit, {
    duplicate: true,
    statusCode: 202,
    payload: commitPayload,
    token: "token-2"
  });
  await assert.rejects(
    store.commitAttempt({
      state: committedState,
      previousToken: "token-2",
      nextToken: "token-3",
      requestId: "commit-main",
      requestDigest: requestDigest("f"),
      payload: commitPayload
    }),
    /idempotency_key_reused/
  );
  await assert.rejects(
    store.commitAttempt({
      state: committedState,
      previousToken: "token-1",
      nextToken: "token-3",
      requestId: "commit-stale",
      requestDigest: requestDigest("f"),
      payload: commitPayload
    }),
    /stale_attempt_token/
  );
  await assert.rejects(
    store.loadAttempt({
      caseId: "P003",
      attemptId: "missing-attempt",
      token: "token",
      requestId: "load-missing",
      requestDigest: requestDigest("1")
    }),
    /attempt_not_found/
  );

  const raceState = state("attempt-race");
  await store.registerAttempt({
    state: raceState,
    token: "race-token-1",
    requestId: "register-race",
    requestDigest: requestDigest("2"),
    payload: { registered: true }
  });
  const raceResults = await Promise.allSettled([
    store.commitAttempt({
      state: state("attempt-race", { completedStages: [1] }),
      previousToken: "race-token-1",
      nextToken: "race-token-a",
      requestId: "race-a",
      requestDigest: requestDigest("3"),
      payload: { winner: "a" }
    }),
    store.commitAttempt({
      state: state("attempt-race", { completedStages: [2] }),
      previousToken: "race-token-1",
      nextToken: "race-token-b",
      requestId: "race-b",
      requestDigest: requestDigest("4"),
      payload: { winner: "b" }
    })
  ]);
  assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = raceResults.find((result) => result.status === "rejected");
  assert.match(rejected.reason.message, /stale_attempt_token/);

  await store.registerAttempt({
    state: state("attempt-prune"),
    token: "prune-token-0",
    requestId: "register-prune",
    requestDigest: requestDigest("5"),
    payload: { registered: true }
  });
  for (let index = 0; index < 70; index += 1) {
    await store.commitAttempt({
      state: state("attempt-prune", { completedStages: [index] }),
      previousToken: `prune-token-${index}`,
      nextToken: `prune-token-${index + 1}`,
      requestId: `prune-${String(index).padStart(2, "0")}`,
      requestDigest: (index + 100).toString(16).padStart(64, "0"),
      payload: { index }
    });
  }
  const pruningDatabase = new DatabaseSync(databasePath);
  const prunedRequestCount = pruningDatabase.prepare(`
    SELECT COUNT(*) AS count
    FROM attempt_requests
    WHERE attempt_key = ?
  `).get(`hematuria:attempt:v1:${store.digest("p003:attempt-prune")}`).count;
  pruningDatabase.close();
  assert.equal(prunedRequestCount, 64);

  store.setDesktopSetting("appearance.theme", { value: "dark" });
  assert.deepEqual(store.getDesktopSetting("appearance.theme"), { value: "dark" });
  const secret = store.getOrCreateDesktopSecret();
  assert.equal(secret.length >= 40, true);
  assert.equal(store.getOrCreateDesktopSecret(), secret);
  assert.equal(store.getDesktopSetting("training_state_signing_secret"), undefined);

  const session = store.upsertDesktopSessionMetadata({
    sessionId: "session-1",
    attemptId: "attempt-main",
    caseId: "P003",
    language: "zh",
    mode: "practice",
    status: "active",
    prompt: "must not be stored",
    sessionToken: "must not be stored"
  });
  assert.equal(session.sessionId, "session-1");
  assert.equal("prompt" in session, false);
  assert.equal("sessionToken" in session, false);
  const record = store.saveTrainingRecordSnapshot({
    recordId: "record-1",
    sessionId: "session-1",
    attemptId: "attempt-main",
    caseId: "P003",
    status: "completed",
    score: 88,
    completedAt: 123456789,
    completeDialogue: "must not be stored",
    teacherData: { hidden: true },
    sessionToken: "must not be stored"
  });
  assert.deepEqual(record, {
    recordId: "record-1",
    sessionId: "session-1",
    attemptId: "attempt-main",
    caseId: "P003",
    status: "completed",
    score: 88,
    completedAt: 123456789,
    createdAt: record.createdAt
  });

  sqlite.closeDesktopSqliteStore();
  delete require.cache[require.resolve("../server/trainingAttemptStore.js")];
  delete require.cache[require.resolve("../server/desktopSqliteStore.js")];
  store = require("../server/trainingAttemptStore.js");
  sqlite = require("../server/desktopSqliteStore.js");
  assert.deepEqual(store.getDesktopSetting("appearance.theme"), { value: "dark" });
  assert.equal(store.getOrCreateDesktopSecret(), secret);
  const persisted = await store.validateCurrentAttempt({
    caseId: "P003",
    attemptId: "attempt-main",
    token: "token-2"
  });
  assert.deepEqual(persisted.completedStages, [1]);

  sqlite.closeDesktopSqliteStore();
  const newerSchemaDatabase = new DatabaseSync(databasePath);
  newerSchemaDatabase.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run();
  newerSchemaDatabase.close();
  assert.throws(() => sqlite.getDesktopSchemaVersion(), /desktop_database_schema_too_new/);

  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = "relative.sqlite";
  assert.equal(store.durableAttemptStoreConfigured(), false);
  assert.throws(() => store.assertStoreConfigured(), /training_attempt_store_unavailable/);

  console.log("Desktop SQLite attempt store tests passed.");
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  try {
    sqlite.closeDesktopSqliteStore();
  } catch {
    // Best-effort cleanup after a failed assertion.
  }
  if (originalMode === undefined) delete process.env.TRAINING_ATTEMPT_STORE_MODE;
  else process.env.TRAINING_ATTEMPT_STORE_MODE = originalMode;
  if (originalDatabasePath === undefined) delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
  else process.env.HEMATURIA_DESKTOP_DATABASE_PATH = originalDatabasePath;
  try {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  } catch (error) {
    if (!failure) failure = error;
  }
}
if (failure) throw failure;
