import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineHead = "99c206e1036472a562ee84ca26e762b9c09027a7";
const targetBranch = "codex/hematuria-desktop-r5-quality-hardening";
const frozenHeads = [
  "fa1d5d05731163697eda0be8efa47c48a673a8cf",
  "19c1278e76bf25a933c5f0d06bef83255ee2bfd0",
  "21b4f6229fa4d871ffb6954f63193084169d9866",
  baselineHead
];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const git = process.platform === "win32" ? "git.exe" : "git";
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor !== 22 || nodeMinor < 14) throw new Error(`R5 gates require Node >=22.14 <23; received ${process.versions.node}`);

function command(bin, ...args) {
  return { bin, args, desktopEnv: false };
}

function desktopCommand(bin, ...args) {
  return { bin, args, desktopEnv: true };
}

const fast = [
  command(process.execPath, "scripts/test-r5-regression-corpus.mjs"),
  command(pnpm, "run", "test:desktop:health-probe"),
  command(pnpm, "run", "test:r5:state-model"),
  command(pnpm, "run", "test:attempts"),
  command(pnpm, "run", "test:evidence-graph"),
  command(pnpm, "run", "test:ui-clinical-stage3"),
  command(pnpm, "run", "test:case-order-applicability"),
  command(pnpm, "run", "test:human-approved-medical-results"),
  command(pnpm, "run", "test:stage2:persistence"),
  command(pnpm, "run", "test:order-result-student-presentation"),
  command(pnpm, "run", "test:desktop:effective-model-mode"),
  command(pnpm, "run", "test:desktop:state-authority"),
  command(process.execPath, "scripts/test-desktop-sqlite-faults.mjs"),
  command(pnpm, "run", "test:training-security"),
  command(pnpm, "run", "test:desktop:student-score-projection"),
  command(pnpm, "run", "test:data-agent-authority"),
  command(pnpm, "run", "test:bilingual-conflict-quarantine"),
  command(pnpm, "run", "test:patient-spoken-language-realism"),
  command(pnpm, "run", "test:patient-semantic-coverage"),
  command(pnpm, "run", "test:patient-knowledge-grounding"),
  command(pnpm, "run", "test:patient-knowable-allowlist"),
  command(pnpm, "run", "test:patient-adversarial-corpus"),
  command(pnpm, "run", "test:desktop:install-identity"),
  command(pnpm, "run", "typecheck"),
  command(pnpm, "run", "lint")
];
const milestone = [
  ...fast,
  command(pnpm, "run", "test:stage2:all-orders"),
  command(pnpm, "run", "test:r5:state-model", "--", "--runs", "200", "--steps", "50", "--integration"),
  command(pnpm, "run", "test"),
  command(process.execPath, "scripts/run-r5-playwright.mjs", "--workers=4", "--retries=0"),
  desktopCommand(pnpm, "run", "desktop:prepare"),
  desktopCommand(pnpm, "run", "build"),
  command(pnpm, "run", "test:bundle"),
  command(pnpm, "run", "test:secrets"),
  command(pnpm, "run", "test:desktop:public-boundary"),
  desktopCommand(pnpm, "run", "desktop:stage"),
  command(pnpm, "run", "test:desktop:lifecycle"),
  command(pnpm, "run", "test:desktop:packaged-sidecar"),
  command(pnpm, "run", "test:desktop:runtime-evidence"),
  command(pnpm, "run", "test:desktop:r5-compatibility"),
  command(pnpm, "run", "test:desktop:acceptance"),
  command(pnpm, "run", "test:desktop:renderer-contract"),
  command("cargo", "check", "--manifest-path", "src-tauri/Cargo.toml"),
  command("cargo", "test", "--manifest-path", "src-tauri/Cargo.toml", "--lib"),
  desktopCommand(pnpm, "exec", "tauri", "build", "--bundles", "nsis"),
  desktopCommand("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/desktop-package-portable.ps1"),
  desktopCommand(process.execPath, "scripts/desktop-write-artifact-manifest.mjs"),
  desktopCommand(process.execPath, "scripts/scan-desktop-package.mjs", "--require-artifacts"),
  desktopCommand(process.execPath, "scripts/test-desktop-tauri-smoke.mjs", "--surface", "no-bundle"),
  desktopCommand(process.execPath, "scripts/test-desktop-package-differential.mjs", "--require-packages"),
  desktopCommand(process.execPath, "scripts/test-desktop-fault-injection.mjs"),
  command(git, "diff", "--quiet", baselineHead, "HEAD", "--", "data")
];
function parseArguments(argv) {
  const options = { level: argv[0], dryRun: false, allowPackage: false, preflightOnly: false };
  if (!new Set(["fast", "milestone", "candidate"]).has(options.level)) {
    throw new Error("usage: node scripts/run-r5-gate.mjs <fast|milestone|candidate> [--seed VALUE] [--product-head SHA] [--dry-run] [--preflight-only] [--allow-package]");
  }
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--allow-package") options.allowPackage = true;
    else if (argument === "--preflight-only") options.preflightOnly = true;
    else if (argument === "--seed" || argument === "--product-head") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument === "--seed" ? "seed" : "productHead"] = value;
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.allowPackage && options.level !== "candidate") throw new Error("--allow-package is only valid for the candidate gate");
  if (options.preflightOnly && options.level !== "candidate") throw new Error("--preflight-only is only valid for the candidate gate");
  if (options.level === "candidate" && !/^[0-9a-f]{40}$/.test(options.productHead || "")) {
    throw new Error("candidate gate requires --product-head with a full lowercase git SHA");
  }
  options.seed ||= options.level === "candidate" ? options.productHead : `${baselineHead.slice(0, 7)}-r5-${options.level}`;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(options.seed)) throw new Error("seed must be 1-128 safe replay characters");
  return options;
}

function run(bin, args, { capture = false, allowFailure = false, env = process.env } = {}) {
  let executable = bin;
  let executableArgs = args;
  let npmExecPath = String(process.env.npm_execpath || "");
  if (path.basename(npmExecPath).toLowerCase() === "pnpm.cjs") {
    const pnpmModule = path.resolve(path.dirname(npmExecPath), "..", "dist", "pnpm.mjs");
    if (existsSync(pnpmModule)) npmExecPath = pnpmModule;
  }
  if (bin === pnpm && npmExecPath && existsSync(npmExecPath)) {
    executable = process.execPath;
    executableArgs = [npmExecPath, ...args];
  }
  const result = spawnSync(executable, executableArgs, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? `: ${(result.stderr || result.stdout || "").trim()}` : "";
    const safeBin = path.isAbsolute(executable) ? path.basename(executable) : executable;
    throw new Error(`${safeBin} ${args.join(" ")} failed with exit ${result.status}${detail}`);
  }
  return result;
}

function gitText(...args) {
  return run(git, args, { capture: true }).stdout.trim();
}

function candidatePreflight(productHead) {
  const actualHead = gitText("rev-parse", "HEAD");
  if (actualHead !== productHead) throw new Error(`candidate product HEAD mismatch: expected ${productHead}, actual ${actualHead}`);
  const branch = gitText("branch", "--show-current");
  if (branch !== targetBranch) throw new Error(`candidate must run on ${targetBranch}; actual branch is ${branch || "detached"}`);
  for (const head of frozenHeads) gitText("cat-file", "-e", `${head}^{commit}`);
  run(git, ["merge-base", "--is-ancestor", baselineHead, productHead], { capture: true });
  run(git, ["diff", "--quiet", baselineHead, productHead, "--", "data"], { capture: true });
  const currentConfig = JSON.parse(gitText("show", `${productHead}:src-tauri/tauri.conf.json`));
  const r4Config = JSON.parse(gitText("show", `${frozenHeads[0]}:src-tauri/tauri.conf.json`));
  const identity = (config) => ({
    productName: config.productName,
    identifier: config.identifier,
    version: config.version,
    installMode: config.bundle?.windows?.nsis?.installMode
  });
  const currentIdentity = identity(currentConfig);
  const r4Identity = identity(r4Config);
  const matchingIdentityFields = Object.keys(r4Identity).filter((key) => currentIdentity[key] === r4Identity[key]);
  if (currentIdentity.productName === r4Identity.productName || currentIdentity.identifier === r4Identity.identifier) {
    throw new Error(`R4/R5 NSIS identity is not isolated before packaging; matching fields: ${matchingIdentityFields.join(", ")}`);
  }
  const status = gitText("status", "--porcelain", "--untracked-files=all");
  if (status) throw new Error("candidate requires a clean worktree");
  return {
    actualHead,
    branch,
    baselineHead,
    frozenHeadsVerified: frozenHeads.length,
    dataChanged: false,
    r4Identity,
    currentIdentity,
    matchingIdentityFields
  };
}

function printable(step) {
  const safeBin = path.isAbsolute(step.bin) ? path.basename(step.bin) : step.bin;
  return [safeBin, ...step.args].join(" ");
}

function redact(message) {
  let safe = String(message).replaceAll(repoRoot, "<repo>");
  for (const privateRoot of [process.env.USERPROFILE, process.env.HOME].filter(Boolean)) {
    safe = safe.replaceAll(privateRoot, "<user-home>");
  }
  return safe;
}

async function writeReport(report) {
  const directory = path.join(repoRoot, "test-results", "r5-gates");
  await fs.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(directory, `${report.level}-${timestamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return path.relative(repoRoot, reportPath).replaceAll(path.sep, "/");
}

let options;
let report;
try {
  options = parseArguments(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const plan = options.level === "fast" ? fast : milestone;
  report = {
    schemaVersion: 1,
    level: options.level,
    seed: options.seed,
    productHead: options.productHead || gitText("rev-parse", "HEAD"),
    startedAt,
    finishedAt: null,
    status: "running",
    completedCommands: [],
    plannedCommands: plan.map(printable),
    candidatePreflight: null
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ ...report, status: "dry_run" }, null, 2));
    process.exitCode = 0;
  } else {
    if (options.level === "candidate") {
      report.candidatePreflight = candidatePreflight(options.productHead);
      if (options.preflightOnly) {
        report.status = "preflight_passed";
      } else if (!options.allowPackage) {
        throw new Error("candidate packaging is fail-closed; rerun with --allow-package only after Portable/NSIS, real-model, and external-evidence gates are ready");
      } else {
        throw new Error("candidate packaged-surface automation is not implemented; no package was created");
      }
    }

    if (report.status === "running") {
      const executionPlan = options.level === "fast" ? fast : milestone;
      const commonEnv = {
        ...process.env,
        ...(options.level === "milestone" ? { CI: "true" } : {}),
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`,
        R5_TEST_SEED: options.seed,
        HEMATURIA_PRODUCT_HEAD: report.productHead
      };
      if (options.level === "milestone") {
        commonEnv.HEMATURIA_DESKTOP_ARTIFACTS = path.join(repoRoot, ".desktop-cache", "phase3-artifacts");
      }
      const desktopEnv = {
        NEXT_PUBLIC_RUNTIME_TARGET: "desktop",
        NEXT_PUBLIC_API_BASE_URL: "",
        NEXT_PUBLIC_GIT_SHA: report.productHead
      };
      for (const step of executionPlan) {
        console.log(`\n[r5:${options.level}] ${printable(step)}`);
        run(step.bin, step.args, { env: step.desktopEnv ? { ...commonEnv, ...desktopEnv } : commonEnv });
        report.completedCommands.push(printable(step));
      }
      report.status = "passed";
    }
    report.finishedAt = new Date().toISOString();
    const location = await writeReport(report);
    console.log(`R5 ${options.level} gate ${report.status}; report: ${location}`);
  }
} catch (error) {
  const errorMessage = redact(error instanceof Error ? error.message : String(error));
  if (report) {
    report.status = "failed";
    report.finishedAt = new Date().toISOString();
    report.error = errorMessage;
    try {
      const location = await writeReport(report);
      console.error(`R5 ${report.level} gate failed; report: ${location}`);
    } catch {}
  }
  console.error(errorMessage);
  process.exitCode = 1;
}
