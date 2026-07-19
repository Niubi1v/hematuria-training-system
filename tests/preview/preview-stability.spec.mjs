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

function percentile50(values) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)];
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
  const audit = { sameOriginRequests: 0, cookieBootstrapRequests: 0, crossOriginRequests: 0, crossOriginProtectionRequests: 0 };
  page.on("request", (request) => {
    if (shouldAttachPreviewProtection(request.url(), preview.baseURL)) return;
    audit.crossOriginRequests += 1;
    const requestHeaders = request.headers();
    if (requestHeaders["x-vercel-protection-bypass"] || requestHeaders["x-vercel-set-bypass-cookie"]) {
      audit.crossOriginProtectionRequests += 1;
    }
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

async function switchReadyLanguage(page, language) {
  const english = language === "en";
  const attemptPending = page.waitForResponse((response) => isAction(response, "init-attempt") && safeBody(response.request()).language === language, { timeout: 45_000 });
  const sessionPending = page.waitForResponse((response) => isSessionInit(response, language), { timeout: 45_000 });
  void attemptPending.catch(() => undefined);
  void sessionPending.catch(() => undefined);
  const accept = (dialog) => dialog.accept();
  page.once("dialog", accept);
  await page.getByRole("button", { name: english ? "English" : "中文", exact: true }).click();
  page.off("dialog", accept);
  const [attempt, session] = await Promise.all([attemptPending, sessionPending]);
  await expect(page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" })).toBeVisible();
  return { attemptStatus: attempt.status(), sessionStatus: session.status() };
}

function safeFailureKind(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  if (/ERR_CONNECTION_CLOSED/.test(message)) return "network_connection_closed";
  if (/ERR_TIMED_OUT/.test(message)) return "network_timeout";
  if (/timeout/i.test(message)) return "ui_timeout";
  if (/Target page|context or browser has been closed/i.test(message)) return "browser_context_closed";
  return "unexpected_failure";
}

async function askLiveQuestion(page, language, question, options = {}) {
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
    replyText: options.includeReplyText ? String(payload.replyText || "") : undefined,
    uiDispatchMs,
    answerMs,
    clickToAnswerMs,
    patientTiming: parseServerTiming(timingHeader(await patient.allHeaders())),
    historyTiming: parseServerTiming(timingHeader(await history.allHeaders()))
  };
}

async function askLiveQuestionWithVisibleTiming(page, language, question) {
  const english = language === "en";
  const input = page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: english ? "Send" : "发送", exact: true });
  const log = page.getByRole("log", { name: english ? "Simulated interview conversation" : "模拟问诊对话" });
  const conversation = log.locator(".space-y-3 > *");
  await input.fill(question);
  await expect(send).toBeEnabled();
  const initialDomItems = await conversation.count();
  await log.evaluate((element, expectedCount) => {
    const state = { clickAt: undefined, firstVisibleAt: undefined, observer: undefined };
    const observer = new MutationObserver(() => {
      if (state.firstVisibleAt !== undefined) return;
      const count = element.querySelectorAll(".space-y-3 > *").length;
      if (count >= expectedCount) {
        state.firstVisibleAt = performance.now();
        observer.disconnect();
      }
    });
    state.observer = observer;
    observer.observe(element, { childList: true, subtree: true });
    window.__qaVisibleAnswerTiming = state;
  }, initialDomItems + 2);
  await send.evaluate((element) => {
    element.addEventListener("click", () => {
      window.__qaVisibleAnswerTiming.clickAt = performance.now();
    }, { capture: true, once: true });
  });

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
  const history = await historyPending;
  await expect.poll(() => page.evaluate(() => window.__qaVisibleAnswerTiming?.firstVisibleAt), {
    message: "patient answer must become visible in the browser DOM",
    timeout: 10_000
  }).not.toBeUndefined();
  const visibleTiming = await page.evaluate(() => {
    const state = window.__qaVisibleAnswerTiming;
    state?.observer?.disconnect();
    return {
      clickAt: state?.clickAt,
      firstVisibleAt: state?.firstVisibleAt
    };
  });
  expect(visibleTiming.clickAt).toBeDefined();
  expect(visibleTiming.firstVisibleAt).toBeDefined();
  const clickToFirstVisibleMs = Math.max(0, visibleTiming.firstVisibleAt - visibleTiming.clickAt);
  await expect.poll(() => conversation.count(), { timeout: 10_000 }).toBe(initialDomItems + 2);
  return {
    patientStatus: patient.status(),
    historyStatus: history.status(),
    generationSource: payload.generationSource,
    provider: payload.provider,
    isFallback: payload.isFallback,
    clickToFirstVisibleMs,
    uiDispatchMs: requestStartedAt - clickStartedAt,
    fullResponseMs: responseReceivedAt - requestStartedAt,
    clickToFullResponseMs: responseReceivedAt - clickStartedAt,
    initialDomItems,
    finalDomItems: await conversation.count()
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

test("@preview-background-recovery continues one session after a frozen lifecycle", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  let cdp;
  try {
    opened = await openReadyCase(context, "P001", "zh");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    let attemptReinitCount = 0;
    let sessionReinitCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST") {
        const action = safeBody(request).action;
        if (action === "history-log") historyLogCount += 1;
        if (action === "init-attempt") attemptReinitCount += 1;
      }
      if (pathname === "/api/session/init/" && request.method() === "POST") sessionReinitCount += 1;
    });

    const firstAnswer = await askLiveQuestion(opened.page, "zh", "请问是什么时候开始的？");
    expect(firstAnswer.patientStatus).toBe(200);
    expect(firstAnswer.historyStatus).toBe(200);
    expect(firstAnswer.generationSource).toBe("live_ai");
    expect(firstAnswer.isFallback).toBe(false);
    expect(String(firstAnswer.provider || "").toLowerCase()).toBe("deepseek");

    const conversation = opened.page.getByRole("log", { name: "模拟问诊对话" }).locator(".space-y-3 > *");
    const beforeFreeze = await conversation.count();
    expect(beforeFreeze).toBeGreaterThanOrEqual(4);
    cdp = await context.newCDPSession(opened.page);
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    await opened.page.bringToFront();

    await expect(opened.page.getByRole("textbox", { name: "输入问诊问题" })).toBeVisible();
    const visibilityStateAfterRecovery = await opened.page.evaluate(() => document.visibilityState);
    expect(visibilityStateAfterRecovery).toBe("visible");
    await expect.poll(() => conversation.count(), { message: "lifecycle recovery must preserve the first turn", timeout: 10_000 }).toBe(beforeFreeze);
    const secondAnswer = await askLiveQuestion(opened.page, "zh", "这段时间是反复出现还是一直都有？");
    expect(secondAnswer.patientStatus).toBe(200);
    expect(secondAnswer.historyStatus).toBe(200);
    expect(secondAnswer.generationSource).toBe("live_ai");
    expect(secondAnswer.isFallback).toBe(false);
    expect(String(secondAnswer.provider || "").toLowerCase()).toBe("deepseek");
    await expect.poll(() => conversation.count(), { message: "recovered page must append exactly one new turn", timeout: 10_000 }).toBe(beforeFreeze + 2);
    expect({ agentRequestCount, historyLogCount, attemptReinitCount, sessionReinitCount }).toEqual({
      agentRequestCount: 2,
      historyLogCount: 2,
      attemptReinitCount: 0,
      sessionReinitCount: 0
    });
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);

    const summary = {
      scenario: "preview-background-recovery-two-turn",
      lifecycleEmulation: "chromium-frozen-active",
      firstGenerationSource: firstAnswer.generationSource,
      secondGenerationSource: secondAnswer.generationSource,
      provider: secondAnswer.provider,
      agentRequestCount,
      historyLogCount,
      attemptReinitCount,
      sessionReinitCount,
      visibilityStateAfterRecovery,
      crossOriginRequests: opened.protection.crossOriginRequests,
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
      domItemsBeforeFreeze: beforeFreeze,
      domItemsAfterRecovery: await conversation.count(),
      preservedWithoutDuplication: true
    };
    await testInfo.attach("preview-background-recovery-two-turn", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  } finally {
    await cdp?.detach().catch(() => undefined);
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-visible-answer-timing measures five non-streaming browser-visible answers", async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  try {
    opened = await openReadyCase(context, "P001", "zh");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    let attemptReinitCount = 0;
    let sessionReinitCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST") {
        const action = safeBody(request).action;
        if (action === "history-log") historyLogCount += 1;
        if (action === "init-attempt") attemptReinitCount += 1;
      }
      if (pathname === "/api/session/init/" && request.method() === "POST") sessionReinitCount += 1;
    });

    const questions = [
      "请问是什么时候开始的？",
      "能说说是什么时候开始的吗？",
      "您记得是什么时候开始的吗？",
      "大概是什么时候开始的？",
      "最早是什么时候开始的？"
    ];
    const samples = [];
    for (const question of questions) {
      const sample = await askLiveQuestionWithVisibleTiming(opened.page, "zh", question);
      expect(sample.patientStatus).toBe(200);
      expect(sample.historyStatus).toBe(200);
      expect(sample.generationSource).toBe("live_ai");
      expect(sample.isFallback).toBe(false);
      expect(String(sample.provider || "").toLowerCase()).toBe("deepseek");
      expect(sample.clickToFirstVisibleMs).toBeGreaterThanOrEqual(0);
      samples.push(sample);
    }
    expect({ agentRequestCount, historyLogCount, attemptReinitCount, sessionReinitCount }).toEqual({
      agentRequestCount: 5,
      historyLogCount: 5,
      attemptReinitCount: 0,
      sessionReinitCount: 0
    });
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);

    const visibleValues = samples.map((sample) => sample.clickToFirstVisibleMs);
    const fullResponseValues = samples.map((sample) => sample.clickToFullResponseMs);
    const summary = {
      scenario: "preview-visible-answer-timing-zh-5",
      transportMode: "non-streaming",
      providerFirstTokenMeasured: false,
      browserVisibleAnswerMeasured: true,
      sampleCount: samples.length,
      liveAiCount: samples.filter((sample) => sample.generationSource === "live_ai" && sample.isFallback === false).length,
      provider: samples[0]?.provider,
      agentRequestCount,
      historyLogCount,
      attemptReinitCount,
      sessionReinitCount,
      p50ClickToFirstVisibleMs: percentile50(visibleValues),
      p95ClickToFirstVisibleMs: percentile95(visibleValues),
      p50ClickToFullResponseMs: percentile50(fullResponseValues),
      p95ClickToFullResponseMs: percentile95(fullResponseValues),
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests
    };
    await testInfo.attach("preview-visible-answer-timing-zh-5", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-wrong-summary-correction rejects a contradictory P001 recap without leaking teacher content", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
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

    const baseline = await askLiveQuestion(opened.page, "zh", "请问尿红是什么时候开始的？", { includeReplyText: true });
    expect(baseline.patientStatus).toBe(200);
    expect(baseline.historyStatus).toBe(200);
    expect(baseline.generationSource).toBe("live_ai");
    expect(baseline.isFallback).toBe(false);
    expect(String(baseline.provider || "").toLowerCase()).toBe("deepseek");
    const baselineDurationConfirmed = /(?:3|三)[^，。！？]{0,6}月/.test(baseline.replyText);
    expect(baselineDurationConfirmed).toBe(true);

    const correction = await askLiveQuestion(opened.page, "zh", "我确认一下：您是今天才第一次出现尿红，而且一直没有反复，对吗？", { includeReplyText: true });
    expect(correction.patientStatus).toBe(200);
    expect(correction.historyStatus).toBe(200);
    expect(correction.generationSource).toBe("live_ai");
    expect(correction.isFallback).toBe(false);
    expect(String(correction.provider || "").toLowerCase()).toBe("deepseek");
    const correctionDetected = /不是|不对|并非|并不是|(?:3|三)\s*个?月|间断|反复|时有时无/.test(correction.replyText);
    const teacherMetaLeakageDetected = /评分|得分点|教师|标准答案|JSON|system\s*prompt/i.test(correction.replyText);
    const finalDiagnosisLeakageDetected = /膀胱癌|膀胱恶性肿瘤/.test(correction.replyText);
    expect(correctionDetected).toBe(true);
    expect(teacherMetaLeakageDetected).toBe(false);
    expect(finalDiagnosisLeakageDetected).toBe(false);
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 2, historyLogCount: 2 });
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);

    const summary = {
      scenario: "preview-wrong-summary-correction-p001-zh",
      baselineGenerationSource: baseline.generationSource,
      correctionGenerationSource: correction.generationSource,
      provider: correction.provider,
      baselineDurationConfirmed,
      correctionDetected,
      teacherMetaLeakageDetected,
      finalDiagnosisLeakageDetected,
      agentRequestCount,
      historyLogCount,
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
      responseTextRetained: false
    };
    await testInfo.attach("preview-wrong-summary-correction-p001-zh", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-language-quality corrects a contradictory English P001 recap", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  try {
    opened = await openReadyCase(context, "P001", "en");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
    });

    const baseline = await askLiveQuestion(opened.page, "en", "When did you first notice the red urine?", { includeReplyText: true });
    expect(baseline.patientStatus).toBe(200);
    expect(baseline.historyStatus).toBe(200);
    expect(baseline.generationSource).toBe("live_ai");
    expect(baseline.isFallback).toBe(false);
    expect(String(baseline.provider || "").toLowerCase()).toBe("deepseek");
    const baselineDurationConfirmed = /(?:three|3)[^.!?]{0,12}months?/i.test(baseline.replyText);
    expect(baselineDurationConfirmed).toBe(true);

    const correction = await askLiveQuestion(opened.page, "en", "So this only started today and it has never happened before, correct?", { includeReplyText: true });
    expect(correction.patientStatus).toBe(200);
    expect(correction.historyStatus).toBe(200);
    expect(correction.generationSource).toBe("live_ai");
    expect(correction.isFallback).toBe(false);
    expect(String(correction.provider || "").toLowerCase()).toBe("deepseek");
    const correctionDetected = /\b(?:no|not|incorrect|actually|months?|intermittent|before|on and off)\b/i.test(correction.replyText);
    const chineseLeakageDetected = /[\u3400-\u9fff]/u.test(correction.replyText);
    const teacherMetaLeakageDetected = /scor(?:e|ing)|rubric|teacher|standard answer|JSON|system\s*prompt/i.test(correction.replyText);
    const finalDiagnosisLeakageDetected = /bladder\s+(?:cancer|malignan)|urothelial\s+carcinoma/i.test(correction.replyText);
    expect(correctionDetected).toBe(true);
    expect(chineseLeakageDetected).toBe(false);
    expect(teacherMetaLeakageDetected).toBe(false);
    expect(finalDiagnosisLeakageDetected).toBe(false);
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 2, historyLogCount: 2 });
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);

    const summary = {
      scenario: "preview-wrong-summary-correction-p001-en",
      baselineGenerationSource: baseline.generationSource,
      correctionGenerationSource: correction.generationSource,
      provider: correction.provider,
      baselineDurationConfirmed,
      correctionDetected,
      chineseLeakageDetected,
      teacherMetaLeakageDetected,
      finalDiagnosisLeakageDetected,
      agentRequestCount,
      historyLogCount,
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
      responseTextRetained: false
    };
    await testInfo.attach("preview-wrong-summary-correction-p001-en", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-language-quality asks for clarification instead of dumping English history", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  try {
    opened = await openReadyCase(context, "P001", "en");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
    });

    const answer = await askLiveQuestion(opened.page, "en", "Could you explain the other part?", { includeReplyText: true });
    expect(answer.patientStatus).toBe(200);
    expect(answer.historyStatus).toBe(200);
    expect(answer.generationSource).toBe("live_ai");
    expect(answer.isFallback).toBe(false);
    expect(String(answer.provider || "").toLowerCase()).toBe("deepseek");
    const clarificationDetected = /\b(?:what|which|mean|part|refer|specific|clarif|like to know|about what|anything in particular|not sure)\b/i.test(answer.replyText);
    const chineseLeakageDetected = /[\u3400-\u9fff]/u.test(answer.replyText);
    const teacherMetaLeakageDetected = /scor(?:e|ing)|rubric|teacher|standard answer|JSON|system\s*prompt/i.test(answer.replyText);
    const finalDiagnosisLeakageDetected = /bladder\s+(?:cancer|malignan)|urothelial\s+carcinoma/i.test(answer.replyText);
    const historyFactSignalCount = [
      /(?:three|3)[^.!?]{0,12}months?/i,
      /blood\s+clots?/i,
      /aspirin/i,
      /hypertension|high\s+blood\s+pressure/i,
      /difficult(?:y)?\s+(?:to\s+)?ur|empty(?:ing)?\s+my\s+bladder/i
    ].filter((pattern) => pattern.test(answer.replyText)).length;
    const fullHistoryDumpDetected = historyFactSignalCount >= 3;
    const summary = {
      scenario: "preview-ungrounded-vague-question-clarification-p001-en",
      generationSource: answer.generationSource,
      provider: answer.provider,
      clarificationDetected,
      chineseLeakageDetected,
      teacherMetaLeakageDetected,
      finalDiagnosisLeakageDetected,
      fullHistoryDumpDetected,
      historyFactSignalCount,
      agentRequestCount,
      historyLogCount,
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
      responseTextRetained: false
    };
    await testInfo.attach("preview-vague-question-clarification-p001-en", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
    expect(clarificationDetected).toBe(true);
    expect(chineseLeakageDetected).toBe(false);
    expect(teacherMetaLeakageDetected).toBe(false);
    expect(finalDiagnosisLeakageDetected).toBe(false);
    expect(fullHistoryDumpDetected).toBe(false);
    expect({ agentRequestCount, historyLogCount }).toEqual({ agentRequestCount: 1, historyLogCount: 1 });
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test("@preview-representative-chief-complaint samples ten clinical categories bilingually", async ({ browser }, testInfo) => {
  test.setTimeout(900_000);
  const representatives = [
    { caseId: "P013", category: "urinary-tumor", diagnosisLeak: /膀胱(?:癌|恶性)|尿路上皮癌|bladder\s+(?:cancer|malignan)|urothelial\s+carcinoma/i },
    { caseId: "P017", category: "anticoagulation", diagnosisLeak: /抗凝相关血尿|anticoagulant-related\s+hematuria/i },
    { caseId: "P019", category: "infection", diagnosisLeak: /肾盂肾炎|pyelonephritis/i },
    { caseId: "P023", category: "stone", diagnosisLeak: /输尿管结石|ureter(?:al|ic)\s+(?:stone|calculus)/i },
    { caseId: "P028", category: "prostate", diagnosisLeak: /前列腺增生|benign\s+prostatic\s+hyperplasia|\bBPH\b/i },
    { caseId: "P032", category: "glomerular", diagnosisLeak: /肾小球肾炎|glomerulonephritis/i },
    { caseId: "P034", category: "hereditary-pediatric-clue", diagnosisLeak: /Alport|遗传性肾炎/i },
    { caseId: "P037", category: "female-contamination", diagnosisLeak: /月经污染|妇科来源|menstrual\s+contamination|gynecologic\s+source/i },
    { caseId: "P038", category: "trauma", diagnosisLeak: /肾挫伤|renal\s+contusion/i },
    { caseId: "P042", category: "high-risk-microscopic", diagnosisLeak: /高危无症状镜下血尿|high-risk\s+asymptomatic\s+microscopic/i }
  ];
  const sourceVocabulary = new Set(["live_ai", "ai_cache", "rule_fallback", "safety_boundary", "mock", "unknown"]);
  const samples = [];
  for (const representative of representatives) {
    for (const language of ["zh", "en"]) {
      const context = await browser.newContext();
      await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
      let opened;
      try {
        opened = await openReadyCase(context, representative.caseId, language);
        let agentRequestCount = 0;
        let historyLogCount = 0;
        opened.page.on("request", (request) => {
          const pathname = new URL(request.url()).pathname;
          if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
          if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
        });
        const question = language === "en"
          ? "Please describe the main problem that brought you here in your own words."
          : "请用自己的话说说这次最主要的不舒服是什么？";
        const answer = await askLiveQuestion(opened.page, language, question, { includeReplyText: true });
        const source = sourceVocabulary.has(answer.generationSource) ? answer.generationSource : "unknown";
        const chinesePresent = /[\u3400-\u9fff]/u.test(answer.replyText);
        const languageLeakDetected = language === "en" ? chinesePresent : !chinesePresent;
        const teacherMetaLeakageDetected = /评分|得分点|教师|标准答案|scor(?:e|ing)|rubric|teacher|standard answer|JSON|system\s*prompt/i.test(answer.replyText);
        const structuredPayloadLeakageDetected = /matchedSlotIds?|matchedFacts?|generationSource|isFallback|caseId|slotId/i.test(answer.replyText);
        const diagnosisHeuristicDetected = representative.diagnosisLeak.test(answer.replyText);
        samples.push({
          caseId: representative.caseId,
          category: representative.category,
          language,
          source,
          patientStatus: answer.patientStatus,
          historyStatus: answer.historyStatus,
          providerContractPass: source !== "live_ai" || (String(answer.provider || "").toLowerCase() === "deepseek" && answer.isFallback === false),
          languageLeakDetected,
          teacherMetaLeakageDetected,
          structuredPayloadLeakageDetected,
          diagnosisHeuristicDetected,
          agentRequestCount,
          historyLogCount,
          crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
          responseTextRetained: false
        });
      } finally {
        await opened?.page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    }
  }

  const sourceCounts = Object.fromEntries([...sourceVocabulary].map((source) => [source, samples.filter((sample) => sample.source === source).length]));
  const summary = {
    scenario: "preview-representative-chief-complaint-bilingual-20",
    caseCount: representatives.length,
    sampleCount: samples.length,
    sourceCounts,
    httpContractFailures: samples.filter((sample) => sample.patientStatus !== 200 || sample.historyStatus !== 200).length,
    providerContractFailures: samples.filter((sample) => !sample.providerContractPass).length,
    requestContractFailures: samples.filter((sample) => sample.agentRequestCount !== 1 || sample.historyLogCount !== 1).length,
    languageLeakCount: samples.filter((sample) => sample.languageLeakDetected).length,
    teacherMetaLeakCount: samples.filter((sample) => sample.teacherMetaLeakageDetected).length,
    structuredPayloadLeakCount: samples.filter((sample) => sample.structuredPayloadLeakageDetected).length,
    diagnosisHeuristicCount: samples.filter((sample) => sample.diagnosisHeuristicDetected).length,
    crossOriginProtectionRequestCount: samples.reduce((sum, sample) => sum + sample.crossOriginProtectionRequests, 0),
    responseTextRetained: false,
    samples
  };
  await testInfo.attach("preview-representative-chief-complaint-bilingual-20", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  expect(summary.sampleCount).toBe(20);
  expect(summary.httpContractFailures).toBe(0);
  expect(summary.providerContractFailures).toBe(0);
  expect(summary.requestContractFailures).toBe(0);
  expect(summary.languageLeakCount).toBe(0);
  expect(summary.teacherMetaLeakCount).toBe(0);
  expect(summary.structuredPayloadLeakCount).toBe(0);
  expect(summary.diagnosisHeuristicCount).toBe(0);
  expect(summary.crossOriginProtectionRequestCount).toBe(0);
  expect(sourceCounts.unknown).toBe(0);
});

test("@preview-paraphrase-consistency preserves onset duration across bilingual rephrasing", async ({ browser }, testInfo) => {
  test.setTimeout(900_000);
  const representatives = [
    { caseId: "P019", category: "infection", expected: "3-days", zh: /(?:3|三)\s*天/, en: /(?:three|3)\s+days?/i },
    { caseId: "P023", category: "stone", expected: "6-hours", zh: /(?:6|六)\s*个?小时|半天/, en: /(?:six|6)\s+hours?|half\s+a\s+day/i },
    {
      caseId: "P032",
      category: "glomerular",
      expected: "1-week",
      zh: /(?:1|一)\s*周|一个星期/,
      en: /(?:one|1|a)\s+weeks?|last\s+week/i,
      questions: {
        zh: ["茶色尿和眼睑水肿大概从什么时候开始？", "再确认一下，尿变成茶色并出现水肿是多久以前？"],
        en: ["About when did the tea-colored urine and swelling start?", "Just to confirm, how long ago did the dark urine and swelling first appear?"]
      }
    },
    { caseId: "P038", category: "trauma", expected: "4-hours", zh: /(?:4|四)\s*个?小时/, en: /(?:four|4)\s+hours?/i },
    { caseId: "P042", category: "high-risk-microscopic", expected: "1-month", zh: /(?:1|一)\s*个?月/, en: /(?:one|1|a)\s+months?/i }
  ];
  const samples = [];
  for (const representative of representatives) {
    for (const language of ["zh", "en"]) {
      const context = await browser.newContext();
      await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
      let opened;
      try {
        opened = await openReadyCase(context, representative.caseId, language);
        let agentRequestCount = 0;
        let historyLogCount = 0;
        opened.page.on("request", (request) => {
          const pathname = new URL(request.url()).pathname;
          if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
          if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
        });
        const questions = representative.questions?.[language] || (language === "en"
          ? ["About when did these symptoms start?", "Just to confirm, how long ago did you first notice them?"]
          : ["这些症状大概从什么时候开始？", "再确认一下，最早是多久以前出现的？"]);
        const first = await askLiveQuestion(opened.page, language, questions[0], { includeReplyText: true });
        const second = await askLiveQuestion(opened.page, language, questions[1], { includeReplyText: true });
        const pattern = representative[language];
        const firstDurationMatched = pattern.test(first.replyText);
        const secondDurationMatched = pattern.test(second.replyText);
        const joinedText = `${first.replyText}\n${second.replyText}`;
        const chinesePresentInFirst = /[\u3400-\u9fff]/u.test(first.replyText);
        const chinesePresentInSecond = /[\u3400-\u9fff]/u.test(second.replyText);
        const languageLeakDetected = language === "en"
          ? chinesePresentInFirst || chinesePresentInSecond
          : !chinesePresentInFirst || !chinesePresentInSecond;
        const teacherMetaLeakageDetected = /评分|得分点|教师|标准答案|scor(?:e|ing)|rubric|teacher|standard answer|JSON|system\s*prompt/i.test(joinedText);
        const structuredPayloadLeakageDetected = /matchedSlotIds?|matchedFacts?|generationSource|isFallback|caseId|slotId/i.test(joinedText);
        const liveAiPair = [first, second].every((answer) => answer.generationSource === "live_ai");
        const safetyBoundaryPair = [first, second].every((answer) => answer.generationSource === "safety_boundary");
        const sourcePairClassified = liveAiPair || safetyBoundaryPair;
        samples.push({
          caseId: representative.caseId,
          category: representative.category,
          language,
          expected: representative.expected,
          firstSource: first.generationSource,
          secondSource: second.generationSource,
          firstPatientStatus: first.patientStatus,
          secondPatientStatus: second.patientStatus,
          firstHistoryStatus: first.historyStatus,
          secondHistoryStatus: second.historyStatus,
          liveAiPair,
          safetyBoundaryPair,
          sourcePairClassified,
          providerContractPass: !liveAiPair || [first, second].every((answer) => String(answer.provider || "").toLowerCase() === "deepseek" && answer.isFallback === false),
          firstDurationMatched,
          secondDurationMatched,
          factConsistencyEvaluable: liveAiPair,
          consistent: liveAiPair ? firstDurationMatched && secondDurationMatched : null,
          languageLeakDetected,
          teacherMetaLeakageDetected,
          structuredPayloadLeakageDetected,
          agentRequestCount,
          historyLogCount,
          crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
          responseTextRetained: false
        });
      } finally {
        await opened?.page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    }
  }

  const summary = {
    scenario: "preview-paraphrase-onset-consistency-bilingual-10",
    caseCount: representatives.length,
    sampleCount: samples.length,
    responseCount: samples.length * 2,
    classifiedPairCount: samples.filter((sample) => sample.sourcePairClassified).length,
    liveAiPairCount: samples.filter((sample) => sample.liveAiPair).length,
    safetyBoundaryPairCount: samples.filter((sample) => sample.safetyBoundaryPair).length,
    providerContractFailures: samples.filter((sample) => !sample.providerContractPass).length,
    factConsistencyEvaluablePairCount: samples.filter((sample) => sample.factConsistencyEvaluable).length,
    consistentEvaluablePairCount: samples.filter((sample) => sample.factConsistencyEvaluable && sample.consistent).length,
    safetyBoundarySourceConsistentCount: samples.filter((sample) => sample.safetyBoundaryPair).length,
    httpContractFailures: samples.filter((sample) => sample.firstPatientStatus !== 200 || sample.secondPatientStatus !== 200 || sample.firstHistoryStatus !== 200 || sample.secondHistoryStatus !== 200).length,
    requestContractFailures: samples.filter((sample) => sample.agentRequestCount !== 2 || sample.historyLogCount !== 2).length,
    languageLeakCount: samples.filter((sample) => sample.languageLeakDetected).length,
    teacherMetaLeakCount: samples.filter((sample) => sample.teacherMetaLeakageDetected).length,
    structuredPayloadLeakCount: samples.filter((sample) => sample.structuredPayloadLeakageDetected).length,
    crossOriginProtectionRequestCount: samples.reduce((sum, sample) => sum + sample.crossOriginProtectionRequests, 0),
    responseTextRetained: false,
    samples
  };
  await testInfo.attach("preview-paraphrase-onset-consistency-bilingual-10", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
  expect(summary.sampleCount).toBe(10);
  expect(summary.responseCount).toBe(20);
  expect(summary.classifiedPairCount).toBe(10);
  expect(summary.liveAiPairCount).toBe(7);
  expect(summary.safetyBoundaryPairCount).toBe(3);
  expect(summary.providerContractFailures).toBe(0);
  expect(summary.factConsistencyEvaluablePairCount).toBe(7);
  expect(summary.consistentEvaluablePairCount).toBe(7);
  expect(summary.safetyBoundarySourceConsistentCount).toBe(3);
  expect(summary.httpContractFailures).toBe(0);
  expect(summary.requestContractFailures).toBe(0);
  expect(summary.languageLeakCount).toBe(0);
  expect(summary.teacherMetaLeakCount).toBe(0);
  expect(summary.structuredPayloadLeakCount).toBe(0);
  expect(summary.crossOriginProtectionRequestCount).toBe(0);
});

test("@preview-cross-language-fact preserves P023 duration across zh-en-zh", async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.removeItem("hematuria-language"));
  let opened;
  try {
    opened = await openReadyCase(context, "P023", "zh");
    expect(opened.attemptResponse.status()).toBe(200);
    expect(opened.sessionResponse.status()).toBe(200);
    let agentRequestCount = 0;
    let historyLogCount = 0;
    let apiUnauthorizedCount = 0;
    opened.page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/agent-chat/" && request.method() === "POST" && !safeBody(request).probe) agentRequestCount += 1;
      if (pathname === "/api/training-action/" && request.method() === "POST" && safeBody(request).action === "history-log") historyLogCount += 1;
    });
    opened.page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith("/api/") && response.status() === 401) apiUnauthorizedCount += 1;
    });

    const zhFirst = await askLiveQuestion(opened.page, "zh", "右侧腰痛和血尿大概从什么时候开始？", { includeReplyText: true });
    const enSwitch = await switchReadyLanguage(opened.page, "en");
    const enAnswer = await askLiveQuestion(opened.page, "en", "When did the right-sided pain and blood in the urine start?", { includeReplyText: true });
    const zhSwitch = await switchReadyLanguage(opened.page, "zh");
    const zhSecond = await askLiveQuestion(opened.page, "zh", "再确认一下，右腰腹痛和血尿是多久以前出现的？", { includeReplyText: true });

    const zhDurationPattern = /(?:6|六)\s*个?小时|半天/;
    const enDurationPattern = /(?:six|6)\s+hours?|half\s+a\s+day/i;
    const durationMatches = [
      zhDurationPattern.test(zhFirst.replyText),
      enDurationPattern.test(enAnswer.replyText),
      zhDurationPattern.test(zhSecond.replyText)
    ];
    const answers = [zhFirst, enAnswer, zhSecond];
    const liveAiCount = answers.filter((answer) => answer.generationSource === "live_ai").length;
    const safetyBoundaryCount = answers.filter((answer) => answer.generationSource === "safety_boundary").length;
    const sourceContractPass = liveAiCount >= 1 && answers.every((answer) => {
      if (answer.generationSource === "live_ai") {
        return String(answer.provider || "").toLowerCase() === "deepseek" && answer.isFallback === false;
      }
      return answer.generationSource === "safety_boundary" && answer.isFallback === true;
    });
    const httpContractPass = answers.every((answer) => answer.patientStatus === 200 && answer.historyStatus === 200)
      && [enSwitch, zhSwitch].every((item) => item.attemptStatus === 200 && item.sessionStatus === 200);
    const chineseLeakInEnglishDetected = /[\u3400-\u9fff]/u.test(enAnswer.replyText);
    const teacherMetaLeakageDetected = /评分|得分点|教师|标准答案|scor(?:e|ing)|rubric|teacher|standard answer|JSON|system\s*prompt/i.test(answers.map((answer) => answer.replyText).join("\n"));
    const structuredPayloadLeakageDetected = /matchedSlotIds?|matchedFacts?|generationSource|isFallback|caseId|slotId/i.test(answers.map((answer) => answer.replyText).join("\n"));
    const summary = {
      scenario: "preview-cross-language-fact-p023-zh-en-zh",
      caseId: "P023",
      answerCount: answers.length,
      answerSources: answers.map((answer) => answer.generationSource),
      answerFallbackFlags: answers.map((answer) => answer.isFallback === true),
      liveAiProviderContractPasses: answers.map((answer) => answer.generationSource !== "live_ai"
        || (String(answer.provider || "").toLowerCase() === "deepseek" && answer.isFallback === false)),
      liveAiCount,
      safetyBoundaryCount,
      sourceContractPass,
      httpContractPass,
      durationMatchCount: durationMatches.filter(Boolean).length,
      switchAttemptStatuses: [enSwitch.attemptStatus, zhSwitch.attemptStatus],
      switchSessionStatuses: [enSwitch.sessionStatus, zhSwitch.sessionStatus],
      agentRequestCount,
      historyLogCount,
      apiUnauthorizedCount,
      chineseLeakInEnglishDetected,
      teacherMetaLeakageDetected,
      structuredPayloadLeakageDetected,
      crossOriginProtectionRequests: opened.protection.crossOriginProtectionRequests,
      responseTextRetained: false
    };
    await testInfo.attach("preview-cross-language-fact-p023-zh-en-zh", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    console.log(`PREVIEW_STABILITY_EVIDENCE ${JSON.stringify(summary)}`);
    expect(sourceContractPass).toBe(true);
    expect(httpContractPass).toBe(true);
    expect(summary.durationMatchCount).toBe(3);
    expect(agentRequestCount).toBe(3);
    expect(historyLogCount).toBe(3);
    expect(apiUnauthorizedCount).toBe(0);
    expect(chineseLeakInEnglishDetected).toBe(false);
    expect(teacherMetaLeakageDetected).toBe(false);
    expect(structuredPayloadLeakageDetected).toBe(false);
    expect(opened.protection.crossOriginProtectionRequests).toBe(0);
  } finally {
    await opened?.page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});
