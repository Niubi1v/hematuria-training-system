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

async function routeDesktopDurableBridge(page, observations) {
  const origin = "http://127.0.0.1:43127";
  const authToken = "desktop-e2e-launch-token-with-at-least-forty-three-characters";
  const authority = {
    stateStoreId: "33333333-3333-4333-8333-333333333333",
    schemaVersion: 3,
    productHead: "desktop-durable-bridge-e2e",
    serverStateRevision: 0
  };
  const snapshots = new Map();
  let stateToken = "";

  await page.addInitScript(({ origin, authToken }) => {
    Object.defineProperty(globalThis, "__HEMATURIA_DESKTOP_RUNTIME__", {
      value: Object.freeze({ runtimeTarget: "desktop", apiBaseUrl: origin, authToken, debugRuntime: false }),
      writable: true,
      configurable: false
    });
    localStorage.setItem("hematuria-language", "en");
  }, { origin, authToken });

  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "Access-Control-Allow-Origin": request.headers().origin || "http://127.0.0.1:3000",
      "Access-Control-Allow-Headers": "Content-Type, X-Request-Id, X-Idempotency-Key, X-Training-State, X-Hematuria-Desktop-Token",
      "Access-Control-Expose-Headers": "X-Training-State"
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    expect(request.headers()["x-hematuria-desktop-token"]).toBe(authToken);
    const respond = (status, body, headers = {}) => route.fulfill({
      status,
      contentType: "application/json",
      headers: { ...cors, ...headers },
      body: JSON.stringify(body)
    });
    if (url.pathname === "/api/health/") {
      await respond(200, {
        status: "ok", patientServiceConfigured: true, trainingStateConfigured: true,
        durableAttemptStoreConfigured: true, cloudTtsConfigured: false,
        allowedOriginConfigured: true, deploymentTier: "practice", gitSha: authority.productHead,
        deploymentSha: authority.productHead, apiVersion: "2.6.0"
      });
      return;
    }
    if (url.pathname === "/api/desktop/state/bootstrap") {
      observations.push({ endpoint: "bootstrap", status: 200 });
      await respond(200, authority);
      return;
    }
    const body = request.postDataJSON();
    if (url.pathname === "/api/desktop/attempt/state") {
      const key = `${body.caseId}:${body.mode}:${body.language}`;
      if (body.action === "load") {
        const stored = snapshots.get(key);
        observations.push({ endpoint: "attempt-load", status: stored ? 200 : 404, ...body });
        await respond(stored ? 200 : 404, stored
          ? { ...authority, attemptId: stored.snapshot.attempt.attemptId, currentStage: stored.snapshot.activeStageNo || 1, status: "active", stateToken, snapshot: stored.snapshot }
          : { error: "attempt_not_found" });
        return;
      }
      snapshots.set(key, { snapshot: body.snapshot });
      authority.serverStateRevision += 1;
      observations.push({ endpoint: "attempt-save", status: 200, ...body });
      await respond(200, { saved: true, ...authority });
      return;
    }
    if (url.pathname === "/api/desktop/attempt/resume") {
      const status = body.mode === "free" ? 404 : 400;
      observations.push({ endpoint: "attempt-resume", status, ...body });
      await respond(status, { error: status === 404 ? "attempt_not_found" : "desktop_attempt_resume_payload_invalid" });
      return;
    }
    if (url.pathname === "/api/training-action/") {
      const result = await trainingApi(body, request.headers()["x-training-state"] || "");
      stateToken = result.headers["x-training-state"] || stateToken;
      observations.push({ endpoint: "training-action", action: body.action, status: result.statusCode, mode: body.mode });
      await respond(result.statusCode, result.payload, stateToken ? { "X-Training-State": stateToken } : {});
      return;
    }
    if (url.pathname === "/api/session/init/") {
      await respond(200, {
        sessionId: `desktop-session-${body.attemptId}`, caseId: body.caseId, language: body.language,
        mode: body.mode, patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: authority.productHead,
        apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false
      });
      return;
    }
    await respond(404, { error: "not_found" });
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

const studentInternalFieldPattern = /canonical(?:Key|FactOrAction)?|slot_answered|evidenceId|answerSource|factState|requestedSlot|\bintent\b|\bprovider\b|\bprovenance\b|local_ai|rule_fallback|runtimeSessionId|stateStoreId|attemptId|state.?token|raw.?360|prompt|reasoning|\bEV-[A-Za-z0-9-]+\b|\b(?:LAB|IMG|MED)-[A-Za-z0-9-]+\b|\bPE(?:-[A-Za-z0-9-]+|\d+)\b|\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/i;

async function expectStudentCopyPublic(page) {
  expect(await page.locator("body").innerText()).not.toMatch(studentInternalFieldPattern);
  const exposedAttributesAndForms = await page.locator("body").evaluate((body) => Array.from(body.querySelectorAll("*"))
    .flatMap((element) => ["aria-label", "title", "name", "placeholder", "value"].map((name) => element.getAttribute(name) || ""))
    .filter(Boolean)
    .join("\n"));
  expect(exposedAttributesAndForms).not.toMatch(studentInternalFieldPattern);
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
    const evidenceSummaries = card.getByTestId("evidence-checklist").locator("summary");
    for (let summaryIndex = 0; summaryIndex < await evidenceSummaries.count(); summaryIndex += 1) {
      await evidenceSummaries.nth(summaryIndex).click();
    }
    await card.locator("fieldset").first().locator('input[type="checkbox"]').first().check();
  }
}

async function captureDefectScreenshot(page, directory, name) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name), fullPage: false });
}

async function expectStableScreenshot(page, name) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await expect(page).toHaveScreenshot(name, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.005 });
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
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await expect(page.getByText("血常规：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
  await expect(page.getByText("彩超泌尿系（双肾、输尿管及膀胱）+残余尿：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
  await expect(page.getByText("第2阶段 · 检查与开单", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("第2阶段", { exact: true })).toHaveCount(0);
  await expect(page.getByText("开单服务暂时不可用，未释放报告。")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  const orderCountBeforeDoubleClick = observations.filter((item) => item.action === "order").length;
  await orderInput.fill("X光膀胱造影");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => observations.filter((item) => item.action === "order").length).toBe(orderCountBeforeDoubleClick + 1);
  await expect(page.getByText("X光膀胱造影：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
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
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await expect(page.getByText("血常规：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
  await expect(page.getByText("彩超泌尿系（双肾、输尿管及膀胱）+残余尿：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(page.getByTestId("order-outcome")).toHaveCount(3);
  await expect(page.getByText(/未返回结果|开单服务暂时不可用/)).toHaveCount(0);
});

test("@r5-visual @stage3-evidence-recovery reopens stage 2 when only one diagnostic finding is available", async ({ page }, testInfo) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P001/");

  await enterInvestigationStage(page, "zh");
  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("尿常规");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

  const primaryEvidence = page.getByTestId("diagnosis-builder").locator("fieldset").first().locator('input[type="checkbox"]');
  await expect(primaryEvidence).toHaveCount(1);
  await page.reload();
  await expect(primaryEvidence).toHaveCount(1);
  if (testInfo.project.name === "desktop-chromium") {
    await page.setViewportSize({ width: 1093, height: 614 });
    await expectStableScreenshot(page, "stage3-single-evidence-recovery-1093x614.png");
  }
  await expect(page.getByRole("button", { name: "返回阶段2补充依据", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "返回阶段2补充依据", exact: true }).click();
  await expect(page.getByRole("heading", { name: "检查与开单", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "体温", exact: true }).click();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await expect(primaryEvidence).toHaveCount(2);

  expect(observations.filter((item) => item.action === "stage-feedback" && item.stageKey === "history")).toHaveLength(2);
  expect(observations.filter((item) => item.action === "stage-feedback" && item.stageKey === "orders")).toHaveLength(2);
});

test("@r5-visual @r5-historical @ui-ia investigation and diagnosis directories keep selection context without nested scrolling", async ({ page }, testInfo) => {
  const screenshotDir = process.env.UI_ROUND2_SCREENSHOT_DIR || "";
  await routeTrainingApiThroughHandler(page, []);
  await page.setViewportSize({ width: 1093, height: 614 });
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");

  const summary = page.getByTestId("investigation-selection-summary");
  await expect(summary).toContainText("已勾选医嘱 0 项");
  const firstExamGroup = page.locator(".workbench-main details").first();
  await firstExamGroup.locator("summary").click();
  await expect(page.getByRole("button", { name: "体温", exact: true })).not.toBeVisible();
  await firstExamGroup.locator("summary").click();
  await page.getByRole("button", { name: "体温", exact: true }).click();
  await expect(summary).toContainText("已返回查体记录 1 项");

  await page.getByPlaceholder("搜索医嘱名称或同义词，例如 CTU、尿培养、膀胱镜").fill("尿常规");
  await page.locator("label").filter({ hasText: "尿常规" }).first().getByRole("checkbox").check();
  await expect(summary).toContainText("已勾选医嘱 1 项");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect(summary).toContainText("已返回检查报告 1 份");
  const main = page.locator(".workbench-main");
  await main.evaluate((element) => element.scrollTo({ top: 700, behavior: "auto" }));
  await expect.poll(async () => {
    const [summaryBox, mainBox, paddingTop] = await Promise.all([
      summary.boundingBox(),
      main.boundingBox(),
      main.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop))
    ]);
    return summaryBox && mainBox ? Math.abs(summaryBox.y - mainBox.y - paddingTop) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(2);
  const [summaryBox, actionsBox] = await Promise.all([summary.boundingBox(), page.locator(".workbench-actions").boundingBox()]);
  expect(summaryBox).toBeTruthy();
  expect(actionsBox).toBeTruthy();
  expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(actionsBox.y);
  if (testInfo.project.name === "desktop-chromium") await expectStableScreenshot(page, "stage2-sticky-summary-1093x614.png");
  await captureDefectScreenshot(page, screenshotDir, "stage2-summary-sticky-1093x614.png");
  for (const viewport of [{ width: 390, height: 844 }, { width: 1093, height: 614 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const summaryBox = document.querySelector('[data-testid="investigation-selection-summary"]')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        summaryRight: summaryBox?.right ?? Number.POSITIVE_INFINITY,
        summaryPosition: getComputedStyle(document.querySelector('[data-testid="investigation-selection-summary"]')).position
      };
    });
    expect(layout.overflow, `${viewport.width}x${viewport.height}`).toBe(false);
    expect(Math.ceil(layout.summaryRight), `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
    expect(layout.summaryPosition, `${viewport.width}x${viewport.height}`).toBe(viewport.width >= 1024 ? "sticky" : "static");
  }
  await page.setViewportSize({ width: 1093, height: 614 });
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

  const checklists = page.getByTestId("evidence-checklist");
  await expect(checklists).toHaveCount(7);
  await expect(checklists.first()).toHaveAttribute("open", "");
  await expect(checklists.nth(1)).not.toHaveAttribute("open", "");
  expect(await checklists.first().locator("fieldset > div").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  const primary = checklists.first().locator('input[type="checkbox"]');
  await primary.nth(0).check();
  await primary.nth(1).check();
  await expect(checklists.first().locator("summary")).toContainText("2/2");
  await expectStudentCopyPublic(page);
});

test("@order-result-human-path selected orders use the primary action and return durable evidence", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");

  const summary = page.getByTestId("investigation-selection-summary");
  await page.getByPlaceholder("搜索医嘱名称或同义词，例如 CTU、尿培养、膀胱镜").fill("尿常规");
  await page.locator("label").filter({ hasText: "尿常规" }).first().getByRole("checkbox").check();
  await expect(summary).toContainText("已勾选医嘱 1 项");

  const orderCount = observations.filter((item) => item.action === "order").length;
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect.poll(() => observations.filter((item) => item.action === "order").length).toBe(orderCount + 1);
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(summary).toContainText("已返回检查报告 1 份");

  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(summary).toContainText("已返回检查报告 1 份");
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await expect(page.getByTestId("diagnosis-builder").locator("fieldset").first().locator('input[type="checkbox"]')).toHaveCount(1);
});

test("@order-result-human-path P005 five-order mentor replay presents approved reports without governance leakage", async ({ page }) => {
  const previousRuntimeTarget = process.env.HEMATURIA_RUNTIME_TARGET;
  process.env.HEMATURIA_RUNTIME_TARGET = "desktop";
  try {
    await routeTrainingApiThroughHandler(page, []);
    await page.goto("/cases/P005/");
    await enterInvestigationStage(page, "zh");

    const orderInput = page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜");
    await orderInput.fill("尿常规；尿沉渣镜检；尿抗酸杆菌/结核分枝杆菌检查；PSA；彩超泌尿系（双肾、输尿管及膀胱）+残余尿");
    await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();

    const feedback = page.getByRole("status").filter({ hasText: "5项医嘱" });
    await expect(feedback).toBeFocused();
    await expect(feedback).toContainText("新返回4份报告");
    await expect(feedback).toContainText("同一报告另覆盖1项医嘱");
    await expect(feedback).toContainText("0项当前无可提供结果");
    await expect(page.getByTestId("report-card")).toHaveCount(4);
    await expect(page.getByTestId("report-card").filter({ hasText: /红细胞/u })).toHaveCount(1);
    await expect(page.getByTestId("report-card").filter({ hasText: /抗酸染色阴性.*结核分枝杆菌核酸检测阴性/u })).toHaveCount(1);
    await expect(page.getByTestId("report-card").filter({ hasText: /总PSA 6\.8 ng\/mL/u })).toHaveCount(1);
    await expect(page.getByTestId("report-card").filter({ hasText: /膀胱小梁小房形成.*前列腺增大.*56\*65\*47/u })).toHaveCount(1);
    await expect(page.getByTestId("report-card").filter({ hasText: /心脏|冠脉|EF55/u })).toHaveCount(0);
    await expect(page.getByTestId("order-outcome")).toHaveCount(5);
    await expect(page.getByTestId("order-outcome").filter({ hasText: "报告已返回" })).toHaveCount(5);
    await expect(page.getByTestId("order-outcome").filter({ hasText: /未取材|未实施|暂无可显示结果/u })).toHaveCount(0);
    await expect(page.getByTestId("report-card").getByText("单位", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("report-card").getByText("参考范围", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/等待医学审核|待审核|等待审核元数据|当前不进入诊断、治疗或评分证据|medical_review_pending|needs_review|not_available|diagnosticEligible|scoringEligible/u);

    await orderInput.fill("尿常规；尿沉渣镜检；尿抗酸杆菌/结核分枝杆菌检查；PSA；彩超泌尿系（双肾、输尿管及膀胱）+残余尿");
    await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "5项医嘱" })).toContainText("已有结果4份");
    await expect(page.getByTestId("report-card")).toHaveCount(8);
    await expect(page.getByTestId("investigation-selection-summary")).toContainText("已返回检查报告 4 份");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
    await expect(page.getByTestId("diagnosis-builder")).toBeVisible();
    await expect(page.getByTestId("diagnosis-builder").locator("fieldset").first().locator('input[type="checkbox"]')).toHaveCount(2);
  } finally {
    if (previousRuntimeTarget === undefined) delete process.env.HEMATURIA_RUNTIME_TARGET;
    else process.env.HEMATURIA_RUNTIME_TARGET = previousRuntimeTarget;
  }
});

test("@medical-author-stage2 approved and deterministic teaching reports render without internal metadata", async ({ page }) => {
  const previousRuntimeTarget = process.env.HEMATURIA_RUNTIME_TARGET;
  process.env.HEMATURIA_RUNTIME_TARGET = "desktop";
  try {
    await routeTrainingApiThroughHandler(page, []);
    await page.goto("/cases/P001/");
    await enterInvestigationStage(page, "zh");
    const orderInput = page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜");
    await orderInput.fill("END-001;IMG-CT-001");
    await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
    await expect(page.getByTestId("report-result-line")).toContainText([/膀胱镜：膀胱左侧壁见多发不规则宽基底肿物，最大约3 cm，表面血管丰富并有接触性出血/u, /建议TURBT取材明确病理及肌层受侵情况。/u]);
    await expect(page.getByTestId("report-card")).toHaveCount(2);
    await expect(page.getByTestId("order-outcome").filter({ hasText: "报告已返回" })).toHaveCount(2);
    await expect(page.getByTestId("order-outcome").filter({ hasText: /未实施|暂无可显示结果/u })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/simulated|provenance|medical_review_pending|diagnosticEligible|scoringEligible|affectsDiagnosis|affectsScore/iu);
    await page.reload();
    await expect(page.getByTestId("report-card")).toHaveCount(2);
    await expect(page.getByTestId("report-card").filter({ hasText: "膀胱镜：膀胱左侧壁见多发不规则宽基底肿物" })).toHaveCount(1);
  } finally {
    if (previousRuntimeTarget === undefined) delete process.env.HEMATURIA_RUNTIME_TARGET;
    else process.env.HEMATURIA_RUNTIME_TARGET = previousRuntimeTarget;
  }
});

test("@order-result-human-path duplicate English order resurfaces one stored report and stays isolated by case", async ({ page }) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations);
  await page.goto("/cases/P003/");
  await page.getByRole("button", { name: "English" }).click();
  await enterInvestigationStage(page, "en");

  await page.getByRole("button", { name: "Pathology / procedure", exact: true }).click();
  await page.getByPlaceholder("Search orders or synonyms, e.g. CTU, urine culture, cystoscopy").fill("voided cytology");
  await page.locator("label").filter({ hasText: "voided cytology" }).first().getByRole("checkbox").check();
  const primary = page.getByRole("button", { name: "Order and return results", exact: true });
  await primary.dblclick();
  await expect.poll(() => observations.filter((item) => item.action === "order").length).toBe(1);
  await expect(page.getByTestId("report-card")).toHaveCount(1);
  await expect(page.getByTestId("investigation-selection-summary")).toContainText("1 reports returned");

  await primary.click();
  await expect.poll(() => observations.filter((item) => item.action === "order").length).toBe(2);
  await expect(page.getByTestId("report-card")).toHaveCount(2);
  await expect(page.getByTestId("investigation-selection-summary")).toContainText("1 reports returned");
  await page.reload();
  await expect(page.getByTestId("report-card")).toHaveCount(2);

  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "中文" }).click();
  await enterInvestigationStage(page, "zh");
  await expect(page.getByTestId("report-card")).toHaveCount(0);
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "确认切换", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History taking", exact: true })).toBeVisible();
  await page.goto("/cases/P003/");
  await expect(page.getByTestId("investigation-selection-summary")).toBeVisible();
  await expect(page.getByTestId("report-card")).toHaveCount(2);
  await expect(page.getByTestId("investigation-selection-summary")).toContainText("1 reports returned");
});

test("case catalog switches public labels without exposing complaints", async ({ page }) => {
  await page.goto("/cases/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Choose a training case" })).toBeVisible();
  await expect(page.getByText(/Hematuria/i).first()).toBeVisible();
  await expect(page.locator('a[href="/cases/P013/"]')).toContainText("Case 13");
  await expect(page.locator('a[href="/cases/P013/"]')).toContainText("Age68");
  await expect(page.locator('a[href="/cases/P013/"]')).toContainText("SexMale");
  expect(await page.locator('a[href="/cases/P013/"], a[href="/cases/P019/"], a[href="/cases/P020/"]').allTextContents())
    .not.toEqual(expect.arrayContaining([expect.stringMatching(/red urine|fever|flank pain|chief complaint/i)]));
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
    await expect(page.getByRole("status").filter({ hasText: "本机进度暂不可用，但仍可选择病例。" })).toBeVisible();
    const search = page.getByRole("textbox", { name: "按病例编号搜索" });
    await search.fill("P001");
    await expect(page.locator("a[data-case-id]")).toHaveCount(1);
    await search.fill("");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Choose a training case" })).toBeVisible();
    await expect(page.locator("a[data-case-id]")).toHaveCount(42);
  }

  await page.locator('a[data-case-id="P001"]').click();
  await expect(page).toHaveURL(/\/cases\/P001\/$/);
  await expect(page.getByRole("heading", { name: /血尿临床问诊训练系统|Hematuria Clinical Interview Training System/ })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Choose a training case" })).toBeVisible();
    await expect(page.locator('a[data-case-id="P001"]').getByRole("img", { name: "Not started" })).toBeVisible();
    await expect(page.locator('a[data-case-id="P002"]').getByRole("img", { name: "Not started" })).toBeVisible();
    await expect(page.locator('a[data-case-id="P003"]').getByRole("img", { name: "Not started" })).toBeVisible();
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

test("@r5-visual @r5-historical P001 stage one submission advances across language switches and refresh", async ({ page }, testInfo) => {
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

  const englishTrigger = page.getByRole("button", { name: "English" });
  await englishTrigger.click();
  const languageDialog = page.getByRole("dialog", { name: "切换训练语言？" });
  await expect(languageDialog).toContainText("当前训练记录会保留");
  await expectStudentCopyPublic(page);
  if (testInfo.project.name === "desktop-chromium") {
    await page.setViewportSize({ width: 1366, height: 768 });
    await expectStableScreenshot(page, "language-switch-dialog-1366x768.png");
  }
  const dialogAxe = await new AxeBuilder({ page }).include("dialog").analyze();
  expect(dialogAxe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
  await page.keyboard.press("Shift+Tab");
  expect(await languageDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(languageDialog).not.toBeVisible();
  await expect(englishTrigger).toBeFocused();
  await englishTrigger.click();
  await page.getByTestId("confirm-language-switch").click();
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

  await page.getByRole("button", { name: "中文" }).click();
  await page.getByTestId("confirm-language-switch").click();
  await submitFirstStage(page, "zh");
  expect(observations.filter((item) => item.action === "stage-feedback" && item.language === "zh")).toHaveLength(2);
});

test("@r5-historical rapid stage submission is accepted only once", async ({ page }) => {
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

test("@r5-visual stage submission waits for the training attempt while the patient service is preparing", async ({ page }, testInfo) => {
  const observations = [];
  await routeTrainingApiThroughHandler(page, observations, { initAttemptDelayMs: 800, sessionInitDelayMs: 5000 });
  await page.goto("/cases/P001/");

  await expect(page.getByTestId("stage-preparing-state")).toHaveText("正在准备…");
  await expect(page.getByTestId("resource-status-notice")).toHaveAttribute("data-state", "recovering");
  await expect(page.getByTestId("resource-status-notice")).toHaveClass(/bg-sky-50/);
  if (testInfo.project.name === "desktop-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectStableScreenshot(page, "runtime-preparing-390x844.png");
  }
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  await expect(page.getByText("正在准备问诊……", { exact: true })).toBeVisible();
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
  await expect(page.locator(".workbench-connection")).toContainText("正在准备问诊");
  await expect(page.getByTestId("patient-service-status")).toHaveCount(0);
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

test("failed training attempt initialization coalesces ten rapid prepare clicks", async ({ page }) => {
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

  await retry.evaluate((button) => { for (let index = 0; index < 10; index += 1) button.click(); });
  const submit = page.getByRole("button", { name: "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  expect(observations.filter((item) => item.action === "init-attempt")).toHaveLength(2);
  await submit.click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  expect(observations.filter((item) => item.action === "stage-feedback")).toHaveLength(1);
});

test("random case uses the durable desktop bridge, autosaves, submits, and restores", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop bridge contract is captured once.");
  const observations = [];
  await routeDesktopDurableBridge(page, observations);
  await page.goto("/cases/P001/?mode=random");

  const submit = page.getByTestId("submit-stage");
  await expect(submit).toBeEnabled();
  expect(observations.filter((item) => item.endpoint === "attempt-resume")).toEqual([
    expect.objectContaining({ mode: "free", status: 404 })
  ]);
  expect(observations).toContainEqual(expect.objectContaining({ endpoint: "training-action", action: "init-attempt", status: 200 }));

  const summary = page.getByTestId("history-summary");
  await summary.fill("Durable random-case bridge marker.");
  await expect.poll(() => observations.filter((item) => item.endpoint === "attempt-save").length).toBeGreaterThan(0);
  await submit.click();
  await expect(page.getByTestId("next-stage")).toBeEnabled();
  expect(observations).toContainEqual(expect.objectContaining({ endpoint: "training-action", action: "stage-feedback", status: 200 }));

  await page.reload();
  await expect(page.getByTestId("history-summary")).toHaveValue("Durable random-case bridge marker.");
  expect(observations).toContainEqual(expect.objectContaining({ endpoint: "attempt-load", status: 200, mode: "free" }));
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

test("@r5-visual @ui-state-regression initialization, failure, and submitted actions are mutually exclusive", async ({ page }, testInfo) => {
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
  await expectStableScreenshot(page, "runtime-failure-390x844.png");
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-recovery-390x844.png");

  await retry.click();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "请先完成", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交本阶段", exact: true })).toHaveCount(0);
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);

  await expectStableScreenshot(page, "runtime-recovered-390x844.png");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByTestId("confirm-language-switch").click();
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
  const untranslatedOrders = page.getByText("Order name unavailable in English", { exact: true });
  await expect(untranslatedOrders.first()).toBeVisible();
  await expect(untranslatedOrders.first().locator("xpath=ancestor::label[1]").getByRole("checkbox")).toBeDisabled();

  await page.getByPlaceholder("Example: urinalysis and sediment, CTU, cystoscopy").fill("CBC");
  await page.getByRole("button", { name: "Order and return results", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(0);
  const unavailable = page.getByText("CBC: this case currently has no result available to display for this examination.", { exact: true });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).not.toContainText(/[\u3400-\u9fff]/u);
  expect(observations.filter((item) => item.action === "order")).toEqual([
    expect.objectContaining({ status: 200, tokenPresent: true })
  ]);
});

test("unavailable CBC remains excluded without exposing internal review state", async ({ page }) => {
  await routeTrainingApiThroughHandler(page, []);
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");

  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("血常规");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await expect(page.getByTestId("report-card")).toHaveCount(0);
  await expect(page.getByText("暂无可显示结果", { exact: true })).toBeVisible();
  await expect(page.getByText("血常规：本病例当前无可提供的该项检查结果。", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/等待医学审核|待审核|source|provenance|diagnosticEligible|scoringEligible/u);
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
  await expect(reports.nth(1)).toContainText("No configured result is available.");
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

test("@r5-historical browser back and forward preserve case routing without stale content", async ({ page }) => {
  await page.goto("/cases/");
  await page.locator('a[data-case-id="P001"]').click();
  await expect(page).toHaveURL(/\/cases\/P001\/?$/);
  await expect(page.getByTestId("stage-heading")).toContainText(/病史采集|History taking/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cases\/?$/);
  await expect(page.locator('a[data-case-id="P001"]')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/cases\/P001\/?$/);
  await expect(page.getByTestId("stage-heading")).toContainText(/病史采集|History taking/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("case catalog search has a recoverable empty state", async ({ page }) => {
  await page.goto("/cases/");
  const search = page.getByRole("textbox", { name: "按病例编号搜索" });
  await search.fill("NO-SUCH-CASE");
  await expect(page.getByRole("heading", { name: "没有匹配的病例编号", exact: true })).toBeVisible();
  await expect(page.getByText("0 / 42", { exact: true })).toBeVisible();
  await search.fill("");
  const cards = page.locator("a[data-case-id]");
  await expect(cards).toHaveCount(42);
  await expect(page.locator('a[data-case-id="P001"]')).toBeVisible();
  expect((await cards.allTextContents()).join(" ")).not.toMatch(/主诉|病程|肉眼血尿|尿液发红|无痛|腰痛|发热|尿频|尿急|尿痛|诊断|检查结果|标准答案/);
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

test("@r5-historical stage transitions and refresh restore the active task at the top", async ({ page }) => {
  await routeTrainingApiThroughHandler(page, []);
  await page.setViewportSize({ width: 1093, height: 614 });
  await page.goto("/cases/P001/");
  await enterInvestigationStage(page, "zh");

  const main = page.locator(".workbench-main");
  await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.locator(".workbench-sidebar button").first().click();
  await expect(page.getByTestId("stage-heading")).toHaveText("病史采集");
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);

  await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await expect(page.getByTestId("stage-heading")).toHaveText("检查与开单");
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);

  await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
  await page.reload();
  await expect(page.getByTestId("stage-heading")).toHaveText("检查与开单");
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
});

test("@r5-visual @r5-historical interview composer and desktop workbench fit target Windows viewports and 125 percent scaling", async ({ page }, testInfo) => {
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
      await expect(page.getByTestId("stage-heading")).toContainText(language === "en" ? "History taking" : "病史采集");
      await expect(page.getByText(language === "en" ? "Continue asking the patient." : "继续向患者提问，完成本阶段病史采集。", { exact: true })).toBeVisible();
      await expect(opening).toBeVisible();
      await expect(input).toBeVisible();
      await expect.poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.ceil(box.y + box.height) : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(viewport.height);
      const [openingBox, composerBox, actionsBox, layout] = await Promise.all([
        opening.boundingBox(),
        composer.boundingBox(),
        page.locator(".workbench-actions").boundingBox(),
        page.evaluate(() => {
          const composerElement = document.querySelector('[data-testid="chat-composer"]');
          return {
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
      expect(actionsBox).toBeTruthy();
      expect(composerBox.y, `${viewport.width}x${viewport.height}/${language}`).toBeGreaterThanOrEqual(openingBox.y + openingBox.height);
      expect(Math.ceil(composerBox.y + composerBox.height)).toBeLessThanOrEqual(viewport.height);
      expect(Math.ceil(composerBox.y + composerBox.height), `${viewport.width}x${viewport.height}/${language}`).toBeLessThanOrEqual(Math.ceil(actionsBox.y));
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
      if (viewport.width === 1093) {
        const navItems = page.getByTestId("stage-navigation-item");
        await expect(navItems).toHaveCount(7);
        const heights = await navItems.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
        expect(Math.max(...heights) - Math.min(...heights), language).toBeLessThanOrEqual(1);
        await expect(navItems.first().locator(".stage-navigation-description")).toBeHidden();
      }
      if (language === "zh" && (viewport.width === 390 || viewport.width === 1440)) {
        await expectStableScreenshot(page, `stage1-initial-${viewport.width}x${viewport.height}.png`);
        await captureDefectScreenshot(page, process.env.UI_ROUND2_SCREENSHOT_DIR || "", `stage1-task-focus-${viewport.width}x${viewport.height}.png`);
      }
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

test("@r5-visual @ui-defect-regression P001 Chinese seven-stage contract keeps public labels and coherent actions", async ({ page }, testInfo) => {
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
  await expectStableScreenshot(page, "stage1-multiturn-1093x614.png");
  await submitFirstStage(page, "zh");
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByRole("button", { name: "直肠指检/前列腺", exact: true }).click();
  await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("尿常规；血常规");
  await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
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
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  expect(observations.find((item) => item.action === "stage-feedback" && item.stageKey === "diagnosis")?.submittedEvidenceIds).toHaveLength(2);
  expect(observations.find((item) => item.action === "stage-feedback" && item.stageKey === "diagnosis")?.submittedEvidenceIds.every((id) => /^EV-/.test(id))).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByLabel("暂不需要会诊").check();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
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
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入下一阶段", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("textbox", { name: "学习反思" }).fill("本次训练需要继续改进问诊顺序、证据整合和医嘱表达。");
  await page.getByTestId("complete-training").click();
  const reportSummary = page.getByTestId("final-report-summary");
  await expect(reportSummary).toBeVisible();
  await expect(reportSummary.getByRole("heading", { name: "训练已完成", exact: true })).toBeFocused();
  await expect(reportSummary.getByTestId("final-percentage-score")).toBeInViewport();
  await expect(reportSummary.getByRole("link", { name: "查看完整报告", exact: true })).toBeVisible();
  await expect(page.getByTestId("final-report")).toBeVisible();
  const generatedTrajectory = page.getByTestId("clinical-trajectory");
  await expect(generatedTrajectory).toContainText(/诊断结论|治疗计划|围术期管理/);
  await expect(generatedTrajectory).not.toContainText(/(^|\n)\s*(diagnosis|department|trigger|question|evidence|consult|treatment|perioperative)\s*([:=]|$)/m);
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await expectStudentCopyPublic(page);
  await expect(page.getByTestId("training-complete-state")).toContainText("已完成");
  await expect(page.getByRole("heading", { name: "时间线", exact: true })).toHaveCount(1);
  await expect(page.getByText("训练会话尚未就绪", { exact: true })).toHaveCount(0);
  await expectStableScreenshot(page, "stage7-percentage-summary-1366x768.png");
  await captureDefectScreenshot(page, screenshotDir, "p001-zh-stage7-1366x768.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureDefectScreenshot(page, process.env.UI_ROUND2_SCREENSHOT_DIR || "", "stage7-report-summary-1440x900.png");
  await page.reload();
  await expect(page.getByTestId("final-report-summary")).toBeVisible();
  await expectStableScreenshot(page, "close-reopen-restored-1440x900.png");
  await expect(page.getByTestId("final-report-summary").getByRole("heading", { name: "训练已完成", exact: true })).toBeFocused();
  await expect(page.getByTestId("final-percentage-score")).toBeInViewport();
  await expect(page.getByTestId("final-report")).toBeVisible();
  const recoveredTrajectory = page.getByTestId("clinical-trajectory");
  await expect(recoveredTrajectory).toContainText(/诊断结论|治疗计划|围术期管理/);
  await expect(recoveredTrajectory).not.toContainText(/(^|\n)\s*(diagnosis|department|trigger|question|evidence|consult|treatment|perioperative)\s*([:=]|$)/m);
  await page.emulateMedia({ media: "print" });
  await expect(recoveredTrajectory).not.toContainText(/(^|\n)\s*(diagnosis|department|trigger|question|evidence|consult|treatment|perioperative)\s*([:=]|$)/m);
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByTestId("training-complete-state")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/360分|\b360\b/);
  await expectStudentCopyPublic(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});

test("@ui-defect-regression desktop legacy cache cannot create or restore an attempt in a fresh SQLite authority", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop authority is captured once.");
  const oldAttemptId = "legacy-completed-p001";
  const stateStoreId = "22222222-2222-4222-8222-222222222222";
  const savedAttemptIds = [];
  await page.addInitScript(({ oldAttemptId }) => {
    globalThis.__HEMATURIA_DESKTOP_RUNTIME__ = {
      runtimeTarget: "desktop",
      apiBaseUrl: "http://127.0.0.1:15555",
      authToken: "playwright_desktop_runtime_token_12345678901234567890",
      debugRuntime: false
    };
    const attempt = {
      attemptId: oldAttemptId, caseId: "P001", mode: "free", language: "zh",
      participantId: "practice-user", schemaVersion: "attempt-v3", createdAt: "2026-07-30T18:35:28.465Z"
    };
    localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:zh", JSON.stringify(attempt));
    localStorage.setItem(`hematuria-attempt-v3:P001:free:zh:${oldAttemptId}`, JSON.stringify({ attempt, activeStageNo: 7, finalReport: { total: 360, max: 360 } }));
    localStorage.setItem("hematuria-practice-attempt-summaries-v2", JSON.stringify([{ attemptId: oldAttemptId, caseId: "P001" }]));
    sessionStorage.setItem(`hematuria-training-state-v4:http%3A%2F%2F127.0.0.1%3A15555:${oldAttemptId}`, "legacy-token");
  }, { oldAttemptId });
  await routeTrainingApiThroughHandler(page);
  const authority = { stateStoreId, schemaVersion: 3, productHead: "r3-product-head", serverStateRevision: 0 };
  await page.route("**/api/desktop/state/bootstrap", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authority) }));
  await page.route("**/api/desktop/attempt/resume", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "attempt_not_found" }) }));
  await page.route("**/api/desktop/attempt/state", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "load") {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "attempt_not_found" }) });
      return;
    }
    savedAttemptIds.push(body.attemptId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...authority, serverStateRevision: 1, saved: true }) });
  });

  await page.goto("/cases/P001/");
  await expect(page.getByText(/^第1阶段 · /).first()).toBeVisible();
  await expect(page.getByTestId("final-report")).toHaveCount(0);
  await expect.poll(() => savedAttemptIds.length).toBeGreaterThan(0);
  expect(savedAttemptIds).not.toContain(oldAttemptId);
  const remainingTrainingKeys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) => /attempt-v3|attempt-pointer|training-state|ai-patient-session|attempt-summaries/.test(key)));
  expect(remainingTrainingKeys).toEqual([]);
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
  await expect(page.locator("body")).not.toContainText(/\b360\b/);
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await page.getByRole("button", { name: "Submit stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b360\b/);
  await page.getByRole("button", { name: "Next stage", exact: true }).click();

  await expect(page.getByText("History: Smoking history — obtained", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("History: Onset — obtained", { exact: true }).first()).toBeVisible();
  await expectStudentCopyPublic(page);
  await fillDiagnosisBuilder(page, "en");
  await page.getByRole("button", { name: "Submit stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next stage", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b360\b/);
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
      modelValidation: "not_checked", configuredMode: "lightweight", effectiveMode: "lightweight",
      modelAvailability: { lightweight: false, standard: false }, version: 1
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
  await mockTrainingState(page);
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
  await mockTrainingState(page);
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
  await expect(page.getByText("首选播放方式暂不可用，已自动切换到可用方式。")).toBeVisible();
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
  const chineseSessionAfterRefresh = page.waitForResponse((response) => {
    if (!response.url().includes("/api/session/init/")) return false;
    return response.request().postDataJSON()?.language === "zh";
  });
  await page.getByRole("button", { name: "中文" }).click();
  await page.getByTestId("confirm-language-switch").click();
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

test("@ui-patient-reply-safety persisted internal patient protocol is not restored through messages or timeline", async ({ page }) => {
  const attemptId = "patient-protocol-hydration";
  await page.addInitScript(({ seededAttemptId }) => {
    const attempt = {
      attemptId: seededAttemptId,
      caseId: "P001",
      mode: "free",
      language: "zh",
      participantId: "practice-user",
      schemaVersion: "attempt-v3",
      createdAt: "2026-08-10T00:00:00.000Z"
    };
    const leaked = '{"currentAllowedAnswer":"之前没有做过检查。"}';
    const internalRoleText = "持久化内部助手回答。";
    localStorage.setItem("hematuria-language", "zh");
    localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:zh", JSON.stringify(attempt));
    localStorage.setItem(`hematuria-attempt-v3:P001:free:zh:${seededAttemptId}`, JSON.stringify({
      attempt,
      activeStageNo: 1,
      messages: [
        { role: "patient", text: "医生您好。" },
        { role: "student", text: "之前做过检查吗？" },
        { role: "patient", text: leaked },
        { role: "patient", text: { currentAllowedAnswer: "之前没有做过检查。" } },
        { role: "assistant", text: internalRoleText }
      ],
      timeline: [
        { id: "ask-1", stageNo: 1, type: "ask", label: "学生问", detail: "之前做过检查吗？", at: "2026-08-10T00:00:01.000Z" },
        { id: "answer-1", stageNo: 1, type: "answer", label: "患者答", detail: leaked, at: "2026-08-10T00:00:02.000Z" },
        { id: "assistant-1", stageNo: 1, type: "assistant", label: "内部助手", detail: internalRoleText, at: "2026-08-10T00:00:03.000Z" }
      ]
    }));
  }, { seededAttemptId: attemptId });
  await routeTrainingApiThroughHandler(page);

  await page.goto("/cases/P001/");
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("之前做过检查吗？", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("currentAllowedAnswer");
  await expect(page.locator("body")).not.toContainText("之前没有做过检查。");
  await expect(page.locator("body")).not.toContainText("持久化内部助手回答。");
});

test("@ui-patient-reply-safety grounded compound patient reply is not replaced by the single-topic UI guard", async ({ page }) => {
  await routeTrainingApiThroughHandler(page);
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    const payload = request.probe
      ? { replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }
      : {
          replyText: "有高血压。没有糖尿病。我长期服用缬沙坦、阿司匹林。",
          matchedSlotIds: ["PAST_HYPERTENSION", "MED_ALL", "PAST_DIABETES"],
          matchedFacts: ["hypertension_history", "medication_name", "diabetes_history", "medication_list"],
          provider: "local-test",
          generationSource: "local_ai",
          isFallback: false
        };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("有没有高血压、糖尿病，平时吃什么药？");
  await page.getByRole("button", { name: "发送", exact: true }).click();

  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("有高血压。没有糖尿病。我长期服用缬沙坦、阿司匹林。", { exact: true })).toBeVisible();
  await expect(conversation.getByText("医生，您能问得再具体一点吗？我不太明白您的意思。", { exact: true })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
    const saved = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    const message = saved?.messages?.findLast?.((item) => item.role === "patient" && item.text.includes("缬沙坦"));
    return message ? { matchedSlots: message.matchedSlots, matchedFacts: message.matchedFacts } : null;
  })).toEqual({
    matchedSlots: ["PAST_HYPERTENSION", "MED_ALL", "PAST_DIABETES"],
    matchedFacts: ["hypertension_history", "medication_name", "diabetes_history", "medication_list"]
  });
});

test("@ui-patient-reply-safety JSON provider reply falls closed without collecting public metadata", async ({ page }) => {
  await routeTrainingApiThroughHandler(page);
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    const payload = request.probe
      ? { replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "local-test", isFallback: false }
      : {
          replyText: '{"currentAllowedAnswer":"我吸烟，每天一包。"}',
          matchedSlotIds: ["smoking"],
          matchedFacts: ["smoking_history"],
          provider: "local-test",
          generationSource: "local_ai",
          isFallback: false
        };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("抽烟吗？");
  await page.getByRole("button", { name: "发送", exact: true }).click();

  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("医生，您能问得再具体一点吗？我不太明白您的意思。", { exact: true })).toBeVisible();
  await expect(conversation).not.toContainText("currentAllowedAnswer");
  await expect(conversation).not.toContainText("我吸烟，每天一包。");
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
    const saved = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return saved ? { askedSlots: saved.askedSlots, smoking: saved.collected?.smoking } : null;
  })).toEqual({ askedSlots: [], smoking: false });
});

test("@ui-patient-reply-safety recovered grounded compound patient reply uses the same scope-aware guard", async ({ page }) => {
  await mockTrainingState(page);
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    const request = route.request().postDataJSON();
    const sessionId = request.forceRefresh ? "compound-session-recovered" : "compound-session-initial";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId, caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    if (request.probe) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }) });
    const recovered = request.sessionId === "compound-session-recovered";
    const payload = recovered
      ? { replyText: "有高血压。没有糖尿病。我长期服用缬沙坦、阿司匹林。", matchedSlotIds: ["PAST_HYPERTENSION", "MED_ALL", "PAST_DIABETES"], matchedFacts: ["hypertension_history", "medication_name", "diabetes_history", "medication_list"], provider: "local-test", generationSource: "local_ai", isFallback: false }
      : { replyText: "这次回答暂时没有生成。", matchedSlotIds: [], matchedFacts: [], provider: "rule", generationSource: "rule_fallback", isFallback: true, fallbackReason: "provider_timeout" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("有没有高血压、糖尿病，平时吃什么药？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("问诊辅助暂时不可用，仍可安全继续并稍后重试。")).toBeVisible();
  await page.getByRole("button", { name: "重新连接", exact: true }).click();

  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("有高血压。没有糖尿病。我长期服用缬沙坦、阿司匹林。", { exact: true })).toBeVisible();
  await expect(conversation.getByText("医生，您能问得再具体一点吗？我不太明白您的意思。", { exact: true })).toHaveCount(0);
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
  await expect(page.getByText("问诊辅助暂时不可用，仍可安全继续并稍后重试。")).toBeVisible();
  const reconnect = page.getByRole("button", { name: "重新连接", exact: true });
  expect(await reconnect.count()).toBe(1);
  await reconnect.evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByTestId("patient-service-status")).toHaveText("问诊对话可用");
  await expect(page.getByText("问诊辅助暂时不可用，仍可安全继续并稍后重试。")).toHaveCount(0);
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

test("offline transition sends no request and resumes locally after the online event", async ({ page, context }) => {
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
  await expect(page.getByTestId("resource-status-notice")).toHaveAttribute("data-state", "unavailable");
  await expect(page.getByTestId("resource-status-notice")).toHaveClass(/bg-amber-50/);
  await expect(page.getByTestId("patient-service-status")).toHaveCount(0);
  const before = healthCalls;
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  expect(healthCalls).toBe(before);
  await context.setOffline(false);
  await expect(page.getByText("网络已恢复，可以继续问诊。")).toBeVisible();
  await expect(page.getByTestId("resource-status-notice")).toHaveAttribute("data-state", "recovered");
  await expect(page.getByTestId("resource-status-notice")).toHaveClass(/bg-emerald-50/);
  await expect(page.getByTestId("resource-status-notice")).not.toHaveClass(/bg-amber-50/);
  await expect(page.getByTestId("patient-service-status")).toHaveText("问诊对话可用");
  expect(healthCalls).toBe(before);
  expect(sessionCalls).toBe(1);
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
