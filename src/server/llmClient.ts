export type LLMEndpointType = "chat_completions" | "custom";

export type LLMProviderConfig = {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  endpointType: LLMEndpointType;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  thinkingMode: string;
  enabled: boolean;
};

export type CallLLMInput = {
  systemPrompt: string;
  userPayload: unknown;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: string;
  reasoningEffort?: string;
  responseFormat?: { type: "json_object" };
};
const RETIRED_DEEPSEEK_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);

function isDeepSeekProvider(provider: string, baseUrl?: string) {
  return provider.toLowerCase() === "deepseek" || String(baseUrl || "").toLowerCase().includes("deepseek.com");
}

export function currentModelName(provider: string, baseUrl: string | undefined, configuredModel: string | undefined) {
  return isDeepSeekProvider(provider, baseUrl) && RETIRED_DEEPSEEK_MODELS.has(String(configuredModel || ""))
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
    endpointType: (process.env.LLM_ENDPOINT_TYPE || "chat_completions") as LLMEndpointType,
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 120),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30000),
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

function joinUrl(baseUrl: string, endpointType: LLMEndpointType) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (endpointType === "chat_completions" && !trimmed.endsWith("/chat/completions")) {
    return `${trimmed}/chat/completions`;
  }
  return trimmed;
}

function readChatCompletionText(payload: unknown) {
  const data = payload as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    output_text?: string;
    content?: string;
  };
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.output_text || data.content || "";
}

export async function callLLM({
  systemPrompt,
  userPayload,
  temperature,
  maxTokens,
  thinkingMode,
  reasoningEffort,
  responseFormat
}: CallLLMInput) {
  const config = getLLMProviderConfig();
  if (!config.enabled) throw new Error("LLM agent mode is disabled");
  if (!config.apiKey) throw new Error("Missing LLM_API_KEY");
  if (!config.baseUrl) throw new Error("Missing LLM_API_BASE_URL");
  if (!config.model) throw new Error("Missing LLM_MODEL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(joinUrl(config.baseUrl, config.endpointType), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        model: config.model,
        ...deepSeekThinking(config, thinkingMode ?? config.thinkingMode, reasoningEffort ?? process.env.LLM_REASONING_EFFORT),
        ...((thinkingMode ?? config.thinkingMode) === "enabled"
          ? {}
          : { temperature: temperature ?? config.temperature }),
        max_tokens: maxTokens ?? config.maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`LLM provider returned HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const text = readChatCompletionText(payload).trim();
    if (!text) throw new Error("LLM provider returned empty content");
    return {
      text,
      provider: config.provider,
      model: config.model
    };
  } finally {
    clearTimeout(timeout);
  }
}
