import { expect, test } from "@playwright/test";

import {
  createPreviewProtectionHeaders,
  resolvePreviewBlackboxConfig,
  shouldAttachPreviewProtection
} from "../../scripts/preview-blackbox-config.mjs";

const preview = resolvePreviewBlackboxConfig(process.env);
if (preview.blocked) throw new Error(`${preview.reason}: ${preview.message}`);

function safeBody(request) {
  try { return request.postDataJSON() || {}; } catch { return {}; }
}

function isAction(response, action) {
  if (new URL(response.url()).pathname !== "/api/training-action/" || response.request().method() !== "POST") return false;
  return safeBody(response.request()).action === action;
}

function percentile95(values) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function parseServerTiming(value) {
  const parsed = {};
  for (const item of String(value || "").split(",")) {
    const match = item.trim().match(/^([a-z]+);dur=(\d+(?:\.\d+)?)$/i);
    if (match) parsed[match[1].toLowerCase()] = Number(match[2]);
  }
  return parsed;
}

function timingHeader(headers) {
  return headers["server-timing"] || headers["x-hematuria-timing"] || "";
}

async function installProtection(page) {
  const headers = createPreviewProtectionHeaders(preview);
  let cookieBootstrapSent = false;
  const audit = { sameOriginRequests: 0, cookieBootstrapRequests: 0, crossOriginRequests: 0 };
  page.on("request", (request) => {
    if (!shouldAttachPreviewProtection(request.url(), preview.baseURL)) audit.crossOriginRequests += 1;
  });
  await page.route((url) => shouldAttachPreviewProtection(url.toString(), preview.baseURL), async (route) => {
    audit.sameOriginRequests += 1;
    const requestHeaders = {
      ...route.request().headers(),
      "x-vercel-protection-bypass": headers["x-vercel-protection-bypass"]
    };
    if (!cookieBootstrapSent) {
      requestHeaders["x-vercel-set-bypass-cookie"] = headers["x-vercel-set-bypass-cookie"];
      cookieBootstrapSent = true;
      audit.cookieBootstrapRequests += 1;
    }
    await route.continue({ headers: requestHeaders });
  });
  return audit;
}

async function openReadyCase(browser, caseId, language = "zh") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const protection = await installProtection(page);
  const initAttempt = page.waitForResponse((response) => isAction(response, "init-attempt"));
  const sessionInit = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/session/init/" && response.request().method() === "POST");
  const startedAt = Date.now();
  const navigation = await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(preview.baseURL).origin);
  await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
  if (language === "en") {
    const accept = (dialog) => dialog.accept();
    page.once("dialog", accept);
    await page.getByRole("button", { name: "English", exact: true }).click();
    page.off("dialog", accept);
  }
  const attemptResponse = await initAttempt;
  const sessionResponse = await sessionInit;
  const elapsedMs = Date.now() - startedAt;
  return { context, page, protection, attemptResponse, sessionResponse, elapsedMs };
}

async function askLiveQuestion(page, language, question) {
  const english = language === "en";
  const input = page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: english ? "Send" : "发送", exact: true });
  await input.fill(question);
  await expect(send).toBeEnabled();
  const patientPending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/" && response.request().method() === "POST");
  const historyPending = page.waitForResponse((response) => isAction(response, "history-log"));
  const startedAt = Date.now();
  await send.click();
  const patient = await patientPending;
  const payload = await patient.json();
  const answerMs = Date.now() - startedAt;
  const history = await historyPending;
  return {
    patientStatus: patient.status(),
    historyStatus: history.status(),
    generationSource: payload.generationSource,
    provider: payload.provider,
    isFallback: payload.isFallback,
    answerMs,
    patientTiming: parseServerTiming(timingHeader(await patient.allHeaders())),
    historyTiming: parseServerTiming(timingHeader(await history.allHeaders()))
  };
}

test.describe.configure({ mode: "serial" });

test("@preview-stability initializes 10 fresh training sessions", async ({ browser }, testInfo) => {
  const samples = [];
  for (let index = 1; index <= 10; index += 1) {
    const caseId = `P${String(index).padStart(3, "0")}`;
    const opened = await openReadyCase(browser, caseId);
    try {
      const responseHeaders = await opened.sessionResponse.allHeaders();
      const timing = parseServerTiming(timingHeader(responseHeaders));
      samples.push({
        caseId,
        attemptStatus: opened.attemptResponse.status(),
        sessionStatus: opened.sessionResponse.status(),
        totalMs: opened.elapsedMs,
        serverSessionMs: timing.session,
        sameOriginRequests: opened.protection.sameOriginRequests,
        cookieBootstrapRequests: opened.protection.cookieBootstrapRequests
      });
      expect(opened.attemptResponse.status()).toBe(200);
      expect(opened.sessionResponse.status()).toBe(200);
      expect(timing.session, `session timing missing; response headers=${Object.keys(responseHeaders).sort().join(",")}`).toBeDefined();
      expect(opened.protection.cookieBootstrapRequests).toBe(1);
    } finally {
      await opened.context.close();
    }
  }
  const summary = {
    scenario: "preview-session-10",
    deploymentSha: undefined,
    successCount: samples.filter((item) => item.attemptStatus === 200 && item.sessionStatus === 200).length,
    p95TotalMs: percentile95(samples.map((item) => item.totalMs)),
    p95ServerSessionMs: percentile95(samples.map((item) => item.serverSessionMs).filter(Number.isFinite)),
    samples
  };
  await testInfo.attach("preview-session-stability", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  expect(summary.successCount).toBe(10);
  expect(summary.p95TotalMs).toBeLessThanOrEqual(3000);
});

for (const language of ["zh", "en"]) {
  test(`@preview-stability returns 5 live AI ${language} answers with verified history logs`, async ({ browser }, testInfo) => {
    const questions = language === "en"
      ? [
          "When did you first notice blood in your urine?",
          "How long have you had blood in your urine?",
          "When did this urine discoloration begin?",
          "When was the first episode of visible blood in your urine?",
          "How long ago did you notice your urine changing color?"
        ]
      : [
          "您最早什么时候发现尿里有血？",
          "尿里带血大概有多久了？",
          "这次尿色改变是从什么时候开始的？",
          "第一次看到肉眼血尿是什么时候？",
          "您多久前发现尿液颜色变了？"
        ];
    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const caseId = `P${String(index + 1).padStart(3, "0")}`;
      const opened = await openReadyCase(browser, caseId, language);
      try {
        expect(opened.attemptResponse.status()).toBe(200);
        expect(opened.sessionResponse.status()).toBe(200);
        const answer = await askLiveQuestion(opened.page, language, questions[index]);
        samples.push({ caseId, ...answer });
        expect(answer.patientStatus).toBe(200);
        expect(answer.historyStatus).toBe(200);
        expect(answer.generationSource).toBe("live_ai");
        expect(answer.isFallback).toBe(false);
        expect(String(answer.provider || "").toLowerCase()).toBe("deepseek");
        expect(answer.patientTiming.provider).toBeDefined();
        expect(answer.patientTiming.firsttoken).toBeDefined();
        expect(answer.historyTiming.history).toBeDefined();
      } finally {
        await opened.context.close();
      }
    }
    const summary = {
      scenario: `preview-live-ai-${language}-5`,
      successCount: samples.filter((item) => item.patientStatus === 200 && item.historyStatus === 200 && item.generationSource === "live_ai" && item.isFallback === false).length,
      p95AnswerMs: percentile95(samples.map((item) => item.answerMs)),
      p95ProviderMs: percentile95(samples.map((item) => item.patientTiming.provider).filter(Number.isFinite)),
      p95FirstTokenMs: percentile95(samples.map((item) => item.patientTiming.firsttoken).filter(Number.isFinite)),
      p95HistoryMs: percentile95(samples.map((item) => item.historyTiming.history).filter(Number.isFinite)),
      samples
    };
    await testInfo.attach(`preview-live-ai-${language}`, { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
    expect(summary.successCount).toBe(5);
    expect(summary.p95AnswerMs).toBeLessThanOrEqual(3000);
  });
}
