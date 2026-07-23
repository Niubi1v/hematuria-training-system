import http from "node:http";

const port = Number(process.env.PORT || 8787);
const host = String(process.env.HOSTNAME || "0.0.0.0");
const maxBytes = 128 * 1024;

function safeAnswer(payload) {
  try {
    const userMessage = payload?.messages?.findLast?.((message) => message?.role === "user")?.content || "";
    const promptPayload = JSON.parse(userMessage);
    const allowed = String(promptPayload?.currentAllowedAnswer || "").trim();
    if (allowed) return allowed.slice(0, 160);
  } catch {
    // Never reflect a malformed prompt.
  }
  return "This is a local safe-mock response.";
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return sendJson(res, 200, { status: "ok", mock: true });
  if (req.method !== "POST" || req.url !== "/chat/completions") return sendJson(res, 404, { error: "not_found" });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) return sendJson(res, 413, { error: "request_body_too_large" });
    chunks.push(chunk);
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return sendJson(res, 400, { error: "invalid_json" });
  }
  const content = safeAnswer(payload);
  if (payload.stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  return sendJson(res, 200, {
    id: "mainland-safe-mock",
    choices: [{ message: { role: "assistant", content } }]
  });
}).listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ event: "mainland_safe_llm_mock_ready", host, port, mock: true })}\n`);
});
