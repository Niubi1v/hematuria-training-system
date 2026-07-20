import assert from "node:assert/strict";

const safeLogger = require("../server/safeLogger.js");
const { auditPatientPrompt, promptAuditEnabled } = require("../server/patientPromptAudit.js");

function main() {
  const canary = `synthetic-audit-canary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localEnv = {
    NODE_ENV: "development",
    PATIENT_PROMPT_AUDIT_ENABLED: "true",
    LLM_API_KEY: canary,
    TRAINING_STATE_SECRET: `${canary}-state`
  };
  assert.equal(promptAuditEnabled(localEnv), true);
  assert.equal(promptAuditEnabled({ ...localEnv, NODE_ENV: "production" }), false);
  assert.equal(promptAuditEnabled({ ...localEnv, VERCEL: "1" }), false);
  assert.equal(promptAuditEnabled({ ...localEnv, VERCEL_ENV: "preview" }), false);

  let disabledSinkCalls = 0;
  const disabled = auditPatientPrompt({ caseId: "P001" }, {
    env: { NODE_ENV: "production", PATIENT_PROMPT_AUDIT_ENABLED: "true" },
    sink: () => { disabledSinkCalls += 1; }
  });
  assert.equal(disabled, null);
  assert.equal(disabledSinkCalls, 0, "disabled audit must return before formatting or writing output");

  const output: string[] = [];
  const event = auditPatientPrompt({
    templateVersion: "patient-answer-v3",
    caseId: "P001",
    language: "zh",
    canonicalIntents: ["dysuria"],
    matchedAliases: ["小便痛不痛"],
    matcherLayer: "canonical_alias",
    matcherConfidence: 1,
    factFields: ["dysuria"],
    provenance: "source",
    reviewerStatus: "governance_checked",
    providerInvoked: false,
    historyCount: 2,
    estimatedInputTokens: 40,
    maxTokens: 300,
    temperature: 0.35,
    provider: "deepseek",
    outputFilter: "accepted",
    fallbackReason: "",
    prompt: `hidden prompt ${canary}`,
    payload: { Authorization: `Bearer ${canary}` },
    patientAnswer: "hidden answer"
  }, { env: localEnv, sink: (...args: unknown[]) => output.push(JSON.stringify(args)) });
  assert.ok(event);
  assert.equal("prompt" in event, false);
  assert.equal("payload" in event, false);
  assert.equal("patientAnswer" in event, false);
  assert.equal(output.length, 1);
  assert.doesNotMatch(output[0], new RegExp(canary), "audit output must not contain synthetic credentials");

  const nested = new Error(`Authorization: Bearer ${canary}`);
  nested.cause = { cookie: canary, nested: { signature: `${canary}-sig` }, url: `https://example.test/?token=${canary}` };
  const sanitized = JSON.stringify(safeLogger.sanitizeForLog({ error: nested, requestHeaders: { cookie: canary }, safe: "ok" }, localEnv));
  assert.doesNotMatch(sanitized, new RegExp(canary));
  assert.match(sanitized, /REDACTED/);
  assert.match(sanitized, /"safe":"ok"/);

  console.log("Patient Prompt audit local-only gating and recursive synthetic credential redaction tests passed.");
}

main();
