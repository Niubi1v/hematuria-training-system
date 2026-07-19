import fs from "node:fs";
import path from "node:path";

export const REDACTED = "[REDACTED]";

const SENSITIVE_NAME_SOURCE = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-vercel-protection-bypass",
  "x-vercel-set-bypass-cookie",
  "session[_-]?token",
  "attempt[_-]?token",
  "training(?:[_-]?(?:state|attempt))?[_-]?(?:signature|token|secret)",
  "signature",
  "redis[_-]?(?:token|url)",
  "(?:upstash|kv)[_-]?(?:rest[_-]?api[_-]?)?(?:token|url)",
  "vercel[_-]?automation[_-]?bypass[_-]?secret"
].join("|");

const SENSITIVE_NAME = new RegExp(`^(?:${SENSITIVE_NAME_SOURCE})$`, "i");
const REDACTED_VALUE = /^(?:\[?REDACTED\]?|<redacted>)$/i;

function replaceAllLiteral(text, needle, replacement) {
  if (!needle || !text.includes(needle)) return text;
  return text.split(needle).join(replacement);
}

function isSensitiveKey(key) {
  return SENSITIVE_NAME.test(String(key || "").trim());
}

function isRedacted(value) {
  return REDACTED_VALUE.test(String(value || "").trim());
}

/**
 * Redacts known runtime values and sensitive key/value pairs without removing
 * the field name. The resulting text may safely state that a header was
 * present, but it cannot preserve its value.
 */
export function redactSensitiveText(value, secrets = []) {
  let text = String(value ?? "");
  const exactValues = [...new Set(secrets.map((entry) => String(entry || "")).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (const secret of exactValues) text = replaceAllLiteral(text, secret, REDACTED);

  const quotedPair = new RegExp(
    `(["']?(?:${SENSITIVE_NAME_SOURCE})["']?\\s*[:=]\\s*)(["'])(.*?)\\2`,
    "gi"
  );
  text = text.replace(quotedPair, (match, prefix, quote, raw) => (
    isRedacted(raw) ? match : `${prefix}${quote}${REDACTED}${quote}`
  ));

  const headerLine = new RegExp(
    `(^|[\\r\\n,{;(\\s]\\s*)((?:${SENSITIVE_NAME_SOURCE})\\s*[:=]\\s*)([^\\r\\n,;}]+)`,
    "gi"
  );
  text = text.replace(headerLine, (match, boundary, prefix, raw) => (
    isRedacted(raw) ? match : `${boundary}${prefix}${REDACTED}`
  ));

  const queryValue = new RegExp(
    `([?&](?:${SENSITIVE_NAME_SOURCE})=)([^&#\\s]*)`,
    "gi"
  );
  text = text.replace(queryValue, (match, prefix, raw) => {
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* Malformed queries are redacted. */ }
    return isRedacted(decoded) ? match : `${prefix}${encodeURIComponent(REDACTED)}`;
  });
  return text;
}

export function hasUnredactedSensitiveText(value, secrets = []) {
  const text = String(value ?? "");
  return redactSensitiveText(text, secrets) !== text;
}

export function redactSensitiveValue(value, secrets = [], seen = new WeakSet()) {
  if (typeof value === "string") return redactSensitiveText(value, secrets);
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const safeError = {
      name: redactSensitiveText(value.name, secrets),
      message: redactSensitiveText(value.message, secrets),
      stack: redactSensitiveText(value.stack || "", secrets)
    };
    if (value.cause !== undefined) safeError.cause = redactSensitiveValue(value.cause, secrets, seen);
    for (const key of Object.keys(value)) {
      safeError[key] = isSensitiveKey(key) ? REDACTED : redactSensitiveValue(value[key], secrets, seen);
    }
    return safeError;
  }
  if (Array.isArray(value)) return value.map((entry) => redactSensitiveValue(entry, secrets, seen));

  const safe = {};
  for (const [key, entry] of Object.entries(value)) {
    safe[key] = isSensitiveKey(key) ? REDACTED : redactSensitiveValue(entry, secrets, seen);
  }
  return safe;
}

export function valueHasUnredactedSensitiveData(value, secrets = [], seen = new WeakSet()) {
  if (typeof value === "string") return hasUnredactedSensitiveText(value, secrets);
  if (value === null || value === undefined || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (value instanceof Error) {
    if (hasUnredactedSensitiveText(value.message, secrets) || hasUnredactedSensitiveText(value.stack || "", secrets)) return true;
    if (value.cause !== undefined && valueHasUnredactedSensitiveData(value.cause, secrets, seen)) return true;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveKey(key) && !isRedacted(entry)) return true;
    if (valueHasUnredactedSensitiveData(entry, secrets, seen)) return true;
  }
  return false;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("Preview output scan refuses symbolic links.");
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
    } else if (stat.isFile()) {
      files.push(current);
    }
  }
  return files;
}

/**
 * Scans generated output without returning paths or matched values. Any read
 * failure, symlink, oversized file, raw credential key/value or exact canary is
 * a fail-closed result.
 */
export function scanPreviewOutputDirectories(directories, secrets = [], options = {}) {
  const maxFileBytes = Number(options.maxFileBytes || 32 * 1024 * 1024);
  let filesScanned = 0;
  let findings = 0;
  try {
    const files = directories.flatMap((directory) => listFiles(directory));
    for (const file of files) {
      filesScanned += 1;
      if (hasUnredactedSensitiveText(path.basename(file), secrets)) {
        findings += 1;
        continue;
      }
      const stat = fs.statSync(file);
      if (stat.size > maxFileBytes) {
        return { safe: false, filesScanned, findings, scanError: true };
      }
      const bytes = fs.readFileSync(file);
      const exactLeak = secrets.some((secret) => {
        const value = String(secret || "");
        return value.length > 0 && bytes.includes(Buffer.from(value));
      });
      if (exactLeak || hasUnredactedSensitiveText(bytes.toString("utf8"), secrets)) findings += 1;
    }
    return { safe: findings === 0, filesScanned, findings, scanError: false };
  } catch {
    return { safe: false, filesScanned, findings, scanError: true };
  }
}

export function assessCapturedPreviewRun({ stdout = "", stderr = "", error = null, outputDirectories = [], secrets = [] }) {
  const memoryUnsafe = [stdout, stderr, error]
    .some((entry) => entry !== null && valueHasUnredactedSensitiveData(entry, secrets));
  const artifactScan = scanPreviewOutputDirectories(outputDirectories, secrets);
  const executionError = error !== null && error !== undefined;
  return {
    safe: !executionError && !memoryUnsafe && artifactScan.safe,
    executionError,
    memoryUnsafe,
    artifactScan
  };
}

export function removePreviewOutputDirectories(directories) {
  for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
}
