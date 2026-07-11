const allowedVoices = new Set([
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-YunxiNeural",
  "en-US-JennyNeural",
  "en-US-GuyNeural"
]);

const requestWindows = globalThis.__hematuriaTtsRequestWindows || new Map();
const audioCache = globalThis.__hematuriaTtsAudioCache || new Map();
globalThis.__hematuriaTtsRequestWindows = requestWindows;
globalThis.__hematuriaTtsAudioCache = audioCache;

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

function rateLimited(req) {
  const key = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anonymous").split(",")[0];
  const now = Date.now();
  const recent = (requestWindows.get(key) || []).filter((stamp) => now - stamp < 60_000);
  recent.push(now);
  requestWindows.set(key, recent);
  return recent.length > Number(process.env.TTS_RATE_LIMIT_PER_MINUTE || 30);
}

function cacheKey(text, voiceName, rate, pitch) {
  let hash = 2166136261;
  const input = `${voiceName}|${rate}|${pitch}|${text}`;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed", message: "POST required" });

  const allowedOrigins = (process.env.TTS_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || "https://niubi1v.github.io")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const origin = String(req.headers.origin || "");
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ code: "origin_not_allowed", message: "Origin is not allowed" });
  if (rateLimited(req)) return res.status(429).json({ code: "rate_limited", message: "Too many TTS requests" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = String(body.text || "").replace(/\s+/g, " ").trim();
  const voiceName = String(body.voiceName || "");
  const rate = Math.min(1.15, Math.max(0.8, Number(body.rate) || 0.92));
  const pitch = Math.min(1.1, Math.max(0.85, Number(body.pitch) || 1));
  if (!text || text.length > 500) return res.status(400).json({ code: "invalid_text", message: "Text must contain 1-500 characters" });
  if (!allowedVoices.has(voiceName)) return res.status(400).json({ code: "voice_not_allowed", message: "Voice is not allowed" });

  const speechKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!speechKey || !region) return res.status(503).json({ code: "cloud_tts_unavailable", message: "Cloud TTS is not configured" });

  const key = cacheKey(text, voiceName, rate, pitch);
  const cached = audioCache.get(key);
  if (cached) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-TTS-Cache", "HIT");
    return res.status(200).send(cached);
  }

  const locale = voiceName.startsWith("en-US") ? "en-US" : "zh-CN";
  const ratePercent = Math.round((rate - 1) * 100);
  const pitchPercent = Math.round((pitch - 1) * 100);
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voiceName}"><prosody rate="${ratePercent}%" pitch="${pitchPercent}%">${escapeXml(text)}</prosody></voice></speak>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TTS_REQUEST_TIMEOUT_MS || 10000));
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
    if (!response.ok) return res.status(502).json({ code: "cloud_tts_failed", message: `Cloud TTS returned ${response.status}` });
    const audio = Buffer.from(await response.arrayBuffer());
    if (audioCache.size >= 100) audioCache.delete(audioCache.keys().next().value);
    audioCache.set(key, audio);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-TTS-Cache", "MISS");
    return res.status(200).send(audio);
  } catch (error) {
    return res.status(error?.name === "AbortError" ? 504 : 502).json({ code: "cloud_tts_failed", message: error?.name === "AbortError" ? "Cloud TTS timed out" : "Cloud TTS request failed" });
  } finally {
    clearTimeout(timeout);
  }
};
