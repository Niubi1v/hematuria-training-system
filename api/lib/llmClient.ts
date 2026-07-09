export type LLMProviderConfig = {
  provider: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  endpointType: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
};

export function getLLMProviderConfig(): LLMProviderConfig {
  return {
    provider: process.env.LLM_PROVIDER || "deepseek",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL || "https://api.deepseek.com",
    model: process.env.LLM_MODEL || "deepseek-v4-flash",
    endpointType: process.env.LLM_ENDPOINT_TYPE || "chat_completions",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 500),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000),
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
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

export async function callLLM({ systemPrompt, userPayload, temperature, maxTokens }: {
  systemPrompt: string;
  userPayload: unknown;
  temperature?: number;
  maxTokens?: number;
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
    if (!response.ok) throw new Error(`LLM provider returned ${response.status}`);
    const json = await response.json();
    const text = readLLMText(json).trim();
    if (!text) throw new Error("LLM provider returned empty content");
    return { text, provider: config.provider, model: config.model };
  } finally {
    clearTimeout(timeout);
  }
}
