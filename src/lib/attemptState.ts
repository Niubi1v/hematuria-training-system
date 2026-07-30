export type AttemptMode = "free" | "osce" | "rct";
export type AttemptLanguage = "zh" | "en";

export type AttemptIdentity = {
  attemptId: string;
  caseId: string;
  mode: AttemptMode;
  language: AttemptLanguage;
  participantId: string;
  schemaVersion: "attempt-v3";
  createdAt: string;
};

export type StoredAttemptState = {
  attempt?: AttemptIdentity;
  activeStageNo?: number;
  submitted?: Record<string, unknown>;
  finalReport?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export function createAttempt(caseId: string, mode: AttemptMode, language: AttemptLanguage, participantId = "practice-user"): AttemptIdentity {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { attemptId: random, caseId, mode, language, participantId, schemaVersion: "attempt-v3", createdAt: new Date().toISOString() };
}

function participantScope(participantId: string, schemaVersion: AttemptIdentity["schemaVersion"]) {
  // Preserve existing public-practice keys while isolating named OSCE/RCT participants.
  return participantId === "practice-user" ? "" : `:participant:${encodeURIComponent(participantId)}:${schemaVersion}`;
}

export function attemptStorageKey(attempt: Pick<AttemptIdentity, "caseId" | "mode" | "language" | "attemptId" | "participantId" | "schemaVersion">) {
  return `hematuria-attempt-v3:${attempt.caseId}:${attempt.mode}:${attempt.language}${participantScope(attempt.participantId, attempt.schemaVersion)}:${attempt.attemptId}`;
}

export function attemptPointerKey(caseId: string, mode: AttemptMode, language: AttemptLanguage, participantId = "practice-user", schemaVersion: AttemptIdentity["schemaVersion"] = "attempt-v3") {
  return `hematuria-attempt-pointer-v3:${caseId}:${mode}:${language}${participantScope(participantId, schemaVersion)}`;
}

export function trainingStateStorageKey(attemptId: string, apiBaseUrl: string, pageOrigin: string) {
  const apiScope = String(apiBaseUrl || pageOrigin || "same-origin").trim().replace(/\/+$/, "").toLowerCase();
  return `hematuria-training-state-v4:${encodeURIComponent(apiScope)}:${attemptId}`;
}

export function legacyTrainingStateStorageKey(attemptId: string) {
  return `hematuria-training-state-v3:${attemptId}`;
}

export function isAttemptCompatible(
  attempt: unknown,
  expected: Pick<AttemptIdentity, "caseId" | "mode" | "language"> & Partial<Pick<AttemptIdentity, "participantId" | "schemaVersion">>
) : attempt is AttemptIdentity {
  if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) return false;
  const candidate = attempt as Partial<AttemptIdentity>;
  if (
    typeof candidate.attemptId !== "string" || !candidate.attemptId.trim()
    || typeof candidate.caseId !== "string" || !candidate.caseId.trim()
    || !["free", "osce", "rct"].includes(String(candidate.mode))
    || !["zh", "en"].includes(String(candidate.language))
    || typeof candidate.participantId !== "string" || !candidate.participantId.trim()
    || candidate.schemaVersion !== "attempt-v3"
    || typeof candidate.createdAt !== "string" || !candidate.createdAt.trim()
    || !Number.isFinite(Date.parse(candidate.createdAt))
  ) return false;
  return candidate.caseId === expected.caseId
    && candidate.mode === expected.mode
    && candidate.language === expected.language
    && (!expected.participantId || candidate.participantId === expected.participantId)
    && (!expected.schemaVersion || candidate.schemaVersion === expected.schemaVersion);
}

export function isStoredAttemptStateCompatible<T extends StoredAttemptState>(
  value: T | null | undefined,
  expected: AttemptIdentity
): value is T & { attempt: AttemptIdentity } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const storedAttempt = (value as StoredAttemptState).attempt;
  return isAttemptCompatible(storedAttempt, expected)
    && storedAttempt.attemptId === expected.attemptId;
}

export function recordTimeoutOnce(events: Array<{ type: string; [key: string]: unknown }>, at = new Date().toISOString()) {
  return events.some((event) => event.type === "timeout") ? events : [...events, { type: "timeout", at }];
}
