const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 3;
const MAX_IDEMPOTENCY_RECORDS = 64;
const ATTEMPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;
const STATE_STORE_ID_KEY = "state_store_id";
const SERVER_STATE_REVISION_KEY = "server_state_revision";
const RUNTIME_EVENT_TYPES = new Set(["local_ai_accepted", "rule_fallback_used"]);
const RUNTIME_MODELS = new Set(["Qwen3-1.7B", "Qwen3-4B"]);

let activeStore = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function desktopDatabasePath() {
  const configured = String(process.env.HEMATURIA_DESKTOP_DATABASE_PATH || "");
  if (!configured) throw new Error("desktop_database_path_required");
  if (!path.isAbsolute(configured)) throw new Error("desktop_database_path_must_be_absolute");
  if (configured.includes("\0")) throw new Error("desktop_database_path_invalid");
  return path.normalize(configured);
}

function transaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

function readSchemaVersion(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT
  `);
  const row = database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
  if (!row) return 0;
  const version = Number(row.value);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("desktop_database_schema_invalid");
  return version;
}

function migrate(database) {
  transaction(database, () => {
    const version = readSchemaVersion(database);
    if (version > SCHEMA_VERSION) throw new Error("desktop_database_schema_too_new");
    if (version === SCHEMA_VERSION) return;
    if (version === 0) database.exec(`
      CREATE TABLE attempts (
        attempt_key TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        current_token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX attempts_case_attempt
        ON attempts(case_id, attempt_id);

      CREATE TABLE attempt_requests (
        attempt_key TEXT NOT NULL,
        request_id TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (attempt_key, request_id),
        FOREIGN KEY (attempt_key) REFERENCES attempts(attempt_key) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX attempt_requests_prune
        ON attempt_requests(attempt_key, created_at, request_id);

      CREATE TABLE desktop_sessions (
        session_id TEXT PRIMARY KEY,
        attempt_id TEXT,
        case_id TEXT,
        language TEXT,
        mode TEXT,
        status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE training_records (
        record_id TEXT PRIMARY KEY,
        session_id TEXT,
        attempt_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score REAL,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES desktop_sessions(session_id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX training_records_attempt
        ON training_records(attempt_id, created_at);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE internal_secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
    `);
    if (version === 0 || version === 1) database.exec(`
      CREATE TABLE desktop_attempt_snapshots (
        attempt_key TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (attempt_key) REFERENCES attempts(attempt_key) ON DELETE CASCADE
      ) STRICT;
    `);
    if (![0, 1, 2].includes(version)) throw new Error("desktop_database_schema_unsupported");
    database.prepare(`
      INSERT INTO schema_meta(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(STATE_STORE_ID_KEY, crypto.randomUUID());
    database.prepare(`
      INSERT INTO schema_meta(key, value) VALUES (?, '0')
      ON CONFLICT(key) DO NOTHING
    `).run(SERVER_STATE_REVISION_KEY);
    database.prepare(`
      INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(SCHEMA_VERSION));
  });
}

function ensureRuntimeAuditSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS desktop_runtime_sessions (
      runtime_session_id TEXT PRIMARY KEY,
      session_started_at TEXT NOT NULL,
      event_write_failure_count INTEGER NOT NULL DEFAULT 0 CHECK(event_write_failure_count >= 0),
      created_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS desktop_runtime_events (
      event_id TEXT PRIMARY KEY,
      runtime_session_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('local_ai_accepted', 'rule_fallback_used')),
      timestamp TEXT NOT NULL,
      model TEXT NOT NULL,
      latency INTEGER NOT NULL CHECK(latency >= 0 AND latency <= 120000),
      FOREIGN KEY (runtime_session_id) REFERENCES desktop_runtime_sessions(runtime_session_id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS desktop_runtime_events_session
      ON desktop_runtime_events(runtime_session_id, event_type);
  `);
}

function openStore() {
  const databasePath = desktopDatabasePath();
  if (activeStore?.path === databasePath) return activeStore;
  if (activeStore) {
    activeStore.database.close();
    activeStore = null;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    migrate(database);
    ensureRuntimeAuditSchema(database);
  } catch (error) {
    database.close();
    throw error;
  }
  activeStore = { database, path: databasePath };
  return activeStore;
}

function closeDesktopSqliteStore() {
  if (!activeStore) return;
  activeStore.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  activeStore.database.close();
  activeStore = null;
}

function runtimeIdentifier(value, code) {
  const normalized = String(value || "");
  if (!normalized || normalized.length > 160 || !/^[A-Za-z0-9:_.-]+$/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function runtimeTimestamp(value) {
  const normalized = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)) {
    throw new Error("desktop_runtime_timestamp_invalid");
  }
  return normalized;
}

function desktopRuntimeEventSummary(runtimeSessionId) {
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const { database } = openStore();
  const row = database.prepare(`
    SELECT
      s.session_started_at,
      s.event_write_failure_count,
      COALESCE(SUM(CASE WHEN e.event_type = 'local_ai_accepted' THEN 1 ELSE 0 END), 0) AS local_ai_accepted_count,
      COALESCE(SUM(CASE WHEN e.event_type = 'rule_fallback_used' THEN 1 ELSE 0 END), 0) AS rule_fallback_count
    FROM desktop_runtime_sessions s
    LEFT JOIN desktop_runtime_events e ON e.runtime_session_id = s.runtime_session_id
    WHERE s.runtime_session_id = ?
    GROUP BY s.runtime_session_id
  `).get(sessionId);
  if (!row) return null;
  return {
    sessionStartedAt: row.session_started_at,
    localAiAcceptedCount: Number(row.local_ai_accepted_count),
    ruleFallbackCount: Number(row.rule_fallback_count),
    eventWriteFailureCount: Number(row.event_write_failure_count),
    runtimeAuditHealthy: Number(row.event_write_failure_count) === 0
  };
}

function startDesktopRuntimeSession({ runtimeSessionId, sessionStartedAt }) {
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const startedAt = runtimeTimestamp(sessionStartedAt);
  const { database } = openStore();
  database.prepare(`
    INSERT INTO desktop_runtime_sessions(
      runtime_session_id, session_started_at, event_write_failure_count, created_at
    ) VALUES (?, ?, 0, ?)
    ON CONFLICT(runtime_session_id) DO NOTHING
  `).run(sessionId, startedAt, Date.now());
  const row = database.prepare(`
    SELECT session_started_at FROM desktop_runtime_sessions WHERE runtime_session_id = ?
  `).get(sessionId);
  if (row?.session_started_at !== startedAt) throw new Error("desktop_runtime_session_conflict");
  return desktopRuntimeEventSummary(sessionId);
}

function writeDesktopRuntimeEvent({ eventId, runtimeSessionId, eventType, timestamp, model, latency }) {
  const normalizedEventId = runtimeIdentifier(eventId, "desktop_runtime_event_id_invalid");
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const normalizedType = String(eventType || "");
  const normalizedModel = String(model || "");
  const normalizedLatency = Number(latency);
  if (!RUNTIME_EVENT_TYPES.has(normalizedType)) throw new Error("desktop_runtime_event_type_invalid");
  if (!RUNTIME_MODELS.has(normalizedModel)) throw new Error("desktop_runtime_event_model_invalid");
  if (!Number.isSafeInteger(normalizedLatency) || normalizedLatency < 0 || normalizedLatency > 120_000) {
    throw new Error("desktop_runtime_event_latency_invalid");
  }
  const { database } = openStore();
  const inserted = database.prepare(`
    INSERT INTO desktop_runtime_events(
      event_id, runtime_session_id, event_type, timestamp, model, latency
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO NOTHING
  `).run(
    normalizedEventId,
    sessionId,
    normalizedType,
    runtimeTimestamp(timestamp),
    normalizedModel,
    normalizedLatency
  );
  return {
    inserted: inserted.changes === 1,
    ...desktopRuntimeEventSummary(sessionId)
  };
}

function recordDesktopRuntimeWriteFailure(runtimeSessionId) {
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const { database } = openStore();
  const updated = database.prepare(`
    UPDATE desktop_runtime_sessions
    SET event_write_failure_count = event_write_failure_count + 1
    WHERE runtime_session_id = ?
  `).run(sessionId);
  if (updated.changes !== 1) throw new Error("desktop_runtime_session_missing");
  return desktopRuntimeEventSummary(sessionId);
}

function desktopRuntimeEventsForTests(runtimeSessionId) {
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const { database } = openStore();
  return database.prepare(`
    SELECT event_id, runtime_session_id, event_type, timestamp, model, latency
    FROM desktop_runtime_events
    WHERE runtime_session_id = ?
    ORDER BY timestamp, event_id
  `).all(sessionId).map((row) => ({
    eventId: row.event_id,
    runtimeSessionId: row.runtime_session_id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    model: row.model,
    latency: row.latency
  }));
}

function resetDesktopRuntimeSessionForTests(runtimeSessionId) {
  const sessionId = runtimeIdentifier(runtimeSessionId, "desktop_runtime_session_id_invalid");
  const { database } = openStore();
  transaction(database, () => {
    database.prepare("DELETE FROM desktop_runtime_events WHERE runtime_session_id = ?").run(sessionId);
    database.prepare(`
      UPDATE desktop_runtime_sessions SET event_write_failure_count = 0 WHERE runtime_session_id = ?
    `).run(sessionId);
  });
}

function readServerStateRevision(database) {
  const row = database.prepare("SELECT value FROM schema_meta WHERE key = ?").get(SERVER_STATE_REVISION_KEY);
  const revision = Number(row?.value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("desktop_server_state_revision_invalid");
  return revision;
}

function bumpServerStateRevision(database) {
  const next = readServerStateRevision(database) + 1;
  database.prepare("UPDATE schema_meta SET value = ? WHERE key = ?").run(String(next), SERVER_STATE_REVISION_KEY);
  return next;
}

function getDesktopStateAuthority() {
  const { database } = openStore();
  const stateStore = database.prepare("SELECT value FROM schema_meta WHERE key = ?").get(STATE_STORE_ID_KEY);
  const stateStoreId = String(stateStore?.value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stateStoreId)) {
    throw new Error("desktop_state_store_id_invalid");
  }
  return {
    stateStoreId,
    schemaVersion: readSchemaVersion(database),
    productHead: String(process.env.HEMATURIA_PRODUCT_HEAD || process.env.NEXT_PUBLIC_GIT_SHA || "desktop-local"),
    serverStateRevision: readServerStateRevision(database)
  };
}

function parseAttemptState(row) {
  if (!row) return null;
  try {
    const state = JSON.parse(row.state_json);
    return state && typeof state === "object" && !Array.isArray(state) ? state : null;
  } catch {
    return null;
  }
}

function discoverAttempt({ caseId, mode, language }) {
  const expectedCaseId = String(caseId || "");
  const expectedMode = String(mode || "");
  const expectedLanguage = String(language || "");
  if (!expectedCaseId || !expectedMode || !expectedLanguage) throw new Error("desktop_attempt_identity_required");
  const { database } = openStore();
  const rows = database.prepare(`
    SELECT a.attempt_key, a.state_json, a.created_at, a.updated_at, a.expires_at,
           s.snapshot_json
    FROM attempts a
    LEFT JOIN desktop_attempt_snapshots s ON s.attempt_key = a.attempt_key
    WHERE a.case_id = ? AND a.expires_at > ?
    ORDER BY a.updated_at DESC, a.created_at DESC
  `).all(expectedCaseId, Date.now());
  for (const row of rows) {
    const state = parseAttemptState(row);
    if (!state || state.mode !== expectedMode || state.language !== expectedLanguage) continue;
    if (!["active", "completed"].includes(String(state.status || ""))) continue;
    let snapshot = null;
    try {
      snapshot = row.snapshot_json ? JSON.parse(row.snapshot_json) : null;
    } catch {
      snapshot = null;
    }
    return {
      kind: "active",
      attemptKey: row.attempt_key,
      state: clone(state),
      snapshot: snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? clone(snapshot) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  return { kind: "missing" };
}

function saveAttemptSnapshot({ attemptKey, caseId, attemptId, mode, language, snapshot }) {
  const serialized = JSON.stringify(snapshot);
  if (!serialized || Buffer.byteLength(serialized, "utf8") > 1_500_000) {
    throw new Error("desktop_attempt_snapshot_invalid");
  }
  const { database } = openStore();
  return transaction(database, () => {
    const row = database.prepare("SELECT case_id, attempt_id, state_json, expires_at FROM attempts WHERE attempt_key = ?").get(String(attemptKey || ""));
    const state = parseAttemptState(row);
    if (!row || !state || row.expires_at <= Date.now()) return { kind: "missing" };
    if (
      row.case_id !== String(caseId)
      || row.attempt_id !== String(attemptId)
      || state.mode !== String(mode)
      || state.language !== String(language)
      || snapshot?.attempt?.attemptId !== String(attemptId)
      || snapshot?.attempt?.caseId !== String(caseId)
    ) return { kind: "identity_mismatch" };
    database.prepare(`
      INSERT INTO desktop_attempt_snapshots(attempt_key, snapshot_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(attempt_key) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        updated_at = excluded.updated_at
    `).run(attemptKey, serialized, Date.now());
    bumpServerStateRevision(database);
    return { kind: "saved" };
  });
}

function attemptRequestPayloads(attemptKey) {
  const { database } = openStore();
  return database.prepare(`
    SELECT payload_json FROM attempt_requests
    WHERE attempt_key = ? ORDER BY created_at, request_id
  `).all(String(attemptKey || "")).flatMap((row) => {
    try { return [JSON.parse(row.payload_json)]; } catch { return []; }
  });
}

function catalogProgress() {
  const { database } = openStore();
  const progress = {};
  const rows = database.prepare(`
    SELECT case_id, state_json FROM attempts
    WHERE expires_at > ? ORDER BY updated_at DESC
  `).all(Date.now());
  for (const row of rows) {
    const state = parseAttemptState(row);
    if (!state || !["active", "completed"].includes(String(state.status || ""))) continue;
    const next = state.status === "completed" ? "completed" : "in-progress";
    if (progress[row.case_id] !== "completed") progress[row.case_id] = next;
  }
  return progress;
}

function deleteExpiredAttempt(database, attemptKey, now) {
  const deleted = database.prepare("DELETE FROM attempts WHERE attempt_key = ? AND expires_at <= ?").run(attemptKey, now);
  if (deleted.changes > 0) bumpServerStateRevision(database);
}

function readCachedRequest(database, attemptKey, requestId) {
  const row = database.prepare(`
    SELECT request_digest, status_code, payload_json, token
    FROM attempt_requests
    WHERE attempt_key = ? AND request_id = ?
  `).get(attemptKey, requestId);
  if (!row) return null;
  return {
    requestDigest: row.request_digest,
    statusCode: row.status_code,
    payload: JSON.parse(row.payload_json),
    token: row.token
  };
}

function duplicateOrConflict(cached, requestDigest) {
  if (cached.requestDigest !== requestDigest) return { kind: "conflict" };
  return { kind: "duplicate", cached };
}

function registerAttempt({
  attemptKey,
  caseId,
  attemptId,
  state,
  tokenHash,
  requestId,
  requestDigest,
  payload,
  token,
  statusCode
}) {
  const { database } = openStore();
  return transaction(database, () => {
    const now = Date.now();
    deleteExpiredAttempt(database, attemptKey, now);
    const existing = database.prepare("SELECT 1 FROM attempts WHERE attempt_key = ?").get(attemptKey);
    if (existing) {
      const cached = readCachedRequest(database, attemptKey, requestId);
      return cached ? duplicateOrConflict(cached, requestDigest) : { kind: "exists" };
    }

    database.prepare(`
      INSERT INTO attempts(
        attempt_key, case_id, attempt_id, state_json, current_token_hash,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptKey,
      String(caseId),
      String(attemptId),
      JSON.stringify(state),
      tokenHash,
      now,
      now,
      now + ATTEMPT_TTL_MILLISECONDS
    );
    database.prepare(`
      INSERT INTO attempt_requests(
        attempt_key, request_id, request_digest, status_code, payload_json, token, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(attemptKey, requestId, requestDigest, statusCode, JSON.stringify(payload), String(token || ""), now);
    database.prepare(`
      INSERT INTO training_records(
        record_id, session_id, attempt_id, case_id, status, score, completed_at, created_at
      ) VALUES (?, NULL, ?, ?, 'active', NULL, NULL, ?)
      ON CONFLICT(record_id) DO NOTHING
    `).run(attemptKey, String(attemptId), String(caseId), now);
    bumpServerStateRevision(database);
    return { kind: "created" };
  });
}

function loadAttempt({ attemptKey, requestId, requestDigest, tokenHash }) {
  const { database } = openStore();
  return transaction(database, () => {
    deleteExpiredAttempt(database, attemptKey, Date.now());
    const row = database.prepare(`
      SELECT state_json, current_token_hash
      FROM attempts
      WHERE attempt_key = ?
    `).get(attemptKey);
    if (!row) return { kind: "missing" };
    const cached = readCachedRequest(database, attemptKey, requestId);
    if (cached) return duplicateOrConflict(cached, requestDigest);
    if (row.current_token_hash !== tokenHash) return { kind: "stale" };
    return { kind: "active", state: JSON.parse(row.state_json) };
  });
}

function validateCurrentAttempt({ attemptKey, tokenHash }) {
  const { database } = openStore();
  return transaction(database, () => {
    deleteExpiredAttempt(database, attemptKey, Date.now());
    const row = database.prepare(`
      SELECT state_json, current_token_hash
      FROM attempts
      WHERE attempt_key = ?
    `).get(attemptKey);
    if (!row) return { kind: "missing" };
    if (row.current_token_hash !== tokenHash) return { kind: "stale" };
    return { kind: "active", state: JSON.parse(row.state_json) };
  });
}

function resumeAttempt({ attemptKey, caseId, attemptId, mode, language }) {
  const expected = {
    attemptKey: String(attemptKey || ""),
    caseId: String(caseId || ""),
    attemptId: String(attemptId || ""),
    mode: String(mode || ""),
    language: String(language || "")
  };
  if (Object.values(expected).some((value) => !value)) throw new Error("desktop_attempt_identity_required");
  const { database } = openStore();
  const row = database.prepare(`
    SELECT case_id, attempt_id, state_json, expires_at
    FROM attempts
    WHERE attempt_key = ?
  `).get(expected.attemptKey);
  if (!row) return { kind: "missing" };
  if (!Number.isSafeInteger(row.expires_at) || row.expires_at <= Date.now()) {
    return { kind: "expired" };
  }
  if (row.case_id !== expected.caseId || row.attempt_id !== expected.attemptId) {
    return { kind: "identity_mismatch" };
  }

  let state;
  try {
    state = JSON.parse(row.state_json);
  } catch {
    return { kind: "invalid_state" };
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) return { kind: "invalid_state" };
  if (
    state.caseId !== expected.caseId
    || state.attemptId !== expected.attemptId
    || state.mode !== expected.mode
    || state.language !== expected.language
  ) {
    return { kind: "identity_mismatch" };
  }
  if (!Number.isSafeInteger(state.expiresAt) || state.expiresAt <= Date.now()) {
    return { kind: "expired" };
  }
  if (!["active", "completed"].includes(state.status)) return { kind: "not_resumable" };
  if (!Number.isSafeInteger(Number(state.currentStage)) || Number(state.currentStage) < 1 || Number(state.currentStage) > 8) {
    return { kind: "invalid_state" };
  }
  return { kind: "active", state: clone(state) };
}

function commitAttempt({
  attemptKey,
  state,
  previousTokenHash,
  nextTokenHash,
  requestId,
  requestDigest,
  payload,
  token,
  statusCode
}) {
  const { database } = openStore();
  return transaction(database, () => {
    const now = Date.now();
    deleteExpiredAttempt(database, attemptKey, now);
    const row = database.prepare("SELECT current_token_hash FROM attempts WHERE attempt_key = ?").get(attemptKey);
    if (!row) return { kind: "missing" };
    const cached = readCachedRequest(database, attemptKey, requestId);
    if (cached) return duplicateOrConflict(cached, requestDigest);
    if (row.current_token_hash !== previousTokenHash) return { kind: "stale" };

    const updated = database.prepare(`
      UPDATE attempts
      SET state_json = ?, current_token_hash = ?, updated_at = ?, expires_at = ?
      WHERE attempt_key = ? AND current_token_hash = ?
    `).run(
      JSON.stringify(state),
      nextTokenHash,
      now,
      now + ATTEMPT_TTL_MILLISECONDS,
      attemptKey,
      previousTokenHash
    );
    if (updated.changes !== 1) return { kind: "stale" };
    database.prepare(`
      INSERT INTO attempt_requests(
        attempt_key, request_id, request_digest, status_code, payload_json, token, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(attemptKey, requestId, requestDigest, statusCode, JSON.stringify(payload), String(token || ""), now);
    database.prepare(`
      INSERT INTO training_records(
        record_id, session_id, attempt_id, case_id, status, score, completed_at, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        completed_at = excluded.completed_at
    `).run(
      attemptKey,
      String(state.attemptId),
      String(state.caseId),
      String(state.status || "active"),
      state.finalScore === undefined || state.finalScore === null ? null : Number(state.finalScore),
      state.completedAt ? Date.parse(state.completedAt) : null,
      now
    );
    database.prepare(`
      DELETE FROM attempt_requests
      WHERE attempt_key = ? AND request_id IN (
        SELECT request_id
        FROM attempt_requests
        WHERE attempt_key = ?
        ORDER BY created_at DESC, request_id DESC
        LIMIT -1 OFFSET ?
      )
    `).run(attemptKey, attemptKey, MAX_IDEMPOTENCY_RECORDS);
    bumpServerStateRevision(database);
    return { kind: "committed" };
  });
}

function assertPublicSettingKey(key) {
  const normalized = String(key || "");
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(normalized)) throw new Error("desktop_setting_key_invalid");
  return normalized;
}

function getDesktopSetting(key) {
  const normalized = assertPublicSettingKey(key);
  const { database } = openStore();
  const row = database.prepare("SELECT value_json FROM settings WHERE key = ?").get(normalized);
  return row ? clone(JSON.parse(row.value_json)) : undefined;
}

function setDesktopSetting(key, value) {
  const normalized = assertPublicSettingKey(key);
  if (value === undefined) throw new Error("desktop_setting_value_invalid");
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("desktop_setting_value_invalid");
  const { database } = openStore();
  database.prepare(`
    INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(normalized, serialized, Date.now());
  return clone(value);
}

function getOrCreateDesktopSecret() {
  const { database } = openStore();
  return transaction(database, () => {
    const existing = database.prepare("SELECT value FROM internal_secrets WHERE key = 'training_state_signing_secret'").get();
    if (existing) return existing.value;
    const secret = crypto.randomBytes(32).toString("base64url");
    database.prepare(`
      INSERT INTO internal_secrets(key, value, created_at)
      VALUES ('training_state_signing_secret', ?, ?)
    `).run(secret, Date.now());
    return secret;
  });
}

function cleanOptionalText(value, maxLength = 160) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).slice(0, maxLength);
}

function upsertDesktopSessionMetadata(metadata) {
  const sessionId = cleanOptionalText(metadata?.sessionId, 2048);
  if (!sessionId) throw new Error("desktop_session_id_required");
  const now = Date.now();
  const { database } = openStore();
  database.prepare(`
    INSERT INTO desktop_sessions(
      session_id, attempt_id, case_id, language, mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      attempt_id = excluded.attempt_id,
      case_id = excluded.case_id,
      language = excluded.language,
      mode = excluded.mode,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    sessionId,
    cleanOptionalText(metadata.attemptId),
    cleanOptionalText(metadata.caseId),
    cleanOptionalText(metadata.language, 16),
    cleanOptionalText(metadata.mode, 80),
    cleanOptionalText(metadata.status, 80),
    now,
    now
  );
  return getDesktopSessionMetadata(sessionId);
}

function getDesktopSessionMetadata(sessionId) {
  const normalized = cleanOptionalText(sessionId, 2048);
  if (!normalized) throw new Error("desktop_session_id_required");
  const { database } = openStore();
  const row = database.prepare(`
    SELECT session_id, attempt_id, case_id, language, mode, status, created_at, updated_at
    FROM desktop_sessions
    WHERE session_id = ?
  `).get(normalized);
  if (!row) return null;
  return {
    sessionId: row.session_id,
    attemptId: row.attempt_id,
    caseId: row.case_id,
    language: row.language,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function saveTrainingRecordSnapshot(snapshot) {
  const recordId = cleanOptionalText(snapshot?.recordId);
  const attemptId = cleanOptionalText(snapshot?.attemptId);
  const caseId = cleanOptionalText(snapshot?.caseId);
  const status = cleanOptionalText(snapshot?.status, 80);
  if (!recordId || !attemptId || !caseId || !status) throw new Error("desktop_training_record_invalid");
  const score = snapshot.score === undefined || snapshot.score === null ? null : Number(snapshot.score);
  if (score !== null && !Number.isFinite(score)) throw new Error("desktop_training_record_invalid");
  const completedAt = snapshot.completedAt === undefined || snapshot.completedAt === null
    ? null
    : Number(snapshot.completedAt);
  if (completedAt !== null && !Number.isSafeInteger(completedAt)) throw new Error("desktop_training_record_invalid");
  const { database } = openStore();
  database.prepare(`
    INSERT INTO training_records(
      record_id, session_id, attempt_id, case_id, status, score, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(record_id) DO UPDATE SET
      session_id = excluded.session_id,
      attempt_id = excluded.attempt_id,
      case_id = excluded.case_id,
      status = excluded.status,
      score = excluded.score,
      completed_at = excluded.completed_at
  `).run(
    recordId,
    cleanOptionalText(snapshot.sessionId),
    attemptId,
    caseId,
    status,
    score,
    completedAt,
    Date.now()
  );
  return getTrainingRecordSnapshot(recordId);
}

function getTrainingRecordSnapshot(recordId) {
  const normalized = cleanOptionalText(recordId);
  if (!normalized) throw new Error("desktop_training_record_id_required");
  const { database } = openStore();
  const row = database.prepare(`
    SELECT record_id, session_id, attempt_id, case_id, status, score, completed_at, created_at
    FROM training_records
    WHERE record_id = ?
  `).get(normalized);
  if (!row) return null;
  return {
    recordId: row.record_id,
    sessionId: row.session_id,
    attemptId: row.attempt_id,
    caseId: row.case_id,
    status: row.status,
    score: row.score,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

function getDesktopSchemaVersion() {
  return readSchemaVersion(openStore().database);
}

module.exports = {
  SCHEMA_VERSION,
  closeDesktopSqliteStore,
  catalogProgress,
  commitAttempt,
  discoverAttempt,
  desktopDatabasePath,
  desktopRuntimeEventSummary,
  desktopRuntimeEventsForTests,
  getDesktopSchemaVersion,
  getDesktopStateAuthority,
  getDesktopSessionMetadata,
  getDesktopSetting,
  getOrCreateDesktopSecret,
  getTrainingRecordSnapshot,
  loadAttempt,
  attemptRequestPayloads,
  recordDesktopRuntimeWriteFailure,
  registerAttempt,
  resetDesktopRuntimeSessionForTests,
  resumeAttempt,
  saveAttemptSnapshot,
  saveTrainingRecordSnapshot,
  setDesktopSetting,
  startDesktopRuntimeSession,
  upsertDesktopSessionMetadata,
  validateCurrentAttempt,
  writeDesktopRuntimeEvent
};
