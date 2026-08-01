import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

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
  let sessionInitCount = 0;
  await page.route("**/api/session/init/**", async (route) => {
    const startedAt = Date.now();
    const request = route.request();
    const body = request.postDataJSON();
    sessionInitCount += 1;
    if (options.sessionInitDelayMs) await new Promise((resolve) => setTimeout(resolve, options.sessionInitDelayMs));
    if (options.sessionInitStaleAfterStageOnce && sessionInitCount === 1) {
      for (let index = 0; index < 200 && !observations.some((item) => item.action === "stage-feedback"); index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const staleAfterStage = options.sessionInitStaleAfterStageOnce
      && sessionInitCount === 1
      && observations.some((item) => item.action === "stage-feedback");
    const sessionStatus = staleAfterStage ? 409 : options.sessionInitFailureCode ? 503 : 200;
    const sessionError = staleAfterStage ? "stale_attempt_token" : options.sessionInitFailureCode || "";
    observations.push({
      action: "session-init", caseId: body.caseId, language: body.language,
      attemptId: body.attemptId, status: sessionStatus,
      error: sessionError,
      requestId: request.headers()["x-request-id"] || "",
      url: request.url(),
      startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      tokenPresent: Boolean(request.headers()["x-training-state"])
    });
    if (sessionError) {
      await route.fulfill({ status: sessionStatus, contentType: "application/json", body: JSON.stringify({ error: sessionError }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `stage-session-${body.attemptId}`, caseId: body.caseId,
        language: body.language, mode: body.runtimeMode || "free",
        patientOpeningStatement: body.language === "en" ? "Hello doctor. I came in for a consultation." : "医生您好，我来看一下。",
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
      submittedEvidenceIds: body.submission?.evidenceSelections?.primary?.evidenceIds || [],
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
  const nextLabel = language === "en" ? "Next stage" : "进入下一阶段";
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("button", { name: nextLabel, exact: true })).toBeVisible();
}

async function enterInvestigationStage(page, language) {
  await page.getByRole("textbox", { name: language === "en" ? "History summary" : "病史小结" })
    .fill(language === "en" ? "Focused history completed." : "已完成重点病史采集。");
  await submitFirstStage(page, language);
  await page.getByRole("button", { name: language === "en" ? "Next stage" : "进入下一阶段", exact: true }).click();
  await expect(page.getByRole("heading", { name: language === "en" ? "Investigation and ordering" : "检查与开单", exact: true })).toBeVisible();
}

const studentInternalFieldPattern = /slot_answered|answerSource|factState|requestedSlot|\bintent\b|\bprovider\b|\bprovenance\b|\bEV-[A-Za-z0-9-]+\b|\b(?:LAB|IMG|MED)-[A-Za-z0-9-]+\b|\bPE(?:-[A-Za-z0-9-]+|\d+)\b|\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/i;

async function expectStudentCopyPublic(page) {
  expect(await page.locator("body").innerText()).not.toMatch(studentInternalFieldPattern);
}

async function fillDiagnosisBuilder(page, language) {
  const diagnosisBuilder = page.getByTestId("diagnosis-builder");
  await diagnosisBuilder.getByRole("textbox", { name: language === "en" ? "Most likely diagnosis" : "最可能诊断", exact: true }).fill(language === "en" ? "Working diagnosis" : "待定诊断");
  const primaryEvidence = diagnosisBuilder.locator("fieldset").first().locator('input[type="checkbox"]');
  expect(await primaryEvidence.count()).toBeGreaterThan(1);
  await primaryEvidence.nth(0).check();
  await primaryEvidence.nth(1).check();
  for (let index = 0; index < 3; index += 1) {
    const card = diagnosisBuilder.getByTestId("differential-card").nth(index);
    await card.getByRole("textbox", { name: language === "en" ? `Differential diagnosis ${index + 1}` : `鉴别诊断 ${index + 1}`, exact: true }).fill(language === "en" ? `Differential ${index + 1}` : `鉴别诊断示例 ${index + 1}`);
    await card.locator("fieldset").first().locator('input[type="checkbox"]').first().check();
  }
}

async function captureDefectScreenshot(page, directory, name) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name), fullPage: false });
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
  await expect(page.getByRole("heading", { name: "血尿临床问诊训练系统" })).toBeVisible();
  await expect(page.getByTestId("teaching-disclaimer")).toContainText("仅用于医学教学与模拟训练，不用于真实患者的诊断或治疗决策");
  await expect(page.getByRole("link", { name: /教师/ })).toHaveCount(0);
});

test("case route renders seven locked stages and no disease tag", async ({ page }) => {
  await page.goto("/cases/P008/");
  await expect(page.getByText("病例 08", { exact: true }).first()).toBeVisible();
  await expect(page.locator("aside button")).toHaveCount(7);
  await expect(page.getByText(/Case tags|疾病标签|膀胱结石/)).toHaveCount(0);
  await expect(page.getByText(/漏问项|得分点/)).toHaveCount(0);
});

test("@ui-clinical-stage3 male case hides initial answers and restores released canonical reports", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "我发现小便颜色变红。",
      matchedSlotIds: ["chief_complaint"],
      matchedFacts: ["chief_complaint=小便颜色变红"],
      provider: "deepseek",
      generationSource: "live_ai",
      isFallback: false
    })
  }));
  await page.goto("/cases/P001/");

  const visibleInfo = page.locator("aside section").filter({ hasText: "当前可见资料" });
  await expect(visibleInfo).toContainText("65 / 男");
  await expect(visibleInfo).not.toContainText("主诉");
  await expect(page.getByRole("log", { name: "模拟问诊对话" })).toContainText("医生您好，我来看一下。");
  await expect(page.getByTestId("patient-service-status")).toHaveText("问诊对话可用");
  await expect(page.getByText(/人工智能服务|live_ai|ai_cache|rule_fallback|DeepSeek/)).toHaveCount(0);

  await page.getByRole("textbox", { name: "输入问诊问题" }).fill("哪里不舒服？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByRole("log", { name: "模拟问诊对话" })).toContainText("我发现小便颜色变红。");
  await enterInvestigationStage(page, "zh");

  await expect(page.getByRole("button", { name: "直肠指检/前列腺", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "妇科查体/阴道出血", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "检查", exact: true }).click();
  await expect(page.getByText("彩超男性生殖系统（阴囊、睾丸、输精管）+精索静脉", { exact: true })).toBeVisible();
  await expect(page.getByText("彩超女性生殖系统", { exact: true })).toHaveCount(0);
  await expect(page.getByText("前列腺MR平扫", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "阴囊", exact: true }).click();
  await expect(page.getByText("阴囊、睾丸及附睾未见明显异常。", { exact: true })).toBeVisible();

  const orderInput = page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜");
  await orderInput.fill("尿常规；血常规；彩超泌尿系（双肾、输尿管及膀胱）+残余尿");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(3);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await expect(page.getByText("第2阶段 · 检查与开单", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("第2阶段", { exact: true })).toHaveCount(0);
  await expect(page.getByText("开单服务暂时不可用，未释放报告。")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(3);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  const orderCountBeforeDoubleClick = observations.filter((item) => item.action === "order").length;
  await orderInput.fill("X光膀胱造影");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => observations.filter((item) => item.action === "order").length).toBe(orderCountBeforeDoubleClick + 1);
  await expect(page.getByText(/X光膀胱造影：等待医学审核，当前不进入诊断、治疗或评分证据。/)).toBeVisible();
});

test("@ui-clinical-stage3 female case shows only applicable examination and imaging entries", async ({ page }) => {
  await routeTrainingApiThroughHandler(page, []);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "我发现小便颜色发红。",
      matchedSlotIds: ["chief_complaint"],
      matchedFacts: ["chief_complaint=小便颜色发红"],
      provider: "deepseek",
      generationSource: "live_ai",
      isFallback: false
    })
  }));
  await page.goto("/cases/P002/");

  const visibleInfo = page.locator("aside section").filter({ hasText: "当前可见资料" });
  await expect(visibleInfo).toContainText("67 / 女");
  await expect(visibleInfo).not.toContainText("主诉");
  await expect(page.getByRole("log", { name: "模拟问诊对话" })).toContainText("医生您好，我来看一下。");
  await expect(page.getByTestId("patient-service-status")).toHaveText("问诊对话可用");

  await page.getByRole("textbox", { name: "输入问诊问题" }).fill("为什么来看？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await enterInvestigationStage(page, "zh");

  await expect(page.getByRole("button", { name: "妇科查体/阴道出血", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "直肠指检/前列腺", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "检查", exact: true }).click();
  await expect(page.getByText("彩超女性生殖系统", { exact: true })).toBeVisible();
  await expect(page.getByText("彩超男性生殖系统（阴囊、睾丸、输精管）+精索静脉", { exact: true })).toHaveCount(0);
  await expect(page.getByText("前列腺MR平扫", { exact: true })).toHaveCount(0);

  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("尿常规；血常规；彩超泌尿系（双肾、输尿管及膀胱）+残余尿");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(3);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(3);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await expect(page.getByText(/未返回结果|开单服务暂时不可用/)).toHaveCount(0);
});

test("case catalog switches public complaint language", async ({ page }) => {
  await page.goto("/cases/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
  await expect(page.getByText(/Hematuria/i).first()).toBeVisible();
  await expect(page.locator('a[href="/cases/P013/"]')).toContainText("Intermittent red urine for 2 months");
  await expect(page.locator('a[href="/cases/P019/"]')).toContainText("Fever, left flank pain, urinary frequency, and painful urination for 3 days");
  await expect(page.locator('a[href="/cases/P020/"]')).toContainText("Chief complaint pending medical review");
});

test("case catalog remains usable when localStorage throws across four viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The test explicitly covers all four required viewport sizes.");
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    window.__blockCatalogStorage = true;
    Storage.prototype.getItem = function getItem(key) {
      if (this === localStorage && window.__blockCatalogStorage) throw new DOMException("Synthetic read denial", "SecurityError");
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage && window.__blockCatalogStorage) throw new DOMException("Synthetic write denial", "SecurityError");
      return originalSetItem.call(this, key, value);
    };
  });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/");
    await expect(page.locator("a[data-case-id]")).toHaveCount(42);
    await expect(page.getByRole("status").filter({ hasText: "浏览器存储不可用" })).toBeVisible();
    const search = page.getByRole("textbox", { name: "搜索病例" });
    await search.fill("P001");
    await expect(page.locator("a[data-case-id]")).toHaveCount(1);
    await search.fill("");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
    await expect(page.locator("a[data-case-id]")).toHaveCount(42);
  }

  await page.locator('a[data-case-id="P001"]').click();
  await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
});

test("case catalog rejects malformed pointers and unverified summaries across four viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The test explicitly covers all four required viewport sizes.");
  await page.addInitScript(() => {
    const malformedPointer = {
      caseId: "P001",
      mode: "free",
      language: "en",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-07-25T00:00:00.000Z"
    };
    const orphanAttempt = {
      attemptId: "catalog-orphan-attempt",
      caseId: "P003",
      mode: "free",
      language: "en",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-07-25T00:00:00.000Z"
    };
    localStorage.setItem("hematuria-language", "en");
    localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:en", JSON.stringify(malformedPointer));
    localStorage.setItem("hematuria-practice-attempt-summaries-v2", JSON.stringify([{ caseId: "P002", total: 360 }]));
    localStorage.setItem(`hematuria-attempt-v3:P003:free:en:${orphanAttempt.attemptId}`, JSON.stringify({
      attempt: orphanAttempt,
      activeStageNo: 1,
      submitted: {}
    }));
  });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/");
    await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
    await expect(page.locator('a[data-case-id="P001"]')).toContainText("Not started");
    await expect(page.locator('a[data-case-id="P002"]')).toContainText("Not started");
    await expect(page.locator('a[data-case-id="P003"]')).toContainText("Not started");
  }
});

test("saved English preference initializes one English patient session and opening", async ({ page }) => {
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P034/");

  const conversation = page.getByRole("log", { name: "Simulated patient conversation" });
  await expect(conversation).toContainText("Hello doctor. I came in for a consultation.");
  await expect(conversation).not.toContainText("My urine has looked red.");
  await expect(conversation).not.toContainText("医生您好");
  await expect.poll(() => observations.filter((item) => item.action === "session-init").length).toBe(1);
  expect(observations.filter((item) => item.action === "session-init")).toEqual([
    expect.objectContaining({ caseId: "HX-ADD-022", language: "en", status: 200 })
  ]);
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

  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation and ordering", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Investigation and ordering", exact: true })).toBeVisible();

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

test("rapid final-stage completion creates one debrief request and one report", async ({ page }) => {
  const attemptId = "e2e-final-stage-singleflight";
  await page.addInitScript(({ seededAttemptId }) => {
    const attempt = {
      attemptId: seededAttemptId,
      caseId: "P001",
      mode: "free",
      language: "zh",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-07-24T00:00:00.000Z"
    };
    const evaluation = {
      stageKey: "history",
      max: 50,
      score: 0,
      hits: [],
      misses: [],
      warnings: [],
      standardAnswer: "",
      comment: "E2E stage completed.",
      practiceOnly: true
    };
    localStorage.setItem("hematuria-language", "zh");
    localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:zh", JSON.stringify(attempt));
    localStorage.setItem(`hematuria-attempt-v3:P001:free:zh:${seededAttemptId}`, JSON.stringify({
      attempt,
      activeStageNo: 7,
      answers: { debriefReflection: "这是一段满足长度要求的复盘内容。" },
      submitted: Object.fromEntries([1, 2, 3, 4, 5, 6].map((stage) => [stage, { ...evaluation, stageKey: `stage-${stage}` }]))
    }));
  }, { seededAttemptId: attemptId });
  await routeTrainingApiThroughHandler(page, []);

  const debriefRequests = [];
  const scoreRequests = [];
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    const headers = { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": `e2e-${body.attemptId}` };
    if (body.action === "init-attempt") {
      return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ attemptId: body.attemptId, practiceOnly: true }) });
    }
    if (body.action === "stage-feedback" && body.stageKey === "debrief") {
      debriefRequests.push(body.requestId);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (debriefRequests.length > 1) {
        return route.fulfill({ status: 409, contentType: "application/json", headers, body: JSON.stringify({ error: "stage_not_unlocked" }) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          stageKey: "debrief", max: 30, score: 0, hits: [], misses: [], warnings: [],
          standardAnswer: "", comment: "Debrief accepted.", practiceOnly: true
        })
      });
    }
    if (body.action === "score") {
      scoreRequests.push(body.requestId);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          total: 0, max: 360, items: [], redFlags: [], ragGuardrails: [],
          scoringVersion: "e2e", caseVersion: "e2e", generatedAt: new Date().toISOString(), reportVersion: 1
        })
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ recorded: true }) });
  });

  await page.goto("/cases/P001/");
  const finish = page.getByRole("button", { name: "完成训练并生成最终报告", exact: true });
  await expect(finish).toBeEnabled();
  await finish.evaluate((button) => {
    button.click();
    button.click();
  });

  await expect(page.getByTestId("final-report")).toBeVisible();
  await expect(page.getByTestId("final-percentage-score")).toHaveText(/0\s*\/\s*100/);
  expect(debriefRequests).toHaveLength(1);
  expect(new Set(debriefRequests).size).toBe(1);
  expect(scoreRequests).toHaveLength(1);
  await expect(page.getByRole("alert").filter({ hasText: "终末评分服务暂时不可用" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(({ seededAttemptId }) => {
    const saved = JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:zh:${seededAttemptId}`) || "null");
    return saved?.timeline?.filter((item) => item.type === "submit" && item.stageNo === 7).length ?? 0;
  }, { seededAttemptId: attemptId })).toBe(1);
});

test("stage submission waits for the training attempt while the patient service is preparing", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { initAttemptDelayMs: 800, sessionInitDelayMs: 5000 });
  await page.goto("/cases/P001/");

  const initializing = page.getByRole("button", { name: "正在初始化训练会话……", exact: true });
  await expect(initializing).toBeDisabled();
  await expect(page.getByText("正在初始化训练会话", { exact: false })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  await expect(page.getByText("患者服务连接中……", { exact: false })).toBeVisible();
  await submit.click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  expect(observations.filter((item) => item.action === "stage-feedback")).toEqual([
    expect.objectContaining({ status: 200, tokenPresent: true })
  ]);
});

test("patient session refreshes once after stage feedback rotates the attempt token", async ({ page }) => {
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, observations, { sessionInitStaleAfterStageOnce: true });
  await page.goto("/cases/P003/");

  const submit = page.getByRole("button", { name: "Submit stage", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();

  await expect.poll(() => observations.filter((item) => item.action === "session-init").length).toBe(2);
  expect(observations.filter((item) => item.action === "session-init")).toEqual([
    expect.objectContaining({ status: 409, error: "stale_attempt_token", tokenPresent: true }),
    expect.objectContaining({ status: 200, error: "", tokenPresent: true })
  ]);
  const feedback = observations.filter((item) => item.action === "stage-feedback");
  expect(feedback).toEqual([
    expect.objectContaining({ status: 200, stageKey: "history", tokenPresent: true })
  ]);
  expect(new Set(feedback.map((item) => item.requestId)).size).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const storageKey = Object.keys(localStorage).find((key) => key.startsWith("hematuria-attempt-v3:P003:free:en:"));
    const saved = storageKey ? JSON.parse(localStorage.getItem(storageKey) || "null") : null;
    return saved?.timeline?.filter((item) => item.type === "submit" && item.stageNo === 1).length ?? 0;
  })).toBe(1);
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
});

test("P003 replaces a legacy cross-deployment token before zero-round stage submission", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { sessionInitDelayMs: 5000 });
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
  await expect(page.getByText("患者服务连接中……", { exact: false })).toBeVisible();
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

test("malformed attempt pointer cannot hydrate a terminal state", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.addInitScript(() => {
    const validAttempt = {
      attemptId: "malformed-terminal-attempt",
      caseId: "P001",
      mode: "free",
      language: "en",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-07-25T00:00:00.000Z"
    };
    const malformedPointer = { ...validAttempt };
    delete malformedPointer.participantId;
    localStorage.setItem("hematuria-language", "en");
    localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:en", JSON.stringify(malformedPointer));
    localStorage.setItem(`hematuria-attempt-v3:P001:free:en:${validAttempt.attemptId}`, JSON.stringify({
      attempt: validAttempt,
      activeStageNo: 7,
      submitted: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { score: 1, max: 1 }])),
      finalReport: {
        total: 360,
        max: 360,
        items: [],
        redFlags: [],
        ragGuardrails: [],
        scoringVersion: "forged",
        caseVersion: "forged",
        generatedAt: "2026-07-25T00:00:00.000Z",
        reportVersion: 3
      }
    }));
  });

  await page.goto("/cases/P001/");
  await expect(page.getByTestId("final-report")).toHaveCount(0);
  const pointer = await page.evaluate(() => JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null"));
  expect(pointer).toMatchObject({
    caseId: "P001",
    mode: "free",
    language: "en",
    participantId: "practice-user",
    schemaVersion: "attempt-v3"
  });
  expect(pointer.attemptId).not.toBe("malformed-terminal-attempt");
});

test("autosave repairs the active pointer after browser storage recovers across four viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The test explicitly covers all four required viewport sizes.");
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.addInitScript(() => {
    localStorage.setItem("hematuria-language", "en");
    const originalSetItem = Storage.prototype.setItem;
    window.__blockAttemptPointerWrites = true;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage && window.__blockAttemptPointerWrites && String(key).startsWith("hematuria-attempt-pointer-v3:")) {
        throw new DOMException("Synthetic pointer write outage", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    window.__recoverAttemptPointerWrites = () => { window.__blockAttemptPointerWrites = false; };
  });

  for (const [index, viewport] of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ].entries()) {
    if (index > 0) {
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("hematuria-attempt-v3:") || key.startsWith("hematuria-attempt-pointer-v3:")) localStorage.removeItem(key);
        }
        window.__blockAttemptPointerWrites = true;
      });
    }
    await page.setViewportSize(viewport);
    await page.goto("/cases/P001/");
    await expect(page.getByRole("textbox", { name: "History summary" })).toBeVisible();
    const marker = `Pointer recovery draft retained ${index}`;
    await page.getByRole("textbox", { name: "History summary" }).fill(`Pointer recovery draft ${index}`);
    expect(await page.evaluate(() => localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en"))).toBeNull();

    await page.evaluate(() => window.__recoverAttemptPointerWrites());
    await page.getByRole("textbox", { name: "History summary" }).fill(marker);
    await expect.poll(() => page.evaluate(() => {
      const pointer = JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null");
      const state = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:en:${pointer.attemptId}`) || "null")
        : null;
      return { pointerPresent: Boolean(pointer?.attemptId), marker: state?.answers?.historySummary || "" };
    })).toEqual({ pointerPresent: true, marker });

    await page.reload();
    await expect(page.getByRole("textbox", { name: "History summary" })).toHaveValue(marker);
  }
});

test("an init response without a signed training token never enables stage submission", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { omitTrainingStateHeaderForActions: ["init-attempt"] });
  await page.goto("/cases/P003/");

  await expect(page.locator("main").getByRole("alert")).toContainText("本次训练尚未准备完成");
  await expect(page.getByTestId("stage-preparing-state")).toContainText("需要重新准备");
  await expect(page.getByTestId("next-stage")).toHaveCount(0);
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(1);
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);
});

test("failed training attempt initialization never sends stage feedback and retries explicitly", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { initAttemptDelayMs: 300, initAttemptFailures: 1, initAttemptFailureStatus: 502, initAttemptFailureCode: "network_error" });
  await page.goto("/cases/P001/");

  const retry = page.getByRole("button", { name: "重新准备", exact: true });
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

test("a transient durable attempt store failure recovers without a doomed stage request", async ({ page }) => {
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, observations, {
    initAttemptFailures: 1,
    initAttemptFailureStatus: 503,
    initAttemptFailureCode: "training_attempt_store_unavailable"
  });
  await page.goto("/cases/P003/");

  const retry = page.getByRole("button", { name: "Prepare again", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByTestId("stage-preparing-state")).toContainText("Preparation required");
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

  await retry.click();
  const submit = page.getByRole("button", { name: "Submit stage", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "init-attempt")).toEqual([
    expect.objectContaining({ status: 503, error: "training_attempt_store_unavailable" }),
    expect.objectContaining({ status: 200, error: "" })
  ]);
  expect(observations.filter((item) => item.action === "stage-feedback")).toEqual([
    expect.objectContaining({ status: 200, stageKey: "history" })
  ]);
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

test("@ui-state-regression initialization, failure, and submitted actions are mutually exclusive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "State contract is captured once.");
  const screenshotDir = process.env.UI_DEFECT_SCREENSHOT_DIR || "";
  await page.setViewportSize({ width: 390, height: 844 });
  await routeTrainingApiThroughHandler(page, [], {
    initAttemptDelayMs: 500,
    initAttemptFailures: 1,
    initAttemptFailureStatus: 503,
    initAttemptFailureCode: "training_attempt_store_unavailable",
    sessionInitFailureCode: "provider_unavailable"
  });
  await page.goto("/cases/P001/");

  await expect(page.getByTestId("stage-preparing-state")).toContainText(/正在准备|需要重新准备/);
  await expect(page.getByTestId("next-stage")).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(1);
  await expect(page.locator(".workbench-connection")).toHaveCount(0);
  const retry = page.getByRole("button", { name: "重新准备", exact: true });
  await expect(retry).toBeVisible();
  expect(await retry.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  expect((await page.getByTestId("stage-preparing-state").boundingBox())?.width).toBeLessThan(200);
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-recovery-390x844.png");

  await retry.click();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "请先完成", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toHaveCount(0);
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "English", exact: true }).click();
  const englishSubmit = page.getByRole("button", { name: "Submit stage", exact: true });
  const englishIncomplete = page.getByRole("button", { name: "Complete this stage first", exact: true });
  await expect(englishSubmit).toBeEnabled();
  await expect(englishIncomplete).toBeDisabled();
  expect(await englishSubmit.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  expect(await englishIncomplete.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
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

test("English investigation presentation fails closed without exposing untranslated CJK", async ({ page }) => {
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P008/");
  await enterInvestigationStage(page, "en");

  const investigation = page.locator(".workbench-main");
  const visibleControls = await investigation.locator("h3, h4, label, input[placeholder]").allTextContents();
  expect(visibleControls.join(" ")).not.toMatch(/[\u3400-\u9fff]/u);
  const untranslatedOrders = page.getByText("Awaiting reviewed order-name translation", { exact: true });
  await expect(untranslatedOrders.first()).toBeVisible();
  await expect(untranslatedOrders.first().locator("xpath=ancestor::label[1]").getByRole("checkbox")).toBeDisabled();

  await page.getByPlaceholder("Example: urinalysis and sediment, CTU, cystoscopy").fill("CBC");
  await page.getByRole("button", { name: "Order and return results", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(0);
  const unavailable = page.getByText("CBC: the result is awaiting medical content review and is excluded from diagnosis and scoring for this attempt.", { exact: true });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).not.toContainText(/[\u3400-\u9fff]/u);
  expect(observations.filter((item) => item.action === "order")).toEqual([
    expect.objectContaining({ status: 200, tokenPresent: true })
  ]);
});

test("numeric laboratory reports expose missing reviewed metadata instead of a normal-looking dash", async ({ page }) => {
  await routeTrainingApiThroughHandler(page, []);
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");

  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("血常规");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  const report = page.getByTestId("report-card");
  await expect(report).toBeVisible();
  await expect(report.getByText("等待审核元数据", { exact: true })).toHaveCount(2);
});

test("report status labels are localized and abnormal evidence takes priority over final", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, []);
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "order") return route.fallback();
    const stateToken = route.request().headers()["x-training-state"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": stateToken },
      body: JSON.stringify({
        id: "localized-status-fixture",
        input: body.input,
        matched: true,
        matchedOrders: [{ orderId: "TEST-STATUS", displayName: "Status presentation test", translationAvailable: true }],
        results: [
          {
            caseId: "P008", orderId: "TEST-STATUS", resultId: "status-abnormal",
            status: "final", orderCategory: "Laboratory tests/Status presentation",
            result: "A reviewed abnormal signal is present.", value: "positive",
            unit: "", referenceRange: "", impression: "",
            abnormalFlags: ["abnormal"], abnormalLevel: "abnormal",
            teachingExplanation: "", metadataStatus: "complete", translationStatus: "source_text_no_cjk"
          },
          {
            caseId: "P008", orderId: "TEST-STATUS", resultId: "status-unavailable",
            status: "not_available", orderCategory: "Laboratory tests/Status presentation",
            result: "No configured result is available.", value: "",
            unit: "", referenceRange: "", impression: "No configured result is available.",
            abnormalFlags: [], abnormalLevel: "not_available",
            teachingExplanation: "", metadataStatus: "complete", translationStatus: "source_text_no_cjk"
          }
        ],
        duplicateOrderIds: [], unmetPrerequisites: [], selectedOrderCount: 1,
        recognizedOrderCount: 1, returnedReportCount: 2,
        at: new Date().toISOString(), placedAt: new Date().toISOString(),
        stageNo: 2, status: "reported", message: "Status fixtures returned."
      })
    });
  });
  await page.goto("/cases/P008/");
  await enterInvestigationStage(page, "en");

  await page.getByPlaceholder("Example: urinalysis and sediment, CTU, cystoscopy").fill("status presentation");
  await page.getByRole("button", { name: "Order and return results", exact: true }).click();
  const reports = page.getByTestId("report-card");
  await expect(reports).toHaveCount(2);
  await expect(reports.nth(0)).toHaveAttribute("data-status", "abnormal");
  await expect(reports.nth(0)).toContainText("Abnormal");
  await expect(reports.nth(1)).toContainText("Not available in this case");
  expect((await reports.allTextContents()).join(" ")).not.toMatch(/\b(final|not_available|not_performed)\b/);
});

test("nonterminal report with an empty result renders no blank keyed row", async ({ page }) => {
  const reactKeyErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /unique "key" prop/i.test(message.text())) {
      reactKeyErrors.push(message.text());
    }
  });
  await routeTrainingApiThroughHandler(page, []);
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "order") return route.fallback();
    const stateToken = route.request().headers()["x-training-state"];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": stateToken },
      body: JSON.stringify({
        id: "nonterminal-empty-result-fixture",
        input: body.input,
        matched: true,
        matchedOrders: [{ orderId: "TEST-NONTERMINAL", displayName: "非终态报告", translationAvailable: true }],
        results: [{
          caseId: "P001", orderId: "TEST-NONTERMINAL", resultId: "status-not-available-empty-result",
          status: "not_available", orderCategory: "检验/非终态",
          result: "", value: "", unit: "", referenceRange: "",
          impression: "当前病例尚无可释放结果。",
          abnormalFlags: [], abnormalLevel: "not_available",
          teachingExplanation: "", metadataStatus: "complete"
        }],
        duplicateOrderIds: [], unmetPrerequisites: [], selectedOrderCount: 1,
        recognizedOrderCount: 1, returnedReportCount: 1,
        at: new Date().toISOString(), placedAt: new Date().toISOString(),
        stageNo: 2, status: "reported", message: "已返回非终态报告。"
      })
    });
  });
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");
  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("非终态报告");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();

  const report = page.getByTestId("report-card");
  await expect(report).toBeVisible();
  await expect(report).toContainText("当前病例尚无可释放结果。");
  await expect(report.getByTestId("report-result-line")).toHaveCount(0);
  expect(reactKeyErrors).toEqual([]);
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

test("restart stays on the page after a first delete failure across four viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The test explicitly covers all four required viewport sizes.");
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));

  for (const [index, viewport] of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ].entries()) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/P001/");
    await expect(page.getByRole("button", { name: "Submit stage", exact: true })).toBeEnabled();
    const marker = `Restart failure marker ${index}`;
    await page.getByRole("textbox", { name: "History summary" }).fill(marker);
    const before = await expect.poll(() => page.evaluate(() => {
      const pointer = JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null");
      const state = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:en:${pointer.attemptId}`) || "null")
        : null;
      return { attemptId: pointer?.attemptId || "", marker: state?.answers?.historySummary || "" };
    })).toEqual(expect.objectContaining({ attemptId: expect.any(String), marker }));
    void before;
    const priorAttemptId = await page.evaluate(() => JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null")?.attemptId);

    await page.evaluate(() => {
      const originalRemoveItem = Storage.prototype.removeItem;
      let failed = false;
      Storage.prototype.removeItem = function removeItem(key) {
        if (!failed && this === localStorage && String(key).startsWith("hematuria-attempt-v3:P001:free:en:")) {
          failed = true;
          throw new DOMException("Synthetic one-shot delete failure", "SecurityError");
        }
        return originalRemoveItem.call(this, key);
      };
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restart training", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Restart could not clear" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/cases/P001/");
    expect(await page.evaluate(() => {
      const pointer = JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null");
      const state = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:en:${pointer.attemptId}`) || "null")
        : null;
      return { attemptId: pointer?.attemptId, marker: state?.answers?.historySummary };
    })).toEqual({ attemptId: priorAttemptId, marker });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restart training", exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("hematuria-attempt-pointer-v3:P001:free:en") || "null")?.attemptId))
      .not.toBe(priorAttemptId);
  }
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
  await expect(page.getByRole("heading", { name: "检查与开单", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "检查与开单", exact: true })).toBeVisible();
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
  await expect(page.locator("main").getByRole("alert")).toContainText("训练记录暂时不可用，当前无法提交阶段");
  await expect(page.getByRole("button", { name: "重新准备", exact: true })).toBeVisible();
  await expect(page.getByTestId("stage-preparing-state")).toContainText("需要重新准备");
  expect(actions).toEqual(["init-attempt"]);
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toHaveCount(0);
});

test("catalog links cover all display IDs and representative routes refresh", async ({ page }) => {
  const routeBasePath = (process.env.PLAYWRIGHT_ROUTE_BASE_PATH || "").replace(/\/$/, "");
  await page.goto(`${routeBasePath}/cases/`);
  const displayIds = Array.from({ length: 42 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`);
  const expected = displayIds.map((caseId) => `${routeBasePath}/cases/${caseId}/`);
  const chineseHrefs = await page.locator('a[href*="/cases/P"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(chineseHrefs).toEqual(expected);
  // The catalog contract above covers all 42 IDs in both languages, while the
  // production build must materialize every static page. Repeating two HTTP
  // requests for every parameter in every browser project adds 336 dev-server
  // requests without a viewport-specific assertion, so browser navigation uses
  // core, first supplementary and final boundary representatives.
  for (const href of [expected[0], expected[12], expected[41]]) {
    const direct = await page.request.get(href);
    expect(direct.status(), `direct ${href}`).toBe(200);
    const refresh = await page.request.get(href);
    expect(refresh.status(), `refresh ${href}`).toBe(200);
  }
  await page.getByRole("button", { name: "English" }).click();
  const englishHrefs = await page.locator('a[href*="/cases/P"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(englishHrefs).toEqual(expected);
  // Unknown-ID rejection is covered by the public route unit contract and the
  // production static-output smoke. Next dev can leave an ungenerated dynamic
  // parameter request pending when dynamicParams=false, which is not the
  // deployed static-server behavior and must not stall the browser suite.

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

test("interview composer and desktop workbench fit target Windows viewports and 125 percent scaling", async ({ page }, testInfo) => {
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
    : [
        { width: 1093, height: 614 }, // 1366x768 at Windows 125% effective CSS viewport.
        { width: 1366, height: 768 },
        { width: 1440, height: 900 }
      ];
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
            mainRight: document.querySelector(".workbench-main")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
            mainHeight: document.querySelector(".workbench-main")?.getBoundingClientRect().height ?? 0,
            drawerDisplay: getComputedStyle(document.querySelector(".workbench-drawer")).display,
            drawerRight: document.querySelector(".workbench-drawer")?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
            drawerWidth: document.querySelector(".workbench-drawer")?.getBoundingClientRect().width ?? 0,
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
      expect(Math.ceil(layout.mainRight)).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.mainHeight).toBeGreaterThan(240);
      if (viewport.width >= 1180) {
        expect(layout.drawerDisplay).not.toBe("none");
        expect(Math.ceil(layout.drawerRight)).toBeLessThanOrEqual(viewport.width + 1);
        expect(layout.drawerWidth).toBeGreaterThanOrEqual(220);
      }
      if (viewport.width >= 1040 && viewport.width < 1180) expect(layout.drawerDisplay).toBe("none");
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

test("@ui-defect-regression P001 Chinese seven-stage contract keeps public labels and coherent actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One desktop project captures the required contract evidence.");
  testInfo.setTimeout(180_000);
  const screenshotDir = process.env.UI_DEFECT_SCREENSHOT_DIR || "";
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "我平时吸烟，最近发现尿色发红。",
      matchedSlotIds: ["smoking", "chief_complaint"],
      matchedFacts: ["smoking=current"],
      provider: "local-test",
      generationSource: "test",
      isFallback: false
    })
  }));

  await page.setViewportSize({ width: 1093, height: 614 });
  await page.goto("/cases/P001/");
  await page.getByRole("textbox", { name: "输入问诊问题" }).fill("平时吸烟吗？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("textbox", { name: "病史小结" }).fill("已完成重点病史采集。小便颜色发红，已询问相关危险因素。");
  await submitFirstStage(page, "zh");
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByRole("button", { name: "直肠指检/前列腺", exact: true }).click();
  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("尿常规；血常规");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

  const smokingEvidence = page.getByText("问诊：吸烟史——已采集", { exact: true }).first();
  await expect(smokingEvidence).toBeVisible();
  await expectStudentCopyPublic(page);
  await smokingEvidence.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-stage3-1093x614.png");
  await fillDiagnosisBuilder(page, "zh");
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toHaveCount(0);
  expect(observations.find((item) => item.action === "stage-feedback" && item.stageKey === "diagnosis")?.submittedEvidenceIds).toHaveLength(2);
  expect(observations.find((item) => item.action === "stage-feedback" && item.stageKey === "diagnosis")?.submittedEvidenceIds.every((id) => /^EV-/.test(id))).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByLabel("暂不需要会诊").check();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("treatment-order-workbench")).toBeVisible();
  const finalTreatmentInput = page.getByTestId("treatment-discharge").locator("input").first();
  await finalTreatmentInput.fill("门诊复查");
  await finalTreatmentInput.scrollIntoViewIfNeeded();
  const mobileGeometry = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="treatment-discharge"] input')?.getBoundingClientRect();
    const actions = document.querySelector(".workbench-actions")?.getBoundingClientRect();
    return { input: input?.toJSON(), actions: actions?.toJSON(), overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(mobileGeometry.overflow).toBe(false);
  expect(mobileGeometry.input).toBeTruthy();
  expect(mobileGeometry.actions).toBeTruthy();
  expect(Math.ceil(mobileGeometry.input.bottom)).toBeLessThanOrEqual(Math.ceil(mobileGeometry.actions.top));
  await expect(page.getByRole("button", { name: "请先完成", exact: true })).toBeDisabled();
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-stage5-390x844.png");
  await expectStudentCopyPublic(page);
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("textbox", { name: "学习反思" }).fill("本次训练需要继续改进问诊顺序、证据整合和医嘱表达。");
  await page.getByTestId("complete-training").click();
  await expect(page.getByTestId("final-report")).toBeVisible();
  await expectStudentCopyPublic(page);
  await expect(page.getByTestId("training-complete-state")).toContainText("已完成");
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-stage7-1366x768.png");
  await page.reload();
  await expect(page.getByTestId("final-report")).toBeVisible();
  await expect(page.getByTestId("training-complete-state")).toBeVisible();
  await expectStudentCopyPublic(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});

test("@ui-defect-regression P001 English stages 1-3 use natural evidence labels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "English contract evidence is captured once on desktop.");
  testInfo.setTimeout(120_000);
  const screenshotDir = process.env.UI_DEFECT_SCREENSHOT_DIR || "";
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApiThroughHandler(page, observations);
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "I smoke, and the change started this morning.",
      matchedSlotIds: ["smoking", "hematuria_onset"],
      matchedFacts: ["smoking=current", "onset=today"],
      provider: "local-test",
      generationSource: "test",
      isFallback: false
    })
  }));

  await page.setViewportSize({ width: 1093, height: 614 });
  await page.goto("/cases/P001/");
  await page.getByRole("textbox", { name: "Enter an interview question" }).fill("Do you smoke, and when did this start?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("textbox", { name: "History summary" }).fill("Focused history completed.");
  await submitFirstStage(page, "en");
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await page.getByRole("button", { name: "Submit stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next stage", exact: true }).click();

  await expect(page.getByText("History: Smoking history — obtained", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("History: Onset — obtained", { exact: true }).first()).toBeVisible();
  await expectStudentCopyPublic(page);
  await fillDiagnosisBuilder(page, "en");
  await page.getByRole("button", { name: "Submit stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();
  const diagnosisSubmission = observations.find((item) => item.action === "stage-feedback" && item.stageKey === "diagnosis");
  expect(diagnosisSubmission?.submittedEvidenceIds).toHaveLength(2);
  expect(diagnosisSubmission?.submittedEvidenceIds.every((id) => /^EV-/.test(id))).toBe(true);
  await expectStudentCopyPublic(page);
  await captureDefectScreenshot(page, screenshotDir, "p001-en-stage3-1093x614.png");
});

test("desktop assistance settings fit the Windows 125 percent viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop runtime settings are covered in the desktop project.");
  const screenshotDir = process.env.UI_QUALITY_SCREENSHOT_DIR || "";
  const phase = process.env.UI_QUALITY_SCREENSHOT_PHASE || "review";
  const baselineCapture = phase === "before";
  await page.addInitScript(() => {
    globalThis.__HEMATURIA_DESKTOP_RUNTIME__ = {
      runtimeTarget: "desktop",
      apiBaseUrl: "http://127.0.0.1:43000",
      authToken: "playwright_desktop_runtime_token_12345678901234567890",
      debugRuntime: true
    };
  });
  await page.route("**/api/desktop/settings", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      modelMode: "lightweight", modelAlias: "Qwen3-1.7B", modelDirectory: "C:\\TrainingResources",
      modelFilePath: "", modelPresent: false, localAiEnabled: false, llamaStatus: "model_missing",
      modelValidation: "not_checked", version: 1
    })
  }));
  await page.setViewportSize({ width: 1093, height: 614 });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "问诊辅助设置" }).click();
  const dialog = page.getByRole("dialog", { name: "问诊辅助设置" });
  await expect(dialog).toBeVisible();
  if (!baselineCapture) {
    await expect(dialog.getByRole("heading", { name: "辅助设置" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "关闭" })).toBeVisible();
    await expect(dialog.getByText(/本地模型|Qwen|运行时别名|answerSource|factState|intent|Provider|AI/)).toHaveCount(0);
  }
  const box = await dialog.boundingBox();
  expect(box).toBeTruthy();
  if (!baselineCapture) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(Math.ceil(box.y + box.height)).toBeLessThanOrEqual(614);
  }
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `${phase}-125pct-settings.png`), fullPage: false });
  }
  if (!baselineCapture) {
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
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

test("mobile voice controls meet the 44px touch-target contract", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch geometry is a mobile contract.");
  await mockTrainingState(page);
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/P001/");
    const trigger = page.getByRole("button", { name: /语音设置/ });
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    for (const control of [
      page.getByRole("button", { name: "关闭" }),
      page.getByRole("button", { name: "试听" }),
      page.getByTitle("停止")
    ]) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "关闭" }).click();
  }
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
  await expect(page.getByText("患者服务正在使用安全离线回答，可随时重新连接。")).toBeVisible();
  const reconnect = page.getByRole("button", { name: "重新连接", exact: true });
  expect(await reconnect.count()).toBe(1);
  await reconnect.evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByText("患者服务已重新连接")).toBeVisible();
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

test("patient send waits for a session capability before issuing agent-chat", async ({ page }) => {
  let releaseSession;
  let sessionRequestStarted;
  let patientCalls = 0;
  const sessionGate = new Promise((resolve) => { releaseSession = resolve; });
  const sessionStarted = new Promise((resolve) => { sessionRequestStarted = resolve; });
  await mockTrainingState(page);
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" })
  }));
  await page.route("**/api/session/init/**", async (route) => {
    sessionRequestStarted();
    await sessionGate;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionId: "delayed-capability", caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false })
    });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    patientCalls += 1;
    const body = route.request().postDataJSON();
    expect(body.sessionId).toBe("delayed-capability");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "今天早上开始的。", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) });
  });

  await page.goto("/cases/P001/");
  await sessionStarted;
  const input = page.getByRole("textbox", { name: "输入问诊问题" });
  const send = page.getByRole("button", { name: "发送", exact: true });
  await input.fill("什么时候开始的？");
  await expect(send).toBeDisabled();
  await input.press("Enter");
  expect(patientCalls).toBe(0);

  releaseSession();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("今天早上开始的。", { exact: true })).toBeVisible();
  expect(patientCalls).toBe(1);
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
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  expect(healthCalls).toBe(before);
  await context.setOffline(false);
  await expect(page.getByText("网络已恢复，可以重新连接患者服务。")).toBeVisible();
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  await expect(page.getByText("患者服务已重新连接")).toBeVisible();
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
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry sync" })).toBeVisible();
  await page.waitForTimeout(700);
  expect(historyCalls).toBe(3);
  await page.getByRole("button", { name: "Retry sync" }).click();
  await expect(page.getByText("Scoring synced")).toBeVisible();
  expect(historyCalls).toBe(4);
  expect(new Set(historyRequestIds).size).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:en:"));
    const saved = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return saved?.pendingHistoryLogs?.length ?? -1;
  })).toBe(0);
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
