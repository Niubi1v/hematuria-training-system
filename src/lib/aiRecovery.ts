import type { CollectedMap, KeyPointId } from "./types";

export type AiConnectionStatus = "unknown" | "checking" | "connected" | "degraded" | "reconnecting" | "offline" | "error";
export type PublicConnectionState = "idle" | "initializing" | "ready" | "degraded" | "reconnecting" | "offline" | "failed";
export type ConnectionTransition = {
  at: string;
  from: PublicConnectionState;
  to: PublicConnectionState;
};

export function publicConnectionState(status: AiConnectionStatus): PublicConnectionState {
  return ({
    unknown: "idle",
    checking: "initializing",
    connected: "ready",
    degraded: "degraded",
    reconnecting: "reconnecting",
    offline: "offline",
    error: "failed"
  } as const)[status];
}

export function recordConnectionTransition(
  history: ConnectionTransition[],
  from: AiConnectionStatus,
  to: AiConnectionStatus,
  at = new Date().toISOString(),
  limit = 50
) {
  const event = { at, from: publicConnectionState(from), to: publicConnectionState(to) };
  if (event.from === event.to) return history;
  return [...history, event].slice(-limit);
}

export type CachedPatientSession = {
  sessionId: string;
  attemptId: string;
  caseId: string;
  language: "zh" | "en";
  mode: string;
  patientOpeningStatement: string;
  sessionCreatedAt: string;
  sessionExpiresAt: string;
  deploymentSha: string;
  apiVersion: string;
  aiStatus: "unknown" | "available" | "degraded";
  profileSource: "local-reviewed" | "local-simulation";
};

const connectionFailureReasons = new Set([
  "llm_error", "provider_timeout", "provider_rate_limit", "provider_unavailable", "provider_not_configured",
  "llm_unavailable_or_rule_mode", "ai_unavailable_or_rule_mode"
]);

const safetyFallbackReasons = new Set([
  "diagnosis_boundary", "report_boundary", "compound_question_preserves_all_facts", "ai_response_blocked", "medical_bilingual_conflict_pending_review", "safety_filter"
]);

export function isConnectionFailureFallback(reason = "") {
  const normalized = reason.toLowerCase();
  if (safetyFallbackReasons.has(normalized) || normalized.startsWith("blocked_")) return false;
  return connectionFailureReasons.has(normalized) || /provider_(?:timeout|rate_limit|unavailable)|llm_(?:error|unavailable)/.test(normalized);
}

export function isSafetyFallback(reason = "") {
  const normalized = reason.toLowerCase();
  return safetyFallbackReasons.has(normalized) || normalized.startsWith("blocked_");
}

export function validCachedSession(session: CachedPatientSession | null, expected: {
  attemptId: string;
  caseId: string;
  language: "zh" | "en";
  mode: string;
  deploymentSha?: string;
  apiVersion?: string;
  now?: number;
}): session is CachedPatientSession {
  if (!session?.sessionId || session.attemptId !== expected.attemptId || session.caseId !== expected.caseId || session.language !== expected.language || session.mode !== expected.mode) return false;
  const now = expected.now ?? Date.now();
  if (!Number.isFinite(Date.parse(session.sessionExpiresAt)) || Date.parse(session.sessionExpiresAt) <= now) return false;
  if (expected.deploymentSha && session.deploymentSha && session.deploymentSha !== expected.deploymentSha) return false;
  if (expected.apiVersion && session.apiVersion && session.apiVersion !== expected.apiVersion) return false;
  return true;
}

export function mergeRecoveredCoverage(
  askedSlots: string[],
  collected: CollectedMap,
  matchedSlotIds: string[],
  canonicalToCollected: Record<string, KeyPointId | undefined>
) {
  const nextAskedSlots = [...new Set([...askedSlots, ...matchedSlotIds])];
  const nextCollected = { ...collected };
  for (const slot of matchedSlotIds) {
    const key = canonicalToCollected[slot];
    if (key) nextCollected[key] = true;
  }
  return { askedSlots: nextAskedSlots, collected: nextCollected };
}
