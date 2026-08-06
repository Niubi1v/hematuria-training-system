import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const sqlite = require("../server/desktopSqliteStore.js");
const compatibility = require("../server/desktopCompatibility.js");
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-sqlite-faults-"));
const validPath = path.join(testDirectory, "valid.sqlite");
const corruptPath = path.join(testDirectory, "corrupt.sqlite");
const originalDatabasePath = process.env.HEMATURIA_DESKTOP_DATABASE_PATH;

try {
  assert.equal(compatibility.classifyRuntimeError(new Error("database schema is locked")), "sqlite_locked_or_corrupt");
  assert.equal(compatibility.classifyRuntimeError({ code: "SQLITE_BUSY", message: "database is locked" }), "sqlite_locked_or_corrupt");
  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = validPath;
  sqlite.setDesktopSetting("fault.sentinel", { kept: true });
  sqlite.closeDesktopSqliteStore();
  const originalBytes = fs.readFileSync(validPath);

  sqlite.getDesktopSchemaVersion();
  const lock = new DatabaseSync(validPath);
  try {
    lock.exec("BEGIN EXCLUSIVE; UPDATE settings SET updated_at = updated_at WHERE key = 'fault.sentinel'");
    let error;
    try {
      sqlite.setDesktopSetting("fault.locked", true);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, "an exclusive SQLite lock must reject the competing write");
    assert.equal(compatibility.classifyRuntimeError(error), "sqlite_locked_or_corrupt");
    assert.deepEqual(fs.readFileSync(validPath), originalBytes, "a locked database must not be replaced");
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
  }
  assert.deepEqual(sqlite.getDesktopSetting("fault.sentinel"), { kept: true });
  sqlite.setDesktopSetting("fault.recovered", true);
  sqlite.closeDesktopSqliteStore();

  const corruptBytes = fs.readFileSync(validPath);
  Buffer.from("not a sqlite database").copy(corruptBytes);
  fs.writeFileSync(corruptPath, corruptBytes);
  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = corruptPath;
  let error;
  try {
    sqlite.getDesktopSchemaVersion();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, "a non-SQLite file must be rejected");
  assert.equal(compatibility.classifyRuntimeError(error), "sqlite_locked_or_corrupt");
  assert.deepEqual(fs.readFileSync(corruptPath), corruptBytes, "a corrupt database must not be replaced");

  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = validPath;
  assert.deepEqual(sqlite.getDesktopSetting("fault.sentinel"), { kept: true });
  assert.equal(sqlite.getDesktopSetting("fault.recovered"), true);
  console.log("Desktop SQLite fault tests passed.");
} finally {
  try {
    sqlite.closeDesktopSqliteStore();
  } catch {
    // Best-effort cleanup after a failed assertion.
  }
  if (originalDatabasePath === undefined) delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
  else process.env.HEMATURIA_DESKTOP_DATABASE_PATH = originalDatabasePath;
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
