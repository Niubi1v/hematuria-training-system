const { createHash } = require("node:crypto");
const { parseJsonBody, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../server/requestSecurity.js");

const allowedVoices = new Set([
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-YunxiNeural",
  "en-US-JennyNeural",
  "en-US-GuyNeural"
]);

const requestWindows = globalThis.__hematuriaTtsRequestWindows || new Map();
const audioCache = globalThis.__hematuriaTtsAudioCache || new Map();
const inFlightAudio = globalThis.__hematuriaTtsInFlightAudio || new Map();
const AUDIO_CACHE_TTL_MS = 3_600_000;
const MAX_TTS_IN_FLIGHT = 100;
globalThis.__hematuriaTtsRequestWindows = requestWindows;
globalThis.__hematuriaTtsAudioCache = audioCache;
globalThis.__hematuriaTtsInFlightAudio = inFlightAudio;

function setCors(req, res) {
  const allowed = (process.env.TTS_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || "https://niubi1v.github.io")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origin = String(req.headers.origin || "");
  if (origin && allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[character]));
}

function cacheTuple(origin, text, voiceName, rate, pitch) {
  return JSON.stringify([origin || "server", voiceName, rate, pitch, text]);
}

function sendAudio(res, audio, cacheStatus) {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-TTS-Cache", cacheStatus);
  return res.status(200).send(audio);
}

async function synthesize({ speechKey, region, ssml }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), positiveInteger(process.env.TTS_REQUEST_TIMEOUT_MS, 10_000, 30_000));
  try {
    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "hematuria-training-system"
      },
      body: ssml,
      signal: controller.signal
    });
    if (!response.ok) return { statusCode: 502, error: { code: "cloud_tts_failed", message: `Cloud TTS returned ${response.status}` } };
    return { statusCode: 200, audio: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    return {
      statusCode: error?.name === "AbortError" ? 504 : 502,
      error: { code: "cloud_tts_failed", message: error?.name === "AbortError" ? "Cloud TTS timed out" : "Cloud TTS request failed" }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(tuple) {
  return createHash("sha256").update(tuple, "utf8").digest("hex");
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed", message: "POST required" });

  const allowedOrigins = (process.env.TTS_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || "https://niubi1v.github.io")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origin = String(req.headers.origin || "");
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ code: "origin_not_allowed", message: "Origin is not allowed" });
  const rateLimit = takeRateLimit(req, {
    store: requestWindows,
    limit: positiveInteger(process.env.TTS_RATE_LIMIT_PER_MINUTE, 30, 1000),
    windowMs: 60_000
  });
  setRateLimitHeaders(res, rateLimit);
  if (rateLimit.limited) return res.status(429).json({ code: "rate_limited", message: "Too many TTS requests" });

  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return res.status(415).json({ code: "content_type_not_supported", message: "application/json is required" });
  let body;
  try {
    body = parseJsonBody(req, 16 * 1024);
  } catch (error) {
    const code = String(error?.message || error);
    if (code === "request_body_too_large") return res.status(413).json({ code, message: "TTS request body is too large" });
    return res.status(400).json({ code: "invalid_json_body", message: "TTS request body must be valid JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((field) => !["text", "voiceName", "rate", "pitch"].includes(field))) {
    return res.status(400).json({ code: "unexpected_request_field", message: "TTS request contains unsupported fields" });
  }
  const text = String(body.text || "").replace(/\s+/g, " ").trim();
  const voiceName = String(body.voiceName || "");
  const rate = Math.min(1.15, Math.max(0.8, Number(body.rate) || 0.92));
  const pitch = Math.min(1.1, Math.max(0.85, Number(body.pitch) || 1));
  if (!text || text.length > 500) return res.status(400).json({ code: "invalid_text", message: "Text must contain 1-500 characters" });
  if (!allowedVoices.has(voiceName)) return res.status(400).json({ code: "voice_not_allowed", message: "Voice is not allowed" });

  const speechKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!speechKey || !region) return res.status(503).json({ code: "cloud_tts_unavailable", message: "Cloud TTS is not configured" });

  const tuple = cacheTuple(origin, text, voiceName, rate, pitch);
  const key = cacheKey(tuple);
  const cached = audioCache.get(key);
  if (cached?.tuple === tuple && cached.expiresAt > Date.now() && Buffer.isBuffer(cached.audio)) {
    return sendAudio(res, cached.audio, "HIT");
  }
  if (cached) audioCache.delete(key);

  const locale = voiceName.startsWith("en-US") ? "en-US" : "zh-CN";
  const ratePercent = Math.round((rate - 1) * 100);
  const pitchPercent = Math.round((pitch - 1) * 100);
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voiceName}"><prosody rate="${ratePercent}%" pitch="${pitchPercent}%">${escapeXml(text)}</prosody></voice></speak>`;
  const existing = inFlightAudio.get(key);
  if (existing?.tuple === tuple) {
    const result = await existing.promise;
    if (result.statusCode !== 200) return res.status(result.statusCode).json(result.error);
    return sendAudio(res, result.audio, "COALESCED");
  }
  if (inFlightAudio.size >= MAX_TTS_IN_FLIGHT) {
    res.setHeader("Retry-After", "1");
    return res.status(429).json({ code: "tts_concurrency_limited", message: "Too many TTS requests are in progress" });
  }
  const promise = synthesize({ speechKey, region, ssml }).then((result) => {
    if (result.statusCode === 200) {
      if (audioCache.size >= 100) audioCache.delete(audioCache.keys().next().value);
      audioCache.set(key, { tuple, audio: result.audio, expiresAt: Date.now() + AUDIO_CACHE_TTL_MS });
    }
    return result;
  });
  const entry = { tuple, promise };
  inFlightAudio.set(key, entry);
  try {
    const result = await promise;
    if (result.statusCode !== 200) return res.status(result.statusCode).json(result.error);
    return sendAudio(res, result.audio, "MISS");
  } finally {
    if (inFlightAudio.get(key) === entry) inFlightAudio.delete(key);
  }
};
