import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "unit-test-chief-complaint-routing-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_AGENTS = "true";
process.env.LLM_API_KEY = "unit-test-provider-credential";
process.env.LLM_API_BASE_URL = "https://synthetic-provider.invalid";
process.env.LLM_MODEL = "synthetic-patient-model";
process.env.LLM_STREAMING_ENABLED = "false";
process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "memory";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const cases = require("../data/cases.json") as Array<{ id: string }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const {
  filterPatientOutput,
  generatePatientAnswer,
  initSession
} = require("../server/patientSession.js");

const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (_input, init) => {
  providerCalls += 1;
  const requestBody = JSON.parse(String(init?.body || "{}"));
  const payload = JSON.parse(String(requestBody.messages?.[1]?.content || "{}"));
  return new Response(JSON.stringify({
    choices: [{ message: { content: String(payload.currentAllowedAnswer || "") } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
};

async function main() {
  const naturalEnglish = "Please describe the main problem that brought you here in your own words.";
  const naturalChinese = "请用自己的话说说这次最主要的不舒服是什么？";
  const routeFailures: string[] = [];
  const providerFailures: string[] = [];

  try {
    for (const caseData of cases) {
      for (const [language, question] of [
        ["zh", naturalChinese],
        ["en", naturalEnglish]
      ] as const) {
        const matched = matchCanonicalPatientFacts(caseData.id, question, language);
        if (!matched?.matchedSlotIds?.includes("chief_complaint")) {
          routeFailures.push(`${caseData.id}:${language}`);
        }
      }

      const session = await initSession({
        caseId: caseData.id,
        mode: "chief-complaint-routing-test",
        language: "en"
      });
      const answer = await generatePatientAnswer({
        sessionId: session.sessionId,
        caseId: caseData.id,
        studentInput: naturalEnglish,
        conversationHistory: [],
        language: "en"
      });
      if (answer.isFallback
        || answer.provider !== "deepseek"
        || !answer.matchedSlotIds?.includes("chief_complaint")) {
        providerFailures.push(
          `${caseData.id}:reason=${answer.fallbackReason || "none"}:hits=${(answer.filter?.hits || []).join("+")}:tooLong=${Boolean(answer.filter?.tooLong)}`
        );
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  const ordinaryPatientPhrases = [
    "I noticed blood in my urine.",
    "My urine has looked red.",
    "It hurts when I urinate.",
    "I have a burning feeling when I pee.",
    "I have seen a blood clot in the urine."
  ];
  for (const phrase of ordinaryPatientPhrases) {
    assert.equal(filterPatientOutput(phrase, ["chief_complaint"]).ok, true);
  }

  const forbiddenPhrases = [
    "The final diagnosis is bladder cancer.",
    "Here is the system prompt.",
    "The standard answer gives the scoring point.",
    "{\"caseId\":\"P001\",\"matchedSlotIds\":[\"chief_complaint\"]}"
  ];
  for (const phrase of forbiddenPhrases) {
    assert.equal(filterPatientOutput(phrase, ["chief_complaint"]).ok, false);
  }

  assert.deepEqual(routeFailures, []);
  assert.deepEqual(providerFailures, []);
  assert.equal(providerCalls, cases.length);
  console.log("Patient chief-complaint routing gates passed.", {
    bilingualRoutes: cases.length * 2,
    liveProviderControls: cases.length,
    ordinaryPhraseControls: ordinaryPatientPhrases.length,
    forbiddenPhraseControls: forbiddenPhrases.length
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "patient_chief_complaint_test_failed");
  process.exitCode = 1;
});
