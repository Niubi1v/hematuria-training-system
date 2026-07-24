import assert from "node:assert/strict";

const pagesOrigin = "https://niubi1v.github.io";
process.env.TRAINING_API_ALLOWED_ORIGINS = pagesOrigin;
process.env.AGENT_API_ALLOWED_ORIGINS = pagesOrigin;

const trainingHandler = require("../api/training-action.js");
const agentHandler = require("../api/agent-chat.js");
const sessionHandler = require("../api/session/init.js");

async function call(handler: (req: unknown, res: unknown) => unknown, origin: string, host = "") {
  let statusCode = 200;
  let ended = false;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const requestHeaders: Record<string, string> = {
    origin,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type,x-request-id,x-training-state,x-idempotency-key"
  };
  if (host) {
    requestHeaders.host = host;
    requestHeaders["x-forwarded-host"] = host;
    requestHeaders["x-forwarded-proto"] = "https";
  }
  await handler({ method: "OPTIONS", headers: requestHeaders, socket: { remoteAddress: "teacher-cors-test" } }, {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = String(value); },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { ended = true; return this; }
  });
  return { statusCode, ended, payload, headers };
}

function assertCorsHeaders(result: Awaited<ReturnType<typeof call>>, label: string, expectedOrigin: string) {
  assert.equal(result.statusCode, 204, `${label} preflight must succeed`);
  assert.equal(result.ended, true);
  assert.equal(result.headers["access-control-allow-origin"], expectedOrigin);
  assert.notEqual(result.headers["access-control-allow-origin"], "*");
  assert.match(result.headers["access-control-allow-methods"], /POST/);
  for (const header of ["Content-Type", "X-Request-Id", "X-Training-State", "X-Idempotency-Key"]) {
    assert.match(result.headers["access-control-allow-headers"], new RegExp(header, "i"), `${label} must allow ${header}`);
  }
}

async function main() {
  const training = await call(trainingHandler, pagesOrigin);
  assertCorsHeaders(training, "training-action", pagesOrigin);
  assert.match(training.headers["access-control-expose-headers"], /X-Training-State/i);
  assert.match(training.headers["access-control-expose-headers"], /Server-Timing/i);

  assertCorsHeaders(await call(agentHandler, pagesOrigin), "agent-chat", pagesOrigin);
  assertCorsHeaders(await call(sessionHandler, pagesOrigin), "session-init", pagesOrigin);

  const previewOrigin = "https://teacher-preview.example";
  assertCorsHeaders(await call(trainingHandler, previewOrigin, "teacher-preview.example"), "same-origin preview training-action", previewOrigin);
  assertCorsHeaders(await call(agentHandler, previewOrigin, "teacher-preview.example"), "same-origin preview agent-chat", previewOrigin);

  const denied = await call(trainingHandler, "https://evil.example");
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
  assert.notEqual(denied.headers["access-control-allow-origin"], "*");

  console.log("Teacher GitHub Pages and same-origin Preview CORS preflight contracts passed, including X-Request-Id without wildcard origins.");
}

void main();
