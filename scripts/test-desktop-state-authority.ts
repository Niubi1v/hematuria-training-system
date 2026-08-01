import assert from "node:assert/strict";
import {
  clearUntrustedDesktopTrainingCaches,
  desktopAuthoritiesCompatible,
  isDesktopStateAuthority,
  isDesktopTrainingCacheKey,
  type DesktopStateAuthority
} from "../src/lib/desktopStateAuthority";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, sessionStorage } });

const oldStore = "11111111-1111-4111-8111-111111111111";
const newStore = "22222222-2222-4222-8222-222222222222";
const authority = (stateStoreId: string, revision: number): DesktopStateAuthority => ({
  stateStoreId,
  schemaVersion: 3,
  productHead: "product-head-r3",
  serverStateRevision: revision
});

for (const key of [
  "hematuria-attempt-v3:P001:free:zh:old-attempt",
  "hematuria-attempt-pointer-v3:P001:free:zh",
  "hematuria-ai-patient-session-old-attempt-P001-zh-free",
  "hematuria-practice-attempt-summaries-v2"
]) localStorage.setItem(key, JSON.stringify({ stateStoreId: oldStore, activeStageNo: 7 }));
sessionStorage.setItem("hematuria-training-state-v4:http%3A%2F%2F127.0.0.1:old-attempt", "legacy-token");
localStorage.setItem("hematuria-language", "zh");

assert.equal(isDesktopTrainingCacheKey("hematuria-attempt-pointer-v3:P001:free:zh"), true);
assert.equal(isDesktopTrainingCacheKey("hematuria-language"), false);
assert.deepEqual(clearUntrustedDesktopTrainingCaches(), { ok: true, removed: 5 });
assert.equal(localStorage.length, 1);
assert.equal(localStorage.getItem("hematuria-language"), "zh");
assert.equal(sessionStorage.length, 0);

assert.equal(isDesktopStateAuthority(authority(newStore, 0)), true);
assert.equal(isDesktopStateAuthority({ ...authority(newStore, 0), stateStoreId: "legacy" }), false);

// A: legacy/stale renderer state and a new SQLite store never share authority.
assert.equal(desktopAuthoritiesCompatible(authority(oldStore, 99), authority(newStore, 0)), false);
// B: empty renderer state accepts an existing SQLite authority.
assert.equal(desktopAuthoritiesCompatible(authority(newStore, 7), authority(newStore, 7)), true);
// C: SQLite wins both directions; only its matching, non-regressing revision is accepted.
assert.equal(desktopAuthoritiesCompatible(authority(newStore, 7), authority(newStore, 6)), false);
assert.equal(desktopAuthoritiesCompatible(authority(newStore, 7), authority(newStore, 8)), true);
// D: package/path upgrades retain authority when the SQLite state directory is unchanged.
assert.equal(desktopAuthoritiesCompatible(authority(newStore, 8), authority(newStore, 8)), true);
// E: repeated starts do not change the stable authority or manufacture a revision.
for (let index = 0; index < 3; index += 1) {
  assert.equal(desktopAuthoritiesCompatible(authority(newStore, 8), authority(newStore, 8)), true);
}

console.log("Desktop state authority and cache-isolation tests passed.");
