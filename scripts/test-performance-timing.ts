import assert from "node:assert/strict";

const {
  formatServerTiming,
  parseServerTiming,
  setServerTiming
} = require("../server/performanceTiming.js") as {
  formatServerTiming: (metrics: Record<string, number | undefined>) => string;
  parseServerTiming: (value: string) => Record<string, number>;
  setServerTiming: (res: { setHeader(name: string, value: string): void }, metrics: Record<string, number | undefined>) => string;
};

const formatted = formatServerTiming({ app: 12.345, provider: 9.2, invalid: Number.NaN, negative: -1 });
assert.equal(formatted, "app;dur=12.3, provider;dur=9.2", "timing output must be stable, finite, non-negative and rounded");
assert.deepEqual(parseServerTiming(formatted), { app: 12.3, provider: 9.2 });
assert.deepEqual(parseServerTiming("session;dur=3, malformed, score;dur=1.25, secret;desc=hidden"), { session: 3, score: 1.25 });
assert.deepEqual(parseServerTiming("firsttoken;dur=8.25, reasoning;dur=1"), { firsttoken: 8.25 });

const headers: Record<string, string> = {};
const header = setServerTiming({ setHeader(name, value) { headers[name.toLowerCase()] = value; } }, { history: 4, score: 2.26 });
assert.equal(header, "history;dur=4.0, score;dur=2.3");
assert.equal(headers["server-timing"], header);
assert.doesNotMatch(header, /prompt|question|patient|secret|token|signature/i, "timing metadata must not contain sensitive labels");

console.log("Non-sensitive Server-Timing format and parser contract passed.");
