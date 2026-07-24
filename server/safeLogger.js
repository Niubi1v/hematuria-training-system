const SENSITIVE_KEY = /(?:authorization|cookie|api[_-]?key|token|secret|signature|x-training-state|x-vercel-protection-bypass|prompt|payload|conversation|patientanswer|hidden)/i;
const SENSITIVE_ENV_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD|AUTH|COOKIE|SIGNATURE|REDIS_URL|KV_URL)$/i;

function sensitiveEnvironmentValues(env = process.env) {
  return Object.entries(env)
    .filter(([key, value]) => SENSITIVE_ENV_KEY.test(key) && typeof value === "string" && value.length >= 8)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
}

function redactText(value, env = process.env) {
  let text = String(value || "");
  for (const secret of sensitiveEnvironmentValues(env)) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/((?:authorization|cookie|api[_-]?key|token|secret|signature|x-training-state|x-vercel-protection-bypass)\s*[:=]\s*)[^\s,;&]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|secret|signature|key|authorization|cookie)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");
}

function sanitizeForLog(value, env = process.env, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactText(value, env);
  if (value instanceof Error) {
    return {
      name: redactText(value.name, env),
      message: "[REDACTED_ERROR_MESSAGE]",
      ...(typeof value.code === "string" && /^[a-z0-9_]{1,80}$/i.test(value.code) ? { code: value.code } : {}),
      ...(Number.isInteger(Number(value.status)) ? { status: Number(value.status) } : {}),
      ...(value.cause === undefined ? {} : { cause: sanitizeForLog(value.cause, env, seen) })
    };
  }
  if (typeof value !== "object") return redactText(String(value), env);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, env, seen));
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeForLog(item, env, seen);
  }
  return result;
}

function debugLoggingEnabled(env = process.env) {
  return env.PATIENT_PROMPT_AUDIT_ENABLED === "true"
    && env.NODE_ENV !== "production"
    && !env.VERCEL
    && !env.VERCEL_ENV;
}

function log(level, event, payload = {}, options = {}) {
  const env = options.env || process.env;
  if (level === "debug" && !debugLoggingEnabled(env)) return false;
  const sink = options.sink || (level === "error" ? console.error : level === "warn" ? console.warn : console.info);
  sink(redactText(event, env), sanitizeForLog(payload, env));
  return true;
}

module.exports = {
  debug: (event, payload, options) => log("debug", event, payload, options),
  debugLoggingEnabled,
  error: (event, payload, options) => log("error", event, payload, options),
  info: (event, payload, options) => log("info", event, payload, options),
  redactText,
  sanitizeForLog,
  warn: (event, payload, options) => log("warn", event, payload, options)
};
