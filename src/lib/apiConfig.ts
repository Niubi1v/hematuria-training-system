export type ApiEndpointName = "sessionInit" | "patientAgent" | "trainingAction" | "tts" | "health";

export type PublicApiConfig = Readonly<Record<ApiEndpointName, string> & { baseUrl: string }>;

function validateBaseUrl(raw: string | undefined): string {
  const isProduction = process.env.NODE_ENV === "production";
  const fallback = isProduction ? "" : "http://127.0.0.1:3001";
  const candidate = String(raw || fallback).trim().replace(/\/+$/, "");
  if (!candidate) throw new Error("NEXT_PUBLIC_API_BASE_URL is required for production builds.");
  const parsed = new URL(candidate);
  if (isProduction && parsed.protocol !== "https:") throw new Error("Production API base URL must use HTTPS.");
  if (isProduction && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("Production API base URL cannot use localhost.");
  return parsed.toString().replace(/\/+$/, "");
}

const baseUrl = validateBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

export const publicApiConfig: PublicApiConfig = Object.freeze({
  baseUrl,
  sessionInit: `${baseUrl}/api/session/init/`,
  patientAgent: `${baseUrl}/api/agent-chat/`,
  trainingAction: `${baseUrl}/api/training-action/`,
  tts: `${baseUrl}/api/tts/`,
  health: `${baseUrl}/api/health/`
});
