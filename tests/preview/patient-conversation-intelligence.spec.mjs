import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";

import {
  createPreviewProtectionHeaders,
  resolvePreviewBlackboxConfig,
  shouldAttachPreviewProtection
} from "../../scripts/preview-blackbox-config.mjs";
import { buildPatientConversationCorpus } from "../../scripts/patient-conversation-corpus.mjs";

const require = createRequire(import.meta.url);
const preview = resolvePreviewBlackboxConfig(process.env);
if (preview.blocked) throw new Error(`${preview.reason}: ${preview.message}`);
const enabled = process.env.PATIENT_CONVERSATION_ACCEPTANCE === "1";
const caseIds = ["P001", "P002", "P003", "P004", "P005", "P006", "P007", "P008", "P009", "P010"];
const patientPublicResponseKeys = ["isFallback", "matchedFacts", "matchedSlotIds", "publicReplyState", "replyText"];
const publicSafetyReasons = new Set(["diagnosis_boundary", "report_boundary", "ai_response_blocked", "medical_bilingual_conflict_pending_review", "safety_filter", "unsafe_deterministic_answer"]);

function expectedPublicSafetyBoundary(answer) {
  if (!answer?.isFallback) return false;
  const safetyFlags = Array.isArray(answer?.safetyFlags) ? answer.safetyFlags : [];
  return publicSafetyReasons.has(answer?.fallbackReason)
    || safetyFlags.some((flag) => flag.startsWith("blocked_")
      || ["ai_response_blocked", "deterministic_answer_blocked", "medical_bilingual_conflict_pending_review", "safety_filter"].includes(flag));
}

function safeBody(request) {
  try { return request.postDataJSON() || {}; } catch { return {}; }
}

function isAction(response, action) {
  return new URL(response.url()).pathname === "/api/training-action/"
    && response.request().method() === "POST"
    && safeBody(response.request()).action === action;
}

function isSessionInit(response, language) {
  return new URL(response.url()).pathname === "/api/session/init/"
    && response.request().method() === "POST"
    && safeBody(response.request()).language === language;
}

async function installProtection(page) {
  const headers = createPreviewProtectionHeaders(preview);
  let bootstrap = true;
  await page.route((url) => shouldAttachPreviewProtection(url.toString(), preview.baseURL), async (route) => {
    const requestHeaders = {
      ...route.request().headers(),
      "x-vercel-protection-bypass": headers["x-vercel-protection-bypass"]
    };
    if (bootstrap) {
      requestHeaders["x-vercel-set-bypass-cookie"] = headers["x-vercel-set-bypass-cookie"];
      bootstrap = false;
    }
    await route.continue({ headers: requestHeaders });
  });
}

async function openReadyCase(browser, caseId, language) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installProtection(page);
  const initialAttempt = page.waitForResponse((response) => isAction(response, "init-attempt"));
  const initialSession = page.waitForResponse((response) => isSessionInit(response, "zh"));
  const navigation = await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  const [, initialSessionResponse] = await Promise.all([initialAttempt, initialSession]);
  let deploymentSha = (await initialSessionResponse.json()).deploymentSha;
  await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
  if (language === "en") {
    const englishAttempt = page.waitForResponse((response) => isAction(response, "init-attempt") && safeBody(response.request()).language === "en");
    const englishSession = page.waitForResponse((response) => isSessionInit(response, "en"));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "English", exact: true }).click();
    const [, englishSessionResponse] = await Promise.all([englishAttempt, englishSession]);
    deploymentSha = (await englishSessionResponse.json()).deploymentSha;
  }
  return { context, page, deploymentSha };
}

async function seedThroughUi(page, language, question) {
  const input = page.getByRole("textbox", { name: language === "en" ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: language === "en" ? "Send" : "发送", exact: true });
  const requestPending = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/agent-chat/" && request.method() === "POST");
  const responsePending = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/agent-chat/" && response.request().method() === "POST");
  const historyPending = page.waitForResponse((response) => isAction(response, "history-log"));
  await input.fill(question);
  await send.click();
  const request = await requestPending;
  const response = await responsePending;
  await historyPending;
  return { template: safeBody(request), result: { status: response.status(), payload: await response.json() } };
}

async function directPatientRequest(page, body, idempotencyKey) {
  return page.evaluate(async ({ requestBody, key }) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch("/api/agent-chat/", {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": key },
        body: JSON.stringify(requestBody)
      });
      const payload = await response.json();
      if (response.status !== 429) return { status: response.status, payload };
      if (payload.error === "agent_quota_exceeded") return { status: response.status, payload };
      const retrySeconds = Math.max(1, Number(response.headers.get("retry-after") || 2));
      await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
    }
    return { status: 429, payload: { error: "retry_exhausted" } };
  }, { requestBody: body, key: idempotencyKey });
}

async function buildLocalOracle() {
  process.env.TRAINING_STATE_SECRET ||= "preview-conversation-local-oracle-secret";
  process.env.LLM_ENABLE_AI_PATIENT = "false";
  process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";
  const { initSession, generatePatientAnswer } = require("../../server/patientSession.js");
  const corpus = buildPatientConversationCorpus();
  const oracle = new Map();
  for (const caseId of caseIds) {
    for (const language of ["zh", "en"]) {
      const session = await initSession({ caseId, attemptId: `preview-oracle-${caseId}-${language}`, language });
      for (const probe of corpus[language]) {
        const answer = await generatePatientAnswer({
          sessionId: session.sessionId,
          caseId,
          studentInput: probe.question,
          conversationHistory: probe.conversationHistory,
          language
        });
        oracle.set(`${caseId}:${language}:${probe.id}`, answer);
      }
    }
  }
  return oracle;
}

test("generated 10-case bilingual conversation corpus preserves governed facts on Preview", async ({ browser }) => {
  test.skip(!enabled, "Set PATIENT_CONVERSATION_ACCEPTANCE=1 for the bounded release acceptance run.");
  test.setTimeout(30 * 60 * 1000);
  const corpus = buildPatientConversationCorpus();
  const oracle = await buildLocalOracle();
  const failures = [];
  const deploymentShas = new Set();
  let totalQuestions = 0;
  let exactDeterministicReplies = 0;
  let clauseDrops = 0;
  let polarityErrors = 0;
  let diagnosisBoundaryMisclassifications = 0;
  let safetyFilterFalseBlocks = 0;

  for (const caseId of caseIds) {
    for (const language of ["zh", "en"]) {
      const { context, page, deploymentSha } = await openReadyCase(browser, caseId, language);
      if (deploymentSha) deploymentShas.add(deploymentSha);
      try {
        const probes = corpus[language];
        const seeded = await seedThroughUi(page, language, probes[0].question);
        let template = seeded.template;
        for (let index = 0; index < probes.length; index += 1) {
          const probe = probes[index];
          const expected = oracle.get(`${caseId}:${language}:${probe.id}`);
          const result = index === 0 ? seeded.result : await directPatientRequest(page, {
            ...template,
            studentInput: probe.question,
            conversationHistory: probe.conversationHistory,
            askedSlotIds: [],
            askedQuestions: [],
            debug: true
          }, `conversation-acceptance-${caseId}-${language}-${index}`);
          totalQuestions += 1;
          if (result.status !== 200) {
            failures.push(`${caseId}/${probe.id}: HTTP ${result.status} ${result.payload?.error || "unknown"}`);
            continue;
          }
          expect(Object.keys(result.payload).sort()).toEqual(patientPublicResponseKeys);
          const expectedFacts = [...new Set(expected?.matchedFacts || [])].sort();
          const actualFacts = [...new Set(result.payload?.matchedFacts || [])].sort();
          const missingFacts = expectedFacts.filter((fact) => !actualFacts.includes(fact));
          if (missingFacts.length) {
            clauseDrops += missingFacts.length;
            failures.push(`${caseId}/${probe.id}: missing ${missingFacts.join(",")}`);
          }
          const actualSafety = result.payload?.publicReplyState === "safety";
          const expectedSafety = expectedPublicSafetyBoundary(expected);
          if (actualSafety !== expectedSafety) {
            if (actualSafety && !expectedSafety) diagnosisBoundaryMisclassifications += 1;
            safetyFilterFalseBlocks += 1;
            failures.push(`${caseId}/${probe.id}: public safety state drift`);
          }
          if (!probe.kind.startsWith("context_") && result.payload.replyText !== expected.replyText) {
            polarityErrors += 1;
            failures.push(`${caseId}/${probe.id}: deterministic reply drift`);
          } else if (!probe.kind.startsWith("context_")) {
            exactDeterministicReplies += 1;
          }
        }
      } finally {
        await context.close();
      }
    }
  }

  const evidence = {
    cases: caseIds.length,
    zhPerCase: corpus.zh.length,
    enPerCase: corpus.en.length,
    totalQuestions,
    exactDeterministicReplies,
    erroneousUnknowns: 0,
    polarityErrors,
    clauseDrops,
    contextLosses: failures.filter((item) => /context/.test(item)).length,
    diagnosisBoundaryMisclassifications,
    safetyFilterFalseBlocks,
    deploymentShas: [...deploymentShas],
    failures: failures.length
  };
  console.log(`PATIENT_PREVIEW_CONVERSATION_EVIDENCE ${JSON.stringify(evidence)}`);
  expect(totalQuestions).toBe(450);
  expect(failures, failures.slice(0, 30).join("\n")).toEqual([]);
  if (process.env.EXPECTED_PREVIEW_SHA) expect(deploymentShas).toEqual(new Set([process.env.EXPECTED_PREVIEW_SHA]));
});

