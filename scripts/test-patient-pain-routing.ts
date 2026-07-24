import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): { matchedSlotIds?: string[] } | null;
};
const { generatePatientAnswer } = require("../server/patientSession.js") as {
  generatePatientAnswer(input: {
    sessionId: string;
    caseId: string;
    studentInput: string;
    language: "zh" | "en";
    conversationHistory: unknown[];
  }): Promise<{
    matchedSlotIds?: string[];
    fallbackReason?: string;
    quarantinedSlotIds?: string[];
  }>;
};
const cases = require("../data/cases.json") as Array<{ id: string }>;
const { bilingualConflictEntries, BILINGUAL_CONFLICT_REASON } = require("../server/bilingualConflictQuarantine.js") as {
  bilingualConflictEntries: Array<{ caseId: string; field: string }>;
  BILINGUAL_CONFLICT_REASON: string;
};

const probes = [
  { id: "flank-en", question: "Do you have flank pain?", language: "en" as const, expected: ["flank_pain"] },
  { id: "radiating-en", question: "Does the pain radiate to the groin?", language: "en" as const, expected: ["radiating_pain"] },
  { id: "colicky-en", question: "Have you had colicky pain?", language: "en" as const, expected: ["renal_colic"] },
  { id: "radiating-zh", question: "疼痛会放射到腹股沟吗？", language: "zh" as const, expected: ["radiating_pain"] },
  { id: "general-en", question: "Do you have any pain?", language: "en" as const, expected: ["pain"] },
  { id: "compound-en", question: "Do you have flank pain or any other pain?", language: "en" as const, expected: ["flank_pain", "pain"] }
];

async function main() {
  assert.equal(cases.length, 42);
  for (const caseData of cases) {
    for (const probe of probes) {
      const matched = matchCanonicalPatientFacts(caseData.id, probe.question, probe.language);
      assert.deepEqual((matched?.matchedSlotIds || []).sort(), [...probe.expected].sort(), `${caseData.id}/${probe.id}`);
    }
  }

  const painConflictCaseIds = bilingualConflictEntries.filter((item) => item.field === "pain").map((item) => item.caseId);
  assert.equal(painConflictCaseIds.length, 5);
  for (const caseId of painConflictCaseIds) {
    for (const probe of probes.slice(0, 4)) {
      const result = await generatePatientAnswer({
        sessionId: `pain-specificity-${caseId}-${probe.id}`,
        caseId,
        studentInput: probe.question,
        language: probe.language,
        conversationHistory: []
      });
      assert.notEqual(result.fallbackReason, BILINGUAL_CONFLICT_REASON, `${caseId}/${probe.id}`);
      assert.ok(!(result.quarantinedSlotIds || []).includes("pain"), `${caseId}/${probe.id}`);
    }
  }

  const generalConflict = await generatePatientAnswer({
    sessionId: "pain-general-conflict-p001",
    caseId: "P001",
    studentInput: "Do you have any pain?",
    language: "en",
    conversationHistory: []
  });
  assert.equal(generalConflict.fallbackReason, BILINGUAL_CONFLICT_REASON);
  assert.ok((generalConflict.quarantinedSlotIds || []).includes("pain"));

  console.log("Patient pain routing preserved 42x6 specificity contracts and 5-case conflict quarantine scope.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
