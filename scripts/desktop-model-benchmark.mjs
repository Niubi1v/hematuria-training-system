import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
const llamaPath = path.join(repoRoot, "desktop-runtime", "llama", manifest.llamaCpp.entryPoint);
const defaultDataDirectory = path.join(
  process.env.LOCALAPPDATA || "",
  "cn.hematuria.training.desktop"
);
const modelPath = process.env.HEMATURIA_DESKTOP_MODEL_PATH
  || path.join(defaultDataDirectory, "models", manifest.model.fileName);

assert.equal((await fs.stat(llamaPath)).isFile(), true, "llama runtime missing");
assert.equal((await fs.stat(modelPath)).size, manifest.model.size, "model size mismatch");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("benchmark_port_unavailable");
  return port;
}

function percentile(values, quantile) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1));
  return ordered[index];
}

async function processPeakBytes(pid) {
  return new Promise((resolve, reject) => {
    const command = spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).PeakWorkingSet64`
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    command.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    command.once("error", reject);
    command.once("exit", (code) => {
      const value = Number(output.trim());
      if (code === 0 && Number.isFinite(value)) resolve(value);
      else reject(new Error("benchmark_peak_memory_unavailable"));
    });
  });
}

const port = await reservePort();
const apiKey = crypto.randomBytes(32).toString("base64url");
const origin = `http://127.0.0.1:${port}`;
const llama = spawn(llamaPath, [
  "--model", modelPath,
  "--alias", "Qwen3-1.7B",
  "--host", "127.0.0.1",
  "--port", String(port),
  "--ctx-size", "4096",
  "--threads", String(Math.max(1, os.availableParallelism() - 1)),
  "--parallel", "1",
  "--jinja",
  "--reasoning", "off",
  "--chat-template-kwargs", "{\"enable_thinking\":false}",
  "--no-webui",
  "--api-key", apiKey
], {
  cwd: path.dirname(llamaPath),
  windowsHide: true,
  stdio: "ignore"
});

const startedAt = performance.now();
try {
  const deadline = Date.now() + 180_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (llama.exitCode !== null) throw new Error("benchmark_llama_exited");
    try {
      const response = await fetch(`${origin}/health`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Model loading is expected to take several seconds on CPU.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("benchmark_llama_startup_timeout");
  const loadMs = Math.round(performance.now() - startedAt);

  Object.assign(process.env, {
    NODE_ENV: "test",
    TRAINING_STATE_SECRET: "desktop-model-benchmark-training-secret-2026",
    TRAINING_ATTEMPT_STORE_MODE: "memory",
    LLM_PROVIDER: "local",
    LLM_API_BASE_URL: `${origin}/v1`,
    LLM_API_KEY: apiKey,
    LLM_MODEL: "Qwen3-1.7B",
    LLM_ENDPOINT_TYPE: "chat_completions",
    LLM_STREAMING_ENABLED: "false",
    LLM_ENABLE_AI_PATIENT: "true",
    PATIENT_SEMANTIC_CLASSIFIER_ENABLED: "true",
    LLM_THINKING_MODE: "disabled",
    PATIENT_LOCAL_TIMEOUT_MS: "90000"
  });

  const { generatePatientAnswer, initSession } = require("../server/patientSession.js");
  const { resetPatientIntentClassifierState } = require("../server/patientIntentClassifier.js");
  const questionSets = [
    {
      caseId: "P001",
      language: "zh",
      questions: ["哪里不舒服？", "多久了？", "有没有其他疾病？", "高血压吃什么药？", "怎么吃？"]
    },
    {
      caseId: "P001",
      language: "en",
      questions: [
        "What brings you in?",
        "How long has it been going on?",
        "Do you have any other diseases?",
        "What medicine do you take for high blood pressure?",
        "How do you take it?"
      ]
    }
  ];
  const timings = [];
  const sources = {};
  const fallbackReasons = {};
  const rounds = process.argv.includes("--quick") ? 1 : 2;
  for (let round = 0; round < rounds; round += 1) {
    for (const set of questionSets) {
      resetPatientIntentClassifierState();
      const session = await initSession({
        caseId: set.caseId,
        attemptId: `benchmark-${set.language}-${round}-${Date.now()}`,
        mode: "free",
        capabilityMode: "public-practice",
        language: set.language
      });
      const conversationHistory = [];
      for (const question of set.questions) {
        const turnStarted = performance.now();
        const answer = await generatePatientAnswer({
          sessionId: session.sessionId,
          caseId: set.caseId,
          studentInput: question,
          conversationHistory,
          language: set.language
        });
        timings.push(Math.round(performance.now() - turnStarted));
        const source = `${answer.runtimeTrace?.generationSource || "unknown"}/${answer.runtimeTrace?.classificationSource || "none"}/${answer.runtimeTrace?.classifierStatus || "unknown"}`;
        sources[source] = (sources[source] || 0) + 1;
        const fallbackReason = String(answer.runtimeTrace?.fallbackReason || "none");
        fallbackReasons[fallbackReason] = (fallbackReasons[fallbackReason] || 0) + 1;
        assert.ok(String(answer.replyText || "").trim(), "Patient answer must be non-empty");
        conversationHistory.push({ role: "student", text: question }, { role: "patient", text: answer.replyText });
      }
    }
  }
  const peakWorkingSetBytes = await processPeakBytes(llama.pid);
  const result = {
    model: manifest.model.fileName,
    modelBytes: manifest.model.size,
    thinkingMode: "disabled",
    loadMs,
    turns: timings.length,
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    minMs: Math.min(...timings),
    maxMs: Math.max(...timings),
    peakWorkingSetBytes,
    sources,
    fallbackReasons
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (llama.exitCode === null) {
    llama.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      llama.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (llama.exitCode === null) llama.kill("SIGKILL");
}
