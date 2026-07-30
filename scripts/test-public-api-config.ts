import assert from "node:assert/strict";
import { publicApiConfig, resolvePublicApiBaseUrl } from "../src/lib/apiConfig";

assert.deepEqual(publicApiConfig, {
  baseUrl: "",
  sessionInit: "/api/session/init/",
  patientAgent: "/api/agent-chat/",
  trainingAction: "/api/training-action/",
  tts: "/api/tts/",
  health: "/api/health/"
}, "the default browser contract must expose only same-origin relative API routes");

assert.equal(
  resolvePublicApiBaseUrl(undefined, { NODE_ENV: "development" }),
  "",
  "local browser clients must default to same-origin relative API routes"
);
assert.equal(
  resolvePublicApiBaseUrl("http://127.0.0.1:8787", { NODE_ENV: "development" }),
  "http://127.0.0.1:8787",
  "an explicit local API origin must remain an opt-in development contract"
);
assert.equal(
  resolvePublicApiBaseUrl(undefined, { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" }),
  "",
  "Vercel previews must use same-origin relative API routes when no public API origin is injected"
);
assert.equal(
  resolvePublicApiBaseUrl("https://hematuria-training-system.vercel.app", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" }),
  "",
  "Vercel previews must not inherit the production API origin and load an older backend"
);
assert.equal(
  resolvePublicApiBaseUrl("https://hematuria-training-system.vercel.app", { NODE_ENV: "production", NEXT_PUBLIC_VERCEL_ENV: "preview" }),
  "",
  "the client-visible Vercel scope must keep preview bundles on their own origin"
);
assert.equal(
  resolvePublicApiBaseUrl("https://hematuria-training-system.vercel.app", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }),
  "",
  "Vercel production must use relative same-origin API routes even when a public origin is injected"
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
  () => resolvePublicApiBaseUrl("https://127.0.0.1:3001", { NODE_ENV: "production" }),
  /cannot use localhost/,
  "production must reject an explicitly injected test API origin"
);
assert.throws(
  () => resolvePublicApiBaseUrl("https://api.example.test/api", { NODE_ENV: "production" }),
  /origin without an API path/
);

console.log("Public API configuration passed for Vercel same-origin preview and fail-closed static production builds.");
