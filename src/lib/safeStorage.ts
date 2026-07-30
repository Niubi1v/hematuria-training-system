export type StorageReadResult<T> = {
  value: T;
  recovered: boolean;
  error?: string;
};

export type BrowserStorageArea = "local" | "session";

function browserStorage(area: BrowserStorageArea) {
  if (typeof window === "undefined") return null;
  return area === "local" ? window.localStorage : window.sessionStorage;
}

export function readStringStorage(key: string, area: BrowserStorageArea = "local") {
  try {
    const storage = browserStorage(area);
    if (!storage) return { value: null, ok: false as const };
    return { value: storage.getItem(key), ok: true as const };
  } catch {
    return { value: null, ok: false as const };
  }
}

export function writeStringStorage(key: string, value: string, area: BrowserStorageArea = "local") {
  try {
    const storage = browserStorage(area);
    if (!storage) return { ok: false as const };
    storage.setItem(key, value);
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export function listStorageKeys(area: BrowserStorageArea = "local") {
  try {
    const storage = browserStorage(area);
    if (!storage) return { keys: [] as string[], ok: false as const };
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key));
    return { keys, ok: true as const };
  } catch {
    return { keys: [] as string[], ok: false as const };
  }
}

export function removeBrowserStorageEntries(entries: Array<{ area: BrowserStorageArea; key: string }>) {
  const snapshots: Array<{ area: BrowserStorageArea; key: string; value: string | null }> = [];
  try {
    for (const entry of entries) {
      const storage = browserStorage(entry.area);
      if (!storage) throw new Error("storage_unavailable");
      snapshots.push({ ...entry, value: storage.getItem(entry.key) });
    }
    for (const entry of entries) {
      const storage = browserStorage(entry.area);
      if (!storage) throw new Error("storage_unavailable");
      storage.removeItem(entry.key);
      if (storage.getItem(entry.key) !== null) throw new Error("storage_remove_failed");
    }
    return { ok: true as const };
  } catch {
    for (const snapshot of snapshots) {
      try {
        const storage = browserStorage(snapshot.area);
        if (!storage) continue;
        if (snapshot.value === null) storage.removeItem(snapshot.key);
        else storage.setItem(snapshot.key, snapshot.value);
      } catch {
        // Fail closed. The caller must keep the page open and report failure.
      }
    }
    return { ok: false as const };
  }
}

export function readJsonStorage<T>(key: string, fallback: T): StorageReadResult<T> {
  if (typeof window === "undefined") return { value: fallback, recovered: false };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { value: fallback, recovered: false };
    return { value: JSON.parse(raw) as T, recovered: false };
  } catch (error) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage may be completely unavailable; the in-memory fallback still works.
    }
    return {
      value: fallback,
      recovered: true,
      error: error instanceof Error ? error.message : "localStorage读取失败"
    };
  }
}

export function writeJsonStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return { ok: false, error: "浏览器存储不可用" };
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "浏览器存储写入失败"
    };
  }
}

export function initializeStorageVersion(version: string) {
  if (typeof window === "undefined") return { migrated: false, error: undefined as string | undefined };
  const versionKey = "hematuria-storage-version";
  try {
    const previous = window.localStorage.getItem(versionKey);
    if (previous && previous !== version) {
      listStorageKeys("local").keys.forEach((key) => {
        if (
          key.startsWith("hematuria-session-")
          || key.startsWith("hematuria-ai-session-")
          || key.startsWith("hematuria-ai-patient-session-")
        ) {
          window.localStorage.removeItem(key);
        }
      });
    }
    window.localStorage.setItem(versionKey, version);
    return { migrated: Boolean(previous && previous !== version), error: undefined };
  } catch (error) {
    return { migrated: false, error: error instanceof Error ? error.message : "无法初始化本地存储" };
  }
}
