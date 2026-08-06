import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSurfaceCheckpoint, comparableOutcome } from "../tests/desktop/surface-checkpoint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requirePackages = process.argv.includes("--require-packages");
const expectedHead = String(process.env.HEMATURIA_PRODUCT_HEAD || "");
assert.match(expectedHead, /^[0-9a-f]{40}$/u, "HEMATURIA_PRODUCT_HEAD must be the full product SHA");
const packageVersion = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")).version;
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-surface-differential-"));
const checkpoints = [];
let nsisUninstaller;

function run(bin, args, env = {}) {
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(bin)} ${args.join(" ")} failed:\n${`${result.stdout || ""}\n${result.stderr || ""}`.trim()}`);
  return result.stdout;
}

async function runRenderer(surface, appRoot = repoRoot) {
  const checkpointPath = path.join(temporaryRoot, `${surface}.json`);
  run(process.execPath, [
    path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js"),
    "test", "--config", "playwright.desktop-contract.config.mjs"
  ], {
    HEMATURIA_DESKTOP_RENDERER_SURFACE: surface,
    HEMATURIA_DESKTOP_CONTRACT_APP_ROOT: appRoot,
    HEMATURIA_SURFACE_CHECKPOINT: checkpointPath
  });
  checkpoints.push(assertSurfaceCheckpoint(JSON.parse(await fs.readFile(checkpointPath, "utf8"))));
}

async function runTauri(surface, label, executable) {
  const checkpointPath = path.join(temporaryRoot, `${label}.json`);
  run(process.execPath, [path.join(repoRoot, "scripts", "test-desktop-tauri-smoke.mjs"), "--surface", surface], {
    HEMATURIA_DESKTOP_TAURI_EXECUTABLE: executable,
    HEMATURIA_SURFACE_LABEL: label,
    HEMATURIA_SURFACE_CHECKPOINT: checkpointPath
  });
  checkpoints.push(assertSurfaceCheckpoint(JSON.parse(await fs.readFile(checkpointPath, "utf8"))));
}

async function extractPortable(archive, relative) {
  const destination = path.join(temporaryRoot, relative);
  await fs.mkdir(destination, { recursive: true });
  run("tar.exe", ["-xf", archive, "-C", destination]);
  const executable = path.join(destination, "HematuriaTraining-R5.exe");
  await fs.access(executable);
  return executable;
}

async function installNsis(installer) {
  const destination = path.join(temporaryRoot, "nsis-installed");
  run(installer, ["/S", `/D=${destination}`]);
  const executable = path.join(destination, "hematuria-training-r5.exe");
  nsisUninstaller = path.join(destination, "uninstall.exe");
  await Promise.all([fs.access(executable), fs.access(nsisUninstaller)]);
  return executable;
}

try {
  await runRenderer("development-renderer");
  await runRenderer("static-renderer");
  await runRenderer("staged-desktop", path.join(repoRoot, "src-tauri", "resources", "app"));
  await runTauri("no-bundle", "no-bundle", path.join(repoRoot, "src-tauri", "target", "release", "hematuria-training-r5.exe"));

  const artifactRoot = process.env.HEMATURIA_DESKTOP_ARTIFACTS;
  const portableArchive = process.env.HEMATURIA_DESKTOP_PORTABLE_ZIP
    || (artifactRoot && path.join(artifactRoot, `hematuria-desktop-r5-portable-${packageVersion}-windows-x64.zip`));
  const nsisInstaller = process.env.HEMATURIA_DESKTOP_NSIS_INSTALLER
    || (artifactRoot && path.join(artifactRoot, `hematuria-desktop-r5-setup-${packageVersion}-windows-x64.exe`));
  if (requirePackages) {
    assert.ok(portableArchive, "HEMATURIA_DESKTOP_PORTABLE_ZIP is required");
    assert.ok(nsisInstaller, "HEMATURIA_DESKTOP_NSIS_INSTALLER is required");
    await fs.access(portableArchive);
    const portableVariants = [
      ["portable-normal", "portable-normal"],
      ["portable-unicode-space", "中文 空格/portable"],
      ["portable-long-path", `${"long-segment/".repeat(10)}portable`]
    ];
    for (const [label, relative] of portableVariants) {
      await runTauri("portable", label, await extractPortable(portableArchive, relative));
    }
    await fs.access(nsisInstaller);
    await runTauri("nsis", "nsis", await installNsis(nsisInstaller));
  }

  const reference = comparableOutcome(checkpoints[0]);
  for (const checkpoint of checkpoints.slice(1)) assert.deepEqual(comparableOutcome(checkpoint), reference, `surface drift: ${checkpoint.surface}`);
  const summary = {
    status: "passed",
    productHead: expectedHead,
    surfaces: checkpoints.map(({ surface, artifactSha, installationMode, attemptCount, snapshotCount, requestCount, serverStateRevision }) => ({
      surface, artifactSha, installationMode, attemptCount, snapshotCount, requestCount, serverStateRevision
    })),
    comparableOutcome: reference,
    portableExecutedFromExtractedDirectories: requirePackages,
    externalR4Coexistence: "BLOCKED_EXTERNAL"
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} finally {
  if (nsisUninstaller) run(nsisUninstaller, ["/S"]);
  await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
