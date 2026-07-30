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

const deployWorkflow = fs.readFileSync(path.resolve(".github/workflows/deploy.yml"), "utf8");
const e2eStep = deployWorkflow.match(/- name: Playwright E2E([\s\S]*?)\n\s*- name:/)?.[1] || "";
const e2eStepBudget = Number(e2eStep.match(/timeout-minutes:\s*(\d+)/)?.[1]);
assert.ok(e2eStepBudget >= 10, "the expanded 72-test E2E gate needs a bounded budget of at least 10 minutes");
assert.match(e2eStep, /run:\s*pnpm run test:e2e/);
assert.doesNotMatch(e2eStep, /--retries|--timeout/);

console.log("Next runtime configuration preserves dynamic development routing, static production output and a bounded CI E2E budget without retries.");
