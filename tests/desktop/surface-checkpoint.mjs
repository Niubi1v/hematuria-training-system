import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export async function fileSha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

export async function directoryFingerprint(directory) {
  const records = [];
  async function visit(current, relative = "") {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = `${current}/${entry.name}`;
      if (entry.isDirectory()) await visit(child, childRelative);
      else {
        const stat = await fs.stat(child);
        records.push(`${childRelative}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  }
  await visit(directory);
  return crypto.createHash("sha256").update(records.join("\n")).digest("hex");
}

export function databaseCheckpoint(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const scalar = (sql) => Number(database.prepare(sql).get()?.value || 0);
    const count = (table) => Number(database.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get()?.value || 0);
    const requestCount = count("attempt_requests");
    const distinctRequestCount = Number(database.prepare("SELECT COUNT(DISTINCT request_id) AS value FROM attempt_requests").get()?.value || 0);
    const stateStoreId = String(database.prepare("SELECT value FROM schema_meta WHERE key = 'state_store_id'").get()?.value || "");
    assert.match(stateStoreId, /^[0-9a-f-]{36}$/iu);
    return {
      attemptCount: count("attempts"),
      eventCount: count("desktop_runtime_events"),
      requestCount,
      schemaVersion: scalar("SELECT value FROM schema_meta WHERE key = 'schema_version'"),
      serverStateRevision: scalar("SELECT value FROM schema_meta WHERE key = 'server_state_revision'"),
      snapshotCount: count("desktop_attempt_snapshots"),
      stateStoreIdHash: crypto.createHash("sha256").update(stateStoreId).digest("hex").slice(0, 16),
      uniqueRequests: requestCount === distinctRequestCount
    };
  } finally {
    database.close();
  }
}

export function assertSurfaceCheckpoint(checkpoint) {
  assert.match(checkpoint.productHead, /^[0-9a-f]{40}$/u);
  assert.match(checkpoint.artifactSha, /^[0-9a-f]{64}$/u);
  assert.equal(checkpoint.durableMode, "free");
  assert.equal(checkpoint.activeStage, 2);
  assert.equal(checkpoint.submittedStageCount, 1);
  assert.equal(checkpoint.schemaVersion, 3);
  assert.equal(checkpoint.attemptCount, checkpoint.snapshotCount);
  assert.equal(checkpoint.uniqueRequests, true);
  assert.equal(checkpoint.idempotentReplay, true);
  assert.equal(checkpoint.cloudRequestCount, 0);
  assert.equal(checkpoint.percentageOnlyBoundary, true);
  assert.equal(checkpoint.diagnosticExport, true);
  assert.equal(checkpoint.processCleanup, true);
  assert.equal(checkpoint.r4DataUnchanged, true);
  const serialized = JSON.stringify(checkpoint);
  assert.doesNotMatch(serialized, /attemptId|authToken|bearer|handshake|stateToken|patient question|prompt|reasoning|(?:[A-Z]:\\|[A-Z]:\/Users\/)/iu);
  return checkpoint;
}

export function comparableOutcome(checkpoint) {
  return {
    productHead: checkpoint.productHead,
    durableMode: checkpoint.durableMode,
    activeStage: checkpoint.activeStage,
    submittedStageCount: checkpoint.submittedStageCount,
    schemaVersion: checkpoint.schemaVersion,
    uniqueRequests: checkpoint.uniqueRequests,
    idempotentReplay: checkpoint.idempotentReplay,
    cloudRequestCount: checkpoint.cloudRequestCount,
    percentageOnlyBoundary: checkpoint.percentageOnlyBoundary,
    diagnosticExport: checkpoint.diagnosticExport,
    processCleanup: checkpoint.processCleanup,
    r4DataUnchanged: checkpoint.r4DataUnchanged
  };
}

export async function writeSurfaceCheckpoint(checkpoint, outputPath = process.env.HEMATURIA_SURFACE_CHECKPOINT) {
  assertSurfaceCheckpoint(checkpoint);
  if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  return checkpoint;
}
