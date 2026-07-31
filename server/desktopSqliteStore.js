const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 1;
const MAX_IDEMPOTENCY_RECORDS = 64;
const ATTEMPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;

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
    if (version !== 0) throw new Error("desktop_database_schema_unsupported");

    database.exec(`
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
    database.prepare(`
      INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(SCHEMA_VERSION));
  });
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
  } catch (error) {
    database.close();
    throw error;
  }
  activeStore = { database, path: databasePath };
  return activeStore;
}

function closeDesktopSqliteStore() {
  if (!activeStore) return;
  activeStore.database.close();
  activeStore = null;
}

function deleteExpiredAttempt(database, attemptKey, now) {
  database.prepare("DELETE FROM attempts WHERE attempt_key = ? AND expires_at <= ?").run(attemptKey, now);
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
  commitAttempt,
  desktopDatabasePath,
  getDesktopSchemaVersion,
  getDesktopSessionMetadata,
  getDesktopSetting,
  getOrCreateDesktopSecret,
  getTrainingRecordSnapshot,
  loadAttempt,
  registerAttempt,
  resumeAttempt,
  saveTrainingRecordSnapshot,
  setDesktopSetting,
  upsertDesktopSessionMetadata,
  validateCurrentAttempt
};
