const http = require("node:http");
const next = require("next");

const port = Number(process.env.PORT || 3000);
const hostname = String(process.env.HOSTNAME || "0.0.0.0");
const maxBodyBytes = Math.min(Math.max(Number(process.env.MAINLAND_MAX_BODY_BYTES || 131072), 1024), 1024 * 1024);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname, port });
const nextHandler = app.getRequestHandler();

const apiRoutes = new Map([
  ["/api/agent-chat", require("../api/agent-chat.js")],
  ["/api/health", require("../api/health.js")],
  ["/api/patient-reply", require("../api/patient-reply.js")],
  ["/api/session/complete-profile", require("../api/session/complete-profile.js")],
  ["/api/session/init", require("../api/session/init.js")],
  ["/api/training-action", require("../api/training-action.js")],
  ["/api/tts", require("../api/tts.js")]
]);

function requestPath(req) {
  try {
    return new URL(req.url || "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function attachResponseHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(payload) {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = function send(payload) {
    res.end(payload);
    return res;
  };
}

async function readBody(req) {
  if (!["POST", "PUT", "PATCH"].includes(String(req.method || "").toUpperCase())) return {};
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json_body");
  }
}

function safeAccessLog(req, res, startedAt) {
  const requestId = String(req.headers["x-request-id"] || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  const event = {
    event: "http_request",
    method: String(req.method || "GET"),
    path: requestPath(req),
    status: res.statusCode,
    durationMs: Date.now() - startedAt,
    ...(requestId ? { requestId } : {})
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

app.prepare().then(() => {
  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    res.on("finish", () => safeAccessLog(req, res, startedAt));
    const path = requestPath(req);
    const apiHandler = apiRoutes.get(path);
    try {
      if (!apiHandler) {
        if (path.startsWith("/api/")) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "not_found" }));
          return;
        }
        await nextHandler(req, res);
        return;
      }
      attachResponseHelpers(res);
      req.body = await readBody(req);
      await apiHandler(req, res);
    } catch (error) {
      if (res.writableEnded) return;
      const code = error instanceof Error ? error.message : "request_failed";
      const status = code === "request_body_too_large" ? 413 : code === "invalid_json_body" ? 400 : 500;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: status === 500 ? "internal_server_error" : code }));
    }
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 35_000;
  server.listen(port, hostname, () => {
    process.stdout.write(`${JSON.stringify({ event: "mainland_server_ready", hostname, port })}\n`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}).catch(() => {
  process.stderr.write(`${JSON.stringify({ event: "mainland_server_start_failed" })}\n`);
  process.exit(1);
});
