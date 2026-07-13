export type ApiFailureKind =
  | "network" | "offline" | "not-deployed" | "backend-outdated" | "timeout" | "rate-limited"
  | "not-configured" | "provider-timeout" | "provider-rate-limited" | "provider-unavailable"
  | "safety-filter" | "patient-service" | "request";

export class ApiRequestError extends Error {
  constructor(
    public kind: ApiFailureKind,
    public status?: number,
    public code = "",
    public requestId = ""
  ) {
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

export function createRequestId(endpoint = "api") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${endpoint.replace(/[^a-z0-9]/gi, "-").slice(-20)}-${suffix}`;
}

const transientStatuses = new Set([408, 425, 429, 502, 503, 504]);

function classify(status: number, code: string): ApiFailureKind {
  const normalized = code.toLowerCase();
  if (status === 404) return "not-deployed";
  if (/backend_outdated|version_mismatch/.test(normalized)) return "backend-outdated";
  if (/provider_not_configured|llm_not_configured|missing_llm/.test(normalized)) return "not-configured";
  if (/provider_timeout|upstream_timeout/.test(normalized)) return "provider-timeout";
  if (/provider_rate_limit|upstream_rate_limit/.test(normalized) || status === 429) return "provider-rate-limited";
  if (/provider_unavailable|llm_unavailable/.test(normalized)) return "provider-unavailable";
  if (/safety_filter|unsafe_response/.test(normalized)) return "safety-filter";
  if (status >= 500) return "patient-service";
  return "request";
}

async function errorCode(response: Response) {
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    return String(body.code || body.error || body.fallbackReason || "");
  } catch {
    return "";
  }
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

export function recoveryDelayMs(attempt: number, retryAfter = 0) {
  const base = [400, 1000, 2200][Math.min(attempt, 2)] || 2200;
  const jitter = Math.round(base * (Math.random() * 0.3 - 0.15));
  return Math.max(retryAfter, base + jitter);
}

export function waitForRecoveryDelay(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

type RecoveryOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  requestId?: string;
  endpointName?: string;
};

export async function fetchWithRecovery(url: string, init: RecoveryOptions = {}) {
  const { timeoutMs = 15_000, retries = 2, requestId = createRequestId(init.endpointName || "api"), endpointName = new URL(url).pathname, ...requestInit } = init;
  let lastError: ApiRequestError | null = null;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiRequestError("offline", undefined, "browser_offline", requestId);
    const controller = new AbortController();
    const externalSignal = requestInit.signal;
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...requestInit,
        headers: { ...Object.fromEntries(new Headers(requestInit.headers).entries()), "X-Request-Id": requestId },
        signal: controller.signal,
        cache: "no-store"
      });
      if (response.ok) return response;
      const code = await errorCode(response);
      const error = new ApiRequestError(classify(response.status, code), response.status, code, requestId);
      const retryableFailure = transientStatuses.has(response.status) && !["not-configured", "backend-outdated", "not-deployed", "safety-filter"].includes(error.kind);
      if (!retryableFailure || attempt === retries) throw error;
      lastError = error;
      await waitForRecoveryDelay(recoveryDelayMs(attempt, retryAfterMs(response)), externalSignal || undefined);
    } catch (error) {
      const normalized = error instanceof ApiRequestError
        ? error
        : new ApiRequestError(error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network", undefined, "", requestId);
      if (externalSignal?.aborted) throw normalized;
      if ((normalized.status && !transientStatuses.has(normalized.status)) || attempt === retries) {
        console.warn("api_request_failed", { requestId, endpoint: endpointName, status: normalized.status || 0, durationMs: Date.now() - startedAt, retryCount: attempt, fallbackReason: normalized.code || normalized.kind });
        throw normalized;
      }
      lastError = normalized;
      await waitForRecoveryDelay(recoveryDelayMs(attempt), externalSignal || undefined);
    } finally {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }
  throw lastError || new ApiRequestError("network", undefined, "", requestId);
}

export async function requestJson<T>(url: string, body?: unknown, options: { timeoutMs?: number; retries?: number; idempotencyKey?: string; method?: "GET" | "POST"; signal?: AbortSignal; requestId?: string; endpointName?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const method = options.method || (body === undefined ? "GET" : "POST");
  const response = await fetchWithRecovery(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
      ...(options.headers || {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    requestId: options.requestId,
    endpointName: options.endpointName
  });
  return response.json() as Promise<T>;
}

export function studentFacingApiMessage(kind: ApiFailureKind, language: "zh" | "en") {
  const messages: Record<ApiFailureKind, readonly [string, string]> = {
    network: ["网络连接失败，请检查网络后重试。", "Network connection failed. Check your connection and retry."],
    offline: ["当前处于离线状态，恢复网络后可重新连接AI。", "You are offline. Reconnect to the internet, then reconnect AI."],
    "not-deployed": ["生产后端版本尚未更新，请联系教师。", "The production backend has not been updated."],
    "backend-outdated": ["生产后端版本过旧，请完成后端部署。", "The production backend is outdated."],
    timeout: ["服务响应超时，请稍后重新连接。", "The service timed out. Reconnect shortly."],
    "rate-limited": ["请求过于频繁，请稍后再试。", "Too many requests. Please wait and retry."],
    "not-configured": ["AI服务尚未配置，当前由规则库回答。", "AI is not configured; rule fallback is active."],
    "provider-timeout": ["上游AI响应超时，当前由规则库回答。", "The AI provider timed out; rule fallback is active."],
    "provider-rate-limited": ["上游AI暂时限流，当前由规则库回答。", "The AI provider is rate-limited; rule fallback is active."],
    "provider-unavailable": ["上游AI暂时不可用，当前由规则库回答。", "The AI provider is unavailable; rule fallback is active."],
    "safety-filter": ["本次回答触发安全边界，已使用规则库回答。", "This answer triggered a safety boundary; rule fallback was used."],
    "patient-service": ["患者AI服务暂时失败，当前由规则库回答。", "The patient AI service failed; rule fallback is active."],
    request: ["请求未被服务接受，请刷新后重试。", "The request was not accepted. Refresh and retry."]
  };
  return messages[kind][language === "en" ? 1 : 0];
}
