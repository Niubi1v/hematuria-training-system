function getLLMProviderConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "deepseek",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL || "https://api.deepseek.com",
    model: process.env.LLM_MODEL || "deepseek-v4-flash",
    endpointType: process.env.LLM_ENDPOINT_TYPE || "chat_completions",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 500),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000),
    thinkingMode: process.env.LLM_THINKING_MODE || "disabled",
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
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

const transientStatuses = new Set([408, 425, 429, 502, 503, 504]);

function retryDelay(attempt, retryAfter = 0) {
  const base = [400, 1000, 2200][Math.min(attempt, 2)];
  return Math.max(retryAfter, base + Math.round(base * (Math.random() * 0.3 - 0.15)));
}

async function callLLM({ systemPrompt, userPayload, temperature, maxTokens, maxRetries = 2 }) {
  const config = getLLMProviderConfig();
  if (!config.enabled) throw new Error("LLM agent mode is disabled");
  if (!config.apiKey) throw new Error("Missing LLM_API_KEY");
  if (!config.baseUrl) throw new Error("Missing LLM_API_BASE_URL");
  if (!config.model) throw new Error("Missing LLM_MODEL");

  const requestId = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(joinUrl(config.baseUrl, config.endpointType), {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({
          model: config.model,
          ...deepSeekThinking(config),
          temperature: temperature ?? config.temperature,
          max_tokens: maxTokens ?? config.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) }
          ],
          stream: false
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(`LLM provider returned ${response.status}: ${body.slice(0, 120)}`);
        error.status = response.status;
        if (!transientStatuses.has(response.status) || attempt === maxRetries) throw error;
        lastError = error;
        const retryAfter = Number(response.headers.get("Retry-After") || 0) * 1000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, retryAfter)));
        continue;
      }
      const json = await response.json();
      const text = readLLMText(json).trim();
      if (!text) throw new Error("LLM provider returned empty content");
      return { text, provider: config.provider, model: config.model, requestId, retryCount: attempt };
    } catch (error) {
      lastError = error;
      const timedOut = error?.name === "AbortError";
      const retryable = timedOut || transientStatuses.has(Number(error?.status || 0));
      if (!retryable || attempt === maxRetries) {
        console.warn("llm_request_failed", { requestId, endpoint: "chat_completions", status: Number(error?.status || 0), durationMs: Date.now() - startedAt, retryCount: attempt, fallbackReason: timedOut ? "provider_timeout" : "provider_unavailable", deploymentSha: String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 12) });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("LLM provider unavailable");
}

module.exports = { callLLM, getLLMProviderConfig };
