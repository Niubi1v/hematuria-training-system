function resolveRedisRestCredentials() {
  const upstashUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const upstashToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  const kvUrl = String(process.env.KV_REST_API_URL || "").trim();
  const kvToken = String(process.env.KV_REST_API_TOKEN || "").trim();
  const url = upstashUrl || kvUrl;
  const token = upstashToken || kvToken;
  let source = "none";
  if (url && token) {
    if (upstashUrl && upstashToken) source = "upstash_rest";
    else if (!upstashUrl && !upstashToken && kvUrl && kvToken) source = "vercel_kv_rest";
    else source = "mixed_rest";
  }
  return { url, token, source };
}

module.exports = { resolveRedisRestCredentials };
