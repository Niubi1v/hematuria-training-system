export type ApiEndpointName = "sessionInit" | "patientAgent" | "trainingAction" | "tts" | "health";

export type PublicApiConfig = Readonly<Record<ApiEndpointName, string> & { baseUrl: string }>;

type PublicApiEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "VERCEL" | "VERCEL_ENV" | "NEXT_PUBLIC_VERCEL_ENV">>;

export type DesktopRuntimeConfig = Readonly<{
  runtimeTarget: "desktop";
  apiBaseUrl: string;
  authToken: string;
}>;

declare global {
  // The Tauri host injects this value before any application JavaScript runs.
  // It is intentionally launch-scoped and is never persisted by the renderer.
  var __HEMATURIA_DESKTOP_RUNTIME__: DesktopRuntimeConfig | undefined;
}

export function resolvePublicApiBaseUrl(raw: string | undefined, env: PublicApiEnvironment = process.env): string {
  const isProduction = env.NODE_ENV === "production";
  const vercelEnvironment = env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV;
  const isVercelBuild = env.VERCEL === "1" || Boolean(vercelEnvironment);
  // Every Vercel deployment contains its own same-origin API functions. Project-level
  // public variables may point at another deployment, which would split CORS, signing
  // secrets and the durable attempt-store namespace. Local browser clients use the same
  // relative contract by default; an explicit development origin remains opt-in.
  if (isVercelBuild) return "";
  const candidate = String(raw || "").trim().replace(/\/+$/, "");
  if (!candidate && !isProduction) return "";
  if (!candidate) throw new Error("NEXT_PUBLIC_API_BASE_URL is required for production builds.");
  const parsed = new URL(candidate);
  if (isProduction && parsed.protocol !== "https:") throw new Error("Production API base URL must use HTTPS.");
  if (isProduction && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("Production API base URL cannot use localhost.");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("NEXT_PUBLIC_API_BASE_URL must be an origin without an API path.");
  return parsed.toString().replace(/\/+$/, "");
}

function validatedDesktopRuntime(): DesktopRuntimeConfig | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = globalThis.__HEMATURIA_DESKTOP_RUNTIME__;
  if (!candidate || candidate.runtimeTarget !== "desktop") return null;
  const parsed = new URL(String(candidate.apiBaseUrl || ""));
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Desktop API origin must be an HTTP 127.0.0.1 origin.");
  }
  if (!/^[A-Za-z0-9_-]{43,}$/.test(String(candidate.authToken || ""))) {
    throw new Error("Desktop API authentication token is invalid.");
  }
  return Object.freeze({
    runtimeTarget: "desktop",
    apiBaseUrl: parsed.toString().replace(/\/+$/, ""),
    authToken: candidate.authToken
  });
}

export function desktopRuntimeConfig(): DesktopRuntimeConfig | null {
  return validatedDesktopRuntime();
}

const desktopRuntime = process.env.NEXT_PUBLIC_RUNTIME_TARGET === "desktop"
  ? validatedDesktopRuntime()
  : null;
const baseUrl = desktopRuntime?.apiBaseUrl || (
  process.env.NEXT_PUBLIC_RUNTIME_TARGET === "desktop"
    // During static prerender the Tauri launch configuration does not exist yet.
    // The browser evaluates this module again after the host injects it.
    ? ""
    : resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV
      })
);

export const publicApiConfig: PublicApiConfig = Object.freeze({
  baseUrl,
  sessionInit: `${baseUrl}/api/session/init/`,
  patientAgent: `${baseUrl}/api/agent-chat/`,
  trainingAction: `${baseUrl}/api/training-action/`,
  tts: `${baseUrl}/api/tts/`,
  health: `${baseUrl}/api/health/`
});
