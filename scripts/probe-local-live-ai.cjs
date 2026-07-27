"use strict";

const path = require("node:path");

function writeResult(result, exitCode) {
  process.stdout.write(JSON.stringify(result));
  process.exitCode = exitCode;
}

function supportedNodeVersion() {
  return /^22\.14\./.test(process.versions.node);
}

try {
  if (!supportedNodeVersion()) {
    writeResult({
      moduleLoaded: false,
      errorCode: "node_version_unsupported"
    }, 2);
  } else {
    const classifier = require(path.join(__dirname, "..", "server", "patientIntentClassifier.js"));
    const moduleLoaded = typeof classifier.classifyPatientIntent === "function"
      && typeof classifier.resetPatientIntentClassifierState === "function";

    if (process.argv.includes("--module-load-only")) {
      writeResult({
        moduleLoaded,
        nodeVersion: process.versions.node,
        errorCode: moduleLoaded ? "" : "classifier_module_invalid"
      }, moduleLoaded ? 0 : 2);
    } else if (!moduleLoaded) {
      writeResult({
        providerConfigured: false,
        answerSource: "rule_fallback",
        thinkingExecuted: false,
        model: "",
        providerHttpSuccess: false,
        durationMs: 0,
        errorCode: "classifier_module_invalid"
      }, 2);
    } else {
      void (async () => {
        classifier.resetPatientIntentClassifierState();
        const result = await classifier.classifyPatientIntent({
          question: "Does it hurt to pee?",
          language: "en",
          conversationHistory: [],
          conversationState: null
        });
        const providerConfigured = Boolean(
          process.env.LLM_API_KEY
          && process.env.LLM_API_BASE_URL
          && process.env.LLM_MODEL
          && process.env.LLM_ENABLE_AI_PATIENT === "true"
        );
        const providerHttpSuccess = result.providerCalls === 1
          && result.reason !== "semantic_provider_unavailable"
          && Boolean(result.model);
        const thinkingExecuted = providerHttpSuccess && result.thinkingMode === "max";
        const answerSource = providerHttpSuccess && result.accepted ? "live_ai" : "rule_fallback";
        const success = providerConfigured
          && providerHttpSuccess
          && answerSource === "live_ai"
          && result.model === "deepseek-v4-pro"
          && thinkingExecuted;

        writeResult({
          providerConfigured,
          answerSource,
          thinkingExecuted,
          model: String(result.model || process.env.LLM_MODEL || ""),
          providerHttpSuccess,
          durationMs: Number(result.durationMs || 0),
          errorCode: success ? "" : String(result.reason || "provider_probe_failed")
        }, success ? 0 : 2);
      })().catch(() => {
        writeResult({
          providerConfigured: Boolean(process.env.LLM_API_KEY),
          answerSource: "rule_fallback",
          thinkingExecuted: false,
          model: String(process.env.LLM_MODEL || ""),
          providerHttpSuccess: false,
          durationMs: 0,
          errorCode: "provider_probe_failed"
        }, 2);
      });
    }
  }
} catch {
  writeResult({
    moduleLoaded: false,
    errorCode: "classifier_module_load_failed"
  }, 2);
}
