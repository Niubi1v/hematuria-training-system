import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const cases = require("../data/cases.json") as Array<{ id: string }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "en"): { replyText: string; matchedSlotIds: string[] } | null;
};
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "en"): { replyText: string; matchedSlotIds: string[] } | null;
};
const { generatePatientAnswer } = require("../server/patientSession.js") as {
  generatePatientAnswer(input: {
    sessionId: string;
    caseId: string;
    studentInput: string;
    language: "en";
    conversationHistory: unknown[];
  }): Promise<{
    replyText?: string;
    matchedSlotIds?: string[];
    fallbackReason?: string;
    safetyFlags?: string[];
  }>;
};

const GENERIC_UNKNOWN = new Set(["I'm not sure about that right now.", "I do not know."]);
const probes = [
  { id: "glomerular", question: "Do you have foamy urine?", expected: ["glomerular_features"] },
  { id: "triggers", question: "Was this triggered by exercise?", expected: ["triggers"] },
  { id: "occupation", question: "Have you had chemical exposure?", expected: ["LIFE_EXPOSURE"] }
];
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

async function main() {
  assert.equal(cases.length, 42);
  let projected = 0;
  let safetyBlocked = 0;
  for (const caseData of cases) {
    for (const probe of probes) {
      const routed = matchStructuredFacts(caseData, probe.question, "en")
        || matchCanonicalPatientFacts(caseData.id, probe.question, "en");
      assert.ok(routed, `${caseData.id}/${probe.id} route`);
      assert.deepEqual(routed.matchedSlotIds, probe.expected, `${caseData.id}/${probe.id} slots`);

      const result = await generatePatientAnswer({
        sessionId: `safe-projection-${caseData.id}-${probe.id}`,
        caseId: caseData.id,
        studentInput: probe.question,
        language: "en",
        conversationHistory: []
      });
      if (result.fallbackReason === "unsafe_deterministic_answer") {
        safetyBlocked += 1;
        assert.deepEqual(result.matchedSlotIds || [], []);
        assert.ok(result.safetyFlags?.includes("deterministic_answer_blocked"));
        continue;
      }

      projected += 1;
      assert.deepEqual(result.matchedSlotIds || [], probe.expected, `${caseData.id}/${probe.id} public slots`);
      assert.ok(!GENERIC_UNKNOWN.has(String(result.replyText || "")), `${caseData.id}/${probe.id} generic unknown`);
      assert.equal(normalize(String(result.replyText || "")), normalize(routed.replyText), `${caseData.id}/${probe.id} meaning`);
      assert.ok(String(result.replyText || "").split("\n").every((line) => line.length <= 80), `${caseData.id}/${probe.id} line bound`);
    }
  }

  assert.ok(projected > 0);
  console.log(`Patient safe projection preserved ${projected} approved route replies; ${safetyBlocked} unsafe sources stayed blocked.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
