import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_AGENTS = "true";
process.env.LLM_API_KEY = "unit-test-provider-credential";
process.env.LLM_API_BASE_URL = "https://synthetic-provider.invalid";
process.env.LLM_MODEL = "synthetic-patient-model";
process.env.LLM_STREAMING_ENABLED = "false";
process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "memory";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const { initSession, generatePatientAnswer } = require("../server/patientSession.js") as {
  initSession(input: { caseId: string; mode: string; language: "zh" | "en" }): Promise<{ sessionId: string }>;
  generatePatientAnswer(input: {
    sessionId: string;
    caseId: string;
    studentInput: string;
    conversationHistory?: Array<{ role: string; text: string }>;
    language: "zh" | "en";
  }): Promise<{
    replyText: string;
    provider: string;
    isFallback: boolean;
    fallbackReason: string;
    matchedSlotIds?: string[];
    safetyFlags?: string[];
    contextResolution?: { inherited: boolean; reason: string; sourceIntent: string };
  }>;
};

const originalFetch = globalThis.fetch;
let providerCalls = 0;
let contextualEllipsisChecks = 0;

globalThis.fetch = async () => {
  providerCalls += 1;
  throw new Error("deterministic Patient routing must not invoke the provider");
};

async function expectPlanner(input: Parameters<typeof generatePatientAnswer>[0]) {
  const result = await generatePatientAnswer(input);
  assert.equal(result.isFallback, true, `${input.caseId}/${input.studentInput} should use the governed answer planner`);
  assert.equal(result.provider, "rule", `${input.caseId}/${input.studentInput} should not identify DeepSeek as the answer author`);
  return result;
}

async function main() {
  try {
    const p001 = await initSession({ caseId: "P001", mode: "training", language: "en" });
    const correction = await expectPlanner({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "So this only started today and it has never happened before, correct?",
      conversationHistory: [
        { role: "student", text: "When did you first notice the red urine?" },
        { role: "patient", text: "It started about 3 months ago and has happened on and off." }
      ],
      language: "en"
    });
    assert.match(correction.replyText, /(?:no|not|3 months)/i, "contradictory recap should be corrected from the allowed context");

    const clarification = await expectPlanner({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "Could you explain the other part?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(clarification.replyText, /clarif|which part|what.*mean/i, "a vague question should receive one concise clarification");

    const p001Zh = await initSession({ caseId: "P001", mode: "training", language: "zh" });
    const correctionZh = await expectPlanner({
      sessionId: p001Zh.sessionId,
      caseId: "P001",
      studentInput: "我确认一下：您是今天才第一次出现尿红，而且一直没有反复，对吗？",
      conversationHistory: [
        { role: "student", text: "尿红是什么时候开始的？" },
        { role: "patient", text: "大约3个月前开始，后来反复出现。" }
      ],
      language: "zh"
    });
    assert.match(correctionZh.replyText, /3[^，。！？]{0,6}月/, "Chinese correction should retain the governed onset duration");
    await expectPlanner({
      sessionId: p001Zh.sessionId,
      caseId: "P001",
      studentInput: "请解释一下刚才说的另一部分。",
      conversationHistory: [],
      language: "zh"
    });

    const p037 = await initSession({ caseId: "HX-ADD-025", mode: "training", language: "en" });
    await expectPlanner({
      sessionId: p037.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "Please tell me in your own words why you came today.",
      conversationHistory: [],
      language: "en"
    });

    const p005Zh = await initSession({ caseId: "P005", mode: "training", language: "zh" });
    const ellipsisHistory = [
      { role: "student", text: "哪里不舒服？" },
      { role: "patient", text: "我小便红了几天。" }
    ];
    const durationEllipsis = await expectPlanner({
      sessionId: p005Zh.sessionId,
      caseId: "P005",
      studentInput: "多少天？",
      conversationHistory: ellipsisHistory,
      language: "zh"
    });
    assert.equal(durationEllipsis.contextResolution?.reason, "contextual_duration");
    assert.ok(durationEllipsis.matchedSlotIds?.includes("hematuria_onset"));
    assert.doesNotMatch(durationEllipsis.replyText, /不太清楚|不知道/, "known coarse duration must not be downgraded to unknown");
    contextualEllipsisChecks += 1;

    const painEllipsis = await expectPlanner({
      sessionId: p005Zh.sessionId,
      caseId: "P005",
      studentInput: "那疼吗？",
      conversationHistory: ellipsisHistory,
      language: "zh"
    });
    assert.equal(painEllipsis.contextResolution?.reason, "contextual_pain");
    assert.ok(painEllipsis.matchedSlotIds?.includes("dysuria"));
    contextualEllipsisChecks += 1;

    const courseEllipsis = await expectPlanner({
      sessionId: p005Zh.sessionId,
      caseId: "P005",
      studentInput: "是一直这样吗？",
      conversationHistory: ellipsisHistory,
      language: "zh"
    });
    assert.equal(courseEllipsis.contextResolution?.reason, "contextual_course");
    assert.ok(courseEllipsis.matchedSlotIds?.includes("hematuria_frequency"));
    contextualEllipsisChecks += 1;

    const previousEllipsis = await expectPlanner({
      sessionId: p005Zh.sessionId,
      caseId: "P005",
      studentInput: "那以前有过吗？",
      conversationHistory: ellipsisHistory,
      language: "zh"
    });
    assert.equal(previousEllipsis.contextResolution?.reason, "contextual_previous_episode");
    assert.ok(previousEllipsis.matchedSlotIds?.includes("hematuria_frequency"));
    contextualEllipsisChecks += 1;

    const correctionEllipsis = await expectPlanner({
      sessionId: p005Zh.sessionId,
      caseId: "P005",
      studentInput: "为什么前面说不痛，现在又说不舒服？",
      conversationHistory: [
        { role: "student", text: "小便时痛不痛？" },
        { role: "patient", text: "有，尿的时候会痛。" }
      ],
      language: "zh"
    });
    assert.equal(correctionEllipsis.contextResolution?.reason, "contextual_correction");
    assert.ok(correctionEllipsis.matchedSlotIds?.includes("dysuria"));
    contextualEllipsisChecks += 1;
    const p037Duration = await expectPlanner({
      sessionId: p037.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "How long ago was the urine test abnormality first found?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(p037Duration.replyText, /\b1 day\b/i, "P037 English onset should retain its one-day duration");

    const p037Zh = await initSession({ caseId: "HX-ADD-025", mode: "training", language: "zh" });
    await expectPlanner({
      sessionId: p037Zh.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "请用自己的话说说这次为什么来就诊。",
      conversationHistory: [],
      language: "zh"
    });
    const p037DurationZh = await expectPlanner({
      sessionId: p037Zh.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "尿检异常是多久以前发现的？",
      conversationHistory: [],
      language: "zh"
    });
    assert.match(p037DurationZh.replyText, /1天|一天/, "P037 Chinese onset should retain its one-day duration");
    const providerCallsBeforeReportBoundary = providerCalls;
    const blockedReportDetail = await generatePatientAnswer({
      sessionId: p037Zh.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "尿检结果具体显示什么，多久以前发现的？",
      conversationHistory: [],
      language: "zh"
    });
    assert.equal(blockedReportDetail.isFallback, true, "asking for report detail must remain inside the safety boundary");
    assert(blockedReportDetail.safetyFlags?.includes("blocked_report_request"), "report detail should retain its explicit safety reason");
    assert.equal(providerCalls, providerCallsBeforeReportBoundary, "report detail must not reach the patient provider");

    const p038 = await initSession({ caseId: "HX-ADD-026", mode: "training", language: "en" });
    await expectPlanner({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "Please describe what happened after the injury in your own words.",
      conversationHistory: [],
      language: "en"
    });
    const p038Duration = await expectPlanner({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "About how long ago did the injury happen?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(p038Duration.replyText, /\b4 hours?\b/i, "P038 English injury context should retain its four-hour duration");

    const p038Zh = await initSession({ caseId: "HX-ADD-026", mode: "training", language: "zh" });
    await expectPlanner({
      sessionId: p038Zh.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "请用自己的话说说受伤后这次不舒服的经过。",
      conversationHistory: [],
      language: "zh"
    });
    const p038RelationZh = await expectPlanner({
      sessionId: p038Zh.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "血尿是在外伤后才出现的吗？",
      conversationHistory: [],
      language: "zh"
    });
    assert.match(p038RelationZh.replyText, /受伤.*后|外伤.*后/, "P038 Chinese answer should preserve the injury relation");
    await expectPlanner({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "Did the blood in your urine appear only after the injury?",
      conversationHistory: [],
      language: "en"
    });

    const repeatedClarification = await expectPlanner({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "Could you clarify the other part?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(repeatedClarification.replyText, /clarif|which part|what.*mean/i);

    assert.equal(providerCalls, 0, "deterministic and contextual Patient turns must not invoke DeepSeek");
    assert.equal(contextualEllipsisChecks, 5);
    console.log(`PATIENT_CONTEXT_EVIDENCE ${JSON.stringify({
      contextualEllipsisChecks,
      contextLosses: 0,
      correctionChecks: 3,
      coarseFactDowngrades: 0
    })}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
