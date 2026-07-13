import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repositoryRoot = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-idempotency-"));
const worktree = path.join(temporaryRoot, "repository");

function run(command: string, args: string[], cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, CASE_LIBRARY_BUILD_ID: "deterministic" } });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout || ""}\n${result.stderr || ""}`);
  }
  return String(result.stdout || "");
}

function controlledFiles() {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(path.relative(worktree, absolute).replace(/\\/g, "/"));
    }
  };
  visit(path.join(worktree, "data"));
  if (fs.existsSync(path.join(worktree, "CASE_DATA_QC_REPORT.md"))) files.push("CASE_DATA_QC_REPORT.md");
  return files.sort();
}

function hashes(files: string[]) {
  return Object.fromEntries(files.map((file) => [file, createHash("sha256").update(fs.readFileSync(path.join(worktree, file))).digest("hex")]));
}

function conversionSteps() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(worktree, "package.json"), "utf8"));
  const script = String(packageJson.scripts?.["convert:excel"] || "");
  const steps = script.split(/\s+&&\s+/).map((step) => step.trim()).filter(Boolean);
  if (!steps.length || steps.some((step) => !step.startsWith("tsx "))) throw new Error("convert:excel must contain explicit tsx steps");
  return steps.map((step) => step.split(/\s+/).slice(1));
}

function convert() {
  const tsxCli = path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  for (const args of conversionSteps()) run(process.execPath, [tsxCli, ...args], worktree);
}

function changed(before: Record<string, string>, after: Record<string, string>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((file) => before[file] !== after[file]).sort();
}

try {
  const callerChanges = run("git", ["status", "--porcelain", "--untracked-files=all"]).trim();
  if (callerChanges) {
    throw new Error(`Conversion idempotency validates the committed HEAD only; commit or isolate the candidate before running it:\n${callerChanges}`);
  }

  run("git", ["worktree", "add", "--detach", worktree, "HEAD"]);
  const nodeModulesTarget = path.join(repositoryRoot, "node_modules");
  const nodeModulesLink = path.join(worktree, "node_modules");
  fs.symlinkSync(nodeModulesTarget, nodeModulesLink, process.platform === "win32" ? "junction" : "dir");

  const baselineFiles = controlledFiles();
  const baseline = hashes(baselineFiles);
  convert();
  const firstFiles = controlledFiles();
  const first = hashes(firstFiles);
  const baselineDrift = changed(baseline, first);
  if (baselineDrift.length) throw new Error(`Committed generated baseline is stale: ${baselineDrift.join(", ")}`);

  convert();
  const secondFiles = controlledFiles();
  const second = hashes(secondFiles);
  const repeatedDrift = changed(first, second);
  if (repeatedDrift.length) throw new Error(`Conversion is not idempotent: ${repeatedDrift.join(", ")}`);

  const worktreeChanges = run("git", ["status", "--porcelain", "--untracked-files=all", "--", "data", "CASE_DATA_QC_REPORT.md"], worktree).trim();
  if (worktreeChanges) throw new Error(`Conversion left generated changes despite matching hash set:\n${worktreeChanges}`);
  console.log(`Conversion baseline and second-run idempotency passed for ${baselineFiles.length} controlled outputs in an isolated worktree.`);
} finally {
  if (fs.existsSync(worktree)) spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: repositoryRoot, encoding: "utf8" });
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
