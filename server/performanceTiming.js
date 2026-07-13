const ALLOWED_METRICS = new Set(["app", "provider", "session", "history", "score"]);
const MAX_DURATION_MS = 10 * 60 * 1000;

function safeDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 && duration <= MAX_DURATION_MS
    ? duration
    : null;
}

function formatServerTiming(metrics = {}) {
  return Object.entries(metrics)
    .filter(([name, value]) => ALLOWED_METRICS.has(name) && safeDuration(value) !== null)
    .map(([name, value]) => `${name};dur=${safeDuration(value).toFixed(1)}`)
    .join(", ");
}

function parseServerTiming(value = "") {
  const metrics = {};
  for (const entry of String(value).split(",")) {
    const match = entry.trim().match(/^([a-z]+);dur=(\d+(?:\.\d+)?)$/);
    if (!match || !ALLOWED_METRICS.has(match[1])) continue;
    const duration = safeDuration(match[2]);
    if (duration !== null) metrics[match[1]] = duration;
  }
  return metrics;
}

function setServerTiming(res, metrics) {
  const value = formatServerTiming(metrics);
  if (value) res.setHeader("Server-Timing", value);
  return value;
}

module.exports = { formatServerTiming, parseServerTiming, setServerTiming };
