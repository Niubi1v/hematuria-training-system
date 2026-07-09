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
  enabled: boolean;
};

export type CallLLMInput = {
  systemPrompt: string;
  userPayload: unknown;
  temperature?: number;
  maxTokens?: number;
};

export function getLLMProviderConfig(): LLMProviderConfig {
  return {
    provider: process.env.LLM_PROVIDER || "custom",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL,
    model: process.env.LLM_MODEL,
    endpointType: (process.env.LLM_ENDPOINT_TYPE || "chat_completions") as LLMEndpointType,
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 120),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 15000),
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
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

export async function callLLM({ systemPrompt, userPayload, temperature, maxTokens }: CallLLMInput) {
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: temperature ?? config.temperature,
        max_tokens: maxTokens ?? config.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM provider returned ${response.status}: ${body.slice(0, 200)}`);
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
