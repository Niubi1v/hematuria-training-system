import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.HEMATURIA_FULLSTACK_HOST || "127.0.0.1";
const port = Number(process.env.HEMATURIA_FULLSTACK_PORT || 3000);
const publicOrigin = `http://${host}:${port}`;
const composeFile = path.join(repoRoot, "docker-compose.local.yml");
const pidFile = path.join(repoRoot, "work", "dev-fullstack.pid");
const redisToken = crypto.randomBytes(32).toString("base64url");
const trainingSecret = crypto.randomBytes(48).toString("base64url");
const composeEnvironment = { ...process.env };
let server;
let redisRestServer;
let shuttingDown = false;
const openSockets = new Set();

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env || process.env,
      shell: false,
      stdio: options.stdio || "inherit",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function waitForRedis() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:8079", {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok && (await response.json()).result === "PONG") return;
    } catch {
      // The container may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("local_redis_http_start_timeout");
}

function encodeRedisCommand(command) {
  const parts = command.map((value) => Buffer.from(String(value), "utf8"));
  const chunks = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    chunks.push(Buffer.from(`$${part.length}\r\n`), part, Buffer.from("\r\n"));
  }
  return Buffer.concat(chunks);
}

function parseRedisResponse(buffer, offset = 0) {
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const line = buffer.subarray(offset + 1, lineEnd).toString("utf8");
  if (prefix === "+" || prefix === "-" || prefix === ":") {
    const value = prefix === ":" ? Number(line) : line;
    return { value, error: prefix === "-", nextOffset: lineEnd + 2 };
  }
  if (prefix === "$") {
    const length = Number(line);
    if (length === -1) return { value: null, error: false, nextOffset: lineEnd + 2 };
    const start = lineEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.subarray(start, end).toString("utf8"), error: false, nextOffset: end + 2 };
  }
  if (prefix === "*") {
    const count = Number(line);
    if (count === -1) return { value: null, error: false, nextOffset: lineEnd + 2 };
    const values = [];
    let cursor = lineEnd + 2;
    for (let index = 0; index < count; index += 1) {
      const item = parseRedisResponse(buffer, cursor);
      if (!item) return null;
      if (item.error) return item;
      values.push(item.value);
      cursor = item.nextOffset;
    }
    return { value: values, error: false, nextOffset: cursor };
  }
  return { value: "unsupported_redis_response", error: true, nextOffset: buffer.length };
}

function executeRedisCommand(command) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 6379 });
    let received = Buffer.alloc(0);
    const timeout = setTimeout(() => socket.destroy(new Error("redis_timeout")), 3000);
    socket.once("connect", () => socket.write(encodeRedisCommand(command)));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      const parsed = parseRedisResponse(received);
      if (!parsed) return;
      clearTimeout(timeout);
      socket.end();
      if (parsed.error) reject(new Error("redis_command_failed"));
      else resolve(parsed.value);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function startRedisRestAdapter() {
  redisRestServer = http.createServer(async (req, res) => {
    try {
      const authorization = String(req.headers.authorization || "");
      const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
      const expected = Buffer.from(redisToken);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "unauthorized" }));
      }
      const body = await readRequestBody(req);
      if (req.method !== "POST" || !Array.isArray(body) || body.length === 0) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "invalid_command" }));
      }
      const result = await executeRedisCommand(body);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ result }));
    } catch {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "redis_unavailable" }));
    }
  });
  await new Promise((resolve, reject) => {
    redisRestServer.once("error", reject);
    redisRestServer.listen(8079, "127.0.0.1", resolve);
  });
}

function installLocalEnvironment() {
  Object.assign(process.env, {
    NODE_ENV: "development",
    TRAINING_STATE_SECRET: trainingSecret,
    TRAINING_ATTEMPT_STORE_MODE: "upstash",
    UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079",
    UPSTASH_REDIS_REST_TOKEN: redisToken,
    TRAINING_API_ALLOWED_ORIGINS: publicOrigin,
    AGENT_API_ALLOWED_ORIGINS: publicOrigin,
    AGENT_API_ALLOWED_ORIGIN: publicOrigin,
    PATIENT_AGENT_ALLOWED_ORIGIN: publicOrigin,
    TTS_ALLOWED_ORIGINS: publicOrigin,
    TRAINING_DEPLOYMENT_TIER: "practice",
    NEXT_PUBLIC_GIT_SHA: "local-fullstack",
    NEXT_PUBLIC_API_BASE_URL: "",
    LLM_ENABLE_AI_AGENTS: "false",
    LLM_ENABLE_AI_PATIENT: "false"
  });
}

async function loadHandlers() {
  const entries = {
    "/api/health": "api/health.js",
    "/api/training-action": "api/training-action.js",
    "/api/session/init": "api/session/init.js",
    "/api/session/complete-profile": "api/session/complete-profile.js",
    "/api/agent-chat": "api/agent-chat.js",
    "/api/patient-reply": "api/patient-reply.js",
    "/api/tts": "api/tts.js"
  };
  const handlers = new Map();
  for (const [route, relativePath] of Object.entries(entries)) {
    const imported = await import(pathToFileURL(path.join(repoRoot, relativePath)).href);
    handlers.set(route, imported.default);
  }
  return handlers;
}

async function readRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function decorateResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (Buffer.isBuffer(payload) || typeof payload === "string") res.end(payload);
    else res.json(payload);
    return res;
  };
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const socket of openSockets) socket.destroy();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (redisRestServer) await new Promise((resolve) => redisRestServer.close(resolve));
  try {
    await run("docker", ["compose", "-f", composeFile, "down"], {
      env: composeEnvironment,
      stdio: "ignore"
    });
  } catch {
    // Shutdown remains best-effort; no credential or request details are logged.
  }
  try {
    const record = JSON.parse(await fs.readFile(pidFile, "utf8"));
    if (record.pid === process.pid) await fs.rm(pidFile, { force: true });
  } catch {
    // The PID file may not have been created yet.
  }
  process.exitCode = exitCode;
}

async function stopExistingFullStack() {
  try {
    const record = JSON.parse(await fs.readFile(pidFile, "utf8"));
    const pid = Number(record.pid);
    const recordedOrigin = String(record.origin || "");
    let verifiedLocalServer = false;
    try {
      const health = await fetch(`${recordedOrigin}/api/health/`, { signal: AbortSignal.timeout(2000) }).then((response) => response.json());
      verifiedLocalServer = health.deploymentSha === "local-fullstack";
    } catch {
      // A stale PID file must never authorize terminating an unrelated process.
    }
    if (verifiedLocalServer && Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
      try { process.kill(pid, "SIGTERM"); } catch { /* A stale PID is safe to discard. */ }
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        try {
          process.kill(pid, 0);
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch {
          break;
        }
      }
    }
  } catch {
    // No running local full stack was recorded.
  }
  await run("docker", ["compose", "-f", composeFile, "down"], {
    env: composeEnvironment
  });
  await fs.rm(pidFile, { force: true });
}

async function main() {
  if (process.argv.includes("--stop")) {
    await stopExistingFullStack();
    return;
  }

  await run("docker", ["compose", "-f", composeFile, "up", "-d", "--wait", "--force-recreate"], {
    env: composeEnvironment
  });
  await startRedisRestAdapter();
  await waitForRedis();
  installLocalEnvironment();

  const [{ default: next }, handlers] = await Promise.all([
    import("next"),
    loadHandlers()
  ]);
  const app = next({ dev: true, dir: repoRoot, hostname: host, port });
  await app.prepare();
  const nextHandler = app.getRequestHandler();

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", publicOrigin);
      const apiPath = url.pathname.replace(/\/+$/, "") || "/";
      const handler = handlers.get(apiPath);
      if (!handler) return nextHandler(req, res);

      req.body = await readRequestBody(req);
      req.headers["x-forwarded-host"] = req.headers.host || `${host}:${port}`;
      req.headers["x-forwarded-proto"] = "http";
      decorateResponse(res);
      return await handler(req, res);
    } catch (error) {
      const code = error instanceof Error && error.message === "request_body_too_large"
        ? "request_body_too_large"
        : "local_api_adapter_error";
      if (!res.headersSent) {
        res.statusCode = code === "request_body_too_large" ? 413 : 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify({ error: code }));
    }
  });

  server.on("upgrade", (req, socket, head) => {
    app.getUpgradeHandler()(req, socket, head);
  });
  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.once("close", () => openSockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  await fs.mkdir(path.dirname(pidFile), { recursive: true });
  await fs.writeFile(pidFile, JSON.stringify({ pid: process.pid, origin: publicOrigin }), { encoding: "utf8", flag: "w" });

  const health = await fetch(`${publicOrigin}/api/health/`).then((response) => response.json());
  console.log(`Local full stack ready: ${publicOrigin}`);
  console.log(`Health: status=${health.status}; trainingState=${health.trainingStateConfigured ? "configured" : "unconfigured"}; durableAttemptStore=${health.durableAttemptStoreConfigured ? "configured" : "unconfigured"}; patientAgent=safe_rule_mock`);
  console.log("Stop: Ctrl+C (or run pnpm run dev:full:stop from another terminal).");
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));
process.once("uncaughtException", () => void shutdown(1));
process.once("unhandledRejection", () => void shutdown(1));

main().catch(async (error) => {
  console.error(`Local full stack failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  await shutdown(1);
});
