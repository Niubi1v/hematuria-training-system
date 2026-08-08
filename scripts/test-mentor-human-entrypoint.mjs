import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("mentor_human_entrypoint_requires_windows");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageIndex = process.argv.indexOf("--package");
const packagePath = path.resolve(packageIndex >= 0 ? String(process.argv[packageIndex + 1] || "") : "");
const variantsIndex = process.argv.indexOf("--variants");
const variantCount = variantsIndex >= 0 ? Number(process.argv[variantsIndex + 1]) : 3;
if (packageIndex < 0) throw new Error("usage: node scripts/test-mentor-human-entrypoint.mjs --package FULL_ZIP");
if (![1, 3].includes(variantCount)) throw new Error("mentor_entrypoint_variants_must_be_1_or_3");
await fs.access(packagePath);
const productHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
const root = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-mentor-entrypoint-"));
const variants = [
  "English",
  "中文 空格",
  path.join("long-path", "mentor-package-segment-1234567890".repeat(3), "full")
];
const results = [];

try {
  for (let index = 0; index < variantCount; index += 1) {
    const extractionRoot = path.join(root, variants[index]);
    if (index === 2) assert.ok(extractionRoot.length >= 170, "mentor_entrypoint_long_path_too_short");
    await fs.mkdir(extractionRoot, { recursive: true });
    const extracted = spawnSync("tar.exe", ["-xf", packagePath, "-C", extractionRoot], { encoding: "utf8", windowsHide: true });
    assert.equal(extracted.status, 0, String(extracted.stderr || extracted.stdout || "mentor_zip_extract_failed"));
    const version = JSON.parse((await fs.readFile(path.join(extractionRoot, "VERSION.json"), "utf8")).replace(/^\uFEFF/u, ""));
    assert.equal(version.productHead, productHead);
    const environment = {
      ...process.env,
      HEMATURIA_MENTOR_PACKAGE_ROOT: extractionRoot,
      HEMATURIA_SURFACE_LABEL: `mentor-full-${index + 1}`,
      HEMATURIA_TAURI_SMOKE_ROOT: path.join(root, `runtime-${index + 1}`),
      HEMATURIA_PRODUCT_HEAD: productHead
    };
    delete environment.HEMATURIA_DESKTOP_MODEL_PATH;
    delete environment.HEMATURIA_DESKTOP_MODEL_MODE;
    delete environment.HEMATURIA_DESKTOP_TEST_MODE;
    delete environment.HEMATURIA_DESKTOP_DISABLE_LOCAL_AI;
    const run = spawnSync(process.execPath, [
      path.join(repoRoot, "scripts", "test-desktop-tauri-smoke.mjs"),
      "--surface", "portable", "--mentor-human-entrypoint"
    ], { cwd: repoRoot, env: environment, encoding: "utf8", windowsHide: true, timeout: 12 * 60_000 });
    assert.equal(run.status, 0, String(run.stderr || run.stdout || "mentor_human_entrypoint_failed"));
    const result = JSON.parse(String(run.stdout || "").trim().split(/\r?\n/u).at(-1));
    assert.equal(result.productHead, productHead);
    assert.equal(result.mentorHumanEntrypoint, true);
    assert.equal(result.realLocalAi, true);
    assert.ok(result.mentorLocalAcceptedCount > 0);
    assert.equal(result.stageTwo.reports, 8);
    assert.equal(result.stageTwo.outcomes, 10);
    assert.equal(result.stageTwo.notPerformed, 2);
    assert.ok(result.stageTwo.evidenceCount >= 2);
    assert.equal(result.cloudRequestCount, 0);
    assert.equal(result.processCleanup, true);
    results.push({ pathVariant: index + 1, ...result });
  }
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

console.log(JSON.stringify({
  status: "passed",
  productHead,
  package: path.basename(packagePath),
  variants: results.map(({ pathVariant, stageTwo, lifecycleCycles, processCleanup, cloudRequestCount, mentorLocalAcceptedCount }) => ({
    pathVariant, stageTwo, lifecycleCycles, processCleanup, cloudRequestCount, mentorLocalAcceptedCount
  }))
}));
