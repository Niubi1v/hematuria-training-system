export type LLMProviderConfig = {
  provider: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  endpointType: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  thinkingMode: string;
  enabled: boolean;
};
const RETIRED_DEEPSEEK_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);

function isDeepSeekProvider(provider: string, baseUrl: string) {
  return provider.toLowerCase() === "deepseek" || baseUrl.toLowerCase().includes("deepseek.com");
}

export function currentModelName(provider: string, baseUrl: string, configuredModel: string) {
  return isDeepSeekProvider(provider, baseUrl) && RETIRED_DEEPSEEK_MODELS.has(configuredModel)
    ? "deepseek-v4-flash"
    : configuredModel;
}

export function getLLMProviderConfig(): LLMProviderConfig {
  const provider = process.env.LLM_PROVIDER || "deepseek";
  const baseUrl = process.env.LLM_API_BASE_URL || "https://api.deepseek.com";
  return {
    provider,
    apiKey: process.env.LLM_API_KEY,
    baseUrl,
    model: currentModelName(provider, baseUrl, process.env.LLM_MODEL || "deepseek-v4-flash"),
    endpointType: process.env.LLM_ENDPOINT_TYPE || "chat_completions",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 500),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 30000),
    thinkingMode: process.env.LLM_THINKING_MODE || "disabled",
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
  };
}

function deepSeekThinking(config: LLMProviderConfig, thinkingMode = config.thinkingMode, reasoningEffort?: string) {
  if (!isDeepSeekProvider(config.provider, config.baseUrl)) return {};
  return {
    thinking: { type: thinkingMode },
    ...(thinkingMode === "enabled" && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };
}

function joinUrl(baseUrl: string, endpointType: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (endpointType === "chat_completions" && !trimmed.endsWith("/chat/completions")) return `${trimmed}/chat/completions`;
  return trimmed;
}

function readLLMText(payload: any) {
  return payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || payload?.content || "";
}

export async function callLLM({ systemPrompt, userPayload, temperature, maxTokens, thinkingMode, reasoningEffort, responseFormat }: {
  systemPrompt: string;
  userPayload: unknown;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: string;
  reasoningEffort?: string;
  responseFormat?: { type: "json_object" };
}) {
  const config = getLLMProviderConfig();
  if (!config.enabled) throw new Error("LLM agent mode is disabled");
  if (!config.apiKey) throw new Error("Missing LLM_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(joinUrl(config.baseUrl, config.endpointType), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        ...deepSeekThinking(config, thinkingMode ?? config.thinkingMode, reasoningEffort),
        ...((thinkingMode ?? config.thinkingMode) === "enabled"
          ? {}
          : { temperature: temperature ?? config.temperature }),
        max_tokens: maxTokens ?? config.maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        stream: false
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`LLM provider returned ${response.status}`);
    const json = await response.json();
    const text = readLLMText(json).trim();
    if (!text) throw new Error("LLM provider returned empty content");
    return { text, provider: config.provider, model: config.model };
  } finally {
    clearTimeout(timeout);
  }
}
