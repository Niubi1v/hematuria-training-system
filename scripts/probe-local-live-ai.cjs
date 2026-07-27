"use strict";

const path = require("node:path");

function writeResult(result, exitCode) {
  process.stdout.write(JSON.stringify(result));
  process.exitCode = exitCode;
}

function supportedNodeVersion() {
  return /^22\.14\./.test(process.versions.node);
}

function providerConfigured() {
  return Boolean(
    process.env.LLM_API_KEY
    && process.env.LLM_API_BASE_URL
    && process.env.LLM_MODEL
    && process.env.LLM_ENABLE_AI_PATIENT === "true"
  );
}

async function runPatientOnly() {
  const startedAt = Date.now();
  const patientApiUrl = String(process.env.LOCAL_PATIENT_API_URL || "");
  if (!providerConfigured() || !patientApiUrl) {
    return {
      result: {
        providerConfigured: providerConfigured(),
        providerHttpSuccess: false,
        answerSource: "rule_fallback",
        thinkingExecuted: false,
        model: String(process.env.LLM_MODEL || ""),
        durationMs: Date.now() - startedAt,
        errorCode: "provider_not_configured"
      },
      exitCode: 2
    };
  }
  const patientRequest = Buffer.from(JSON.stringify({
    caseId: "P002",
    stage: "history",
    studentQuestion: "\u5c0f\u4fbf\u75db\u5417\uff1f",
    mode: "ai",
    language: "zh",
    conversationHistory: []
  }), "utf8");
  const patientResponse = await fetch(patientApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json"
    },
    body: patientRequest,
    signal: AbortSignal.timeout(90000)
  });
  if (!patientResponse.ok) {
    return {
      result: {
        providerConfigured: true,
        providerHttpSuccess: false,
        answerSource: "rule_fallback",
        thinkingExecuted: false,
        model: String(process.env.LLM_MODEL || ""),
        durationMs: Date.now() - startedAt,
        errorCode: "patient_http_error"
      },
      exitCode: 2
    };
  }
  const patientResult = await patientResponse.json();
  const liveAi = patientResult?.isFallback === false
    && patientResult?.provider === "deepseek"
    && patientResult?.model === "deepseek-v4-pro";
  return {
    result: {
      providerConfigured: true,
      providerHttpSuccess: liveAi,
      answerSource: liveAi ? "live_ai" : "rule_fallback",
      thinkingExecuted: false,
      model: String(patientResult?.model || process.env.LLM_MODEL || ""),
      durationMs: Date.now() - startedAt,
      errorCode: liveAi ? "" : String(patientResult?.fallbackReason || "patient_provider_fallback")
    },
    exitCode: liveAi ? 0 : 2
  };
}

async function runProviderOnly(classifier) {
  const startedAt = Date.now();
  classifier.resetPatientIntentClassifierState();
  const result = await classifier.classifyPatientIntent({
    question: "Does it hurt to pee?",
    language: "en",
    conversationHistory: [],
    conversationState: null
  });
  const liveAi = providerConfigured()
    && result.accepted === true
    && result.providerCalls === 1
    && result.model === "deepseek-v4-pro"
    && result.thinkingMode === "max";
  return {
    result: {
      providerConfigured: providerConfigured(),
      providerHttpSuccess: liveAi,
      answerSource: liveAi ? "live_ai" : "rule_fallback",
      thinkingExecuted: liveAi,
      model: String(result.model || process.env.LLM_MODEL || ""),
      durationMs: Date.now() - startedAt,
      errorCode: liveAi ? "" : String(result.reason || "provider_probe_failed")
    },
    exitCode: liveAi ? 0 : 2
  };
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
        const execution = process.argv.includes("--patient-only")
          ? await runPatientOnly()
          : process.argv.includes("--provider-only")
            ? await runProviderOnly(classifier)
            : {
                result: {
                  providerConfigured: providerConfigured(),
                  providerHttpSuccess: false,
                  answerSource: "rule_fallback",
                  thinkingExecuted: false,
                  model: String(process.env.LLM_MODEL || ""),
                  durationMs: 0,
                  errorCode: "probe_mode_required"
                },
                exitCode: 2
              };
        writeResult(execution.result, execution.exitCode);
      })().catch((error) => {
        const timedOut = error?.name === "AbortError"
          || error?.name === "TimeoutError"
          || /abort|timeout/i.test(String(error?.message || ""));
        writeResult({
          providerConfigured: providerConfigured(),
          answerSource: "rule_fallback",
          thinkingExecuted: false,
          model: String(process.env.LLM_MODEL || ""),
          providerHttpSuccess: false,
          durationMs: 0,
          errorCode: timedOut ? "local_abort_timeout" : "provider_probe_failed"
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
