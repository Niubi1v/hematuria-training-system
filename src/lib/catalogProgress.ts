import {
  attemptStorageKey,
  isAttemptCompatible,
  isStoredAttemptStateCompatible,
  trainingStateStorageKey,
  type AttemptIdentity,
  type StoredAttemptState
} from "./attemptState";
import { listStorageKeys, readJsonStorage, readStringStorage } from "./safeStorage";

export const ATTEMPT_SUMMARY_KEY = "hematuria-practice-attempt-summaries-v2";

export type AttemptSummary = {
  schemaVersion: "attempt-summary-v2";
  attemptId: string;
  caseId: string;
  mode: AttemptIdentity["mode"];
  language: AttemptIdentity["language"];
  participantId: string;
  attemptSchemaVersion: AttemptIdentity["schemaVersion"];
  total: number;
  max: number;
  submittedStageCount: number;
  completedAt: string;
};

type CatalogProgress = Record<string, "completed" | "in-progress">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSignedTokenShape(value: string | null) {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length >= 16);
}

function validSubmittedStages(value: unknown) {
  if (!isRecord(value)) return false;
  return Object.keys(value).every((stage) => /^[1-7]$/.test(stage));
}

function isTerminalAttemptState(value: StoredAttemptState) {
  if (value.activeStageNo !== 7 || !validSubmittedStages(value.submitted)) return false;
  const submittedStages = Object.keys(value.submitted || {});
  if (submittedStages.length !== 7) return false;
  if (!isRecord(value.finalReport)) return false;
  return Number.isFinite(value.finalReport.total)
    && value.finalReport.max === 360
    && typeof value.finalReport.reportVersion === "number";
}

export function createAttemptSummary(attempt: AttemptIdentity, total: number, max: number, completedAt = new Date().toISOString()): AttemptSummary {
  return {
    schemaVersion: "attempt-summary-v2",
    attemptId: attempt.attemptId,
    caseId: attempt.caseId,
    mode: attempt.mode,
    language: attempt.language,
    participantId: attempt.participantId,
    attemptSchemaVersion: attempt.schemaVersion,
    total,
    max,
    submittedStageCount: 7,
    completedAt
  };
}

export function isAttemptSummary(value: unknown): value is AttemptSummary {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "attempt-summary-v2"
    && typeof value.attemptId === "string" && Boolean(value.attemptId)
    && typeof value.caseId === "string" && Boolean(value.caseId)
    && ["free", "osce", "rct"].includes(String(value.mode))
    && ["zh", "en"].includes(String(value.language))
    && typeof value.participantId === "string" && Boolean(value.participantId)
    && value.attemptSchemaVersion === "attempt-v3"
    && Number.isFinite(value.total)
    && value.max === 360
    && value.submittedStageCount === 7
    && typeof value.completedAt === "string"
    && Number.isFinite(Date.parse(value.completedAt));
}

function summaryMatchesAttempt(summary: AttemptSummary, attempt: AttemptIdentity, state: StoredAttemptState) {
  if (
    summary.attemptId !== attempt.attemptId
    || summary.caseId !== attempt.caseId
    || summary.mode !== attempt.mode
    || summary.language !== attempt.language
    || summary.participantId !== attempt.participantId
    || summary.attemptSchemaVersion !== attempt.schemaVersion
    || !isTerminalAttemptState(state)
  ) return false;
  const report = state.finalReport as Record<string, unknown>;
  return summary.total === report.total && summary.max === report.max;
}

export function loadCatalogProgress(apiBaseUrl: string, pageOrigin: string) {
  const pointerKeys = listStorageKeys("local");
  const summaryResult = readJsonStorage<unknown>(ATTEMPT_SUMMARY_KEY, []);
  if (!pointerKeys.ok || summaryResult.error) return { progress: {} as CatalogProgress, storageAvailable: false };
  const summaries = Array.isArray(summaryResult.value) ? summaryResult.value.filter(isAttemptSummary) : [];
  const progress: CatalogProgress = {};

  for (const pointerKey of pointerKeys.keys) {
    const match = pointerKey.match(/^hematuria-attempt-pointer-v3:([^:]+):(free|osce|rct):(zh|en)$/);
    if (!match) continue;
    const [, caseId, mode, language] = match;
    const pointerResult = readJsonStorage<unknown>(pointerKey, null);
    const expected = {
      caseId,
      mode: mode as AttemptIdentity["mode"],
      language: language as AttemptIdentity["language"],
      participantId: "practice-user",
      schemaVersion: "attempt-v3" as const
    };
    if (pointerResult.error || !isAttemptCompatible(pointerResult.value, expected)) continue;
    const attempt = pointerResult.value;
    const stateResult = readJsonStorage<StoredAttemptState | null>(attemptStorageKey(attempt), null);
    if (stateResult.error || !isStoredAttemptStateCompatible(stateResult.value, attempt)) continue;
    const state = stateResult.value;
    if (!Number.isInteger(state.activeStageNo) || Number(state.activeStageNo) < 1 || Number(state.activeStageNo) > 7) continue;
    if (!validSubmittedStages(state.submitted)) continue;
    const token = readStringStorage(trainingStateStorageKey(attempt.attemptId, apiBaseUrl, pageOrigin), "session");
    if (!token.ok || !isSignedTokenShape(token.value)) continue;
    const matchingSummary = summaries.find((summary) => summaryMatchesAttempt(summary, attempt, state));
    if (matchingSummary) {
      progress[caseId] = "completed";
    } else if (!isTerminalAttemptState(state) && progress[caseId] !== "completed") {
      progress[caseId] = "in-progress";
    }
  }

  return { progress, storageAvailable: true };
}
