import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDesktopSidecar } from "../tests/desktop/desktop-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-effective-model-mode-"));

function seedMode(dataDirectory, mode) {
  const script = [
    "const store=require('./server/desktopSqliteStore.js');",
    `store.setDesktopSetting('localAi.modelMode', ${JSON.stringify(mode)});`,
    "store.closeDesktopSqliteStore();"
  ].join("");
  const result = spawnSync(process.execPath, ["--no-warnings", "-e", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HEMATURIA_DESKTOP_DATA_DIR: dataDirectory,
      HEMATURIA_DESKTOP_DATABASE_PATH: path.join(dataDirectory, "hematuria.sqlite3"),
      HEMATURIA_PRODUCT_HEAD: process.env.HEMATURIA_PRODUCT_HEAD || "a22415554c18f5a7593a846425dc2259aac5ab61"
    },
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, String(result.stderr || result.stdout));
}

async function settingsFor(name, configuredMode, environment) {
  const dataDirectory = path.join(scratch, name);
  await fs.mkdir(dataDirectory, { recursive: true });
  if (configuredMode) seedMode(dataDirectory, configuredMode);
  const sidecar = await startDesktopSidecar({
    allowedOrigin: `http://127.0.0.1:${47000 + name.length}`,
    dataDirectory,
    environment
  });
  try {
    const response = await fetch(`${sidecar.origin}/api/desktop/settings`, {
      headers: { "X-Hematuria-Desktop-Token": sidecar.runtime.authToken }
    });
    assert.equal(response.status, 200);
    return await response.json();
  } finally {
    await sidecar.stop({ removeData: false });
  }
}

const lightweightPath = path.join(scratch, "Model", manifest.models.lightweight.fileName);
const standardPath = path.join(scratch, "Model", manifest.models.standard.fileName);

try {
  await fs.mkdir(path.dirname(lightweightPath), { recursive: true });
  await fs.writeFile(lightweightPath, "test-lightweight-model");
  const staleStandard = await settingsFor("stale-standard", "standard", {
    HEMATURIA_DESKTOP_TEST_MODE: "1",
    HEMATURIA_DESKTOP_MODEL_MODE: "lightweight",
    HEMATURIA_DESKTOP_MODEL_PATH: lightweightPath
  });
  assert.equal(staleStandard.modelMode, "lightweight", "launcher mode must override a stale SQLite preference");
  assert.equal(staleStandard.modelAlias, "Qwen3-1.7B");
  assert.equal(staleStandard.modelFilePath, lightweightPath);
  assert.equal(staleStandard.configuredMode, "standard");
  assert.equal(staleStandard.effectiveMode, "lightweight");
  assert.equal(staleStandard.effectiveModel, "Qwen3-1.7B");
  assert.equal(staleStandard.overrideSource, "mentor_package");

  const packagedFallback = await settingsFor("packaged-fallback", "standard", {
    HEMATURIA_DESKTOP_TEST_MODE: "1",
    HEMATURIA_DESKTOP_MODEL_PATH: lightweightPath
  });
  assert.equal(packagedFallback.configuredMode, "standard");
  assert.equal(packagedFallback.effectiveMode, "lightweight");
  assert.equal(packagedFallback.effectiveModel, "Qwen3-1.7B");
  assert.equal(packagedFallback.overrideSource, "packaged_model_fallback");

  for (const configuredMode of [undefined, "lightweight"]) {
    const settings = await settingsFor(`lightweight-${configuredMode || "unset"}`, configuredMode, {
      HEMATURIA_DESKTOP_TEST_MODE: "1",
      HEMATURIA_DESKTOP_MODEL_MODE: "lightweight",
      HEMATURIA_DESKTOP_MODEL_PATH: lightweightPath
    });
    assert.equal(settings.effectiveMode, "lightweight");
    assert.equal(settings.effectiveModel, "Qwen3-1.7B");
    assert.equal(settings.modelFilePath, lightweightPath);
  }

  const standard = await settingsFor("standard-no-override", "standard", {
    HEMATURIA_DESKTOP_MODEL_PATH: standardPath
  });
  assert.equal(standard.effectiveMode, "standard");
  assert.equal(standard.effectiveModel, "Qwen3-4B");
  assert.equal(standard.modelPresent, false);

  await assert.rejects(
    settingsFor("invalid-env", "lightweight", {
      HEMATURIA_DESKTOP_MODEL_MODE: "invalid-mode",
      HEMATURIA_DESKTOP_MODEL_PATH: lightweightPath
    }),
    /desktop_model_mode_invalid/
  );

  console.log("R5-MENTOR-EFFECTIVE-MODEL-MODE passed: 6/6");
} finally {
  await fs.rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
