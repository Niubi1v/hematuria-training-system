export type ApiFailureKind = "network" | "not-deployed" | "timeout" | "rate-limited" | "not-configured" | "patient-service" | "request";

export class ApiRequestError extends Error {
  constructor(public kind: ApiFailureKind, public status?: number) {
    super(kind);
    this.name = "ApiRequestError";
  }
}

export function createIdempotencyKey(...parts: string[]) {
  let hash = 2166136261;
  for (const character of parts.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `req-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const transientStatuses = new Set([502, 503, 504]);

function classify(status: number): ApiFailureKind {
  if (status === 404) return "not-deployed";
  if (status === 429) return "rate-limited";
  if (status === 503) return "not-configured";
  if (status >= 500) return "patient-service";
  return "request";
}

export async function fetchWithRecovery(url: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}) {
  const { timeoutMs = 15_000, retries = 2, ...requestInit } = init;
  let lastError: ApiRequestError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = requestInit.signal;
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...requestInit, signal: controller.signal, cache: "no-store" });
      if (response.ok) return response;
      const error = new ApiRequestError(classify(response.status), response.status);
      if (!transientStatuses.has(response.status) || attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      const normalized = error instanceof ApiRequestError
        ? error
        : new ApiRequestError(error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network");
      if (externalSignal?.aborted) throw normalized;
      if ((normalized.status && !transientStatuses.has(normalized.status)) || attempt === retries) throw normalized;
      lastError = normalized;
    } finally {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 350 * 2 ** attempt));
  }
  throw lastError || new ApiRequestError("network");
}

export async function requestJson<T>(url: string, body?: unknown, options: { timeoutMs?: number; retries?: number; idempotencyKey?: string; method?: "GET" | "POST" } = {}): Promise<T> {
  const method = options.method || (body === undefined ? "GET" : "POST");
  const response = await fetchWithRecovery(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: options.timeoutMs,
    retries: options.retries
  });
  return response.json() as Promise<T>;
}

export function studentFacingApiMessage(kind: ApiFailureKind, language: "zh" | "en") {
  const messages = {
    network: ["网络连接失败，请检查网络后重试。", "Network connection failed. Check your connection and retry."],
    "not-deployed": ["后端服务尚未部署，请联系教师。", "The backend service has not been deployed."],
    timeout: ["服务响应超时，请稍后重试。", "The service timed out. Please retry shortly."],
    "rate-limited": ["请求过于频繁，请稍后再试。", "Too many requests. Please wait and retry."],
    "not-configured": ["服务配置尚未完成，当前功能暂不可用。", "The service is not configured yet."],
    "patient-service": ["患者AI服务暂时失败，请稍后重试。", "The patient AI service is temporarily unavailable."],
    request: ["请求未被服务接受，请刷新后重试。", "The request was not accepted. Refresh and retry."]
  } as const;
  return messages[kind][language === "en" ? 1 : 0];
}
