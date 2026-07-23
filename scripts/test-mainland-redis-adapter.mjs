import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const store = require("../server/trainingAttemptStore.js");
const redis = require("../server/standardRedisClient.js");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function main() {
  assert.equal(process.env.TRAINING_ATTEMPT_STORE_MODE, "redis");
  assert.equal(store.assertStoreConfigured(), "redis");
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const caseId = "P001";
  const attemptId = `adapter-${suffix}`;
  const token1 = `token-1-${suffix}`;
  const token2 = `token-2-${suffix}`;
  const state1 = { caseId, attemptId, status: "active", sequence: 0 };
  const state2 = { ...state1, sequence: 1 };
  const createArgs = {
    state: state1,
    token: token1,
    requestId: `${suffix}-init`,
    requestDigest: digest("init"),
    payload: { created: true }
  };
  assert.equal((await store.registerAttempt(createArgs)).duplicate, false);
  assert.equal((await store.loadAttempt({
    caseId, attemptId, token: token1, requestId: `${suffix}-read`, requestDigest: digest("read")
  })).state.attemptId, attemptId);
  const commitArgs = {
    state: state2,
    previousToken: token1,
    nextToken: token2,
    requestId: `${suffix}-commit`,
    requestDigest: digest("commit"),
    payload: { sequence: 1 }
  };
  const concurrent = await Promise.allSettled([
    store.commitAttempt(commitArgs),
    store.commitAttempt(commitArgs)
  ]);
  assert.equal(concurrent.every((item) => item.status === "fulfilled"), true);
  assert.equal(concurrent.filter((item) => item.value.duplicate).length, 1, "exactly one concurrent submission is a replay");
  await assert.rejects(
    store.commitAttempt({ ...commitArgs, requestDigest: digest("changed") }),
    /idempotency_key_reused/
  );
  await assert.rejects(
    store.loadAttempt({
      caseId, attemptId, token: token1, requestId: `${suffix}-stale`, requestDigest: digest("stale")
    }),
    /stale_attempt_token/
  );
  const prefix = process.env.REDIS_KEY_PREFIX || process.env.REDIS_NAMESPACE;
  const key = `hematuria:${prefix.toLowerCase()}:attempt:v1:${store.digest(`${caseId.toLowerCase()}:${attemptId}`)}`;
  const ttl = Number(await redis.standardRedis(["TTL", key]));
  assert.ok(ttl > 0 && ttl <= Number(process.env.TRAINING_ATTEMPT_TTL_SECONDS || 86400));
  const original = process.env.REDIS_KEY_PREFIX;
  process.env.REDIS_KEY_PREFIX = `${prefix}-isolated`;
  await redis.closeActiveClient();
  await assert.rejects(store.validateCurrentAttempt({ caseId, attemptId, token: token2 }), /attempt_not_found/);
  process.env.REDIS_KEY_PREFIX = original;
  await redis.closeActiveClient();
  assert.equal((await store.validateCurrentAttempt({ caseId, attemptId, token: token2 })).sequence, 1);
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    checks: ["write", "read", "ttl", "concurrent-idempotency", "replay-rejection", "stale-token", "namespace", "reconnect"]
  })}\n`);
}

main()
  .finally(() => redis.closeActiveClient())
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", reason: error.message })}\n`);
    process.exitCode = 1;
  });
