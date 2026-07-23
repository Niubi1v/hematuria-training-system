import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const store = require("../server/trainingAttemptStore.js");
const redis = require("../server/standardRedisClient.js");

function requestDigest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function expectUnavailable(action) {
  await assert.rejects(action, (error) => error instanceof Error && error.message === "training_attempt_store_unavailable");
}

async function main() {
  assert.equal(process.env.TRAINING_ATTEMPT_STORE_MODE, "redis", "TRAINING_ATTEMPT_STORE_MODE=redis is required");
  assert.ok(process.env.REDIS_NAMESPACE, "REDIS_NAMESPACE is required");
  assert.equal(store.assertStoreConfigured(), "redis");

  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const caseId = "P001";
  const attemptId = `adapter-${suffix}`;
  const token1 = `token-1-${suffix}`;
  const token2 = `token-2-${suffix}`;
  const state1 = { caseId, attemptId, status: "active", sequence: 0 };
  const state2 = { ...state1, sequence: 1 };
  const initDigest = requestDigest("init");
  const commitDigest = requestDigest("commit");

  const created = await store.registerAttempt({
    state: state1,
    token: token1,
    requestId: `${suffix}-init`,
    requestDigest: initDigest,
    payload: { created: true }
  });
  assert.equal(created.duplicate, false, "write must create an attempt");

  const loaded = await store.loadAttempt({
    caseId,
    attemptId,
    token: token1,
    requestId: `${suffix}-read`,
    requestDigest: requestDigest("read")
  });
  assert.equal(loaded.state.attemptId, attemptId, "read must return the stored attempt");

  const committed = await store.commitAttempt({
    state: state2,
    previousToken: token1,
    nextToken: token2,
    requestId: `${suffix}-commit`,
    requestDigest: commitDigest,
    payload: { sequence: 1 }
  });
  assert.equal(committed.duplicate, false, "first consume must commit");

  const duplicate = await store.commitAttempt({
    state: state2,
    previousToken: token1,
    nextToken: token2,
    requestId: `${suffix}-commit`,
    requestDigest: commitDigest,
    payload: { sequence: 1 }
  });
  assert.equal(duplicate.duplicate, true, "same idempotency key and digest must replay cached output");

  await assert.rejects(
    store.commitAttempt({
      state: state2,
      previousToken: token1,
      nextToken: token2,
      requestId: `${suffix}-commit`,
      requestDigest: requestDigest("changed"),
      payload: { sequence: 2 }
    }),
    /idempotency_key_reused/,
    "changed replay must be rejected"
  );
  await assert.rejects(
    store.loadAttempt({
      caseId,
      attemptId,
      token: token1,
      requestId: `${suffix}-stale`,
      requestDigest: requestDigest("stale")
    }),
    /stale_attempt_token/,
    "consumed token must not be replayable"
  );

  const key = `hematuria:${process.env.REDIS_NAMESPACE.toLowerCase()}:attempt:v1:${store.digest(`${caseId.toLowerCase()}:${attemptId}`)}`;
  const ttl = Number(await redis.standardRedis(["TTL", key]));
  assert.ok(ttl > 0 && ttl <= 86_400, `TTL must be within the 24-hour contract, got ${ttl}`);

  const originalNamespace = process.env.REDIS_NAMESPACE;
  process.env.REDIS_NAMESPACE = `${originalNamespace}-isolated`;
  await redis.closeActiveClient();
  await assert.rejects(
    store.validateCurrentAttempt({ caseId, attemptId, token: token2 }),
    /attempt_not_found/,
    "namespaces must isolate environments"
  );
  process.env.REDIS_NAMESPACE = originalNamespace;
  await redis.closeActiveClient();
  assert.equal((await store.validateCurrentAttempt({ caseId, attemptId, token: token2 })).sequence, 1, "original namespace must recover");

  await redis.closeActiveClient();
  assert.equal((await store.validateCurrentAttempt({ caseId, attemptId, token: token2 })).sequence, 1, "client reconnect must recover");

  if (process.env.MAINLAND_EXPECT_REDIS_UNAVAILABLE === "1") {
    await redis.closeActiveClient();
    await expectUnavailable(() => store.validateCurrentAttempt({ caseId, attemptId, token: token2 }));
  }

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    checks: ["write", "read", "ttl", "idempotent-consume", "replay-rejection", "stale-token", "namespace-isolation", "reconnect"]
  })}\n`);
}

main().finally(() => redis.closeActiveClient()).catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : "adapter_test_failed" })}\n`);
  process.exitCode = 1;
});
