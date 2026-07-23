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
  }>;
};

type ProviderPayload = {
  studentInput?: string;
  currentAllowedAnswer?: string;
};

const originalFetch = globalThis.fetch;
let providerCalls = 0;
let failNextProviderCall = false;

function syntheticReply(payload: ProviderPayload) {
  const question = String(payload.studentInput || "");
  if (/other part/i.test(question)) return "Could you clarify which part you mean?";
  if (/started today/i.test(question)) return "No, it actually started about 3 months ago.";
  if (/why you came today/i.test(question)) return "I came because an abnormal urine result was found about one day ago.";
  if (/describe what happened after the injury/i.test(question)) return "I was injured about 4 hours ago, and then I noticed blood in my urine.";
  if (/blood in your urine.*after the injury/i.test(question)) return "Yes, I noticed it after the injury.";
  return String(payload.currentAllowedAnswer || "I am not sure about that.");
}

globalThis.fetch = async (_input, init) => {
  providerCalls += 1;
  if (failNextProviderCall) {
    failNextProviderCall = false;
    return new Response(JSON.stringify({ error: "synthetic provider rejection" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }
  const requestBody = JSON.parse(String(init?.body || "{}"));
  const payload = JSON.parse(String(requestBody.messages?.[1]?.content || "{}")) as ProviderPayload;
  return new Response(JSON.stringify({
    choices: [{ message: { content: syntheticReply(payload) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
};

async function expectLive(input: Parameters<typeof generatePatientAnswer>[0]) {
  const result = await generatePatientAnswer(input);
  assert.equal(result.isFallback, false, `${input.caseId}/${input.studentInput} should retain a live provider response`);
  assert.equal(result.provider, "deepseek", `${input.caseId}/${input.studentInput} should identify the configured provider`);
  return result;
}

async function main() {
  try {
    const p001 = await initSession({ caseId: "P001", mode: "training", language: "en" });
    const correction = await expectLive({
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

    const clarification = await expectLive({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "Could you explain the other part?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(clarification.replyText, /clarif|which part|what.*mean/i, "a vague question should receive one concise clarification");

    const p001Zh = await initSession({ caseId: "P001", mode: "training", language: "zh" });
    const correctionZh = await expectLive({
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
    await expectLive({
      sessionId: p001Zh.sessionId,
      caseId: "P001",
      studentInput: "请解释一下刚才说的另一部分。",
      conversationHistory: [],
      language: "zh"
    });

    const p037 = await initSession({ caseId: "HX-ADD-025", mode: "training", language: "en" });
    await expectLive({
      sessionId: p037.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "Please tell me in your own words why you came today.",
      conversationHistory: [],
      language: "en"
    });
    const p037Duration = await expectLive({
      sessionId: p037.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "How long ago was the urine test abnormality first found?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(p037Duration.replyText, /\b1 day\b/i, "P037 English onset should retain its one-day duration");

    const p037Zh = await initSession({ caseId: "HX-ADD-025", mode: "training", language: "zh" });
    await expectLive({
      sessionId: p037Zh.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "请用自己的话说说这次为什么来就诊。",
      conversationHistory: [],
      language: "zh"
    });
    const p037DurationZh = await expectLive({
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
    await expectLive({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "Please describe what happened after the injury in your own words.",
      conversationHistory: [],
      language: "en"
    });
    const p038Duration = await expectLive({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "About how long ago did the injury happen?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(p038Duration.replyText, /\b4 hours?\b/i, "P038 English injury context should retain its four-hour duration");

    const p038Zh = await initSession({ caseId: "HX-ADD-026", mode: "training", language: "zh" });
    await expectLive({
      sessionId: p038Zh.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "请用自己的话说说受伤后这次不舒服的经过。",
      conversationHistory: [],
      language: "zh"
    });
    const p038RelationZh = await expectLive({
      sessionId: p038Zh.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "血尿是在外伤后才出现的吗？",
      conversationHistory: [],
      language: "zh"
    });
    assert.match(p038RelationZh.replyText, /受伤.*后|外伤.*后/, "P038 Chinese answer should preserve the injury relation");
    await expectLive({
      sessionId: p038.sessionId,
      caseId: "HX-ADD-026",
      studentInput: "Did the blood in your urine appear only after the injury?",
      conversationHistory: [],
      language: "en"
    });

    failNextProviderCall = true;
    const degraded = await generatePatientAnswer({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "Could you clarify the other part?",
      conversationHistory: [],
      language: "en"
    });
    assert.equal(degraded.isFallback, true, "provider failure must use a safe rule fallback");
    assert.equal(degraded.fallbackReason, "provider_unavailable", "provider failure should retain its safe error classification");

    const recovered = await expectLive({
      sessionId: p001.sessionId,
      caseId: "P001",
      studentInput: "Could you clarify the other part?",
      conversationHistory: [],
      language: "en"
    });
    assert.match(recovered.replyText, /clarif|which part|what.*mean/i, "a later provider success should recover from rule fallback");

    assert.equal(providerCalls, 15, "each legal turn should make exactly one provider request, including one failed call");
    console.log("Patient contextual follow-up routing passed: correction, clarification, P037/P038 context, fallback, and recovery.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
