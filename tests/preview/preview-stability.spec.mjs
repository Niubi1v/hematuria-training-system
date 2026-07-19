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

function isSessionInit(response, language) {
  if (new URL(response.url()).pathname !== "/api/session/init/" || response.request().method() !== "POST") return false;
  return safeBody(response.request()).language === language;
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

async function openReadyCase(context, caseId, language = "zh") {
  let page;
  let initAttempt;
  let sessionInit;
  try {
    page = await context.newPage();
    const protection = await installProtection(page);
    initAttempt = page.waitForResponse((response) => isAction(response, "init-attempt"), { timeout: 45_000 });
    sessionInit = page.waitForResponse((response) => isSessionInit(response, "zh"), { timeout: 45_000 });
    void initAttempt.catch(() => undefined);
    void sessionInit.catch(() => undefined);
    const startedAt = Date.now();
    const navigation = await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
    expect(navigation?.status()).toBe(200);
    expect(new URL(page.url()).origin).toBe(new URL(preview.baseURL).origin);
    await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
    let attemptResponse = await initAttempt;
    let sessionResponse = await sessionInit;
    let elapsedMs = Date.now() - startedAt;
    if (language === "en") {
      const englishAttempt = page.waitForResponse((response) => isAction(response, "init-attempt") && safeBody(response.request()).language === "en", { timeout: 45_000 });
      const englishSession = page.waitForResponse((response) => isSessionInit(response, "en"), { timeout: 45_000 });
      void englishAttempt.catch(() => undefined);
      void englishSession.catch(() => undefined);
      const englishStartedAt = Date.now();
      const accept = (dialog) => dialog.accept();
      page.once("dialog", accept);
      await page.getByRole("button", { name: "English", exact: true }).click();
      page.off("dialog", accept);
      attemptResponse = await englishAttempt;
      sessionResponse = await englishSession;
      elapsedMs = Date.now() - englishStartedAt;
    }
    return { page, protection, attemptResponse, sessionResponse, elapsedMs };
  } catch (error) {
    await page?.close().catch(() => undefined);
    await Promise.allSettled([initAttempt, sessionInit].filter(Boolean));
    throw error;
  }
}

function safeFailureKind(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  if (/ERR_CONNECTION_CLOSED/.test(message)) return "network_connection_closed";
  if (/ERR_TIMED_OUT/.test(message)) return "network_timeout";
  if (/timeout/i.test(message)) return "ui_timeout";
  if (/Target page|context or browser has been closed/i.test(message)) return "browser_context_closed";
  return "unexpected_failure";
}

async function askLiveQuestion(page, language, question) {
  const english = language === "en";
  const input = page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: english ? "Send" : "发送", exact: true });
  await input.fill(question);
  await expect(send).toBeEnabled();
  let requestStartedAt;
  const patientRequestPending = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/agent-chat/" && request.method() === "POST")
    .then((request) => {
      requestStartedAt = Date.now();
      return request;
    });
  const patientPending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/" && response.request().method() === "POST");
  const historyPending = page.waitForResponse((response) => isAction(response, "history-log"));
  const clickStartedAt = Date.now();
  await send.click();
  await patientRequestPending;
  const patient = await patientPending;
  const payload = await patient.json();
  const responseReceivedAt = Date.now();
  const uiDispatchMs = requestStartedAt - clickStartedAt;
  const answerMs = responseReceivedAt - requestStartedAt;
  const clickToAnswerMs = responseReceivedAt - clickStartedAt;
  const history = await historyPending;
  return {
    patientStatus: patient.status(),
    historyStatus: history.status(),
    generationSource: payload.generationSource,
    provider: payload.provider,
    isFallback: payload.isFallback,
    fallbackReason: payload.fallbackReason,
    uiDispatchMs,
    answerMs,
    clickToAnswerMs,
    patientTiming: parseServerTiming(timingHeader(await patient.allHeaders())),
    historyTiming: parseServerTiming(timingHeader(await history.allHeaders()))
  };
}

test("@preview-stability initializes 10 fresh training sessions", async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const samples = [];
  const context = await browser.newContext();
  try {
    for (let index = 1; index <= 10; index += 1) {
      const caseId = `P${String(index).padStart(3, "0")}`;
      let opened;
      try {
        opened = await openReadyCase(context, caseId);
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
      } catch (error) {
        if (!samples.some((item) => item.caseId === caseId)) {
          samples.push({ caseId, attemptStatus: 0, sessionStatus: 0, error: safeFailureKind(error) });
        }
      } finally {
        await opened?.page.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }
  const summary = {
    scenario: "preview-session-10",
    deploymentSha: undefined,
    successCount: samples.filter((item) => item.attemptStatus === 200 && item.sessionStatus === 200).length,
    p95TotalMs: percentile95(samples.map((item) => item.totalMs).filter(Number.isFinite)),
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
    test.setTimeout(600_000);
    const questions = Array(5).fill(language === "en" ? "When did your urine turn red?" : "小便什么时候开始变红？");
    const samples = [];
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
    try {
      for (let index = 0; index < 5; index += 1) {
        const caseId = `P${String(index + 1).padStart(3, "0")}`;
        let opened;
        try {
          opened = await openReadyCase(context, caseId, language);
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
        } catch (error) {
          if (!samples.some((item) => item.caseId === caseId)) {
            samples.push({ caseId, patientStatus: 0, historyStatus: 0, generationSource: "not_reached", isFallback: undefined, error: safeFailureKind(error) });
          }
        } finally {
          await opened?.page.close().catch(() => undefined);
        }
      }
    } finally {
      await context.close().catch(() => undefined);
    }
    const summary = {
      scenario: `preview-live-ai-${language}-5`,
      successCount: samples.filter((item) => item.patientStatus === 200 && item.historyStatus === 200 && item.generationSource === "live_ai" && item.isFallback === false).length,
      p95AnswerMs: percentile95(samples.map((item) => item.answerMs).filter(Number.isFinite)),
      p95UiDispatchMs: percentile95(samples.map((item) => item.uiDispatchMs).filter(Number.isFinite)),
      p95ClickToAnswerMs: percentile95(samples.map((item) => item.clickToAnswerMs).filter(Number.isFinite)),
      p95ProviderMs: percentile95(samples.map((item) => item.patientTiming?.provider).filter(Number.isFinite)),
      p95FirstTokenMs: percentile95(samples.map((item) => item.patientTiming?.firsttoken).filter(Number.isFinite)),
      p95HistoryMs: percentile95(samples.map((item) => item.historyTiming?.history).filter(Number.isFinite)),
      samples
    };
    await testInfo.attach(`preview-live-ai-${language}`, { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
    expect(summary.successCount).toBe(5);
    expect(summary.p95AnswerMs).toBeLessThanOrEqual(3000);
    expect(summary.p95UiDispatchMs).toBeLessThanOrEqual(1000);
  });
}

test("@preview-long-session returns 20 sequential live AI answers without reinitializing", async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const questions = [
    "请问是什么时候开始的？",
    "能说说是什么时候开始的吗？",
    "您记得是什么时候开始的吗？",
    "大概是什么时候开始的？",
    "最早是什么时候开始的？",
    "具体是什么时候开始的？",
    "回想一下是什么时候开始的？",
    "方便说说是什么时候开始的吗？",
    "您能确认是什么时候开始的吗？",
    "麻烦回忆是什么时候开始的？",
    "想请教是什么时候开始的？",
    "可以告诉我是什么时候开始的吗？",
    "您印象中是什么时候开始的？",
    "请仔细想想是什么时候开始的？",
    "最初大约是什么时候开始的？",
    "您第一次留意是什么时候开始的？",
    "按您的记忆是什么时候开始的？",
    "请尽量回忆是什么时候开始的？",
    "您觉得大约是什么时候开始的？",
    "最后再确认一次是什么时候开始的？"
  ];
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  const samples = [];
  try {
    opened = await openReadyCase(context, "P001", "zh");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let sessionReinitializations = 0;
    let agentRequestCount = 0;
    const sessionIds = new Set();
    opened.page.on("response", (response) => {
      if (isSessionInit(response, "zh")) sessionReinitializations += 1;
    });
    opened.page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/api/agent-chat/" || request.method() !== "POST") return;
      agentRequestCount += 1;
      const sessionId = String(safeBody(request).sessionId || "");
      if (sessionId) sessionIds.add(sessionId);
    });

    for (const [index, question] of questions.entries()) {
      const answer = await askLiveQuestion(opened.page, "zh", question);
      samples.push({ turn: index + 1, ...answer });
      expect(answer.patientStatus).toBe(200);
      expect(answer.historyStatus).toBe(200);
      expect(answer.generationSource, `turn=${index + 1} fallback=${answer.fallbackReason || "none"}`).toBe("live_ai");
      expect(answer.isFallback, `turn=${index + 1}`).toBe(false);
      expect(String(answer.provider || "").toLowerCase(), `turn=${index + 1}`).toBe("deepseek");
    }

    expect(agentRequestCount).toBe(20);
    expect(sessionIds.size).toBe(1);
    expect(sessionReinitializations).toBe(0);
    const readPersistenceSummary = () => opened.page.evaluate(() => {
      const records = Object.keys(localStorage)
        .filter((key) => key.startsWith("hematuria-attempt-v3:P001:free:zh:"))
        .map((key) => {
          try {
            return JSON.parse(localStorage.getItem(key) || "null");
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return {
        attemptRecordCount: records.length,
        savedMessageCount: Array.isArray(records[0]?.messages) ? records[0].messages.length : 0
      };
    });
    await expect.poll(readPersistenceSummary, { message: "20-turn conversation must be durably saved before refresh", timeout: 10_000 }).toEqual({
      attemptRecordCount: 1,
      savedMessageCount: 41
    });
    const persistedBeforeRefresh = await readPersistenceSummary();
    const beforeRefresh = await opened.page.getByRole("log", { name: "模拟问诊对话" }).locator(".space-y-3 > *").count();
    await opened.page.reload({ waitUntil: "domcontentloaded" });
    await expect(opened.page.getByRole("textbox", { name: "输入问诊问题" })).toBeVisible();
    const readRenderedMessageCount = () => opened.page.getByRole("log", { name: "模拟问诊对话" }).locator(".space-y-3 > *").count();
    await expect.poll(readRenderedMessageCount, { message: "saved 20-turn conversation must render after refresh", timeout: 10_000 }).toBe(beforeRefresh);
    const afterRefresh = await readRenderedMessageCount();
    expect(afterRefresh).toBe(beforeRefresh);

    const summary = {
      scenario: "preview-live-ai-zh-20-single-session",
      successCount: samples.filter((item) => item.patientStatus === 200 && item.historyStatus === 200 && item.generationSource === "live_ai" && item.isFallback === false).length,
      agentRequestCount,
      distinctSessionCount: sessionIds.size,
      sessionReinitializations,
      persistedMessageCountBeforeRefresh: persistedBeforeRefresh.savedMessageCount,
      domMessageCountBeforeRefresh: beforeRefresh,
      domMessageCountAfterRefresh: afterRefresh,
      refreshMessageCountPreserved: afterRefresh === beforeRefresh,
      p95AnswerMs: percentile95(samples.map((item) => item.answerMs).filter(Number.isFinite)),
      p95UiDispatchMs: percentile95(samples.map((item) => item.uiDispatchMs).filter(Number.isFinite)),
      p95ProviderMs: percentile95(samples.map((item) => item.patientTiming?.provider).filter(Number.isFinite)),
      p95HistoryMs: percentile95(samples.map((item) => item.historyTiming?.history).filter(Number.isFinite)),
      samples
    };
    await testInfo.attach("preview-live-ai-zh-20-single-session", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
    expect(summary.successCount).toBe(20);
    expect(summary.p95AnswerMs).toBeLessThanOrEqual(3000);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-history-navigation preserves one logged turn across back and forward", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  try {
    opened = await openReadyCase(context, "P001", "zh");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
    });

    const answer = await askLiveQuestion(opened.page, "zh", "请问是什么时候开始的？");
    expect(answer.patientStatus).toBe(200);
    expect(answer.historyStatus).toBe(200);
    expect(answer.generationSource).toBe("live_ai");
    expect(answer.isFallback).toBe(false);
    expect(String(answer.provider || "").toLowerCase()).toBe("deepseek");
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 1, historyLogCount: 1 });

    const conversation = opened.page.getByRole("log", { name: "模拟问诊对话" }).locator(".space-y-3 > *");
    const beforeNavigation = await conversation.count();
    expect(beforeNavigation).toBeGreaterThanOrEqual(4);
    const catalog = await opened.page.goto("/cases/", { waitUntil: "domcontentloaded" });
    expect(catalog?.status()).toBe(200);
    await expect(opened.page.getByText("病例库", { exact: true }).first()).toBeVisible();

    await opened.page.goBack({ waitUntil: "domcontentloaded" });
    await expect(opened.page.getByRole("textbox", { name: "输入问诊问题" })).toBeVisible();
    await expect.poll(() => conversation.count(), { message: "back navigation must restore the logged turn", timeout: 10_000 }).toBe(beforeNavigation);
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 1, historyLogCount: 1 });

    await opened.page.goForward({ waitUntil: "domcontentloaded" });
    await expect(opened.page.getByText("病例库", { exact: true }).first()).toBeVisible();
    await opened.page.goBack({ waitUntil: "domcontentloaded" });
    await expect(opened.page.getByRole("textbox", { name: "输入问诊问题" })).toBeVisible();
    await expect.poll(() => conversation.count(), { message: "second back navigation must not duplicate the logged turn", timeout: 10_000 }).toBe(beforeNavigation);
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 1, historyLogCount: 1 });

    const summary = {
      scenario: "preview-history-navigation-one-turn",
      generationSource: answer.generationSource,
      provider: answer.provider,
      agentRequestCount,
      historyLogCount,
      domItemsBeforeNavigation: beforeNavigation,
      domItemsAfterSecondBack: await conversation.count(),
      preservedWithoutDuplication: true
    };
    await testInfo.attach("preview-history-navigation-one-turn", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});
