export const DEFAULT_PREVIEW_URL = "https://hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app/";

const BLOCKED = Object.freeze({
  blocked: true,
  reason: "BLOCKED_PREVIEW_AUTH",
  message: "VERCEL_AUTOMATION_BYPASS_SECRET is not available in the test process."
});

export function resolvePreviewBlackboxConfig(env = process.env) {
  const bypassSecret = String(env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
  if (!bypassSecret) return BLOCKED;

  const rawUrl = String(env.PLAYWRIGHT_PREVIEW_URL || DEFAULT_PREVIEW_URL).trim();
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("PLAYWRIGHT_PREVIEW_URL must be a Vercel Preview HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".vercel.app")) {
    throw new Error("PLAYWRIGHT_PREVIEW_URL must be a Vercel Preview HTTPS URL.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("PLAYWRIGHT_PREVIEW_URL must not contain credentials, query parameters or fragments.");
  }

  return Object.freeze({
    blocked: false,
    baseURL: parsed.toString(),
    bypassSecret
  });
}

export function createPreviewProtectionHeaders(config) {
  if (!config || config.blocked || !config.bypassSecret) {
    throw new Error("BLOCKED_PREVIEW_AUTH: preview protection credentials are unavailable.");
  }
  return {
    "x-vercel-protection-bypass": config.bypassSecret,
    "x-vercel-set-bypass-cookie": "true"
  };
}

export function shouldAttachPreviewProtection(requestUrl, baseURL) {
  try {
    return new URL(requestUrl).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

export function previewOutputHasSensitiveData(output, bypassSecret) {
  const text = String(output || "");
  const secret = String(bypassSecret || "");
  return (secret.length > 0 && Buffer.from(text).includes(Buffer.from(secret)))
    || /\b(?:authorization|cookie|set-cookie|x-vercel-protection-bypass)\s*:/i.test(text);
}
