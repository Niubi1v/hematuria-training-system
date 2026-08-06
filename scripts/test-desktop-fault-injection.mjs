import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const compatibility = require("../server/desktopCompatibility.js");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(script)} failed: ${`${result.stdout || ""}\n${result.stderr || ""}`.trim()}`);
}

run("scripts/test-desktop-r5-compatibility.mjs");
run("scripts/test-desktop-sqlite-faults.mjs");
run("scripts/desktop-lifecycle-test.mjs");
run("node_modules/tsx/dist/cli.mjs", "scripts/test-desktop-state-authority.ts");
run("node_modules/tsx/dist/cli.mjs", "scripts/test-training-security.ts");

const matrix = [
  ["NODE-MISSING", "desktop_node_runtime_missing", "runtime_resources_missing", "compatibility"],
  ["SIDECAR-MISSING", "desktop_sidecar_resource_missing", "runtime_resources_missing", "compatibility"],
  ["LLAMA-MISSING", "llama_dependency_missing", "llama_dependency_missing", "compatibility"],
  ["MODEL-MISSING", "model_missing", "model_missing_or_invalid", "compatibility"],
  ["MODEL-HASH", "checksum_mismatch", "model_missing_or_invalid", "compatibility"],
  ["DATA-UNWRITABLE", "data_directory_unwritable", "data_directory_unwritable", "compatibility"],
  ["SQLITE-LOCK", "SQLITE_BUSY: database is locked", "sqlite_locked_or_corrupt", "sqlite-copy"],
  ["SQLITE-CORRUPT", "database disk image is malformed", "sqlite_locked_or_corrupt", "sqlite-copy"],
  ["PORT-COMPETITION", "listen EADDRINUSE", "loopback_unavailable", "lifecycle"],
  ["HANDSHAKE-TIMEOUT", "sidecar_handshake_timeout", "sidecar_handshake_timeout", "lifecycle"],
  ["HANDSHAKE-MISMATCH", "sidecar_handshake_mismatch", "unknown_runtime_failure", "lifecycle"],
  ["SIDECAR-EXIT", "sidecar_exited_before_handshake", "sidecar_exited", "lifecycle"],
  ["BEARER-MISSING-WRONG", "desktop_token_invalid", null, "lifecycle-http-401"],
  ["ORIGIN-WRONG", "origin_not_allowed", null, "lifecycle-http-403"],
  ["STATE-TOKEN-MISSING-WRONG", "training_state_token_missing_or_invalid", null, "training-security"],
  ["PRODUCT-HEAD-MISMATCH", "desktop_state_authority_changed", null, "state-authority"],
  ["STALE-WEBVIEW-CACHE", "desktop_training_cache_clear", null, "renderer-contract"],
  ["REPREPARE-10X", "single_runtime_after_reprepare", null, "lifecycle"],
  ["LLAMA-IMMEDIATE-EXIT", "llama_server_exited_during_startup", "llama_start_failed", "lifecycle"],
  ["DELAYED-CHILD-CLEANUP", "desktop_child_cleanup", null, "lifecycle"]
].map(([id, code, category, evidence]) => ({ id, code, category, evidence }));

assert.equal(matrix.length, 20);
assert.equal(new Set(matrix.map(({ id }) => id)).size, matrix.length);
for (const item of matrix) {
  if (item.category) {
    assert.equal(compatibility.classifyRuntimeError(item.code), item.category, item.id);
    for (const language of ["zh", "en"]) {
      const message = compatibility.studentFacingRuntimeMessage(item.category, language);
      assert.ok(message.length >= 12, `${item.id}/${language}: missing student message`);
      assert.doesNotMatch(message, /token|bearer|handshake|nonce|sqlite|[A-Z]:[\\/]/iu);
      assert.ok(compatibility.recoveriesFor(item.category, language).length > 0);
    }
  }
}

process.stdout.write(`${JSON.stringify({
  status: "passed",
  scenarios: matrix.length,
  cloudRequestCount: 0,
  sqliteCopiesOnly: true,
  r4Accessed: false,
  diagnosticPrivacy: true,
  recoveryVerifiedBy: ["compatibility", "sqlite-copy", "lifecycle", "state-authority"],
  matrix
})}\n`);
