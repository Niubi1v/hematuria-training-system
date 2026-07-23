const { enterProviderCircuit, recordProviderFailure, recordProviderSuccess } = require("./providerCircuitStore.js");
const safeLogger = require("./safeLogger.js");

function getLLMProviderConfig() {
  const endpointType = process.env.LLM_ENDPOINT_TYPE || "chat_completions";
  return {
    provider: process.env.LLM_PROVIDER || "deepseek",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL || "https://api.deepseek.com",
    model: process.env.LLM_MODEL || "deepseek-v4-flash",
    endpointType,
    streaming: process.env.LLM_STREAMING_ENABLED === undefined
      ? endpointType === "chat_completions"
      : process.env.LLM_STREAMING_ENABLED === "true",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 500),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000),
    thinkingMode: process.env.LLM_THINKING_MODE || "disabled",
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true",
    safeMock: process.env.MAINLAND_SAFE_MOCK_LLM === "true"
  };
}

function deepSeekThinking(config) {
  const isDeepSeek = config.provider.toLowerCase() === "deepseek" || config.baseUrl.toLowerCase().includes("deepseek.com");
  return isDeepSeek ? { thinking: { type: config.thinkingMode } } : {};
}

function joinUrl(baseUrl, endpointType) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  if (endpointType === "chat_completions" && !trimmed.endsWith("/chat/completions")) {
    return `${trimmed}/chat/completions`;
  }
  return trimmed;
}

function readLLMText(payload) {
  return payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || payload?.content || "";
}

async function readStreamingLLM(response, startedAt) {
  if (!response.body) throw new Error("LLM provider returned an empty streaming body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let firstTokenMs;

  function consumeLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return false;
    if (!trimmed.startsWith("data:")) return false;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return true;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new Error("LLM provider returned a malformed streaming event");
    }
    const delta = payload?.choices?.[0]?.delta || {};
    const generatedToken = String(delta.reasoning_content || delta.content || "");
    if (generatedToken && firstTokenMs === undefined) firstTokenMs = Date.now() - startedAt;
    if (typeof delta.content === "string") text += delta.content;
    return false;
  }

  let doneEvent = false;
  try {
    while (!doneEvent) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (consumeLine(line)) {
          doneEvent = true;
          break;
        }
      }
      if (done) {
        if (buffer) consumeLine(buffer);
        break;
      }
    }
  } finally {
    if (doneEvent) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { text: text.trim(), firstTokenMs };
}

async function readLLMResponse(response, { streaming, startedAt }) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (streaming && contentType.includes("text/event-stream")) return readStreamingLLM(response, startedAt);
  const json = await response.json();
  return { text: readLLMText(json).trim(), firstTokenMs: undefined };
}

function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt, retryAfter = 0) {
  const base = [400, 1000, 2200][Math.min(attempt, 2)];
  return Math.max(retryAfter, base + Math.round(base * (Math.random() * 0.3 - 0.15)));
}

async function callLLM({ systemPrompt, userPayload, temperature, maxTokens, maxRetries = 2, timeoutMs }) {
  const config = getLLMProviderConfig();
  if (!config.enabled) throw new Error("LLM agent mode is disabled");
  if (!config.apiKey) throw new Error("Missing LLM_API_KEY");
  if (!config.baseUrl) throw new Error("Missing LLM_API_BASE_URL");
  if (!config.model) throw new Error("Missing LLM_MODEL");

  const requestId = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const retryLimit = Number.isInteger(Number(maxRetries)) ? Math.max(0, Math.min(Number(maxRetries), 2)) : 2;
  const requestTimeoutMs = Math.max(1000, Math.min(Number(timeoutMs) || Number(config.timeoutMs) || 15_000, 30_000));
  const minimumProbeSeconds = Math.ceil(((retryLimit + 1) * requestTimeoutMs + retryLimit * 2500) / 1000) + 5;
  let circuitAdmission;
  try {
    circuitAdmission = await enterProviderCircuit(config, { minimumProbeSeconds });
  } catch (error) {
    const code = String(error?.code || error?.message || error);
    safeLogger.warn("llm_circuit_rejected", { requestId, code, retryAfterSeconds: Number(error?.retryAfterSeconds || 0), deploymentSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
    throw error;
  }
  const effectiveRetryLimit = circuitAdmission.probe ? 0 : retryLimit;
  let lastError;
  for (let attempt = 0; attempt <= effectiveRetryLimit; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(joinUrl(config.baseUrl, config.endpointType), {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: config.streaming ? "text/event-stream" : "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({
          model: config.model,
          ...deepSeekThinking(config),
          temperature: temperature ?? config.temperature,
          max_tokens: maxTokens ?? config.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) }
          ],
          stream: config.streaming
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => {});
        const error = new Error(`LLM provider returned HTTP ${response.status}`);
        error.status = response.status;
        if (!transientStatus(response.status) || attempt === effectiveRetryLimit) throw error;
        lastError = error;
        const retryAfter = Number(response.headers.get("Retry-After") || 0) * 1000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, retryAfter)));
        continue;
      }
      let parsed;
      try {
        parsed = await readLLMResponse(response, { streaming: config.streaming, startedAt });
      } catch (error) {
        error.providerContractFailure = true;
        throw error;
      }
      const { text, firstTokenMs } = parsed;
      if (!text) {
        const error = new Error("LLM provider returned empty content");
        error.providerContractFailure = true;
        throw error;
      }
      await recordProviderSuccess(circuitAdmission).catch(() => {
        safeLogger.warn("llm_circuit_update_failed", { requestId, action: "success", deploymentSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
      });
      return { text, provider: config.provider, model: config.model, requestId, retryCount: attempt, durationMs: Date.now() - startedAt, firstTokenMs, safeMock: config.safeMock };
    } catch (error) {
      lastError = error;
      const timedOut = error?.name === "AbortError";
      const status = Number(error?.status || 0);
      const networkFailure = error instanceof TypeError;
      const retryable = timedOut || networkFailure || transientStatus(status);
      if (!retryable || attempt === effectiveRetryLimit) {
        const providerContractFailure = error?.providerContractFailure === true;
        const countsTowardCircuit = timedOut || networkFailure || providerContractFailure || status === 401 || status === 403 || transientStatus(status);
        if (countsTowardCircuit) {
          await recordProviderFailure(circuitAdmission).catch(() => {
            safeLogger.warn("llm_circuit_update_failed", { requestId, action: "failure", deploymentSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
          });
        }
        const fallbackReason = timedOut ? "provider_timeout" : status === 429 ? "provider_rate_limit" : "provider_unavailable";
        safeLogger.warn("llm_request_failed", { requestId, endpoint: "chat_completions", status, durationMs: Date.now() - startedAt, retryCount: attempt, fallbackReason, deploymentSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("LLM provider unavailable");
}

module.exports = { callLLM, getLLMProviderConfig, readLLMResponse };
