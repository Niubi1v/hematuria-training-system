"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const PROTOCOL_VERSION = 1;
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LLAMA_STARTUP_TIMEOUT_MS = 120_000;
const REQUIRED_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,}$/;
const DEFAULT_MODEL_MODE = "lightweight";
const bearer = String(process.env.HEMATURIA_DESKTOP_BEARER || "");
const handshake = String(process.env.HEMATURIA_DESKTOP_HANDSHAKE || "");
const appRoot = path.resolve(String(process.env.HEMATURIA_APP_ROOT || path.join(__dirname, "..", "..")));
const dataDirectory = path.resolve(String(process.env.HEMATURIA_DESKTOP_DATA_DIR || ""));
const allowedOrigins = new Set(
  String(process.env.HEMATURIA_DESKTOP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

let apiServer = null;
let llamaChild = null;
let sqliteStore = null;
let shuttingDown = false;
let localAiState = { status: "initializing" };
let localAiReconfiguration = Promise.resolve();
let modelModes = null;
let activeModelAlias = "Qwen3-1.7B";
const openSockets = new Set();
const nativeFetch = globalThis.fetch.bind(globalThis);
const networkAudit = {
  loopbackRequestCount: 0,
  cloudRequestCount: 0
};

function fatalConfiguration(message) {
  process.stderr.write(`${JSON.stringify({ event: "desktop_sidecar_configuration_error", code: message })}\n`);
  process.exit(1);
}

if (!REQUIRED_SECRET_PATTERN.test(bearer)) fatalConfiguration("desktop_bearer_invalid");
if (!REQUIRED_SECRET_PATTERN.test(handshake)) fatalConfiguration("desktop_handshake_invalid");
if (!path.isAbsolute(appRoot) || !fs.existsSync(appRoot)) fatalConfiguration("desktop_app_root_invalid");
if (!String(process.env.HEMATURIA_DESKTOP_DATA_DIR || "") || !path.isAbsolute(dataDirectory)) {
  fatalConfiguration("desktop_data_directory_invalid");
}

function loadModelManifest() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "desktop", "runtime-manifest.json"), "utf8"));
  } catch {
    fatalConfiguration("desktop_runtime_manifest_invalid");
  }
  if (
    manifest?.schemaVersion !== 1
    || manifest?.defaultModelMode !== DEFAULT_MODEL_MODE
    || !manifest?.models
    || Object.keys(manifest.models).sort().join(",") !== "lightweight,standard"
  ) {
    fatalConfiguration("desktop_model_manifest_invalid");
  }
  const validated = {};
  for (const [mode, descriptor] of Object.entries(manifest.models)) {
    const fileName = String(descriptor?.fileName || "");
    const alias = String(descriptor?.alias || "");
    const sha256 = String(descriptor?.sha256 || "");
    if (
      path.basename(fileName) !== fileName
      || !fileName.endsWith(".gguf")
      || !/^[A-Za-z0-9._-]{1,80}$/.test(alias)
      || !Number.isSafeInteger(descriptor?.size)
      || descriptor.size <= 0
      || !/^[a-f0-9]{64}$/.test(sha256)
      || descriptor?.bundledInInstaller !== false
      || descriptor?.thinkingMode !== "disabled"
    ) {
      fatalConfiguration(`desktop_model_manifest_${mode}_invalid`);
    }
    validated[mode] = Object.freeze({ fileName, alias, size: descriptor.size, sha256 });
  }
  return Object.freeze(validated);
}

modelModes = loadModelManifest();
activeModelAlias = modelModes[DEFAULT_MODEL_MODE].alias;

function safeLog(event, metadata = {}) {
  const allowed = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (["status", "code", "durationMs", "pid", "port"].includes(key)) allowed[key] = value;
  }
  process.stderr.write(`${JSON.stringify({ event, ...allowed })}\n`);
}

function auditedHttpUrl(input) {
  try {
    const value = input instanceof Request ? input.url : input;
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

globalThis.fetch = async function desktopLoopbackFetch(input, init) {
  const url = auditedHttpUrl(input);
  if (url) {
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (!loopback) {
      networkAudit.cloudRequestCount += 1;
      throw new TypeError("desktop_external_network_blocked");
    }
    networkAudit.loopbackRequestCount += 1;
  }
  return nativeFetch(input, init);
};

function installDesktopEnvironment(trainingSecret) {
  const origins = [...allowedOrigins].join(",");
  Object.assign(process.env, {
    NODE_ENV: "production",
    HEMATURIA_RUNTIME_TARGET: "desktop",
    TRAINING_STATE_SECRET: trainingSecret,
    TRAINING_ATTEMPT_STORE_MODE: "sqlite",
    AGENT_REQUEST_STORE_MODE: "memory",
    LLM_PROVIDER_CIRCUIT_STORE_MODE: "memory",
    TTS_REQUEST_STORE_MODE: "memory",
    TRAINING_API_ALLOWED_ORIGINS: origins,
    AGENT_API_ALLOWED_ORIGINS: origins,
    AGENT_API_ALLOWED_ORIGIN: origins,
    PATIENT_AGENT_ALLOWED_ORIGIN: origins,
    TTS_ALLOWED_ORIGINS: origins,
    TRAINING_DEPLOYMENT_TIER: "practice",
    NEXT_PUBLIC_GIT_SHA: process.env.NEXT_PUBLIC_GIT_SHA || "desktop-local",
    PATIENT_PROMPT_AUDIT_ENABLED: "false"
  });
}

function disableLocalAi() {
  Object.assign(process.env, {
    LLM_PROVIDER: "local",
    LLM_MODEL: activeModelAlias,
    LLM_ENDPOINT_TYPE: "chat_completions",
    LLM_THINKING_MODE: "disabled",
    LLM_ENABLE_AI_AGENTS: "false",
    LLM_ENABLE_AI_PATIENT: "false"
  });
  delete process.env.LLM_API_BASE_URL;
  delete process.env.LLM_API_KEY;
}

function validateModelDirectory(value) {
  const candidate = String(value || "");
  if (!candidate || candidate.length > 2048 || candidate.includes("\0") || !path.isAbsolute(candidate)) {
    throw new Error("desktop_model_directory_invalid");
  }
  return path.normalize(candidate);
}

function validateModelMode(value) {
  const mode = String(value || "");
  if (!Object.hasOwn(modelModes, mode)) throw new Error("desktop_model_mode_invalid");
  return mode;
}

function selectedModelMode(store) {
  const configuredMode = store.getDesktopSetting("localAi.modelMode");
  return configuredMode === undefined
    ? DEFAULT_MODEL_MODE
    : validateModelMode(configuredMode);
}

function selectedModel(store) {
  const modelMode = selectedModelMode(store);
  const descriptor = modelModes[modelMode];
  const environmentModelPath = String(process.env.HEMATURIA_DESKTOP_MODEL_PATH || "");
  if (environmentModelPath) {
    if (!path.isAbsolute(environmentModelPath) || environmentModelPath.includes("\0")) {
      throw new Error("desktop_model_path_invalid");
    }
    const modelFilePath = path.normalize(environmentModelPath);
    return { modelMode, descriptor, modelAlias: descriptor.alias, modelDirectory: path.dirname(modelFilePath), modelFilePath };
  }
  const configuredDirectory = store.getDesktopSetting("localAi.modelDirectory");
  if (configuredDirectory !== undefined) {
    const modelDirectory = validateModelDirectory(configuredDirectory);
    return {
      modelMode,
      descriptor,
      modelAlias: descriptor.alias,
      modelDirectory,
      modelFilePath: path.join(modelDirectory, descriptor.fileName)
    };
  }
  const legacyModelPath = store.getDesktopSetting("localAi.modelPath");
  if (legacyModelPath !== undefined) {
    if (typeof legacyModelPath !== "string" || !path.isAbsolute(legacyModelPath) || legacyModelPath.includes("\0")) {
      throw new Error("desktop_model_path_invalid");
    }
    const legacyDirectory = path.dirname(path.normalize(legacyModelPath));
    return {
      modelMode,
      descriptor,
      modelAlias: descriptor.alias,
      modelDirectory: legacyDirectory,
      modelFilePath: path.join(legacyDirectory, descriptor.fileName)
    };
  }
  const modelDirectory = path.join(dataDirectory, "models");
  return {
    modelMode,
    descriptor,
    modelAlias: descriptor.alias,
    modelDirectory,
    modelFilePath: path.join(modelDirectory, descriptor.fileName)
  };
}

function localAiEnabled(store) {
  if (process.env.HEMATURIA_DESKTOP_DISABLE_LOCAL_AI === "1") return false;
  return store.getDesktopSetting("localAi.enabled") !== false;
}

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

async function validateModelIntegrity(filePath, descriptor) {
  if (process.env.HEMATURIA_DESKTOP_TEST_MODE === "1") return { ok: true };
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return { ok: false, reason: "model_missing" };
  }
  if (!stat.isFile()) return { ok: false, reason: "model_missing" };
  if (stat.size !== descriptor.size) return { ok: false, reason: "checksum_mismatch" };
  const digest = crypto.createHash("sha256");
  try {
    for await (const chunk of fs.createReadStream(filePath)) digest.update(chunk);
  } catch {
    return { ok: false, reason: "checksum_mismatch" };
  }
  return digest.digest("hex") === descriptor.sha256
    ? { ok: true }
    : { ok: false, reason: "checksum_mismatch" };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum
    ? Math.min(parsed, maximum)
    : fallback;
}

async function reserveLoopbackPort() {
  const reservation = net.createServer();
  reservation.unref();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, HOST, resolve);
  });
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => reservation.close(resolve));
  if (!Number.isInteger(port) || port <= 0) throw new Error("loopback_port_reservation_failed");
  return port;
}

function testOnlyLlamaPrefixArguments() {
  if (process.env.HEMATURIA_DESKTOP_TEST_MODE !== "1") return [];
  const raw = String(process.env.HEMATURIA_LLAMA_SERVER_PREFIX_ARGS || "");
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("test_llama_prefix_invalid");
  }
  return parsed;
}

function llamaChildEnvironment() {
  const childEnvironment = { ...process.env };
  for (const name of [
    "HEMATURIA_DESKTOP_BEARER",
    "HEMATURIA_DESKTOP_HANDSHAKE",
    "TRAINING_STATE_SECRET",
    "LLM_API_KEY"
  ]) {
    delete childEnvironment[name];
  }
  return childEnvironment;
}

async function waitForLlama(origin, apiKey, child, expectedModelAlias) {
  const deadline = Date.now() + LLAMA_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("llama_server_exited_during_startup");
    try {
      const health = await fetch(`${origin}/health`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1500)
      });
      if (!health.ok) throw new Error("llama_health_rejected");
      const models = await fetch(`${origin}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1500)
      });
      if (models.ok) {
        const payload = await models.json();
        if (
          Array.isArray(payload?.data)
          && payload.data.some((item) => item?.id === expectedModelAlias)
        ) {
          return;
        }
      }
    } catch {
      // Loading a model can take tens of seconds on a CPU-only machine. The
      // authenticated model identity check also prevents a different service
      // from winning the short reservation-to-spawn race.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("llama_server_startup_timeout");
}

async function terminateChildTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // Continue to the Windows tree fallback below.
  }
  const gracefulDeadline = Date.now() + 1500;
  while (child.exitCode === null && Date.now() < gracefulDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // The process may have exited between checks.
  }
}

async function startLocalAi(store) {
  const { descriptor, modelAlias, modelFilePath: modelPath } = selectedModel(store);
  activeModelAlias = modelAlias;
  disableLocalAi();
  if (!localAiEnabled(store)) return { status: "disabled" };

  if (!isRegularFile(modelPath)) return { status: "model_missing" };
  const integrity = await validateModelIntegrity(modelPath, descriptor);
  if (!integrity.ok) {
    return integrity.reason === "model_missing"
      ? { status: "model_missing" }
      : { status: "model_invalid", validationError: "checksum_mismatch" };
  }

  const llamaPath = path.resolve(String(process.env.HEMATURIA_LLAMA_SERVER_PATH || ""));
  if (!String(process.env.HEMATURIA_LLAMA_SERVER_PATH || "") || !isRegularFile(llamaPath)) {
    return { status: "runtime_missing" };
  }

  const configuredThreads = store.getDesktopSetting("localAi.threads");
  const threads = boundedInteger(configuredThreads, Math.max(1, os.availableParallelism() - 1), 1, 64);
  const contextSize = boundedInteger(store.getDesktopSetting("localAi.contextSize"), 4096, 2048, 32768);
  const startedAt = Date.now();
  let lastStartupError = "startup_failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await reserveLoopbackPort();
    const origin = `http://${HOST}:${port}`;
    const apiKey = crypto.randomBytes(32).toString("base64url");
    const llamaArguments = [
      ...testOnlyLlamaPrefixArguments(),
      "--model", modelPath,
      "--alias", modelAlias,
      "--host", HOST,
      "--port", String(port),
      "--ctx-size", String(contextSize),
      "--threads", String(threads),
      "--parallel", "1",
      "--jinja",
      "--reasoning", "off",
      "--chat-template-kwargs", "{\"enable_thinking\":false}",
      "--no-webui",
      "--api-key", apiKey
    ];
    const child = spawn(llamaPath, llamaArguments, {
      cwd: path.dirname(llamaPath),
      env: llamaChildEnvironment(),
      windowsHide: true,
      stdio: "ignore"
    });
    llamaChild = child;
    child.once("exit", (code) => {
      if (llamaChild !== child || shuttingDown) return;
      llamaChild = null;
      disableLocalAi();
      localAiState = { status: "stopped" };
      safeLog("desktop_llama_stopped_unexpectedly", { code: Number.isInteger(code) ? code : "terminated" });
    });
    child.once("error", (error) => {
      safeLog("desktop_llama_process_error", { code: error.code || "spawn_error" });
    });

    try {
      await waitForLlama(origin, apiKey, child, modelAlias);
      Object.assign(process.env, {
        LLM_PROVIDER: "local",
        LLM_API_BASE_URL: `${origin}/v1`,
        LLM_API_KEY: apiKey,
        LLM_MODEL: modelAlias,
        LLM_ENDPOINT_TYPE: "chat_completions",
        LLM_STREAMING_ENABLED: "true",
        LLM_THINKING_MODE: "disabled",
        LLM_REQUEST_TIMEOUT_MS: "90000",
        PATIENT_LOCAL_TIMEOUT_MS: "90000",
        LLM_ENABLE_AI_AGENTS: "true",
        LLM_ENABLE_AI_PATIENT: "true"
      });
      safeLog("desktop_llama_ready", { durationMs: Date.now() - startedAt, pid: child.pid, port });
      return { status: "ready", modelValidation: "verified" };
    } catch (error) {
      lastStartupError = error instanceof Error ? error.message : "startup_failed";
      await terminateChildTree(child);
      if (llamaChild === child) llamaChild = null;
    }
  }
  safeLog("desktop_llama_unavailable", {
    code: lastStartupError,
    durationMs: Date.now() - startedAt
  });
  return { status: "startup_failed" };
}

async function stopLocalAi() {
  const child = llamaChild;
  llamaChild = null;
  disableLocalAi();
  if (child) await terminateChildTree(child);
}

function reconfigureLocalAi(store) {
  const operation = localAiReconfiguration.then(async () => {
    localAiState = { status: "starting" };
    try {
      await stopLocalAi();
      const classifier = require(path.join(appRoot, "server", "patientIntentClassifier.js"));
      classifier.resetPatientIntentClassifierState();
      localAiState = await startLocalAi(store);
    } catch (error) {
      disableLocalAi();
      localAiState = { status: "startup_failed" };
      safeLog("desktop_llama_reconfiguration_failed", {
        code: error instanceof Error ? error.message : "startup_failed"
      });
    }
    return localAiState;
  });
  localAiReconfiguration = operation.catch(() => undefined);
  return operation;
}

function desktopSettingsSnapshot(store) {
  const { modelMode, modelAlias, modelDirectory, modelFilePath } = selectedModel(store);
  return {
    modelMode,
    modelAlias,
    modelDirectory,
    modelFilePath,
    modelPresent: isRegularFile(modelFilePath),
    localAiEnabled: localAiEnabled(store),
    llamaStatus: localAiState.status,
    modelValidation: localAiState.modelValidation
      || localAiState.validationError
      || (localAiState.status === "starting" ? "pending" : "not_checked"),
    version: PROTOCOL_VERSION
  };
}

function desktopDebugRuntime() {
  return process.env.HEMATURIA_DESKTOP_DEBUG_RUNTIME === "1";
}

function desktopAttemptKey(caseId, attemptId) {
  const scope = `${String(caseId).toLowerCase()}:${String(attemptId)}`;
  const digest = crypto.createHash("sha256").update(scope).digest("hex");
  return `hematuria:attempt:v1:${digest}`;
}

function installDesktopRuntimeEvidence(store) {
  globalThis.__hematuriaDesktopRuntimeEvidence = () => {
    const { modelAlias, modelFilePath } = selectedModel(store);
    const llamaServerReady = localAiState.status === "ready"
      && Boolean(llamaChild)
      && llamaChild.exitCode === null;
    return {
      llamaServerReady,
      localModelReady: llamaServerReady && isRegularFile(modelFilePath),
      model: modelAlias,
      cloudRequestCount: networkAudit.cloudRequestCount
    };
  };
}

function desktopSettingsHandler(store) {
  return async (req, res) => {
    if (req.method === "GET") return res.status(200).json(desktopSettingsSnapshot(store));
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "desktop_settings_payload_invalid" });
    }
    const keys = Object.keys(body);
    if (
      keys.length === 0
      || keys.some((key) => !["modelDirectory", "modelMode", "localAiEnabled"].includes(key))
      || (body.localAiEnabled !== undefined && typeof body.localAiEnabled !== "boolean")
      || (body.modelDirectory !== undefined && typeof body.modelDirectory !== "string")
      || (body.modelMode !== undefined && typeof body.modelMode !== "string")
    ) {
      return res.status(400).json({ error: "desktop_settings_payload_invalid" });
    }
    try {
      if (body.modelDirectory !== undefined) {
        store.setDesktopSetting("localAi.modelDirectory", validateModelDirectory(body.modelDirectory));
      }
      if (body.modelMode !== undefined) {
        store.setDesktopSetting("localAi.modelMode", validateModelMode(body.modelMode));
      }
      if (body.localAiEnabled !== undefined) {
        store.setDesktopSetting("localAi.enabled", body.localAiEnabled);
      }
      await reconfigureLocalAi(store);
      return res.status(200).json(desktopSettingsSnapshot(store));
    } catch (error) {
      const validationCode = error instanceof Error
        && ["desktop_model_directory_invalid", "desktop_model_mode_invalid"].includes(error.message)
        ? error.message
        : "";
      const code = validationCode
        ? validationCode
        : "desktop_settings_update_failed";
      return res.status(validationCode ? 400 : 500).json({ error: code });
    }
  };
}

function desktopEvidenceHandler(evidence) {
  return async (req, res) => {
    if (!desktopDebugRuntime()) return res.status(404).json({ error: "not_found" });
    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
    const snapshot = evidence.desktopEvidenceSnapshot();
    if (!snapshot) return res.status(503).json({ error: "desktop_evidence_unavailable" });
    return res.status(200).json(snapshot);
  };
}

function desktopAttemptResumeHandler(store, trainingState) {
  const validModes = new Set(["free", "osce", "rct", "public-practice", "formal-attempt"]);
  return async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (requestHeader(req, "content-type").split(";")[0].trim().toLowerCase() !== "application/json") {
      return res.status(415).json({ error: "content_type_not_supported" });
    }
    const body = req.body;
    if (
      !body
      || typeof body !== "object"
      || Array.isArray(body)
      || Object.keys(body).sort().join(",") !== "attemptId,caseId,language,mode"
      || typeof body.caseId !== "string"
      || !/^[A-Za-z0-9_-]{1,64}$/.test(body.caseId)
      || typeof body.attemptId !== "string"
      || !/^[A-Za-z0-9:_-]{1,200}$/.test(body.attemptId)
      || typeof body.mode !== "string"
      || !validModes.has(body.mode)
      || !["zh", "en"].includes(body.language)
    ) {
      return res.status(400).json({ error: "desktop_attempt_resume_payload_invalid" });
    }

    const mode = trainingState.normalizeAttemptMode(body.mode);
    const attemptKey = desktopAttemptKey(body.caseId, body.attemptId);
    const stored = store.resumeAttempt({
      attemptKey,
      caseId: body.caseId,
      attemptId: body.attemptId,
      mode,
      language: body.language
    });
    if (stored.kind === "missing") return res.status(404).json({ error: "attempt_not_found" });
    if (stored.kind === "expired") return res.status(410).json({ error: "attempt_expired" });
    if (stored.kind === "identity_mismatch") return res.status(409).json({ error: "attempt_identity_mismatch" });
    if (stored.kind === "not_resumable") return res.status(409).json({ error: "attempt_not_resumable" });
    if (stored.kind !== "active") return res.status(500).json({ error: "attempt_resume_failed" });

    const token = trainingState.signAttemptState(stored.state);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const current = store.validateCurrentAttempt({ attemptKey, tokenHash });
    if (current.kind !== "active") return res.status(409).json({ error: "attempt_state_mismatch" });
    try {
      const claims = trainingState.verifyAttemptState(token, {
        caseId: body.caseId,
        attemptId: body.attemptId,
        mode,
        allowCompleted: true
      });
      if (claims.language !== body.language) throw new Error("attempt_language_mismatch");
    } catch {
      return res.status(409).json({ error: "attempt_state_mismatch" });
    }

    res.setHeader("X-Training-State", token);
    return res.status(200).json({
      attemptId: stored.state.attemptId,
      caseId: stored.state.caseId,
      mode: stored.state.mode,
      language: stored.state.language,
      currentStage: Number(stored.state.currentStage),
      status: stored.state.status
    });
  };
}

async function loadHandlers(store) {
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
    const imported = await import(pathToFileURL(path.join(appRoot, relativePath)).href);
    if (typeof imported.default !== "function") throw new Error("desktop_api_handler_invalid");
    handlers.set(route, imported.default);
  }
  handlers.set("/api/desktop/settings", desktopSettingsHandler(store));
  const evidence = require(path.join(appRoot, "server", "desktopRuntimeEvidence.js"));
  handlers.set("/api/desktop/evidence", desktopEvidenceHandler(evidence));
  const trainingState = require(path.join(appRoot, "server", "trainingState.js"));
  handlers.set("/api/desktop/attempt/resume", desktopAttemptResumeHandler(store, trainingState));
  return handlers;
}

function constantTimeMatches(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requestHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function remoteIsLoopback(req) {
  return ["127.0.0.1", "::ffff:127.0.0.1"].includes(String(req.socket.remoteAddress || ""));
}

function setCorsHeaders(req, res) {
  const origin = requestHeader(req, "origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Request-Id, X-Idempotency-Key, X-Training-State, X-Hematuria-Desktop-Token"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Training-State");
  res.setHeader("Access-Control-Max-Age", "600");
}

function jsonResponse(res, statusCode, payload) {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || ""))) return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_body_too_large");
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
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (Buffer.isBuffer(payload) || typeof payload === "string") res.end(payload);
    else res.json(payload);
    return res;
  };
}

function createApiServer(handlers) {
  const server = http.createServer(async (req, res) => {
    try {
      if (!remoteIsLoopback(req)) return jsonResponse(res, 403, { error: "forbidden" });
      const address = server.address();
      const expectedHost = typeof address === "object" && address
        ? `${HOST}:${address.port}`
        : "";
      if (requestHeader(req, "host") !== expectedHost) {
        return jsonResponse(res, 403, { error: "forbidden" });
      }

      const origin = requestHeader(req, "origin");
      if (origin && !allowedOrigins.has(origin)) {
        return jsonResponse(res, 403, { error: "origin_not_allowed" });
      }
      setCorsHeaders(req, res);
      if (req.method === "OPTIONS") {
        if (!origin) return jsonResponse(res, 403, { error: "origin_required" });
        res.statusCode = 204;
        return res.end();
      }

      if (!constantTimeMatches(requestHeader(req, "x-hematuria-desktop-token"), bearer)) {
        return jsonResponse(res, 401, { error: "unauthorized" });
      }
      const url = new URL(req.url || "/", `http://${expectedHost}`);
      const apiPath = url.pathname.replace(/\/+$/, "") || "/";
      const handler = handlers.get(apiPath);
      if (!handler) return jsonResponse(res, 404, { error: "not_found" });

      req.body = await readRequestBody(req);
      req.headers["x-forwarded-host"] = expectedHost;
      req.headers["x-forwarded-proto"] = "http";
      decorateResponse(res);
      return await handler(req, res);
    } catch (error) {
      const code = error instanceof Error && error.message === "request_body_too_large"
        ? "request_body_too_large"
        : "desktop_api_adapter_error";
      return jsonResponse(res, code === "request_body_too_large" ? 413 : 500, { error: code });
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 80;
  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.once("close", () => openSockets.delete(socket));
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== HOST || !address.port) {
    throw new Error("desktop_api_bind_failed");
  }
  return `http://${HOST}:${address.port}`;
}

async function verifyHealth(origin) {
  const response = await fetch(`${origin}/api/health/`, {
    headers: { "X-Hematuria-Desktop-Token": bearer },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("desktop_health_probe_failed");
  const payload = await response.json();
  if (payload.status !== "ok") throw new Error("desktop_health_probe_failed");
}

async function waitForStartGate() {
  await new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("desktop_start_gate_timeout")), 15_000);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 64 || !buffer.includes("\n")) return;
      const line = buffer.slice(0, buffer.indexOf("\n")).trim();
      finish(line === "START" ? null : new Error("desktop_start_gate_invalid"));
    };
    const onEnd = () => finish(new Error("desktop_start_gate_closed"));
    const finish = (error) => {
      clearTimeout(timeout);
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onEnd);
      if (error) reject(error);
      else resolve();
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onEnd);
    process.stdin.resume();
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const socket of openSockets) socket.destroy();
  if (apiServer) {
    await new Promise((resolve) => apiServer.close(resolve));
    apiServer = null;
  }
  if (llamaChild) {
    await stopLocalAi();
  }
  try {
    sqliteStore?.closeDesktopSqliteStore();
  } catch {
    // Shutdown is best-effort; no request or secret data is logged.
  }
  safeLog("desktop_sidecar_stopped", { status: exitCode === 0 ? "ok" : "error" });
  process.exit(exitCode);
}

async function main() {
  await waitForStartGate();
  process.stdin.once("end", () => void shutdown(0));
  process.chdir(appRoot);

  sqliteStore = require(path.join(appRoot, "server", "desktopSqliteStore.js"));
  const databaseSchemaVersion = sqliteStore.getDesktopSchemaVersion();
  const trainingSecret = sqliteStore.getOrCreateDesktopSecret();
  installDesktopEnvironment(trainingSecret);
  installDesktopRuntimeEvidence(sqliteStore);
  const selected = selectedModel(sqliteStore);
  activeModelAlias = selected.modelAlias;
  disableLocalAi();
  localAiState = localAiEnabled(sqliteStore) ? { status: "starting" } : { status: "disabled" };
  const handlers = await loadHandlers(sqliteStore);

  apiServer = createApiServer(handlers);
  const origin = await listen(apiServer);
  await verifyHealth(origin);

  const ready = {
    event: "ready",
    protocolVersion: PROTOCOL_VERSION,
    handshake,
    pid: process.pid,
    origin,
    databaseSchemaVersion,
    localAi: localAiState
  };
  process.stdout.write(`${JSON.stringify(ready)}\n`);
  safeLog("desktop_sidecar_ready", { status: localAiState.status, pid: process.pid });
  if (localAiEnabled(sqliteStore)) {
    void reconfigureLocalAi(sqliteStore);
  }
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));
process.once("uncaughtException", (error) => {
  safeLog("desktop_sidecar_uncaught_exception", { code: error?.code || error?.message || "uncaught" });
  void shutdown(1);
});
process.once("unhandledRejection", (error) => {
  safeLog("desktop_sidecar_unhandled_rejection", { code: error?.code || error?.message || "rejection" });
  void shutdown(1);
});

main().catch((error) => {
  safeLog("desktop_sidecar_start_failed", { code: error instanceof Error ? error.message : "unknown" });
  void shutdown(1);
});
