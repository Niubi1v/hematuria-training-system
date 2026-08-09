import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:3000";

function start(args, env = process.env) {
  return spawn(process.execPath, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    windowsHide: true
  });
}

function exitCode(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(Number(code ?? 1)));
  });
}

async function waitForNext(child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next exited before readiness with code ${child.exitCode}`);
    try {
      const responses = await Promise.all(["/", "/cases/P001/"].map((pathname) => fetch(`${origin}${pathname}`, { signal: AbortSignal.timeout(5000) })));
      if (responses.every((response) => response.ok)) return;
    } catch {
      // Next is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next readiness timeout");
}

function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
}

const next = start([
  path.join(repoRoot, "node_modules", "next", "dist", "bin", "next"),
  "dev",
  "-H", "127.0.0.1",
  "-p", "3000"
]);

let result = 1;
try {
  await waitForNext(next);
  const playwright = start([
    path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js"),
    "test",
    ...process.argv.slice(2)
  ], { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: "1", PLAYWRIGHT_BASE_URL: origin });
  result = await exitCode(playwright);
} finally {
  stopTree(next);
}

process.exitCode = result;
