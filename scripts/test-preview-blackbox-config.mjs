import assert from "node:assert/strict";

import {
  DEFAULT_PREVIEW_URL,
  createPreviewProtectionHeaders,
  previewOutputHasSensitiveData,
  resolvePreviewBlackboxConfig,
  shouldAttachPreviewProtection
} from "./preview-blackbox-config.mjs";

const missing = resolvePreviewBlackboxConfig({});
assert.deepEqual(missing, {
  blocked: true,
  reason: "BLOCKED_PREVIEW_AUTH",
  message: "VERCEL_AUTOMATION_BYPASS_SECRET is not available in the test process."
});

const secret = "unit-test-only-bypass-value";
const ready = resolvePreviewBlackboxConfig({
  VERCEL_AUTOMATION_BYPASS_SECRET: `  ${secret}\r\n`,
  PLAYWRIGHT_PREVIEW_URL: DEFAULT_PREVIEW_URL
});
assert.equal(ready.blocked, false);
assert.equal(ready.baseURL, DEFAULT_PREVIEW_URL);
assert.equal(ready.bypassSecret, secret);
assert.equal(ready.baseURL.includes(secret), false, "the bypass secret must never enter the URL");
assert.deepEqual(createPreviewProtectionHeaders(ready), {
  "x-vercel-protection-bypass": secret,
  "x-vercel-set-bypass-cookie": "true"
});
assert.equal(shouldAttachPreviewProtection(`${DEFAULT_PREVIEW_URL}api/health/`, DEFAULT_PREVIEW_URL), true);
assert.equal(shouldAttachPreviewProtection("http://127.0.0.1:3000/api/health/", DEFAULT_PREVIEW_URL), false);
assert.equal(shouldAttachPreviewProtection("https://niubi1v.github.io/hematuria-training-system/api/health/", DEFAULT_PREVIEW_URL), false);
assert.equal(shouldAttachPreviewProtection("https://hematuria-training-system.vercel.app/api/health/", DEFAULT_PREVIEW_URL), false);
assert.equal(previewOutputHasSensitiveData("safe test summary", secret), false);
assert.equal(previewOutputHasSensitiveData(`request failed ${secret}`, secret), true);
assert.equal(previewOutputHasSensitiveData("Cookie: redacted-test-value", secret), true);
assert.equal(previewOutputHasSensitiveData("x-vercel-protection-bypass: redacted-test-value", secret), true);

assert.throws(
  () => resolvePreviewBlackboxConfig({
    VERCEL_AUTOMATION_BYPASS_SECRET: secret,
    PLAYWRIGHT_PREVIEW_URL: "https://example.com/"
  }),
  /Vercel Preview HTTPS URL/
);

assert.throws(
  () => resolvePreviewBlackboxConfig({
    VERCEL_AUTOMATION_BYPASS_SECRET: secret,
    PLAYWRIGHT_PREVIEW_URL: `${DEFAULT_PREVIEW_URL}?x=${secret}`
  }),
  /must not contain credentials, query parameters or fragments/
);

console.log("Preview black-box authentication configuration passed without persisting credentials.");
