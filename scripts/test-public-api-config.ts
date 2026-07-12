import assert from "node:assert/strict";
import { resolvePublicApiBaseUrl } from "../src/lib/apiConfig";

assert.equal(
  resolvePublicApiBaseUrl(undefined, { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" }),
  "",
  "Vercel previews must use same-origin relative API routes when no public API origin is injected"
);
assert.throws(
  () => resolvePublicApiBaseUrl(undefined, { NODE_ENV: "production" }),
  /NEXT_PUBLIC_API_BASE_URL is required/,
  "non-Vercel production/static exports must remain fail-closed"
);
assert.equal(
  resolvePublicApiBaseUrl("https://api.example.test/", { NODE_ENV: "production" }),
  "https://api.example.test"
);
assert.throws(
  () => resolvePublicApiBaseUrl("http://api.example.test", { NODE_ENV: "production" }),
  /must use HTTPS/
);
assert.throws(
  () => resolvePublicApiBaseUrl("https://api.example.test/api", { NODE_ENV: "production" }),
  /origin without an API path/
);

console.log("Public API configuration passed for Vercel same-origin preview and fail-closed static production builds.");
