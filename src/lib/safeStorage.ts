export type StorageReadResult<T> = {
  value: T;
  recovered: boolean;
  error?: string;
};

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
      Object.keys(window.localStorage).forEach((key) => {
        if (key.startsWith("hematuria-session-") || key.startsWith("hematuria-ai-session-")) window.localStorage.removeItem(key);
      });
    }
    window.localStorage.setItem(versionKey, version);
    return { migrated: Boolean(previous && previous !== version), error: undefined };
  } catch (error) {
    return { migrated: false, error: error instanceof Error ? error.message : "无法初始化本地存储" };
  }
}
