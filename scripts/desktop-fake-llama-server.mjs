import fs from "node:fs/promises";
import http from "node:http";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

const host = argument("--host");
const port = Number(argument("--port"));
const apiKey = argument("--api-key");
const modelAlias = argument("--alias");
if (host !== "127.0.0.1" || !Number.isInteger(port) || port <= 0 || !apiKey || !modelAlias) {
  process.exit(2);
}

if (process.env.HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE) {
  await fs.writeFile(process.env.HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE, String(process.pid), "utf8");
}

const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ status: "ok" }));
  }
  if (req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      object: "list",
      data: [{ id: modelAlias, object: "model", owned_by: "llama.cpp" }]
    }));
  }
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    for await (const chunk of req) {
      // Drain the test request without storing its contents.
      void chunk;
    }
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }]
    }));
  }
  res.statusCode = 404;
  res.end();
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.listen(port, host);
