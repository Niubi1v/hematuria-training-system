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

export function attemptStorageKey(attempt: Pick<AttemptIdentity, "caseId" | "mode" | "language" | "attemptId">) {
  return `hematuria-attempt-v3:${attempt.caseId}:${attempt.mode}:${attempt.language}:${attempt.attemptId}`;
}

export function attemptPointerKey(caseId: string, mode: AttemptMode, language: AttemptLanguage) {
  return `hematuria-attempt-pointer-v3:${caseId}:${mode}:${language}`;
}

export function isAttemptCompatible(attempt: AttemptIdentity, expected: Pick<AttemptIdentity, "caseId" | "mode" | "language">) {
  return attempt.schemaVersion === "attempt-v3" && attempt.caseId === expected.caseId && attempt.mode === expected.mode && attempt.language === expected.language;
}

export function recordTimeoutOnce(events: Array<{ type: string; [key: string]: unknown }>, at = new Date().toISOString()) {
  return events.some((event) => event.type === "timeout") ? events : [...events, { type: "timeout", at }];
}
