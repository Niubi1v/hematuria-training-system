import { requestJson } from "./apiClient";
import { desktopRuntimeConfig } from "./apiConfig";
import { listStorageKeys, removeBrowserStorageEntries, type BrowserStorageArea } from "./safeStorage";

export type DesktopStateAuthority = {
  stateStoreId: string;
  schemaVersion: number;
  productHead: string;
  serverStateRevision: number;
};

const DESKTOP_TRAINING_CACHE_PREFIXES = [
  "hematuria-attempt-v3:",
  "hematuria-attempt-pointer-v3:",
  "hematuria-ai-patient-session-",
  "hematuria-training-state-v3:",
  "hematuria-training-state-v4:"
] as const;

const DESKTOP_TRAINING_CACHE_KEYS = new Set([
  "hematuria-practice-attempt-summaries-v2"
]);

export function isDesktopStateAuthority(value: unknown): value is DesktopStateAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DesktopStateAuthority>;
  return typeof candidate.stateStoreId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.stateStoreId)
    && Number.isInteger(candidate.schemaVersion) && Number(candidate.schemaVersion) >= 3
    && typeof candidate.productHead === "string" && Boolean(candidate.productHead.trim())
    && Number.isSafeInteger(candidate.serverStateRevision) && Number(candidate.serverStateRevision) >= 0;
}

export function desktopAuthoritiesCompatible(expected: DesktopStateAuthority, received: DesktopStateAuthority) {
  return expected.stateStoreId === received.stateStoreId
    && expected.schemaVersion === received.schemaVersion
    && expected.productHead === received.productHead
    && received.serverStateRevision >= expected.serverStateRevision;
}

export function isDesktopTrainingCacheKey(key: string) {
  return DESKTOP_TRAINING_CACHE_KEYS.has(key)
    || DESKTOP_TRAINING_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function clearUntrustedDesktopTrainingCaches() {
  const entries: Array<{ area: BrowserStorageArea; key: string }> = [];
  for (const area of ["local", "session"] as const) {
    const listed = listStorageKeys(area);
    if (!listed.ok) return { ok: false as const, removed: 0 };
    for (const key of listed.keys) {
      if (isDesktopTrainingCacheKey(key)) entries.push({ area, key });
    }
  }
  if (!entries.length) return { ok: true as const, removed: 0 };
  const result = removeBrowserStorageEntries(entries);
  return { ok: result.ok, removed: result.ok ? entries.length : 0 };
}

export async function bootstrapDesktopStateAuthority() {
  const runtime = desktopRuntimeConfig();
  if (!runtime) throw new Error("desktop_runtime_missing");
  const authority = await requestJson<unknown>(`${runtime.apiBaseUrl}/api/desktop/state/bootstrap`, undefined, {
    method: "GET",
    timeoutMs: 5000,
    retries: 0,
    endpointName: "desktop-state-bootstrap"
  });
  if (!isDesktopStateAuthority(authority)) throw new Error("desktop_state_authority_invalid");
  const cleared = clearUntrustedDesktopTrainingCaches();
  if (!cleared.ok) throw new Error("desktop_training_cache_clear_failed");
  return authority;
}
