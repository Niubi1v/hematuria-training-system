import http from "node:http";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// This adapter is QA-only and must fail closed even when the parent shell has
// provider credentials or AI feature flags enabled.
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.AGENT_API_ALLOWED_ORIGINS = "http://127.0.0.1:3010,http://localhost:3010";
process.env.TRAINING_API_ALLOWED_ORIGINS = "http://127.0.0.1:3010,http://localhost:3010";
process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
globalThis.fetch = async () => {
  throw new Error("QA local API forbids outbound fetch");
};

const routes = new Map([
  ["/api/health/", require("../../api/health.js")],
  ["/api/training-action/", require("../../api/training-action.js")],
  ["/api/session/init/", require("../../api/session/init.js")],
  ["/api/agent-chat/", require("../../api/agent-chat.js")]
]);

const port = Number(process.env.QA_LOCAL_API_PORT || 3001);
const host = process.env.QA_LOCAL_API_HOST || "127.0.0.1";
const REDACTED_TRAINING_STATE = "qa-redacted-training-state";
const attemptTokens = new Map();
const sessionCapabilities = new Map();
let sessionSequence = 0;

function readBody(request) {
  if (request.method === "GET" || request.method === "OPTIONS") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 2_000_000) {
        reject(new Error("request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch { reject(new Error("invalid_json")); }
    });
    request.on("error", reject);
  });
}

function captureResponse() {
  let statusCode = 200;
  let body;
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); return this; },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { statusCode = code; return this; },
    json(value) {
      body = value;
      headers.set("content-type", "application/json; charset=utf-8");
      return this;
    },
    end(value) {
      body = value;
      return this;
    },
    result() { return { statusCode, headers, body }; }
  };
}

function sendCaptured(response, captured) {
  response.statusCode = captured.statusCode;
  for (const [name, value] of captured.headers) response.setHeader(name, value);
  if (captured.body === undefined) return response.end();
  const contentType = String(captured.headers.get("content-type") || "");
  const value = contentType.includes("application/json") && typeof captured.body !== "string"
    ? JSON.stringify(captured.body)
    : captured.body;
  return response.end(value);
}

function internalHeaders(request, body, normalizedPath) {
  const headers = { ...request.headers };
  if (normalizedPath === "/api/training-action/" || normalizedPath === "/api/session/init/") {
    const token = attemptTokens.get(String(body?.attemptId || ""));
    if (token) headers["x-training-state"] = token;
  }
  return headers;
}

function redactHandlerResult(normalizedPath, body, captured) {
  if (normalizedPath === "/api/training-action/") {
    const token = captured.headers.get("x-training-state");
    if (token && body?.attemptId) attemptTokens.set(String(body.attemptId), String(token));
    if (token) captured.headers.set("x-training-state", REDACTED_TRAINING_STATE);
  }
  if (normalizedPath === "/api/session/init/" && captured.body?.sessionId) {
    const safeSessionId = `qa-redacted-session-${++sessionSequence}`;
    sessionCapabilities.set(safeSessionId, String(captured.body.sessionId));
    captured.body = { ...captured.body, sessionId: safeSessionId };
  }
  return captured;
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const handler = routes.get(normalizedPath);
  if (!handler) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const body = await readBody(request);
    const internalBody = normalizedPath === "/api/agent-chat/" && sessionCapabilities.has(String(body?.sessionId || ""))
      ? { ...body, sessionId: sessionCapabilities.get(String(body.sessionId)) }
      : body;
    const capture = captureResponse();
    await handler({
      method: request.method,
      headers: internalHeaders(request, body, normalizedPath),
      body: internalBody,
      socket: request.socket
    }, capture);
    sendCaptured(response, redactHandlerResult(normalizedPath, body, capture.result()));
  } catch {
    if (!response.writableEnded) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "invalid_request" }));
    }
  }
});

server.listen(port, host, () => {
  console.log(`QA local API listening at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
