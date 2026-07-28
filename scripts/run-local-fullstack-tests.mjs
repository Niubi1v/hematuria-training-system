import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(repoRoot, "docker-compose.local.yml");

function run(command, args, stdio = "inherit") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      stdio,
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(Number(code ?? 1)));
  });
}

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [
    path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js"),
    "test",
    "--config=playwright.local-fullstack.config.mjs"
  ]);
} finally {
  const cleanupCode = await run("docker", ["compose", "-f", composeFile, "down"], "ignore");
  if (exitCode === 0 && cleanupCode !== 0) {
    console.error("Local full stack test cleanup failed.");
    exitCode = cleanupCode;
  }
}

process.exitCode = exitCode;
