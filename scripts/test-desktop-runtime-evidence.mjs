import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  desktopPatientEvidence,
  runtimeSnapshot
} = require("../server/desktopRuntimeEvidence.js");

function patient({
  classificationSource = "local_ai",
  classifierStatus = "accepted",
  providerHttpSuccess = true,
  inherited = true,
  factState = "exact_value"
} = {}) {
  return {
    runtimeTrace: {
      classificationSource,
      classifierStatus,
      providerHttpSuccess
    },
    contextResolution: { inherited },
    answerPlans: [{ factState }]
  };
}

try {
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
  assert.equal(runtimeSnapshot(), null);
  assert.equal(desktopPatientEvidence(patient()), null);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0
  });
  assert.deepEqual(desktopPatientEvidence(patient()), {
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0,
    answerSource: "local_ai",
    ontologyApplied: true,
    contextApplied: true,
    nineStateApplied: true,
    answerPlannerApplied: true,
    modelFactAuthority: false
  });

  assert.equal(
    desktopPatientEvidence(patient({ classifierStatus: "rejected" })).answerSource,
    "rule_fallback"
  );
  assert.equal(
    desktopPatientEvidence(patient({ providerHttpSuccess: false })).answerSource,
    "rule_fallback"
  );

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: false,
    localModelReady: false,
    cloudRequestCount: 0
  });
  const unavailable = desktopPatientEvidence(patient());
  assert.equal(unavailable.answerSource, "rule_fallback");
  assert.equal(unavailable.llamaServerReady, false);
  assert.equal(unavailable.localModelReady, false);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: -1
  });
  assert.equal(runtimeSnapshot(), null);

  process.stdout.write("desktop runtime evidence tests passed\n");
} finally {
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
}
