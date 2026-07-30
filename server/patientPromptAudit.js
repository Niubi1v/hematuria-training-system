const safeLogger = require("./safeLogger.js");

const PROMPT_TEMPLATE_VERSION = "patient-answer-v3";
const ALLOWED_EVENT_KEYS = new Set([
  "templateVersion", "caseId", "language", "canonicalIntents", "matchedAliases", "matcherLayer",
  "matcherConfidence", "factFields", "provenance", "reviewerStatus", "providerInvoked",
  "historyCount", "estimatedInputTokens", "maxTokens", "temperature", "provider", "outputFilter",
  "fallbackReason"
]);

function promptAuditEnabled(env = process.env) {
  return safeLogger.debugLoggingEnabled(env);
}

function estimateTokens(parts) {
  const characters = parts.reduce((sum, part) => sum + String(part || "").length, 0);
  return Math.ceil(characters / 4);
}

function buildPromptAuditEvent(input = {}) {
  const event = {};
  for (const [key, value] of Object.entries(input)) {
    if (ALLOWED_EVENT_KEYS.has(key)) event[key] = value;
  }
  event.templateVersion = String(event.templateVersion || PROMPT_TEMPLATE_VERSION);
  event.caseId = String(event.caseId || "").slice(0, 20);
  event.language = event.language === "en" ? "en" : "zh";
  event.canonicalIntents = Array.isArray(event.canonicalIntents) ? event.canonicalIntents.map(String).slice(0, 16) : [];
  event.matchedAliases = Array.isArray(event.matchedAliases) ? event.matchedAliases.map(String).slice(0, 16) : [];
  event.factFields = Array.isArray(event.factFields) ? event.factFields.map(String).slice(0, 16) : [];
  event.historyCount = Math.max(0, Math.min(Number(event.historyCount) || 0, 20));
  event.estimatedInputTokens = Math.max(0, Number(event.estimatedInputTokens) || 0);
  event.providerInvoked = Boolean(event.providerInvoked);
  return event;
}

function auditPatientPrompt(input, options = {}) {
  const env = options.env || process.env;
  if (!promptAuditEnabled(env)) return null;
  const event = buildPromptAuditEvent(input);
  safeLogger.debug("patient_prompt_audit", event, { env, sink: options.sink });
  return event;
}

module.exports = { ALLOWED_EVENT_KEYS, PROMPT_TEMPLATE_VERSION, auditPatientPrompt, buildPromptAuditEvent, estimateTokens, promptAuditEnabled };
