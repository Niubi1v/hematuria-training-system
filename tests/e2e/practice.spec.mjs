import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "playwright-training-state-secret-with-adequate-length";
const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");

async function trainingApi(body, token = "") {
  let statusCode = 200;
  let payload;
  const headers = {};
  const requestBody = { ...body, requestId: body.requestId || `pw-${body.action}-${Date.now()}-${Math.random()}` };
  const req = { method: "POST", body: requestBody, headers: token ? { "x-training-state": token } : {}, socket: { remoteAddress: `pw-${Math.random()}` } };
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; }, status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }, end() { return this; }
  };
  await trainingHandler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token, headers };
}

async function routeTrainingApiThroughHandler(page, observations = [], options = {}) {
  resetMemoryAttemptStore();
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok", patientServiceConfigured: true, trainingStateConfigured: true,
      durableAttemptStoreConfigured: true, cloudTtsConfigured: false,
      allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha",
      deploymentSha: "e2e-sha", apiVersion: "2.6.0"
    })
  }));
  await page.route("**/api/session/init/**", async (route) => {
    const startedAt = Date.now();
    const request = route.request();
    const body = request.postDataJSON();
    if (options.sessionInitDelayMs) await new Promise((resolve) => setTimeout(resolve, options.sessionInitDelayMs));
    const sessionStatus = options.sessionInitFailureCode ? 503 : 200;
    observations.push({
      action: "session-init", caseId: body.caseId, language: body.language,
      attemptId: body.attemptId, status: sessionStatus,
      error: options.sessionInitFailureCode || "",
      url: request.url(),
      startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      tokenPresent: Boolean(request.headers()["x-training-state"])
    });
    if (options.sessionInitFailureCode) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: options.sessionInitFailureCode }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `stage-session-${body.attemptId}`, caseId: body.caseId,
        language: body.language, mode: body.runtimeMode || "free",
        patientOpeningStatement: body.language === "en" ? "Hello doctor. My urine has looked red." : "医生您好，我发现尿液发红。",
        sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(),
        deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available",
        profileSource: "local-simulation", cacheHit: false
      })
    });
  });
  let initAttemptCount = 0;
  await page.route("**/api/training-action/**", async (route) => {
    const startedAt = Date.now();
    const request = route.request();
    const body = request.postDataJSON();
    if (body.action === "init-attempt") {
      initAttemptCount += 1;
      if (options.initAttemptDelayMs) await new Promise((resolve) => setTimeout(resolve, options.initAttemptDelayMs));
      if (initAttemptCount <= (options.initAttemptFailures || 0)) {
        const status = options.initAttemptFailureStatus || 502;
        const error = options.initAttemptFailureCode || "network_error";
        observations.push({
          action: body.action, language: body.language, attemptId: body.attemptId,
          requestId: body.requestId, status, error, tokenPresent: false,
          startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt
        });
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error }) });
        return;
      }
    }
    if (body.action === "stage-feedback" && options.stageFeedbackDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.stageFeedbackDelayMs));
    }
    const result = await trainingApi(body, request.headers()["x-training-state"] || "");
    observations.push({
      action: body.action,
      stageKey: body.stageKey || "",
      language: body.language,
      attemptId: body.attemptId,
      requestId: body.requestId,
      status: result.statusCode,
      error: result.payload?.error || "",
      url: request.url(),
      score: result.payload?.score,
      hits: result.payload?.hits || [],
      startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      tokenPresent: Boolean(request.headers()["x-training-state"])
    });
    const responseHeaders = { "Access-Control-Expose-Headers": "X-Training-State" };
    if (result.headers["x-training-state"] && !(options.omitTrainingStateHeaderForActions || []).includes(body.action)) {
      responseHeaders["X-Training-State"] = result.headers["x-training-state"];
    }
    await route.fulfill({
      status: result.statusCode,
      contentType: "application/json",
      headers: responseHeaders,
      body: JSON.stringify(result.payload)
    });
  });
}

async function submitFirstStage(page, language) {
  const label = language === "en" ? "Submit stage" : "提交本阶段";
  const nextLabel = language === "en" ? "Next Agent" : "进入下一阶段";
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("button", { name: nextLabel, exact: true })).toBeVisible();
}

async function mockTrainingState(page) {
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
}

test("public deployment exposes practice navigation without teacher answers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "血尿临床思维训练系统" })).toBeVisible();
  await expect(page.getByText("不可用于正式 OSCE")).toBeVisible();
  await expect(page.getByRole("link", { name: /教师/ })).toHaveCount(0);
});

test("case route renders seven locked stages and no disease tag", async ({ page }) => {
  await page.goto("/cases/P008/");
  await expect(page.getByText("P008", { exact: true }).first()).toBeVisible();
  await expect(page.locator("aside button")).toHaveCount(7);
  await expect(page.getByText(/Case tags|疾病标签|膀胱结石/)).toHaveCount(0);
  await expect(page.getByText(/漏问项|得分点/)).toHaveCount(0);
});

test("case catalog switches public complaint language", async ({ page }) => {
  await page.goto("/cases/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
  await expect(page.getByText(/Hematuria/i).first()).toBeVisible();
});

test("P001 stage one submission advances across language switches and refresh", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P001/");

  await submitFirstStage(page, "zh");
  expect(observations.filter((item) => item.action === "stage-feedback" && item.language === "zh")).toEqual([
    expect.objectContaining({ stageKey: "history", status: 200, tokenPresent: true })
  ]);
  expect(observations.filter((item) => item.action === "session-init" && item.language === "zh")).toEqual([
    expect.objectContaining({ caseId: "P001", status: 200, tokenPresent: true })
  ]);
  const firstZhStage = observations.find((item) => item.action === "stage-feedback" && item.language === "zh");
  const firstZhSession = observations.find((item) => item.action === "session-init" && item.language === "zh");
  expect(firstZhSession?.attemptId).toBe(firstZhStage?.attemptId);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "English" }).click();
  await submitFirstStage(page, "en");
  expect(observations.filter((item) => item.action === "stage-feedback" && item.language === "en")).toEqual([
    expect.objectContaining({ stageKey: "history", status: 200, tokenPresent: true })
  ]);
  expect(observations.filter((item) => item.action === "session-init" && item.language === "en")).toEqual([
    expect.objectContaining({ caseId: "P001", status: 200, tokenPresent: true })
  ]);
  const englishStage = observations.find((item) => item.action === "stage-feedback" && item.language === "en");
  const englishSession = observations.find((item) => item.action === "session-init" && item.language === "en");
  expect(englishSession?.attemptId).toBe(englishStage?.attemptId);
  expect(englishSession?.attemptId).not.toBe(firstZhSession?.attemptId);

  await page.getByRole("button", { name: "Next Agent", exact: true }).click();
  await expect(page.getByText("Investigation Agent", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Investigation Agent", { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "中文" }).click();
  await submitFirstStage(page, "zh");
  expect(observations.filter((item) => item.action === "stage-feedback" && item.language === "zh")).toHaveLength(2);
});

test("rapid stage submission is accepted only once", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { stageFeedbackDelayMs: 150 });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "提交本阶段", exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect.poll(() => observations.filter((item) => item.action === "stage-feedback").length).toBe(1);
  const feedback = observations.filter((item) => item.action === "stage-feedback");
  expect(new Set(feedback.map((item) => item.requestId)).size).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
    const saved = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return saved?.timeline?.filter((item) => item.type === "submit").length ?? 0;
  })).toBe(1);
});

test("stage submission waits for the training attempt while the AI patient is preparing", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { initAttemptDelayMs: 800, sessionInitDelayMs: 1800 });
  await page.goto("/cases/P001/");

  const initializing = page.getByRole("button", { name: "正在初始化训练会话……", exact: true });
  await expect(initializing).toBeDisabled();
  await expect(page.getByText("正在初始化训练会话", { exact: false })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  await expect(page.getByText("人工智能患者正在准备中……", { exact: false })).toBeVisible();
  await submit.click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  expect(observations.filter((item) => item.action === "stage-feedback")).toEqual([
    expect.objectContaining({ status: 200, tokenPresent: true })
  ]);
});

test("P003 replaces a legacy cross-deployment token before zero-round stage submission", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { sessionInitDelayMs: 1200 });
  const attemptId = "p003-legacy-preview-attempt";
  await page.addInitScript(({ seededAttemptId }) => {
    const attempt = {
      attemptId: seededAttemptId,
      caseId: "P003",
      mode: "free",
      language: "zh",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-07-15T00:00:00.000Z"
    };
    localStorage.setItem("hematuria-attempt-pointer-v3:P003:free:zh", JSON.stringify(attempt));
    sessionStorage.setItem(`hematuria-training-state-v3:${seededAttemptId}`, "legacy-token-from-another-api-deployment");
  }, { seededAttemptId: attemptId });

  await page.goto("/cases/P003/");
  await expect.poll(() => observations.filter((item) => item.action === "init-attempt").length).toBe(1);
  await expect(page.getByText("人工智能患者正在准备中……", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toEqual([
    expect.objectContaining({ status: 200, stageKey: "history", tokenPresent: true })
  ]);
  const pageOrigin = new URL(page.url()).origin;
  expect(observations.every((item) => new URL(item.url).origin === pageOrigin)).toBe(true);
  expect(await page.evaluate(({ seededAttemptId }) => ({
    legacyPresent: sessionStorage.hasOwnProperty(`hematuria-training-state-v3:${seededAttemptId}`),
    scopedKeys: Object.keys(sessionStorage).filter((key) => key.startsWith("hematuria-training-state-v4:"))
  }), { seededAttemptId: attemptId })).toEqual({
    legacyPresent: false,
    scopedKeys: [expect.stringContaining(attemptId)]
  });
});

test("an init response without a signed training token never enables stage submission", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { omitTrainingStateHeaderForActions: ["init-attempt"] });
  await page.goto("/cases/P003/");

  await expect(page.getByRole("alert").filter({ hasText: "训练会话响应缺少有效凭据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "训练会话尚未就绪", exact: true })).toBeDisabled();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);
});

test("failed training attempt initialization never sends stage feedback and retries explicitly", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { initAttemptDelayMs: 300, initAttemptFailures: 1, initAttemptFailureStatus: 502, initAttemptFailureCode: "network_error" });
  await page.goto("/cases/P001/");

  const retry = page.getByRole("button", { name: "重新初始化训练会话", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "网络连接失败" })).toBeVisible();
  expect(observations.filter((item) => item.action === "init-attempt")).toEqual([
    expect.objectContaining({ status: 502, error: "network_error", tokenPresent: false })
  ]);
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

  await retry.evaluate((button) => { button.click(); button.click(); });
  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(2);
  await submit.click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(1);
});

test("AI session failure does not invalidate a ready training attempt", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { sessionInitFailureCode: "provider_unavailable" });
  await page.goto("/cases/P001/");

  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  await expect.poll(() => observations.filter((item) => item.action === "session-init").length).toBeGreaterThan(0);
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  await submit.click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toEqual([
    expect.objectContaining({ status: 200, tokenPresent: true })
  ]);
  await expect(page.getByRole("alert").filter({ hasText: "阶段提交失败" })).toHaveCount(0);
});

test("one fallback patient round submits through the same ready training attempt", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "医生，您能问得再具体一点吗？我不太明白您的意思。",
      matchedSlotIds: [], matchedFacts: [], provider: "rules",
      generationSource: "fallback", isFallback: true, fallbackReason: "provider_unavailable"
    })
  }));
  await page.goto("/cases/P001/");
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();

  await page.getByRole("textbox", { name: "输入问诊问题" }).fill("我想问一个不明确的问题");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("医生，您能问得再具体一点吗？我不太明白您的意思。")).toBeVisible();
  await expect.poll(() => observations.filter((item) => item.action === "history-log" && item.status === 200).length).toBe(1);

  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(1);
});

test("restart removes the prior browser token and initializes exactly one new attempt", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P001/");
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();
  const firstInit = observations.find((item) => item.action === "init-attempt");
  expect(firstInit?.attemptId).toBeTruthy();
  const firstTokenKeys = await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("hematuria-training-state-v4:")));
  expect(firstTokenKeys).toHaveLength(1);
  expect(firstTokenKeys[0]).toContain(firstInit.attemptId);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重新开始训练", exact: true }).click();
  await expect.poll(() => observations.filter((item) => item.action === "init-attempt").length).toBe(2);
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();
  const initAttempts = observations.filter((item) => item.action === "init-attempt");
  expect(initAttempts[1].attemptId).not.toBe(firstInit.attemptId);
  const restartedTokenKeys = await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("hematuria-training-state-v4:")));
  expect(restartedTokenKeys).toHaveLength(1);
  expect(restartedTokenKeys[0]).toContain(initAttempts[1].attemptId);
  expect(restartedTokenKeys[0]).not.toContain(firstInit.attemptId);
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);
});

test("stage one safely recovers when the signed browser token outlives the server attempt", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ replyText: "我吸烟，大约每天一包。", matchedSlotIds: ["smoking"], matchedFacts: ["smoking=current"], provider: "deepseek", generationSource: "live_ai", isFallback: false })
  }));
  await page.goto("/cases/P001/");
  await expect.poll(() => observations.filter((item) => item.action === "init-attempt").length).toBe(1);

  await page.getByRole("textbox", { name: "输入问诊问题" }).fill("您吸烟吗？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("我吸烟，大约每天一包。")).toBeVisible();
  await expect.poll(() => observations.filter((item) => item.action === "history-log" && item.status === 200).length).toBe(1);

  // Model a Preview store reset/expiry while the browser still has its valid signed token.
  resetMemoryAttemptStore();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();

  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  const feedback = observations.filter((item) => item.action === "stage-feedback");
  expect(feedback).toEqual([
    expect.objectContaining({ status: 401, error: "attempt_not_found", tokenPresent: true }),
    expect.objectContaining({ status: 200, stageKey: "history", tokenPresent: true, score: expect.any(Number) })
  ]);
  expect(feedback[1].score).toBeGreaterThan(0);
  expect(feedback[1].hits.join(" ")).toContain("吸烟");
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(2);
  await expect(page.getByRole("alert").filter({ hasText: "阶段提交失败" })).toHaveCount(0);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await expect(page.getByText("检查决策智能体", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("检查决策智能体", { exact: true }).first()).toBeVisible();
});

test("missing Preview attempt store reports a configuration blocker", async ({ page }) => {
  const actions = [];
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok", patientServiceConfigured: true, trainingStateConfigured: false,
      durableAttemptStoreConfigured: false, cloudTtsConfigured: false,
      allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha",
      deploymentSha: "e2e-sha", apiVersion: "2.6.0"
    })
  }));
  await page.route("**/api/training-action/**", (route) => {
    actions.push(route.request().postDataJSON().action);
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "training_attempt_store_unavailable" })
    });
  });
  await page.goto("/cases/P001/");
  await expect(page.getByRole("alert").filter({ hasText: "训练记录服务" })).toContainText("训练记录服务未配置，当前无法提交阶段");
  await expect(page.getByRole("button", { name: "重新初始化训练会话", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "训练会话尚未就绪", exact: true })).toBeDisabled();
  expect(actions).toEqual(["init-attempt"]);
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toHaveCount(0);
});

test("catalog case links use portable directory routes for all display IDs", async ({ page }) => {
  const routeBasePath = (process.env.PLAYWRIGHT_ROUTE_BASE_PATH || "").replace(/\/$/, "");
  await page.goto(`${routeBasePath}/cases/`);
  const displayIds = Array.from({ length: 42 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`);
  const expected = displayIds.map((caseId) => `${routeBasePath}/cases/${caseId}/`);
  const chineseHrefs = await page.locator('a[href*="/cases/P"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(chineseHrefs).toEqual(expected);
  for (const href of expected) {
    const direct = await page.request.get(href);
    expect(direct.status(), `direct ${href}`).toBe(200);
    const refresh = await page.request.get(href);
    expect(refresh.status(), `refresh ${href}`).toBe(200);
  }
  await page.getByRole("button", { name: "English" }).click();
  const englishHrefs = await page.locator('a[href*="/cases/P"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(englishHrefs).toEqual(expected);
  const invalid = await page.request.get(`${routeBasePath}/cases/P999/`);
  expect(invalid.status()).toBe(404);

  await page.addInitScript(() => { Math.random = () => 12.1 / 42; });
  await page.goto(`${routeBasePath}/random/`);
  await expect.poll(() => {
    const current = new URL(page.url());
    return `${current.pathname}${current.search}`;
  }).toBe(`${routeBasePath}/cases/P013/?mode=random`);
});

test("case catalog search has a recoverable empty state", async ({ page }) => {
  await page.goto("/cases/");
  await page.getByRole("textbox", { name: "搜索病例" }).fill("NO-SUCH-CASE");
  await expect(page.getByRole("heading", { name: "没有匹配的病例" })).toBeVisible();
  await expect(page.getByText("当前 0 / 42")).toBeVisible();
  await page.getByRole("button", { name: "清除搜索与筛选" }).click();
  await expect(page.getByRole("heading", { name: "训练病例 P001" })).toBeVisible();
});

test("mobile interview keeps multiline input visible without horizontal overflow", async ({ page }) => {
  await routeTrainingApiThroughHandler(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cases/P001/");
  const input = page.getByRole("textbox", { name: "输入问诊问题" });
  await input.fill("第一行");
  await input.press("Shift+Enter");
  await input.type("第二行");
  await expect(input).toHaveValue("第一行\n第二行");
  await expect.poll(async () => {
    const box = await input.boundingBox();
    return box ? Math.ceil(box.y + box.height) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(844);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("interview composer reserves its measured space across viewports and languages", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const chineseOpening = "医生您好，我是因为小便颜色变红3月余来看病的。";
  const englishOpening = "Hello doctor. I came in because my urine has looked red for more than three months.";
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    const body = route.request().postDataJSON();
    const opening = body.language === "en" ? englishOpening : chineseOpening;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: `layout-${body.language}`, caseId: "P001", language: body.language, mode: "free", patientOpeningStatement: opening, sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await mockTrainingState(page);

  const viewports = testInfo.project.name === "mobile-chromium"
    ? [{ width: 360, height: 800 }, { width: 390, height: 844 }]
    : [{ width: 1280, height: 720 }, { width: 1440, height: 900 }];
  for (const viewport of viewports) {
    for (const language of ["zh", "en"]) {
      await page.setViewportSize(viewport);
      await page.goto("/cases/P001/");
      await page.getByRole("button", { name: language === "en" ? "English" : "中文" }).click();
      const conversation = page.getByRole("log", { name: language === "en" ? "Simulated patient conversation" : "模拟问诊对话" });
      const opening = conversation.getByText(language === "en" ? englishOpening : chineseOpening, { exact: true });
      const input = page.getByRole("textbox", { name: language === "en" ? "Enter an interview question" : "输入问诊问题" });
      const composer = page.getByTestId("chat-composer");
      const spacer = page.getByTestId("chat-composer-spacer");
      await expect(opening).toBeVisible();
      await expect(input).toBeVisible();
      if (viewport.width < 640) await input.focus();
      await expect.poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.ceil(box.y + box.height) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(viewport.height);
      const [openingBox, composerBox, layout] = await Promise.all([
        opening.boundingBox(),
        composer.boundingBox(),
        page.evaluate(() => {
          const composerElement = document.querySelector('[data-testid="chat-composer"]');
          return {
            spacerHeight: Number.parseFloat(getComputedStyle(document.querySelector('[data-testid="chat-composer-spacer"]')).height),
            spacerDisplay: getComputedStyle(document.querySelector('[data-testid="chat-composer-spacer"]')).display,
            composerHeight: composerElement?.getBoundingClientRect().height ?? 0,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            className: composerElement?.className ?? ""
          };
        })
      ]);
      expect(openingBox).toBeTruthy();
      expect(composerBox).toBeTruthy();
      expect(composerBox.y, `${viewport.width}x${viewport.height}/${language}`).toBeGreaterThanOrEqual(openingBox.y + openingBox.height);
      expect(Math.ceil(composerBox.y + composerBox.height)).toBeLessThanOrEqual(viewport.height);
      await expect(spacer).toHaveAttribute("style", /safe-area-inset-bottom/);
      if (viewport.width < 640) {
        expect(layout.spacerDisplay).toBe("none");
      } else {
        expect(layout.spacerHeight).toBeGreaterThanOrEqual(layout.composerHeight);
      }
      expect(layout.className).toContain("safe-area-inset-bottom");
      expect(layout.overflow).toBe(false);
    }
  }

  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "中文" }).click();
    const input = page.getByRole("textbox", { name: "输入问诊问题" });
    await input.focus();
    await page.setViewportSize({ width: 390, height: 640 });
    await expect.poll(async () => {
      const box = await input.boundingBox();
      return box ? Math.ceil(box.y + box.height) : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(640);
  }
});

test("primary practice pages have no serious accessibility violations", async ({ page }) => {
  for (const route of ["/", "/cases/", "/cases/P008/"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("automatic voice profile follows patient sex, language, and age", async ({ page }) => {
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-gender", "male");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "zh-CN-YunxiNeural");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-age-group", "older");

  await page.goto("/cases/P002/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-gender", "female");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "zh-CN-XiaoxiaoNeural");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: /Voice settings/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "en-US-JennyNeural");

  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /Voice settings/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "en-US-GuyNeural");
});

test("cloud TTS failure visibly falls back to the matched browser voice", async ({ page }) => {
  await page.addInitScript(() => {
    class MockUtterance {
      constructor(text) { this.text = text; this.onstart = null; this.onend = null; this.onerror = null; }
    }
    const voices = [{ name: "Microsoft Yunxi Online Natural", voiceURI: "yunxi", lang: "zh-CN", localService: false, default: true }];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: MockUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => voices, addEventListener: () => {}, removeEventListener: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
      speak: (utterance) => { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 800); }
    } });
  });
  await page.route("**/api/tts/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "cloud_tts_unavailable" }) }));
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await page.getByRole("button", { name: "试听" }).click();
  await expect(page.getByText("云语音暂时不可用，已切换为浏览器语音。")).toBeVisible();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "fallback-browser");
});

test("HEM-P1-034 language switches bind each session to its own attempt token", async ({ page }) => {
  const trainingStates = new Map();
  const attemptInitCalls = [];
  const sessionObservations = [];
  let delayEnglishSession = false;
  await page.route("**/api/session/init/**", async (route) => {
    const body = route.request().postDataJSON();
    const trainingState = route.request().headers()["x-training-state"];
    const issued = trainingStates.get(trainingState);
    sessionObservations.push({
      language: body.language,
      headerPresent: Boolean(trainingState),
      attemptMatches: issued?.attemptId === body.attemptId,
      languageMatches: issued?.language === body.language
    });
    if (trainingState !== `e2e-${body.attemptId}`) {
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "invalid_attempt_token" }) });
    }
    if (delayEnglishSession && body.language === "en") await new Promise((resolve) => setTimeout(resolve, 200));
    const english = body.language === "en";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: `e2e-session-${body.attemptId}`, caseId: "P001", language: body.language, mode: "free", patientOpeningStatement: english ? "Hello doctor. My urine has been red." : "医生您好，我发现尿液发红。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "- I do not have pain or fever.", matchedSlotIds: ["pain", "fever_chills"], isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true };
    if (body.action === "init-attempt") {
      attemptInitCalls.push(body.attemptId);
      trainingStates.set(`e2e-${body.attemptId}`, { attemptId: body.attemptId, language: body.language });
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  const chineseSessionReady = page.waitForResponse((response) => {
    if (!response.url().includes("/api/session/init/")) return false;
    return response.request().postDataJSON()?.language === "zh";
  });
  await page.goto("/cases/P001/");
  expect((await chineseSessionReady).status()).toBe(200);
  const englishSessionReady = page.waitForResponse((response) => {
    if (!response.url().includes("/api/session/init/")) return false;
    return response.request().postDataJSON()?.language === "en";
  });
  await page.getByRole("button", { name: "English" }).click();
  const englishSession = await englishSessionReady;
  expect(englishSession.status(), JSON.stringify(sessionObservations)).toBe(200);
  await page.getByPlaceholder("Enter an interview question").fill("Do you have pain or fever?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I do not have pain or fever.").first()).toBeVisible();
  await expect(page.getByText("这个我不太清楚")).toHaveCount(0);
  const englishPointer = await page.evaluate(() => Object.keys(localStorage).find((key) => key.includes("attempt-pointer-v3:P001:free:en")));
  expect(englishPointer).toBeTruthy();

  await page.reload();
  await expect(page.getByPlaceholder("Enter an interview question")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  const chineseSessionAfterRefresh = page.waitForResponse((response) => {
    if (!response.url().includes("/api/session/init/")) return false;
    return response.request().postDataJSON()?.language === "zh";
  });
  await page.getByRole("button", { name: "中文" }).click();
  expect((await chineseSessionAfterRefresh).status(), JSON.stringify(sessionObservations)).toBe(200);
  expect(sessionObservations.at(-1)).toMatchObject({ language: "zh", headerPresent: true, attemptMatches: true, languageMatches: true });
  await expect(page.getByPlaceholder("输入问诊问题")).toBeVisible();

  delayEnglishSession = true;
  const delayedEnglishRequest = page.waitForRequest((request) => request.url().includes("/api/session/init/")
    && request.postDataJSON()?.language === "en");
  await page.getByRole("button", { name: "English" }).click();
  await delayedEnglishRequest;
  const finalChineseSession = page.waitForResponse((response) => response.url().includes("/api/session/init/")
    && response.request().postDataJSON()?.language === "zh");
  await page.getByRole("button", { name: "中文" }).click();
  expect((await finalChineseSession).status(), JSON.stringify(sessionObservations)).toBe(200);
  await page.waitForTimeout(250);
  await expect(page.getByPlaceholder("输入问诊问题")).toBeVisible();
  expect(sessionObservations.at(-1)).toMatchObject({ language: "zh", headerPresent: true, attemptMatches: true, languageMatches: true });
  expect(sessionObservations.every((item) => item.headerPresent && item.attemptMatches && item.languageMatches)).toBe(true);
  expect(Math.max(...Array.from(new Set(attemptInitCalls)).map((attemptId) => attemptInitCalls.filter((item) => item === attemptId).length))).toBe(1);
});

test("HEM-P1-033 unsafe patient metadata cannot collect a hidden fact", async ({ page }) => {
  await mockTrainingState(page);
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "session-p004", caseId: "P004", language: "zh", mode: "free", patientOpeningStatement: "医生您好，我发现尿液发红。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    const payload = request.probe
      ? { replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }
      : { replyText: "未主动诉血块，需追问；以无痛全程血尿为主", matchedSlotIds: ["clots"], matchedFacts: ["clots=teacher-only"], provider: "rule", isFallback: true, fallbackReason: "unsafe_deterministic_answer" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/cases/P004/");
  await page.getByPlaceholder("输入问诊问题").fill("有血块吗？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("医生，您能问得再具体一点吗？我不太明白您的意思。")).toBeVisible();
  await expect(page.getByText(/未主动诉|需追问/)).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P004:free:zh:"));
    const saved = key ? JSON.parse(localStorage.getItem(key)) : null;
    return saved ? { askedSlots: saved.askedSlots, colorClots: saved.collected?.colorClots } : null;
  })).toEqual({ askedSlots: [], colorClots: false });
});

test("rule fallback keeps reconnection available and recovery replaces the reply without duplicate evidence", async ({ page }) => {
  let sessionCalls = 0;
  let historyLogCalls = 0;
  const sessionBodies = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    sessionCalls += 1;
    const request = route.request().postDataJSON();
    sessionBodies.push(request);
    const sessionId = request.forceRefresh ? "session-new" : "session-old";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId, caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    if (request.probe) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }) });
    const recovered = request.sessionId === "session-new";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recovered
      ? { replyText: "我吸烟，大约每天一包。", matchedSlotIds: ["smoking"], matchedFacts: ["smoking=current"], provider: "deepseek", isFallback: false, fallbackReason: "" }
      : { replyText: "我吸烟，大约每天一包。", matchedSlotIds: ["smoking"], matchedFacts: ["smoking=current"], provider: "rule", isFallback: true, fallbackReason: "provider_timeout" }) });
  });
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") historyLogCalls += 1;
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("您吸烟吗？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("当前由规则库回答，可随时重新连接AI。")).toBeVisible();
  const reconnect = page.getByRole("button", { name: "重新连接AI", exact: true });
  expect(await reconnect.count()).toBe(1);
  await reconnect.evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByText("已重新连接AI")).toBeVisible();
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("您吸烟吗？", { exact: true })).toHaveCount(1);
  await expect(conversation.getByText("我吸烟，大约每天一包。", { exact: true })).toHaveCount(1);
  expect(historyLogCalls).toBe(1);
  expect(sessionCalls).toBeGreaterThanOrEqual(2);
  expect(sessionBodies.filter((body) => body.forceRefresh === true)).toHaveLength(1);
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  expect(saved.messages.filter((item) => item.role === "student")).toHaveLength(1);
  expect(saved.askedSlots).toContain("smoking");
  expect(saved.collected.smoking).toBe(true);
  expect(saved.timeline.filter((item) => item.type === "ask")).toHaveLength(1);
  expect(saved.timeline.filter((item) => item.type === "technical")).toHaveLength(1);
});

test("session initialization failure shows one specific connection notice", async ({ page }) => {
  await mockTrainingState(page);
  await page.route("**/api/health/**", (route) => route.abort("failed"));
  await page.route("**/api/session/init/**", (route) => route.abort("failed"));

  await page.goto("/cases/P001/");

  await expect(page.getByText("网络连接失败，请检查网络后重试。")).toBeVisible();
  await expect(page.getByText("暂时无法确认后端健康状态，仍可继续文字练习。")).toHaveCount(0);
});

test("offline reconnect sends no request and can recover after the online event", async ({ page, context }) => {
  let healthCalls = 0;
  let sessionCalls = 0;
  await mockTrainingState(page);
  await page.route("**/api/health/**", (route) => { healthCalls += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }); });
  await page.route("**/api/session/init/**", (route) => { sessionCalls += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: `session-${Date.now()}`, caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }); });
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }) }));
  await page.goto("/cases/P001/");
  await expect.poll(() => sessionCalls).toBe(1);
  await page.waitForTimeout(500);
  expect(sessionCalls).toBe(1);
  // The network-listener effect is registered before the session-init effect.
  // Observing the first session request therefore gives a deterministic
  // hydration/listener-ready boundary before emulating an offline transition.
  await expect.poll(() => sessionCalls).toBeGreaterThan(0);
  await context.setOffline(true);
  await expect(page.getByText("当前处于离线状态，既有训练记录已保留。")).toBeVisible();
  const before = healthCalls;
  await page.getByRole("button", { name: "重新连接AI", exact: true }).click();
  expect(healthCalls).toBe(before);
  await context.setOffline(false);
  await expect(page.getByText("网络已恢复，可以重新连接AI。")).toBeVisible();
  await page.getByRole("button", { name: "重新连接AI", exact: true }).click();
  await expect(page.getByText("已重新连接AI")).toBeVisible();
  expect(healthCalls).toBeGreaterThan(before);
});

test("AI reply renders before history log synchronization and uses one sync notice", async ({ page }) => {
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "I first noticed the red urine this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") await new Promise((resolve) => setTimeout(resolve, 1500));
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did you first notice it?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Simulated patient conversation").getByText("I first noticed the red urine this morning.")).toBeVisible({ timeout: 700 });
  await expect(page.getByText("Scoring sync pending")).toBeVisible();
  await expect(page.getByText("The question log could not be verified; it will not count toward scoring.")).toHaveCount(0);
  await expect(page.getByText("Scoring synced")).toBeVisible();
});

test("history log transient failure retries one idempotent request without replacing the AI reply", async ({ page }) => {
  let historyCalls = 0;
  const historyRequestIds = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "retry-sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "It started this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") {
      historyCalls += 1;
      historyRequestIds.push(body.requestId);
      if (historyCalls === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_log_unavailable" }) });
    }
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did it start?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Simulated patient conversation").getByText("It started this morning.")).toBeVisible({ timeout: 700 });
  await expect(page.getByText("Scoring sync pending")).toBeVisible();
  await expect(page.getByText("Scoring synced")).toBeVisible();
  expect(historyCalls).toBe(2);
  expect(new Set(historyRequestIds).size).toBe(1);
  await expect(page.getByLabel("Simulated patient conversation").getByText("It started this morning.")).toHaveCount(1);
  await expect(page.getByText("The question log could not be verified; it will not count toward scoring.")).toHaveCount(0);
});

test("history log exhausted retries exposes one manual idempotent retry", async ({ page }) => {
  let historyCalls = 0;
  const historyRequestIds = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "manual-retry-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "It started this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") {
      historyCalls += 1;
      historyRequestIds.push(body.requestId);
      if (historyCalls <= 3) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_log_unavailable" }) });
    }
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });

  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did it start?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Retry sync" })).toBeVisible();
  expect(historyCalls).toBe(3);
  await page.getByRole("button", { name: "Retry sync" }).click();
  await expect(page.getByText("Scoring synced")).toBeVisible();
  expect(historyCalls).toBe(4);
  expect(new Set(historyRequestIds).size).toBe(1);
  await expect(page.getByLabel("Simulated patient conversation").getByText("It started this morning.", { exact: true })).toHaveCount(1);
});

test("rapid double send creates one patient request and one conversation turn", async ({ page }) => {
  let patientCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "double-send-session", caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", async (route) => {
    patientCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "今天早上开始的。", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) });
  });
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("什么时候开始的？");
  const send = page.getByRole("button", { name: "发送" });
  await send.evaluate((button) => { button.click(); button.click(); });
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("今天早上开始的。", { exact: true })).toBeVisible();
  expect(patientCalls).toBe(1);
  await expect(conversation.getByText("什么时候开始的？", { exact: true })).toHaveCount(1);
  await expect(conversation.getByText("今天早上开始的。", { exact: true })).toHaveCount(1);
});

test("twenty interview turns do not reinitialize the active language session", async ({ page }) => {
  let sessionCalls = 0;
  let patientCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    sessionCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "twenty-turn-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    patientCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: `Patient answer ${patientCalls}.`, matchedSlotIds: [], matchedFacts: [], provider: "deepseek", generationSource: "live_ai", isFallback: false }) });
  });
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await expect.poll(() => sessionCalls).toBe(2);
  const initializedLanguageSessions = sessionCalls;
  const input = page.getByPlaceholder("Enter an interview question");
  for (let turn = 1; turn <= 19; turn += 1) {
    await input.fill(`Question ${turn}?`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Simulated patient conversation").getByText(`Patient answer ${turn}.`, { exact: true })).toBeVisible();
  }
  const conversation = page.getByLabel("Simulated patient conversation");
  await conversation.evaluate((element) => element.scrollTo({ top: 0, behavior: "auto" }));
  await expect.poll(() => conversation.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeGreaterThan(72);
  await input.fill("Question 20?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(conversation.getByText("Patient answer 20.", { exact: true })).toHaveCount(1);
  const latestButton = page.getByRole("button", { name: "New message · go to latest" });
  await expect(latestButton).toBeVisible();
  expect(await conversation.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeGreaterThan(72);
  await latestButton.click();
  await expect(conversation.getByText("Patient answer 20.", { exact: true })).toBeVisible();
  await expect.poll(() => conversation.evaluate((element) => Math.ceil(element.scrollHeight - element.scrollTop - element.clientHeight))).toBeLessThanOrEqual(1);
  const [answerBox, composerBox] = await Promise.all([
    conversation.getByText("Patient answer 20.", { exact: true }).boundingBox(),
    page.getByTestId("chat-composer").boundingBox()
  ]);
  expect(answerBox).toBeTruthy();
  expect(composerBox).toBeTruthy();
  expect(answerBox.y + answerBox.height).toBeLessThanOrEqual(composerBox.y);
  expect(sessionCalls).toBe(initializedLanguageSessions);
  expect(patientCalls).toBe(20);
  await expect(page.getByLabel("Simulated patient conversation").getByText("Patient answer 20.", { exact: true })).toHaveCount(1);
});

test("page refresh resumes the same pending history log request", async ({ page }) => {
  let historyCalls = 0;
  const historyRequestIds = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "refresh-sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "It began this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") {
      historyCalls += 1;
      historyRequestIds.push(body.requestId);
      if (historyCalls === 1) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did it begin?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Scoring sync pending")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:en:"));
    const saved = key ? JSON.parse(localStorage.getItem(key)) : null;
    return saved?.pendingHistoryLogs?.length || 0;
  })).toBe(1);
  await page.reload();
  await expect(page.getByLabel("Simulated patient conversation").getByText("It began this morning.", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Scoring synced")).toBeVisible();
  expect(historyCalls).toBeGreaterThanOrEqual(2);
  expect(new Set(historyRequestIds).size).toBe(1);
});

test("public teacher and RCT routes do not expose formal functions", async ({ page }) => {
  await page.goto("/teacher/");
  await expect(page.getByText(/演示|practice|正式考核/i).first()).toBeVisible();
  await expect(page.getByText(/标准诊断|standard diagnosis|评分关键词/i)).toHaveCount(0);
  await page.goto("/rct/");
  await expect(page.getByText(/正式研究采集未在公开站启用|不采集研究数据|authenticated backend/i).first()).toBeVisible();
});

test("P008 exact orders and server-validated scoring resist forged answers", async () => {
  const attemptId = `pw-p008-${Date.now()}-${Math.random()}`;
  let response = await trainingApi({ action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "zh" });
  response = await trainingApi({ action: "stage-feedback", caseId: "P008", attemptId, stageKey: "history", submission: {} }, response.token);
  response = await trainingApi({ action: "order", caseId: "P008", attemptId, input: "血常规" }, response.token);
  expect(response.payload.results.every((item) => item.orderId === "LAB-BL-001")).toBe(true);
  expect(JSON.stringify(response.payload)).not.toMatch(/CTU|乳果糖|肠道准备/);

  response = await trainingApi({ action: "stage-feedback", caseId: "P008", attemptId, stageKey: "orders", submission: {} }, response.token);
  response = await trainingApi({ action: "stage-feedback", caseId: "P008", attemptId, stageKey: "diagnosis", submission: {
    diagnosis: "急性阑尾炎", diagnosticEvidence: "右下腹压痛", differentials: "胃炎；胆囊炎；胰腺炎", confirmatoryTests: "腹部平片"
  } }, response.token);
  expect(response.payload.score).toBe(0);
  expect(response.payload.warnings.join(" ")).toMatch(/不符/);

  for (const stageKey of ["consult", "treatment", "perioperative", "debrief"]) {
    response = await trainingApi({ action: "stage-feedback", caseId: "P008", attemptId, stageKey, submission: {} }, response.token);
  }
  const scored = await trainingApi({ action: "score", caseId: "P008", attemptId, events: [{ type: "treatment_action", actionId: "definitive", metadata: { validated: true } }] }, response.token);
  expect(scored.payload.total).toBeLessThan(100);
});
