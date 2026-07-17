import assert from "node:assert/strict";
import fs from "node:fs";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";
import path from "node:path";

import createNextConfig from "../next.config.mjs";

const development = createNextConfig(PHASE_DEVELOPMENT_SERVER);
const production = createNextConfig(PHASE_PRODUCTION_BUILD);

assert.equal(development.output, undefined, "next dev must not apply the static-export route lock");
assert.equal(production.output, "export", "production and Pages builds must remain static exports");
assert.equal(development.trailingSlash, true);
assert.equal(production.trailingSlash, true);
assert.equal(development.reactStrictMode, true);
assert.equal(production.reactStrictMode, true);
assert.equal(production.images.unoptimized, true);

const playwrightConfig = fs.readFileSync(path.resolve("playwright.config.mjs"), "utf8");
assert.match(playwrightConfig, /command:\s*"node node_modules\/next\/dist\/bin\/next dev"/);
assert.doesNotMatch(playwrightConfig, /command:\s*"pnpm run dev"/);

console.log("Next runtime configuration keeps development routing dynamic, owns the test server directly and preserves static production output.");
