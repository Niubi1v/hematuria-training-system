function allowedOrigins() {
  return String(process.env.AGENT_API_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || process.env.PATIENT_AGENT_ALLOWED_ORIGIN || process.env.TRAINING_API_ALLOWED_ORIGINS || process.env.TTS_ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
}

const { signingSecretConfigured } = require("../server/trainingState.js");
const { attemptStoreCredentialSource, durableAttemptStoreConfigured } = require("../server/trainingAttemptStore.js");

module.exports = function handler(req, res) {
  const origin = String(req.headers?.origin || "");
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  return res.status(200).json({
    status: "ok",
    deploymentTier: process.env.TRAINING_DEPLOYMENT_TIER || "practice",
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.NEXT_PUBLIC_GIT_SHA || "unknown",
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || "unknown",
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "unknown",
    patientServiceConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_API_BASE_URL && process.env.LLM_MODEL),
    trainingStateConfigured: signingSecretConfigured() && (!process.env.VERCEL || durableAttemptStoreConfigured()),
    durableAttemptStoreConfigured: durableAttemptStoreConfigured(),
    durableAttemptStoreCredentialSource: attemptStoreCredentialSource(),
    cloudTtsConfigured: Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    allowedOriginConfigured: allowed.length > 0,
    apiVersion: "2.6.0"
  });
};
