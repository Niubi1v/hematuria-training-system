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
  attempt: AttemptIdentity,
  expected: Pick<AttemptIdentity, "caseId" | "mode" | "language"> & Partial<Pick<AttemptIdentity, "participantId" | "schemaVersion">>
) {
  return attempt.schemaVersion === "attempt-v3"
    && attempt.caseId === expected.caseId
    && attempt.mode === expected.mode
    && attempt.language === expected.language
    && (!expected.participantId || attempt.participantId === expected.participantId)
    && (!expected.schemaVersion || attempt.schemaVersion === expected.schemaVersion);
}

export function recordTimeoutOnce(events: Array<{ type: string; [key: string]: unknown }>, at = new Date().toISOString()) {
  return events.some((event) => event.type === "timeout") ? events : [...events, { type: "timeout", at }];
}
