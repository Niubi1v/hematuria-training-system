import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// This adapter is QA-only and must fail closed even when the parent shell has
// provider credentials or AI feature flags enabled.
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.AGENT_API_ALLOWED_ORIGINS = "http://127.0.0.1:3010,http://localhost:3010";
globalThis.fetch = async () => {
  throw new Error("QA local API forbids outbound fetch");
};

const routes = new Map([
  ["/api/health/", require("../../api/health.js")],
  ["/api/session/init/", require("../../api/session/init.js")],
  ["/api/agent-chat/", require("../../api/agent-chat.js")]
]);

const port = Number(process.env.QA_LOCAL_API_PORT || 3001);
const host = process.env.QA_LOCAL_API_HOST || "127.0.0.1";

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

function adapterResponse(response) {
  let statusCode = 200;
  return {
    setHeader(name, value) { response.setHeader(name, value); return this; },
    getHeader(name) { return response.getHeader(name); },
    status(code) { statusCode = code; response.statusCode = code; return this; },
    json(value) {
      if (response.writableEnded) return this;
      response.statusCode = statusCode;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(value));
      return this;
    },
    end(value) {
      if (response.writableEnded) return this;
      response.statusCode = statusCode;
      response.end(value);
      return this;
    }
  };
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
    await handler({
      method: request.method,
      headers: request.headers,
      body,
      socket: request.socket
    }, adapterResponse(response));
    if (!response.writableEnded) response.end();
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
