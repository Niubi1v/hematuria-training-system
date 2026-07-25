import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "10000";

const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");

const ROOT = path.resolve("artifacts/exploratory-qa");
const CASE_ROUTES = JSON.parse(await readFile(path.resolve("data/cases_public.json"), "utf8"))
  .map(({ id, displayCaseId }) => ({ routeId: id, displayCaseId }));
const ORDER_RESULTS = JSON.parse(await readFile(path.resolve("data/order_results_structured.json"), "utf8"));
const DIRS = {
  screenshots: path.join(ROOT, "screenshots"),
  traces: path.join(ROOT, "traces"),
  videos: path.join(ROOT, "videos"),
  reports: path.join(ROOT, "reports"),
  transcripts: path.join(ROOT, "transcripts"),
  tempVideos: path.join(ROOT, ".video-tmp")
};

const viewportSlug = (testInfo) => testInfo.project.name.replace(/^qa-/, "");
const safeSlug = (value) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const redact = (value) => String(value)
  .replace(/(authorization|cookie|set-cookie|x-training-state|api[-_ ]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
  .replace(/\b(?:bearer\s+)?[a-z0-9_-]{32,}\b/gi, "[REDACTED]");

async function ensureDirs() {
  await Promise.all(Object.values(DIRS).map((dir) => mkdir(dir, { recursive: true })));
}

async function invokeLocalTrainingAction(body, token = "", remoteAddress = "qa-local-training-action") {
  let statusCode = 200;
  let payload = {};
  const responseHeaders = {};
  const req = {
    method: "POST",
    body: {
      ...body,
      requestId: body.requestId || `qa-ui-${body.action}-${body.caseId}-${String(body.attemptId || "attempt").slice(-24)}`
    },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress }
  };
  const res = {
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = String(value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await trainingHandler(req, res);
  return {
    statusCode,
    payload,
    token: responseHeaders["x-training-state"] || token
  };
}

async function createCompletedAttemptSeed(caseId, language, attemptId) {
  resetMemoryAttemptStore();
  const attempt = {
    attemptId,
    caseId,
    mode: "free",
    language,
    participantId: "practice-user",
    schemaVersion: "attempt-v3",
    createdAt: "2026-07-25T00:00:00.000Z"
  };
  let token = "";
  const initialized = await invokeLocalTrainingAction({
    action: "init-attempt",
    caseId,
    attemptId,
    language,
    mode: "free",
    requestId: `${attemptId}-init`
  }, token, `${attemptId}-seed`);
  if (initialized.statusCode !== 200) throw new Error(`QA completed-attempt seed init failed: ${initialized.statusCode}`);
  token = initialized.token;
  const submitted = {};
  const stageKeys = ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"];
  for (let index = 0; index < stageKeys.length; index += 1) {
    const stageKey = stageKeys[index];
    const response = await invokeLocalTrainingAction({
      action: "stage-feedback",
      caseId,
      attemptId,
      language,
      mode: "free",
      stageKey,
      submission: {},
      requestId: `${attemptId}-stage-${index + 1}`
    }, token, `${attemptId}-seed`);
    if (response.statusCode !== 200) throw new Error(`QA completed-attempt seed stage ${stageKey} failed: ${response.statusCode}`);
    token = response.token;
    submitted[index + 1] = response.payload;
  }
  const scored = await invokeLocalTrainingAction({
    action: "score",
    caseId,
    attemptId,
    language,
    mode: "free",
    requestId: `${attemptId}-score`
  }, token, `${attemptId}-seed`);
  if (scored.statusCode !== 200) throw new Error(`QA completed-attempt seed score failed: ${scored.statusCode}`);
  return {
    attempt,
    token: scored.token,
    savedState: {
      attempt,
      activeStageNo: 7,
      submitted,
      finalReport: scored.payload,
      messages: [],
      askedSlots: [],
      examLogs: [],
      orderLogs: [],
      mdtOpinions: [],
      timeline: [],
      pendingHistoryLogs: []
    }
  };
}

async function installProductionTrainingApi(page, observations = [], actionObservations = [], {
  resetStore = true,
  serverTokens = new Map(),
  requestIds = new Set(),
  pageLabel = "primary"
} = {}) {
  if (resetStore) resetMemoryAttemptStore();
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      patientServiceConfigured: true,
      trainingStateConfigured: true,
      durableAttemptStoreConfigured: true,
      deploymentTier: "practice",
      apiVersion: "qa-production-handler"
    })
  }));
  await page.route("**/api/session/init/**", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `qa-data-stage-${body.attemptId}`,
        caseId: body.caseId,
        language: body.language,
        mode: body.runtimeMode || "free",
        patientOpeningStatement: body.language === "en" ? "Hello doctor." : "您好，医生。",
        sessionCreatedAt: "2026-07-24T00:00:00.000Z",
        sessionExpiresAt: "2026-07-24T01:00:00.000Z",
        deploymentSha: "local-production-handler",
        apiVersion: "qa-production-handler",
        aiStatus: "available",
        profileSource: "local-simulation",
        cacheHit: false
      })
    });
  });
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "",
      matchedSlotIds: [],
      matchedFacts: [],
      provider: "fixture",
      generationSource: "fixture",
      isFallback: false
    })
  }));
  await page.route("**/api/training-action/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const attemptId = String(body.attemptId || "unscoped");
    const browserToken = request.headers()["x-training-state"] || "";
    const serverToken = body.action === "init-attempt" && !browserToken
      ? ""
      : serverTokens.get(attemptId) || (browserToken === "qa-redacted-training-state" ? "" : browserToken);
    const result = await invokeLocalTrainingAction(
      body,
      serverToken,
      `qa-production-handler-ui-${attemptId}`
    );
    if (result.token) serverTokens.set(attemptId, result.token);
    const requestId = String(body.requestId || "");
    const requestIdDuplicate = requestId ? requestIds.has(requestId) : false;
    if (requestId) requestIds.add(requestId);
    actionObservations.push({
      pageLabel,
      action: String(body.action || ""),
      stageKey: String(body.stageKey || ""),
      requestIdPresent: Boolean(body.requestId),
      requestIdDuplicate,
      status: result.statusCode,
      error: String(result.payload?.error || "")
    });
    if (body.action === "order") {
      observations.push({
        action: "order",
        status: result.statusCode,
        recognizedOrderCount: Number(result.payload?.recognizedOrderCount || 0),
        returnedReportCount: Number(result.payload?.returnedReportCount || 0),
        duplicateOrderCount: (result.payload?.duplicateOrderIds || []).length,
        unmetPrerequisiteCount: (result.payload?.unmetPrerequisites || []).length
      });
    }
    await route.fulfill({
      status: result.statusCode,
      contentType: "application/json",
      headers: {
        "Access-Control-Expose-Headers": "X-Training-State",
        "X-Training-State": "qa-redacted-training-state"
      },
      body: JSON.stringify(result.payload)
    });
  });
}

async function withEvidence(browser, testInfo, scenario, run, {
  videoOnFailure = true,
  traceScreenshots = true,
  traceSnapshots = true
} = {}) {
  await ensureDirs();
  const viewport = testInfo.project.use.viewport;
  const slug = `${safeSlug(scenario)}-${viewportSlug(testInfo)}`;
  const videoDir = path.join(DIRS.tempVideos, slug);
  const context = await browser.newContext({
    viewport,
    isMobile: Boolean(testInfo.project.use.isMobile),
    hasTouch: Boolean(testInfo.project.use.hasTouch),
    recordVideo: videoOnFailure ? { dir: videoDir, size: viewport } : undefined
  });
  const page = await context.newPage();
  const consoleEvents = [];
  const networkEvents = [];
  const requestStart = new Map();
  let failed = false;

  page.on("console", (message) => consoleEvents.push({
    at: new Date().toISOString(),
    type: message.type(),
    text: redact(message.text()).slice(0, 2000)
  }));
  page.on("request", (request) => requestStart.set(request, Date.now()));
  page.on("requestfailed", (request) => networkEvents.push({
    method: request.method(),
    path: new URL(request.url()).pathname,
    status: "FAILED",
    durationMs: Date.now() - (requestStart.get(request) ?? Date.now()),
    failure: redact(request.failure()?.errorText ?? "unknown")
  }));
  page.on("response", (response) => {
    const request = response.request();
    networkEvents.push({
      method: request.method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      durationMs: Date.now() - (requestStart.get(request) ?? Date.now()),
      resourceType: request.resourceType()
    });
  });

  await context.tracing.start({ screenshots: traceScreenshots, snapshots: traceSnapshots, sources: false });
  try {
    await run({ context, page, slug, consoleEvents, networkEvents });
  } catch (error) {
    failed = true;
    const failurePath = path.join(DIRS.screenshots, `${slug}-failure.png`);
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    const tracePath = path.join(DIRS.traces, `${slug}.zip`);
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await writeFile(path.join(DIRS.reports, `${slug}-console.json`), JSON.stringify(consoleEvents, null, 2), "utf8");
    await writeFile(path.join(DIRS.reports, `${slug}-network.json`), JSON.stringify(networkEvents, null, 2), "utf8");
    const video = page.video();
    await context.close();
    if (videoOnFailure && failed && video) {
      await video.saveAs(path.join(DIRS.videos, `${slug}.webm`)).catch(() => {});
    }
    await rm(videoDir, { recursive: true, force: true }).catch(() => {});
  }
}

function observeAdditionalPage(page, label, consoleEvents, networkEvents) {
  const requestStart = new Map();
  page.on("console", (message) => consoleEvents.push({
    at: new Date().toISOString(),
    page: label,
    type: message.type(),
    text: redact(message.text()).slice(0, 2000)
  }));
  page.on("request", (request) => requestStart.set(request, Date.now()));
  page.on("requestfailed", (request) => networkEvents.push({
    page: label,
    method: request.method(),
    path: new URL(request.url()).pathname,
    status: "FAILED",
    durationMs: Date.now() - (requestStart.get(request) ?? Date.now()),
    failure: redact(request.failure()?.errorText ?? "unknown")
  }));
  page.on("response", (response) => {
    const request = response.request();
    networkEvents.push({
      page: label,
      method: request.method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      durationMs: Date.now() - (requestStart.get(request) ?? Date.now()),
      resourceType: request.resourceType()
    });
  });
}

async function saveShot(page, testInfo, name, fullPage = true) {
  const target = path.join(DIRS.screenshots, `${safeSlug(name)}-${viewportSlug(testInfo)}.png`);
  await page.screenshot({ path: target, fullPage, animations: "disabled" });
  await testInfo.attach(path.basename(target), { path: target, contentType: "image/png" });
}

async function installDeterministicApi(page, transcript) {
  let patientCalls = 0;
  let historyCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, deploymentTier: "practice", apiVersion: "qa-fixture" })
  }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessionId: "qa-fixture-session",
      caseId: "P001",
      language: "zh",
      mode: "free",
      patientOpeningStatement: "您好，医生。",
      sessionCreatedAt: "2026-07-13T00:00:00.000Z",
      sessionExpiresAt: "2026-07-13T01:00:00.000Z",
      deploymentSha: "fixture-only",
      apiVersion: "qa-fixture",
      aiStatus: "available",
      profileSource: "local-simulation",
      cacheHit: false
    })
  }));
  await page.route("**/api/agent-chat/**", (route) => {
    const body = route.request().postDataJSON();
    if (body?.probe) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "fixture", generationSource: "fixture", isFallback: false }) });
    }
    patientCalls += 1;
    const replyText = `这是脱敏的固定患者回答 ${patientCalls}。`;
    transcript.push({ turn: patientCalls, question: redact(body?.message ?? body?.question ?? "[UI question]"), answer: replyText, source: "fixture" });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ replyText, matchedSlotIds: [`qa_slot_${patientCalls}`], matchedFacts: [], provider: "fixture", generationSource: "fixture", isFallback: false })
    });
  });
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "history-log") historyCalls += 1;
    const payload = body?.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body?.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": "fixture-state" }, body: JSON.stringify(payload) });
  });
  return { counts: () => ({ patientCalls, historyCalls }) };
}

function fixtureStageEvaluation(stageKey) {
  return {
    stageKey,
    max: 50,
    score: 30,
    hits: ["QA fixture event recorded"],
    misses: ["QA fixture omission retained for feedback rendering"],
    warnings: [],
    standardAnswer: "QA fixture reference only; this is not a medical conclusion.",
    comment: `QA fixture stage ${stageKey} recorded.`,
    practiceOnly: true
  };
}

function fixtureFinalReport() {
  const dimensions = [
    ["病史采集与血尿定位", 50, 32],
    ["危险因素和安全网", 40, 25],
    ["查体与急症识别", 35, 20],
    ["诊断与鉴别诊断", 45, 28],
    ["检验、影像、内镜及病理决策", 55, 34],
    ["MDT与会诊", 45, 25],
    ["治疗及围术期管理", 50, 30],
    ["随访、教育和表达效率", 40, 26]
  ];
  return {
    total: 220,
    max: 360,
    items: dimensions.map(([label, max, score]) => ({
      label,
      max,
      score,
      evidence: ["QA fixture evidence"],
      misses: ["QA fixture improvement item"],
      sequenceIssues: [],
      overuse: [],
      criticalErrors: [],
      improvements: ["Continue structured practice"],
      comment: "Deterministic QA fixture score; not a medical assessment."
    })),
    redFlags: [],
    ragGuardrails: ["QA fixture safety reminder; no medical fact was adjudicated."],
    scoringVersion: "qa-fixture",
    caseVersion: "qa-fixture",
    generatedAt: "2026-07-14T00:00:00.000Z",
    reportVersion: 1,
    calculation: "deterministic_fixture_not_real_scoring"
  };
}

async function installFullWorkflowApi(page, { stageFeedbackDelayMs = 0 } = {}) {
  const stageRequestIds = new Set();
  const calls = {
    exam: 0,
    order: 0,
    score: 0,
    stageFeedback: 0,
    stageKeys: [],
    languages: [],
    uniqueStageRequestIds: 0
  };
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, deploymentTier: "practice", apiVersion: "qa-fixture" })
  }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessionId: "qa-seven-stage-session",
      caseId: "P001",
      language: "zh",
      mode: "free",
      patientOpeningStatement: "您好，医生。",
      sessionCreatedAt: "2026-07-14T00:00:00.000Z",
      sessionExpiresAt: "2026-07-14T01:00:00.000Z",
      deploymentSha: "fixture-only",
      apiVersion: "qa-fixture",
      aiStatus: "available",
      profileSource: "local-simulation",
      cacheHit: false
    })
  }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "fixture", generationSource: "fixture", isFallback: false })
  }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    calls.languages.push(body?.language);
    let payload;
    if (body?.action === "init-attempt") {
      payload = { attemptId: body.attemptId, practiceOnly: true };
    } else if (body?.action === "exam") {
      calls.exam += 1;
      payload = {
        input: body.input,
        result: "QA fixture: vital signs and targeted physical examination returned.",
        at: "2026-07-14T00:01:00.000Z",
        examId: "QA-EXAM-001"
      };
    } else if (body?.action === "order") {
      calls.order += 1;
      const reports = [
        ["LAB-QA-001", "检验", "QA fixture urinalysis report"],
        ["IMG-QA-001", "检查", "QA fixture imaging report"],
        ["END-QA-001", "内镜", "QA fixture endoscopy report"],
        ["PAT-QA-001", "病理/操作", "QA fixture pathology report"]
      ];
      payload = {
        id: "qa-order-log-001",
        input: body.input,
        matched: true,
        matchedOrders: reports.map(([orderId, displayName]) => ({ orderId, displayName })),
        results: reports.map(([orderId, orderCategory, result]) => ({
          caseId: "P001",
          orderId,
          status: "normal",
          orderCategory,
          result,
          abnormalLevel: "normal",
          teachingExplanation: "QA fixture report; not a medical result."
        })),
        message: "QA fixture reports returned.",
        at: "2026-07-14T00:02:00.000Z",
        placedAt: "2026-07-14T00:02:00.000Z",
        stageNo: 2,
        status: "reported"
      };
    } else if (body?.action === "stage-feedback") {
      calls.stageFeedback += 1;
      calls.stageKeys.push(body.stageKey);
      stageRequestIds.add(body.requestId);
      calls.uniqueStageRequestIds = stageRequestIds.size;
      if (stageFeedbackDelayMs) await new Promise((resolve) => setTimeout(resolve, stageFeedbackDelayMs));
      payload = fixtureStageEvaluation(body.stageKey);
    } else if (body?.action === "score") {
      calls.score += 1;
      payload = fixtureFinalReport();
    } else if (body?.action === "mdt") {
      payload = [];
    } else {
      payload = { recorded: true, requestId: body?.requestId };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Training-State": "qa-fixture-state" },
      body: JSON.stringify(payload)
    });
  });
  return { counts: () => structuredClone(calls) };
}

test("visual baseline captures public pages in every required viewport", async ({ browser }, testInfo) => {
  await withEvidence(browser, testInfo, "public-pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "血尿临床思维训练系统" })).toBeVisible();
    await saveShot(page, testInfo, "home-zh");

    await page.goto("/cases/");
    await expect(page.getByText("当前 42 / 42")).toBeVisible();
    await saveShot(page, testInfo, "cases-zh");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
    await saveShot(page, testInfo, "cases-en");

    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("textbox", { name: "输入问诊问题" })).toBeVisible();
    await saveShot(page, testInfo, "training-p001-zh");
    await saveShot(page, testInfo, "training-p001-zh-viewport", false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }, { videoOnFailure: true });
});

test("primary practice pages have no serious accessibility violations in every required viewport", async ({ browser }, testInfo) => {
  await withEvidence(browser, testInfo, "accessibility-primary-pages", async ({ page }) => {
    for (const route of ["/", "/cases/", "/cases/P008/"]) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
      expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
    }
  }, { videoOnFailure: false });
});

test("all 42 case shells render seven stages without pre-submit answer leakage", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "qa-1440x900", "Single-project route sweep avoids duplicate evidence.");
  await withEvidence(browser, testInfo, "p001-p042-shell-audit", async ({ page }) => {
    expect(CASE_ROUTES).toHaveLength(42);
    for (const { routeId, displayCaseId } of CASE_ROUTES) {
      await page.goto(`/cases/${routeId}/`);
      await expect(page.getByText(displayCaseId, { exact: true }).first()).toBeVisible();
      await expect(page.locator("aside button")).toHaveCount(7);
      await expect(page.getByText(/漏问项|得分点|标准答案|Case tags|疾病标签/)).toHaveCount(0);
    }
    await saveShot(page, testInfo, "training-p042-zh");
  }, { videoOnFailure: true });
});

test("local P001-P042 catalog, direct URL, refresh, and bilingual display routes stay valid", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "qa-1440x900", "Single-project route matrix avoids duplicate evidence.");
  testInfo.setTimeout(300_000);
  await withEvidence(browser, testInfo, "local-p001-p042-display-route-matrix", async ({ page }) => {
    await page.route("**/api/health/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, deploymentTier: "practice", apiVersion: "qa-fixture" })
    }));
    await page.route("**/api/training-action/**", (route) => {
      const body = route.request().postDataJSON();
      const payload = body?.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body?.requestId };
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Expose-Headers": "X-Training-State", "X-Training-State": `qa-route-${body.attemptId}` }, body: JSON.stringify(payload) });
    });
    await page.route("**/api/session/init/**", (route) => {
      const body = route.request().postDataJSON();
      const english = body.language === "en";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: `qa-route-${body.caseId}-${body.language}`,
          caseId: body.caseId,
          language: body.language,
          mode: body.mode,
          patientOpeningStatement: english ? "Hello doctor. I noticed blood in my urine." : "医生您好，我发现尿液发红。",
          sessionCreatedAt: "2026-07-14T00:00:00.000Z",
          sessionExpiresAt: "2026-07-14T01:00:00.000Z",
          deploymentSha: "fixture-only",
          apiVersion: "qa-fixture",
          aiStatus: "available",
          profileSource: "local-simulation",
          cacheHit: false
        })
      });
    });
    await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "fixture", generationSource: "fixture", isFallback: false }) }));

    const results = [];
    const issues = [];
    const visibleWithin = async (locator) => {
      try {
        await locator.waitFor({ state: "visible", timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    };
    page.on("dialog", (dialog) => dialog.accept());
    const displayIds = CASE_ROUTES.map(({ displayCaseId }) => displayCaseId);
    expect(displayIds).toEqual(Array.from({ length: 42 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`));
    for (const displayCaseId of displayIds) {
      const catalogResponse = await page.goto("/cases/");
      expect(catalogResponse?.status(), `${displayCaseId} catalog`).toBeLessThan(400);
      await page.getByRole("button", { name: "中文" }).click();
      const link = page.locator(`a[href$="/cases/${displayCaseId}/"]`);
      await expect(link).toHaveCount(1);
      const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await link.click();
      const clickResponse = await navigation;
      const clickStatus = clickResponse?.status() || 0;
      if (clickStatus >= 400) issues.push({ caseId: displayCaseId, check: "catalog_click", status: clickStatus });

      const directResponse = await page.goto(`/cases/${displayCaseId}/`, { waitUntil: "domcontentloaded" });
      const directStatus = directResponse?.status() || 0;
      if (directStatus >= 400) issues.push({ caseId: displayCaseId, check: "direct_url", status: directStatus });
      const zhVisible = directStatus < 400 &&
        await visibleWithin(page.getByText(displayCaseId, { exact: true }).first()) &&
        await visibleWithin(page.getByRole("heading", { name: "血尿7阶段临床思维训练工作台" })) &&
        await visibleWithin(page.getByRole("textbox", { name: "输入问诊问题" }));
      if (!zhVisible) issues.push({ caseId: displayCaseId, check: "zh_heading", status: directStatus });
      await page.evaluate(() => localStorage.setItem("hematuria-language", "en"));
      const englishResponse = await page.reload({ waitUntil: "domcontentloaded" });
      const englishStatus = englishResponse?.status() || 0;
      if (englishStatus >= 400) issues.push({ caseId: displayCaseId, check: "english_route", status: englishStatus });
      const enVisible = englishStatus < 400 &&
        await visibleWithin(page.getByText(displayCaseId, { exact: true }).first()) &&
        await visibleWithin(page.getByRole("heading", { name: "Hematuria 7-Agent Clinical Reasoning Workspace" })) &&
        await visibleWithin(page.getByRole("textbox", { name: "Enter an interview question" }));
      if (!enVisible) issues.push({ caseId: displayCaseId, check: "en_heading", status: englishStatus });

      await page.evaluate(() => localStorage.setItem("hematuria-language", "zh"));
      const refreshResponse = await page.reload({ waitUntil: "domcontentloaded" });
      const refreshStatus = refreshResponse?.status() || 0;
      if (refreshStatus >= 400) issues.push({ caseId: displayCaseId, check: "refresh", status: refreshStatus });
      const refreshVisible = refreshStatus < 400 &&
        await visibleWithin(page.getByText(displayCaseId, { exact: true }).first()) &&
        await visibleWithin(page.getByRole("heading", { name: "血尿7阶段临床思维训练工作台" })) &&
        await visibleWithin(page.getByRole("textbox", { name: "输入问诊问题" }));
      if (!refreshVisible) issues.push({ caseId: displayCaseId, check: "refresh_heading", status: refreshStatus });
      results.push({ caseId: displayCaseId, catalogClickStatus: clickStatus, refreshStatus, directStatus, englishStatus, languages: { zh: zhVisible, en: enVisible }, valid: clickStatus < 400 && directStatus < 400 && englishStatus < 400 && refreshStatus < 400 && zhVisible && enVisible && refreshVisible });
    }
    await writeFile(path.join(DIRS.reports, "local-p001-p042-route-matrix.json"), `${JSON.stringify({ environment: "local-next-dev", productionSha: "70ea9b3c7b31e11a84878de5c277cac60f35481c", source: "deterministic_fixture_not_real_ai", cases: results, issues }, null, 2)}\n`, "utf8");
    await saveShot(page, testInfo, "local-route-matrix-p042-zh", false);
    expect(issues, JSON.stringify(issues)).toEqual([]);
  }, { videoOnFailure: true });
});

test("fixture completes all seven stages and renders a 360-point report after refresh recovery", async ({ browser }, testInfo) => {
  test.skip(!["qa-1440x900", "qa-390x844"].includes(testInfo.project.name), "Representative desktop and mobile workflow only.");
  await withEvidence(browser, testInfo, "fixture-seven-stage-workflow", async ({ page }) => {
    const api = await installFullWorkflowApi(page);
    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByTestId("final-report")).toHaveCount(0);

    await page.getByLabel("病史小结").fill("QA fixture 病史小结，仅验证界面流程，不作医学判断。");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage history recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await page.getByPlaceholder("例如：查肾区叩击痛").fill("生命体征、腹部和肾区查体");
    await page.getByRole("button", { name: "查询查体", exact: true }).click();
    await expect(page.getByText("QA fixture: vital signs and targeted physical examination returned.", { exact: true })).toBeVisible();
    await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("尿常规、CTU、膀胱镜、病理");
    await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
    await expect(page.getByTestId("report-card")).toHaveCount(4);
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage orders recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await page.getByLabel("最可能诊断").fill("QA夹具诊断（非医学结论）");
    await page.getByLabel("诊断依据").fill("这是用于验证提交门禁和状态恢复的脱敏夹具依据。");
    await page.getByLabel("至少 3 个鉴别诊断").fill("夹具鉴别一；夹具鉴别二；夹具鉴别三");
    await page.getByLabel("各鉴别诊断的支持点与反对点").fill("夹具一有支持与反对点；夹具二有支持与反对点；夹具三有支持与反对点。");
    await page.getByLabel("还需哪些检查进一步确认").fill("仅使用QA夹具检查验证流程。");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage diagnosis recorded.", { exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole("button", { name: "修改后重新提交", exact: true })).toBeVisible();
    await expect(page.getByText("QA fixture stage diagnosis recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await page.getByLabel("暂不需要会诊").check();
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage consult recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await page.getByLabel("急诊或入院即时处理").fill("QA夹具即时处理。");
    await page.getByLabel("入院初始处理").fill("QA夹具入院处理。");
    await page.getByLabel("确定性治疗/后续治疗").fill("QA夹具后续处理。");
    await page.getByLabel("MDT 后修订方案").fill("QA夹具修订方案。");
    await page.getByLabel("随访复查与患者教育").fill("QA夹具随访\nQA夹具患者教育");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage treatment recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await expect(page.getByRole("heading", { name: "围术期管理方案" })).toBeVisible();
    await page.getByRole("textbox").fill("QA夹具围术期管理方案，仅验证界面流程。");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await expect(page.getByText("QA fixture stage perioperative recorded.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    await page.getByLabel("学习反思").fill("QA夹具反思内容足够长，仅用于验证终末提交与360分报告显示。");
    await page.getByRole("button", { name: "完成训练并生成最终报告", exact: true }).click();
    const finalReport = page.getByTestId("final-report");
    await expect(finalReport).toBeVisible();
    await expect(finalReport).toContainText("220 / 360");
    await expect(finalReport.getByRole("progressbar")).toHaveCount(8);
    await saveShot(page, testInfo, "training-p001-seven-stage-final-report");

    expect(api.counts()).toEqual({
      exam: 1,
      order: 1,
      score: 1,
      stageFeedback: 7,
      stageKeys: ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"],
      languages: expect.arrayContaining(["zh"]),
      uniqueStageRequestIds: 7
    });
  }, { videoOnFailure: true });
});

test("stages 3-6 support governed return, relock, rebuild, and stable final scoring @stage-return-governance", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        submit: "Submit stage",
        next: "Next Agent",
        resubmit: "Resubmit this stage",
        noConsult: "No consultation for now",
        diagnosis: "Most likely diagnosis",
        evidence: "Diagnostic evidence",
        differentials: "At least 3 differential diagnoses",
        analysis: "Supportive and opposing points for each differential",
        reflection: "Reflection",
        finish: "Finish training and generate final report",
        stage3: /3\. Diagnostic Reasoning/,
        stage4: /4\. MDT Coordinator/,
        stage5: /5\. Clinical Decision Support/
      }
    : {
        submit: "提交本阶段",
        next: "进入下一阶段",
        resubmit: "修改后重新提交",
        noConsult: "暂不需要会诊",
        diagnosis: "最可能诊断",
        evidence: "诊断依据",
        differentials: "至少 3 个鉴别诊断",
        analysis: "各鉴别诊断的支持点与反对点",
        reflection: "学习反思",
        finish: "完成训练并生成最终报告",
        stage3: /第3阶段·诊断推理/,
        stage4: /第4阶段·多学科协作/,
        stage5: /第5阶段·治疗决策/
      };

  await withEvidence(browser, testInfo, "stage-3-6-return-governance", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();

    const submitAndAdvance = async () => {
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect(page.getByRole("button", { name: copy.next, exact: true })).toBeVisible();
      await page.getByRole("button", { name: copy.next, exact: true }).click();
    };
    await submitAndAdvance();
    await submitAndAdvance();
    await page.getByLabel(copy.diagnosis, { exact: true }).fill(language === "en" ? "QA-only training diagnosis" : "仅用于QA流程的训练诊断");
    await page.getByLabel(copy.evidence, { exact: true }).fill(language === "en" ? "QA-only evidence text of sufficient length." : "仅用于QA流程、长度足够的训练依据。");
    await page.getByLabel(copy.differentials, { exact: true }).fill(language === "en" ? "QA option one; QA option two; QA option three" : "QA选项一；QA选项二；QA选项三");
    await page.getByLabel(copy.analysis, { exact: true }).fill(language === "en" ? "Each QA option has a supporting and opposing point." : "每个QA选项均有支持点和反对点。");
    await submitAndAdvance();
    await page.getByRole("radio", { name: copy.noConsult, exact: true }).check();
    await submitAndAdvance();
    await submitAndAdvance();
    await submitAndAdvance();

    const viewport = testInfo.project.use.viewport;
    if (viewport.width < 1024) {
      await page.locator('button[aria-expanded="false"]').filter({ hasText: "7/7" }).click();
    }
    await page.getByRole("button", { name: copy.stage3 }).click();
    await expect(page.getByLabel(copy.diagnosis, { exact: true })).toBeVisible();
    await page.getByLabel(copy.diagnosis, { exact: true }).fill(language === "en" ? "QA-only revised training diagnosis" : "仅用于QA流程的修订训练诊断");
    await page.getByRole("button", { name: copy.resubmit, exact: true }).click();
    if (viewport.width < 1024) {
      await page.locator('button[aria-expanded="false"]').filter({ hasText: "3/7" }).click();
    }
    await expect(page.getByRole("button", { name: copy.stage4 })).toBeEnabled();
    await expect(page.getByRole("button", { name: copy.stage5 })).toBeDisabled();
    await saveShot(page, testInfo, `stage-3-6-return-governance-${language}-relocked`, false);

    await page.getByRole("button", { name: copy.next, exact: true }).click();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await page.getByRole("button", { name: copy.next, exact: true }).click();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await page.getByRole("button", { name: copy.next, exact: true }).click();
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await page.getByRole("button", { name: copy.next, exact: true }).click();

    await page.getByLabel(copy.reflection, { exact: true }).fill(language === "en"
      ? "QA-only reflection long enough to confirm stable final scoring after a governed stage return."
      : "仅用于QA的反思文本，长度足够，用来确认阶段返回重做后的终末评分稳定。"
    );
    await page.getByRole("button", { name: copy.finish, exact: true }).click();
    await expect(page.getByTestId("final-report")).toBeVisible();
    await expect(page.getByTestId("final-report")).toContainText("/ 360");
    await saveShot(page, testInfo, `stage-3-6-return-governance-${language}-final`);

    const stageFeedbacks = actionObservations.filter((item) => item.action === "stage-feedback");
    const scores = actionObservations.filter((item) => item.action === "score");
    const non200 = actionObservations.filter((item) => item.status !== 200);
    const consoleErrorCount = consoleEvents.filter((item) => item.type === "error").length;
    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const summary = {
      schemaVersion: "exploratory-stage-return-ui-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      source: "production_handler_local_ui",
      result: non200.length || consoleErrorCount || failedNetworkRequestCount ? "FAIL_EMULATION" : "PASS_EMULATION",
      language,
      viewport,
      stageFeedbackRequests: stageFeedbacks.length,
      uniqueStageFeedbackRequestIds: stageFeedbacks.filter((item) => item.requestIdPresent).length,
      scoreRequests: scores.length,
      non200ActionResponses: non200.length,
      consoleErrors: consoleErrorCount,
      failedNetworkRequests: failedNetworkRequestCount,
      futureStageRelockedAfterStage3Resubmit: true,
      finalReportVisible: true,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(stageFeedbacks).toHaveLength(11);
    expect(stageFeedbacks.every((item) => item.requestIdPresent)).toBe(true);
    expect(scores).toHaveLength(1);
    expect(non200).toEqual([]);
    expect(summary.consoleErrors).toBe(0);
    expect(summary.failedNetworkRequests).toBe(0);
  }, { videoOnFailure: true });
});

test("HEM-P2-059 English physical-exam category placeholders keep unique React keys @hem-p2-059", async ({ browser }, testInfo) => {
  await withEvidence(browser, testInfo, "hem-p2-059-english-physical-exam-category-keys", async ({ page, slug, consoleEvents, networkEvents }) => {
    await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
    await installProductionTrainingApi(page);
    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "Submit stage", exact: true }).click();
    await page.getByRole("button", { name: "Next Agent", exact: true }).click();
    await expect(page.getByText("Investigation Agent", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);

    const duplicateKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const placeholderHeadingCount = await page.getByRole("heading", { name: "Physical examination", exact: true }).count();
    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    await saveShot(page, testInfo, "hem-p2-059-english-physical-exam-category-keys", false);
    const summary = {
      schemaVersion: "exploratory-hem-p2-059-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: duplicateKeyErrors.length ? "FAIL_EMULATION" : "PASS_EMULATION",
      language: "en",
      viewport: testInfo.project.use.viewport,
      duplicateKeyErrors: duplicateKeyErrors.length,
      duplicatePlaceholderHeadings: placeholderHeadingCount,
      failedNetworkRequests: failedNetworkRequestCount,
      sourceRevisionStatus: "BLOCKED_SOURCE_REVISION",
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(placeholderHeadingCount).toBeGreaterThan(1);
    expect(duplicateKeyErrors, "HEM-P2-059 duplicate React keys must be eliminated without approving missing English source labels").toHaveLength(0);
  }, { videoOnFailure: true });
});

test("stage 3-6 drafts survive reload and the terminal report relocks prior stages @stage-persistence-governance", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        submit: "Submit stage",
        next: "Next Agent",
        diagnosis: "Most likely diagnosis",
        evidence: "Diagnostic evidence",
        differentials: "At least 3 differential diagnoses",
        analysis: "Supportive and opposing points for each differential",
        noConsult: "No consultation for now",
        treatment: "Immediate ED/admission management",
        reflection: "Reflection",
        finish: "Finish training and generate final report"
      }
    : {
        submit: "提交本阶段",
        next: "进入下一阶段",
        diagnosis: "最可能诊断",
        evidence: "诊断依据",
        differentials: "至少 3 个鉴别诊断",
        analysis: "各鉴别诊断的支持点与反对点",
        noConsult: "暂不需要会诊",
        treatment: "急诊或入院即时处理",
        reflection: "学习反思",
        finish: "完成训练并生成最终报告"
      };
  const drafts = language === "en"
    ? {
        diagnosis: "QA persistence diagnosis marker",
        evidence: "QA persistence evidence marker of sufficient length.",
        differentials: "QA option one; QA option two; QA option three",
        analysis: "QA support and opposition marker for each option.",
        treatment: "QA immediate management persistence marker.",
        perioperative: "QA perioperative persistence marker.",
        reflection: "QA reflection long enough to verify terminal report persistence and stage relocking."
      }
    : {
        diagnosis: "QA刷新恢复诊断标记",
        evidence: "QA刷新恢复依据标记，长度满足界面流程要求。",
        differentials: "QA选项一；QA选项二；QA选项三",
        analysis: "QA每个选项的支持与反对标记。",
        treatment: "QA即时处理刷新恢复标记。",
        perioperative: "QA围术期刷新恢复标记。",
        reflection: "QA反思文本长度足够，仅验证终态报告恢复与阶段重新锁定。"
      };

  await withEvidence(browser, testInfo, "stage-3-6-reload-terminal-lock", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");

    const submitAndAdvance = async () => {
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect(page.getByRole("button", { name: copy.next, exact: true })).toBeVisible();
      await page.getByRole("button", { name: copy.next, exact: true }).click();
    };
    const answerField = (label) => page.getByRole("textbox", { name: label, exact: true });
    const waitForSaved = async (expected) => {
      await page.waitForFunction(({ selectedLanguage, expectedValues }) => {
        const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
        if (!pointer?.attemptId) return false;
        const saved = JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null");
        return saved && Object.entries(expectedValues).every(([key, value]) => (
          key === "finalReport" ? Boolean(saved.finalReport) === value : saved.answers?.[key] === value
        ));
      }, { selectedLanguage: language, expectedValues: expected }, { timeout: 8_000 });
    };

    await submitAndAdvance();
    await submitAndAdvance();

    await answerField(copy.diagnosis).fill(drafts.diagnosis);
    await answerField(copy.evidence).fill(drafts.evidence);
    await answerField(copy.differentials).fill(drafts.differentials);
    await answerField(copy.analysis).fill(drafts.analysis);
    await waitForSaved({
      diagnosis: drafts.diagnosis,
      diagnosticEvidence: drafts.evidence,
      differentials: drafts.differentials,
      differentialAnalysis: drafts.analysis
    });
    await page.reload();
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    await expect(answerField(copy.diagnosis)).toHaveValue(drafts.diagnosis);
    await expect(answerField(copy.evidence)).toHaveValue(drafts.evidence);
    await expect(answerField(copy.differentials)).toHaveValue(drafts.differentials);
    await expect(answerField(copy.analysis)).toHaveValue(drafts.analysis);
    await submitAndAdvance();

    await page.getByRole("radio", { name: copy.noConsult, exact: true }).check();
    await waitForSaved({ consultNeeded: "暂不需要会诊" });
    await page.reload();
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    await expect(page.getByRole("radio", { name: copy.noConsult, exact: true })).toBeChecked();
    await submitAndAdvance();

    await answerField(copy.treatment).fill(drafts.treatment);
    await waitForSaved({ immediateTreatment: drafts.treatment });
    await page.reload();
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    await expect(answerField(copy.treatment)).toHaveValue(drafts.treatment);
    await submitAndAdvance();

    const perioperative = page.locator("main textarea:visible").first();
    await perioperative.fill(drafts.perioperative);
    await waitForSaved({ perioperativePreparation: drafts.perioperative });
    await page.reload();
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    await expect(page.locator("main textarea:visible").first()).toHaveValue(drafts.perioperative);
    await submitAndAdvance();

    await page.getByLabel(copy.reflection, { exact: true }).fill(drafts.reflection);
    await page.getByRole("button", { name: copy.finish, exact: true }).click();
    await expect(page.getByTestId("final-report")).toBeVisible();
    await expect(page.getByTestId("final-report")).toContainText("/ 360");
    await waitForSaved({ finalReport: true });
    await page.reload();
    await expect(page.getByTestId("final-report")).toBeVisible();
    await expect(page.getByRole("button", { name: copy.finish, exact: true })).toBeDisabled();

    if (testInfo.project.use.viewport.width < 1024) {
      await page.locator('button[aria-expanded="false"]').filter({ hasText: "7/7" }).click();
    }
    const stageButtons = page.locator("aside").first().locator("section").first().locator("button");
    await expect(stageButtons).toHaveCount(7);
    for (let index = 0; index < 6; index += 1) {
      await expect(stageButtons.nth(index)).toBeDisabled();
    }
    await saveShot(page, testInfo, `stage-3-6-reload-terminal-lock-${language}`, false);

    const knownCompletedResponses = actionObservations.filter((item) =>
      item.status === 401 && item.error === "attempt_already_completed"
    );
    const unexpectedActionResponses = actionObservations.filter((item) =>
      item.status !== 200 && !(item.status === 401 && item.error === "attempt_already_completed")
    );
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const knownCompletedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of 401.*Unauthorized/i.test(item.text)
      && knownCompletedResponses.length > 0
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownEnglishKeyErrors.includes(item)
      && !knownCompletedConsoleErrors.includes(item)
    );
    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const summary = {
      schemaVersion: "exploratory-stage-persistence-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: unexpectedActionResponses.length || unexpectedConsoleErrors.length || failedNetworkRequestCount
        ? "FAIL_EMULATION"
        : "PASS_EMULATION",
      language,
      viewport: testInfo.project.use.viewport,
      stageDraftReloads: 4,
      stage3FieldsRecovered: 4,
      stage4ChoiceRecovered: true,
      stage5DraftRecovered: true,
      stage6DraftRecovered: true,
      terminalReportRecovered: true,
      priorStagesLockedAfterTerminalReload: 6,
      completedAttemptResponses: knownCompletedResponses.length,
      completedAttemptConsoleErrors: knownCompletedConsoleErrors.length,
      knownDefectsObserved: [
        ...(knownCompletedResponses.length ? ["HEM-P2-028"] : []),
        ...(knownEnglishKeyErrors.length ? ["HEM-P2-059"] : [])
      ],
      unexpectedActionResponses: unexpectedActionResponses.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      failedNetworkRequests: failedNetworkRequestCount,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(unexpectedActionResponses).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(failedNetworkRequestCount).toBe(0);
  }, { videoOnFailure: true });
});

test("saved stage progress can rebuild capability after a clean tab boundary @clean-tab-recovery", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        submit: "Submit stage",
        next: "Next Agent",
        diagnosis: "Most likely diagnosis",
        evidence: "Diagnostic evidence",
        differentials: "At least 3 differential diagnoses",
        analysis: "Supportive and opposing points for each differential",
        unavailable: "Training session unavailable"
      }
    : {
        submit: "提交本阶段",
        next: "进入下一阶段",
        diagnosis: "最可能诊断",
        evidence: "诊断依据",
        differentials: "至少 3 个鉴别诊断",
        analysis: "各鉴别诊断的支持点与反对点",
        unavailable: "训练会话尚未就绪"
      };
  const drafts = language === "en"
    ? {
        diagnosis: "QA clean-tab recovery marker",
        evidence: "QA clean-tab evidence marker.",
        differentials: "QA option one; QA option two; QA option three",
        analysis: "QA support and opposition details for each option."
      }
    : {
        diagnosis: "QA关闭标签恢复标记",
        evidence: "QA关闭标签恢复依据标记。",
        differentials: "QA选项一；QA选项二；QA选项三",
        analysis: "QA每个选项均有支持和反对点标记。"
      };

  await withEvidence(browser, testInfo, "clean-tab-capability-recovery", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");

    for (let stage = 1; stage <= 2; stage += 1) {
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await page.getByRole("button", { name: copy.next, exact: true }).click();
    }
    await page.getByRole("textbox", { name: copy.diagnosis, exact: true }).fill(drafts.diagnosis);
    await page.getByRole("textbox", { name: copy.evidence, exact: true }).fill(drafts.evidence);
    await page.getByRole("textbox", { name: copy.differentials, exact: true }).fill(drafts.differentials);
    await page.getByRole("textbox", { name: copy.analysis, exact: true }).fill(drafts.analysis);
    await page.waitForFunction(({ selectedLanguage, expected }) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return saved?.answers?.diagnosis === expected.diagnosis
        && saved?.answers?.diagnosticEvidence === expected.evidence
        && saved?.answers?.differentials === expected.differentials
        && saved?.answers?.differentialAnalysis === expected.analysis;
    }, { selectedLanguage: language, expected: drafts }, { timeout: 8_000 });
    const beforeNormalReload = actionObservations.length;
    await page.reload();
    await expect(page.getByRole("textbox", { name: copy.diagnosis, exact: true })).toHaveValue(drafts.diagnosis);
    await expect.poll(() => actionObservations.length).toBeGreaterThan(beforeNormalReload);
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();

    const beforeBoundary = actionObservations.length;
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole("textbox", { name: copy.diagnosis, exact: true })).toHaveValue(drafts.diagnosis);
    await expect(page.getByRole("textbox", { name: copy.evidence, exact: true })).toHaveValue(drafts.evidence);
    await expect(page.getByRole("textbox", { name: copy.differentials, exact: true })).toHaveValue(drafts.differentials);
    await expect(page.getByRole("textbox", { name: copy.analysis, exact: true })).toHaveValue(drafts.analysis);
    await expect.poll(() => actionObservations.length).toBeGreaterThan(beforeBoundary);
    const initializationActions = actionObservations.slice(beforeBoundary);
    const initializationFailures = initializationActions.filter((item) => item.status !== 200);
    const beforeSubmit = actionObservations.length;
    if (initializationFailures.length === 0) {
      await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await expect.poll(() => actionObservations.length).toBeGreaterThan(beforeSubmit);
    }
    const boundaryActions = actionObservations.slice(beforeBoundary);
    const stageFeedbacks = boundaryActions.filter((item) => item.action === "stage-feedback");
    const capabilityRecovered = initializationFailures.length === 0
      && stageFeedbacks.length === 1
      && stageFeedbacks[0].status === 200;
    if (capabilityRecovered) {
      await expect(page.getByRole("button", { name: copy.next, exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: copy.unavailable, exact: true })).toBeVisible();
    }
    await saveShot(page, testInfo, `clean-tab-capability-recovery-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const knownConflictConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of 409.*Conflict/i.test(item.text)
      && boundaryActions.some((action) => action.status === 409)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownEnglishKeyErrors.includes(item)
      && !knownConflictConsoleErrors.includes(item)
    );
    const summary = {
      schemaVersion: "exploratory-clean-tab-recovery-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: capabilityRecovered ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: capabilityRecovered ? null : "HEM-P1-060",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "CLEAN_TAB_STORAGE_EMULATION",
      localDraftRecovered: true,
      capabilityRecovered,
      initializationActionCount: initializationActions.length,
      initializationStatuses: initializationActions.map((item) => item.status),
      initializationErrors: initializationActions.map((item) => item.error).filter(Boolean),
      stageFeedbackRequestsAfterBoundary: stageFeedbacks.length,
      stageFeedbackStatuses: stageFeedbacks.map((item) => item.status),
      stageFeedbackErrors: stageFeedbacks.map((item) => item.error).filter(Boolean),
      normalReloadControlPassed: true,
      realBrowserCloseClaimed: false,
      responseBodiesRetained: false,
      credentialsRetained: false,
      failedNetworkRequests: failedNetworkRequestCount,
      knownDefectsObserved: knownEnglishKeyErrors.length ? ["HEM-P2-059"] : [],
      expectedConflictConsoleErrors: knownConflictConsoleErrors.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(initializationFailures, "saved local progress must regain a scoped capability after tab session storage is lost").toEqual([]);
    expect(stageFeedbacks).toHaveLength(1);
    expect(stageFeedbacks[0]?.status).toBe(200);
    expect(stageFeedbacks[0]?.requestIdPresent).toBe(true);
  }, { videoOnFailure: true });
});

test("case and language draft storage remains isolated @client-storage-isolation", async ({ browser }, testInfo) => {
  const initialLanguage = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const otherLanguage = initialLanguage === "zh" ? "en" : "zh";
  const copy = {
    zh: {
      summary: "病史小结",
      languageButton: "English",
      marker: "QA-P001-ZH-ISOLATION-MARKER"
    },
    en: {
      summary: "History summary",
      languageButton: "中文",
      marker: "QA-P001-EN-ISOLATION-MARKER"
    }
  };

  await withEvidence(browser, testInfo, "client-storage-isolation", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => {
      if (sessionStorage.getItem("qa-storage-isolation-language-seeded")) return;
      localStorage.setItem("hematuria-language", selectedLanguage);
      sessionStorage.setItem("qa-storage-isolation-language-seeded", "1");
    }, initialLanguage);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");
    await page.getByLabel(copy[initialLanguage].summary, { exact: true }).fill(copy[initialLanguage].marker);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: copy[initialLanguage].languageButton, exact: true }).click();
    await expect(page.getByLabel(copy[otherLanguage].summary, { exact: true })).toHaveValue("");
    await page.getByLabel(copy[otherLanguage].summary, { exact: true }).fill(copy[otherLanguage].marker);
    await page.waitForFunction(({ selectedLanguage, expectedMarker }) => {
      if (localStorage.getItem("hematuria-language") !== selectedLanguage) return false;
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return saved?.answers?.historySummary === expectedMarker;
    }, { selectedLanguage: otherLanguage, expectedMarker: copy[otherLanguage].marker }, { timeout: 8_000 });

    await page.goto("/cases/P002/");
    await expect(page.getByText("P002", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: copy[otherLanguage].summary, exact: true })).toHaveValue("");
    const visibleText = await page.locator("main").innerText();
    expect(visibleText).not.toContain(copy.zh.marker);
    expect(visibleText).not.toContain(copy.en.marker);

    const storageAudit = await page.evaluate(() => {
      const attemptKeys = Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-v3:"));
      const pointerKeys = Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-pointer-v3:"));
      return {
        attemptKeyCount: attemptKeys.length,
        pointerKeyCount: pointerKeys.length,
        p001InitialLanguageKeys: attemptKeys.filter((key) => key.startsWith("hematuria-attempt-v3:P001:free:")).length,
        p002OtherLanguageKeys: attemptKeys.filter((key) => key.startsWith(`hematuria-attempt-v3:P002:free:${localStorage.getItem("hematuria-language")}:`)).length,
        distinctAttemptKeyCount: new Set(attemptKeys).size,
        attemptValuesRetained: false
      };
    });
    await saveShot(page, testInfo, `client-storage-isolation-${initialLanguage}-to-${otherLanguage}`, false);

    const non200 = actionObservations.filter((item) => item.status !== 200);
    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const summary = {
      schemaVersion: "exploratory-client-storage-isolation-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: non200.length || failedNetworkRequestCount ? "FAIL_EMULATION" : "PASS_EMULATION",
      viewport: testInfo.project.use.viewport,
      languageTransition: `${initialLanguage}->${otherLanguage}`,
      p001DraftAbsentAfterLanguageSwitch: true,
      p001DraftAbsentInP002: true,
      ...storageAudit,
      non200ActionResponses: non200.length,
      failedNetworkRequests: failedNetworkRequestCount,
      consoleErrors: consoleEvents.filter((item) => item.type === "error").length,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(storageAudit.attemptKeyCount).toBeGreaterThanOrEqual(3);
    expect(storageAudit.pointerKeyCount).toBeGreaterThanOrEqual(3);
    expect(storageAudit.p001InitialLanguageKeys).toBeGreaterThanOrEqual(2);
    expect(storageAudit.p002OtherLanguageKeys).toBe(1);
    expect(storageAudit.distinctAttemptKeyCount).toBe(storageAudit.attemptKeyCount);
    expect(non200).toEqual([]);
    expect(failedNetworkRequestCount).toBe(0);
  }, { videoOnFailure: true });
});

test("concurrent tabs keep one authoritative attempt mutation and let the stale tab resynchronize @multi-tab-attempt", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        submit: "Submit stage",
        next: "Next Agent",
        unavailable: "Training session unavailable"
      }
    : {
        submit: "提交本阶段",
        next: "进入下一阶段",
        unavailable: "训练会话尚未就绪"
      };

  await withEvidence(browser, testInfo, "multi-tab-attempt-concurrency", async ({ context, page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    const requestIds = new Set();
    const primaryTokens = new Map();
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations, {
      serverTokens: primaryTokens,
      requestIds,
      pageLabel: "primary"
    });
    await page.goto("/cases/P001/");
    await expect(page.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();
    const attemptId = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      return String(pointer?.attemptId || "");
    }, language);
    expect(attemptId).not.toBe("");
    await expect.poll(() => primaryTokens.has(attemptId)).toBe(true);

    const [secondaryPage] = await Promise.all([
      context.waitForEvent("page"),
      page.evaluate(() => { window.open("about:blank", "_blank"); })
    ]);
    observeAdditionalPage(secondaryPage, "secondary", consoleEvents, networkEvents);
    const copiedSessionEntryCount = await secondaryPage.evaluate(() => Object.keys(sessionStorage).length);
    const secondaryTokens = new Map(primaryTokens);
    await installProductionTrainingApi(secondaryPage, [], actionObservations, {
      resetStore: false,
      serverTokens: secondaryTokens,
      requestIds,
      pageLabel: "secondary"
    });
    await secondaryPage.goto(page.url());
    await expect(secondaryPage.getByRole("button", { name: copy.submit, exact: true })).toBeEnabled();

    const beforeConcurrentSubmit = actionObservations.length;
    await Promise.all([
      page.getByRole("button", { name: copy.submit, exact: true }).click(),
      secondaryPage.getByRole("button", { name: copy.submit, exact: true }).click()
    ]);
    await expect.poll(() => actionObservations.slice(beforeConcurrentSubmit)
      .filter((item) => item.action === "stage-feedback" && item.stageKey === "history").length).toBe(2);
    const concurrentActions = actionObservations.slice(beforeConcurrentSubmit)
      .filter((item) => item.action === "stage-feedback" && item.stageKey === "history");
    const accepted = concurrentActions.filter((item) => item.status === 200);
    const staleRejected = concurrentActions.filter((item) => item.status === 409 && item.error === "stale_attempt_token");
    const requestIdCollisions = concurrentActions.filter((item) => item.requestIdDuplicate).length;
    const winnerLabel = accepted[0]?.pageLabel || "primary";
    const loserLabel = staleRejected[0]?.pageLabel || (winnerLabel === "primary" ? "secondary" : "primary");
    const winnerPage = winnerLabel === "primary" ? page : secondaryPage;
    const loserPage = loserLabel === "primary" ? page : secondaryPage;
    await expect(winnerPage.getByRole("button", { name: copy.next, exact: true })).toBeVisible();
    await expect.poll(() => winnerPage.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return Boolean(saved?.submitted?.["1"]);
    }, language)).toBe(true);

    const beforeRecovery = actionObservations.length;
    await loserPage.reload();
    await expect(loserPage.getByText("P001", { exact: true }).first()).toBeVisible();
    await loserPage.waitForTimeout(500);
    const nextVisible = await loserPage.getByRole("button", { name: copy.next, exact: true }).isVisible().catch(() => false);
    if (nextVisible) await loserPage.getByRole("button", { name: copy.next, exact: true }).click();
    const unavailableVisible = await loserPage.getByRole("button", { name: copy.unavailable, exact: true }).isVisible().catch(() => false);
    const submitButton = loserPage.getByRole("button", { name: copy.submit, exact: true });
    const submitReady = await submitButton.isEnabled().catch(() => false);
    if (submitReady) {
      await submitButton.click();
      await loserPage.waitForTimeout(1_500);
    }
    const unavailableAfterRetry = await loserPage.getByRole("button", { name: copy.unavailable, exact: true }).isVisible().catch(() => false);
    const recoveryActions = actionObservations.slice(beforeRecovery);
    const recoveryStageActions = recoveryActions.filter((item) => item.action === "stage-feedback");
    const recoverySucceeded = !unavailableVisible
      && recoveryStageActions.length === 1
      && recoveryStageActions[0].status === 200;
    await saveShot(loserPage, testInfo, `multi-tab-attempt-concurrency-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const knownConflictConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of 409.*Conflict/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownEnglishKeyErrors.includes(item)
      && !knownConflictConsoleErrors.includes(item)
    );
    const summary = {
      schemaVersion: "exploratory-multi-tab-attempt-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: accepted.length === 1 && staleRejected.length === 1 && requestIdCollisions === 0 && recoverySucceeded
        ? "PASS_EMULATION"
        : "FAIL_EMULATION",
      defectId: recoverySucceeded ? null : "HEM-P1-060",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "MULTI_TAB_SAME_ATTEMPT_EMULATION",
      copiedSessionEntryCount,
      concurrentStageFeedbackRequests: concurrentActions.length,
      acceptedMutations: accepted.length,
      staleMutationsRejected: staleRejected.length,
      requestIdCollisions,
      losingTabReloadActionStatuses: recoveryActions.map((item) => item.status),
      losingTabReloadActionErrors: recoveryActions.map((item) => item.error).filter(Boolean),
      losingTabUnavailableBeforeRetry: unavailableVisible,
      losingTabUnavailableAfterRetry: unavailableAfterRetry,
      losingTabAdvancedBeforeRetry: nextVisible,
      losingTabRecoveryStageRequests: recoveryStageActions.length,
      losingTabRecoveryStageKeys: recoveryStageActions.map((item) => item.stageKey),
      losingTabRecoveryStageStatuses: recoveryStageActions.map((item) => item.status),
      losingTabResynchronized: recoverySucceeded,
      realBrowserCloseClaimed: false,
      failedNetworkRequests: failedNetworkRequestCount,
      expectedConflictConsoleErrors: knownConflictConsoleErrors.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(concurrentActions).toHaveLength(2);
    expect(accepted).toHaveLength(1);
    expect(staleRejected).toHaveLength(1);
    expect(requestIdCollisions).toBe(0);
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(recoverySucceeded, "the stale tab must revalidate the shared attempt and continue from the winning mutation").toBe(true);
  }, { videoOnFailure: true });
});

test("a new page restores a completed report as read-only without duplicate scoring @terminal-report-reopen", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        submit: "Submit stage",
        next: "Next Agent",
        diagnosis: "Most likely diagnosis",
        evidence: "Diagnostic evidence",
        differentials: "At least 3 differential diagnoses",
        analysis: "Supportive and opposing points for each differential",
        noConsult: "No consultation for now",
        treatment: "Immediate ED/admission management",
        reflection: "Reflection",
        finish: "Finish training and generate final report"
      }
    : {
        submit: "提交本阶段",
        next: "进入下一阶段",
        diagnosis: "最可能诊断",
        evidence: "诊断依据",
        differentials: "至少 3 个鉴别诊断",
        analysis: "各鉴别诊断的支持点与反对点",
        noConsult: "暂不需要会诊",
        treatment: "急诊或入院即时处理",
        reflection: "学习反思",
        finish: "完成训练并生成最终报告"
      };

  await withEvidence(browser, testInfo, "terminal-report-new-page-recovery", async ({ context, page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    const requestIds = new Set();
    const primaryTokens = new Map();
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations, {
      serverTokens: primaryTokens,
      requestIds,
      pageLabel: "primary"
    });
    await page.goto("/cases/P001/");

    const submitAndAdvance = async () => {
      await page.getByRole("button", { name: copy.submit, exact: true }).click();
      await page.getByRole("button", { name: copy.next, exact: true }).click();
    };
    await submitAndAdvance();
    await submitAndAdvance();
    await page.getByRole("textbox", { name: copy.diagnosis, exact: true }).fill("QA terminal report diagnosis marker");
    await page.getByRole("textbox", { name: copy.evidence, exact: true }).fill("QA terminal report evidence marker with sufficient length.");
    await page.getByRole("textbox", { name: copy.differentials, exact: true }).fill("QA option one; QA option two; QA option three");
    await page.getByRole("textbox", { name: copy.analysis, exact: true }).fill("QA support and opposition marker for every option.");
    await submitAndAdvance();
    await page.getByRole("radio", { name: copy.noConsult, exact: true }).check();
    await submitAndAdvance();
    await page.getByRole("textbox", { name: copy.treatment, exact: true }).fill("QA immediate management terminal recovery marker.");
    await submitAndAdvance();
    await page.locator("main textarea:visible").first().fill("QA perioperative terminal recovery marker.");
    await submitAndAdvance();
    await page.getByLabel(copy.reflection, { exact: true }).fill("QA terminal report reflection is long enough for final scoring.");
    await page.getByRole("button", { name: copy.finish, exact: true }).click();
    await expect(page.getByTestId("final-report")).toBeVisible();
    await expect(page.getByTestId("final-report")).toContainText("/ 360");
    const beforeReopen = actionObservations.length;
    const beforeStageFeedbackCount = actionObservations.filter((item) => item.action === "stage-feedback").length;
    const beforeScoreCount = actionObservations.filter((item) => item.action === "score").length;

    const reopenedPage = await context.newPage();
    observeAdditionalPage(reopenedPage, "reopened", consoleEvents, networkEvents);
    await reopenedPage.addInitScript(() => {
      window.__qaInitialSessionEntryCount = Object.keys(sessionStorage).length;
    });
    await installProductionTrainingApi(reopenedPage, [], actionObservations, {
      resetStore: false,
      serverTokens: new Map(),
      requestIds,
      pageLabel: "reopened"
    });
    await reopenedPage.goto(page.url());
    const newPageSessionEntryCount = await reopenedPage.evaluate(() => Number(window.__qaInitialSessionEntryCount || 0));
    await expect(reopenedPage.getByTestId("final-report")).toBeVisible();
    await expect(reopenedPage.getByTestId("final-report")).toContainText("/ 360");
    await reopenedPage.waitForTimeout(500);
    if (testInfo.project.use.viewport.width < 1024) {
      await reopenedPage.locator('button[aria-expanded="false"]').filter({ hasText: "7/7" }).click();
    }
    const stageButtons = reopenedPage.locator("aside").first().locator("section").first().locator("button");
    await expect(stageButtons).toHaveCount(7);
    let lockedPriorStages = 0;
    for (let index = 0; index < 6; index += 1) {
      if (await stageButtons.nth(index).isDisabled()) lockedPriorStages += 1;
    }
    const finishDisabled = await reopenedPage.getByRole("button", { name: copy.finish, exact: true }).isDisabled();
    const storageAudit = await reopenedPage.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      const summaries = JSON.parse(localStorage.getItem("hematuria-practice-attempt-summaries-v1") || "[]");
      return {
        finalReportPresent: Boolean(saved?.finalReport),
        submittedStageCount: Object.keys(saved?.submitted || {}).length,
        matchingSummaryCount: Array.isArray(summaries)
          ? summaries.filter((item) => item?.attemptId === pointer?.attemptId).length
          : 0
      };
    }, language);
    const reopenActions = actionObservations.slice(beforeReopen);
    const afterStageFeedbackCount = actionObservations.filter((item) => item.action === "stage-feedback").length;
    const afterScoreCount = actionObservations.filter((item) => item.action === "score").length;
    const duplicateStageFeedbacks = afterStageFeedbackCount - beforeStageFeedbackCount;
    const duplicateScores = afterScoreCount - beforeScoreCount;
    await saveShot(reopenedPage, testInfo, `terminal-report-new-page-recovery-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const knownCompletedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of 401.*Unauthorized/i.test(item.text)
      && reopenActions.some((action) => action.status === 401 && action.error === "attempt_already_completed")
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownEnglishKeyErrors.includes(item)
      && !knownCompletedConsoleErrors.includes(item)
    );
    const resultPassed = lockedPriorStages === 6
      && finishDisabled
      && storageAudit.finalReportPresent
      && storageAudit.submittedStageCount === 7
      && storageAudit.matchingSummaryCount === 1
      && duplicateStageFeedbacks === 0
      && duplicateScores === 0;
    const summary = {
      schemaVersion: "exploratory-terminal-report-reopen-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "NEW_PAGE_TERMINAL_STORAGE_EMULATION",
      newPageSessionEntryCount,
      finalReportRecovered: storageAudit.finalReportPresent,
      submittedStageCount: storageAudit.submittedStageCount,
      matchingSummaryCount: storageAudit.matchingSummaryCount,
      lockedPriorStages,
      finishDisabled,
      duplicateStageFeedbacks,
      duplicateScores,
      reopenActionStatuses: reopenActions.map((item) => item.status),
      reopenActionErrors: reopenActions.map((item) => item.error).filter(Boolean),
      realBrowserCloseClaimed: false,
      failedNetworkRequests: failedNetworkRequestCount,
      knownDefectsObserved: reopenActions.some((item) => item.status === 401 && item.error === "attempt_already_completed")
        ? ["HEM-P2-028"]
        : [],
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(resultPassed).toBe(true);
  }, { videoOnFailure: true });
});

test("corrupted and temporarily unwritable local storage recovers without stale or cross-language warnings @storage-fault-recovery", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? { summary: "History summary" }
    : { summary: "病史小结" };
  const draftMarker = language === "en"
    ? "QA storage recovery marker"
    : "QA存储恢复标记";

  await withEvidence(browser, testInfo, "storage-fault-recovery", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => {
      if (!window.__qaStorageFaultPatched) {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function qaStorageSetItem(key, value) {
          if (window.__qaFailAttemptStorageWrites && String(key).startsWith("hematuria-attempt-v3:")) {
            throw new DOMException("QA simulated quota boundary", "QuotaExceededError");
          }
          return originalSetItem.call(this, key, value);
        };
        window.__qaStorageFaultPatched = true;
      }
      if (sessionStorage.getItem("qa-storage-fault-seeded")) return;
      const attemptId = `qa-corrupt-cache-${selectedLanguage}`;
      const attempt = {
        attemptId,
        caseId: "P001",
        mode: "free",
        language: selectedLanguage,
        participantId: "practice-user",
        schemaVersion: "attempt-v3",
        createdAt: "2026-07-25T00:00:00.000Z"
      };
      localStorage.setItem("hematuria-language", selectedLanguage);
      localStorage.setItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`, JSON.stringify(attempt));
      localStorage.setItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${attemptId}`, "{qa-invalid-json");
      sessionStorage.setItem("qa-storage-fault-seeded", "1");
    }, language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");

    const initialAlert = page.getByRole("alert").first();
    await expect(initialAlert).toBeVisible();
    const initialAlertText = await initialAlert.innerText();
    const cacheWarningLocalized = language === "zh"
      ? /损坏.*安全恢复/.test(initialAlertText)
      : !/[\u3400-\u9fff]/u.test(initialAlertText);
    const summaryField = page.getByRole("textbox", { name: copy.summary, exact: true });
    await expect(summaryField).toHaveValue("");
    const corruptPayloadRemoved = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      if (!pointer?.attemptId) return false;
      const raw = localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`);
      if (!raw) return false;
      try {
        const saved = JSON.parse(raw);
        return !saved?.answers?.historySummary;
      } catch {
        return false;
      }
    }, language);
    await initialAlert.getByRole("button").click();

    await page.evaluate(() => { window.__qaFailAttemptStorageWrites = true; });
    await summaryField.fill(draftMarker);
    await expect(page.getByRole("alert").first()).toBeVisible();
    const writeFailureAlertText = await page.getByRole("alert").first().innerText();
    const writeFailureWarningLocalized = language === "zh"
      ? /自动保存失败/.test(writeFailureAlertText)
      : !/[\u3400-\u9fff]/u.test(writeFailureAlertText);
    const failedDraftPersisted = await page.evaluate(({ selectedLanguage, marker }) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const raw = pointer?.attemptId
        ? localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`)
        : "";
      if (!raw) return false;
      return JSON.parse(raw)?.answers?.historySummary === marker;
    }, { selectedLanguage: language, marker: draftMarker });

    const recoveredMarker = `${draftMarker}-RECOVERED`;
    await page.evaluate(() => { window.__qaFailAttemptStorageWrites = false; });
    await summaryField.fill(recoveredMarker);
    await page.waitForFunction(({ selectedLanguage, marker }) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const raw = pointer?.attemptId
        ? localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`)
        : "";
      return Boolean(raw) && JSON.parse(raw)?.answers?.historySummary === marker;
    }, { selectedLanguage: language, marker: recoveredMarker }, { timeout: 8_000 });
    const staleWarningAfterRecovery = await page.getByRole("alert").first().isVisible().catch(() => false);
    await saveShot(page, testInfo, `storage-fault-recovery-${language}`, false);
    await page.reload();
    await expect(page.getByRole("textbox", { name: copy.summary, exact: true })).toHaveValue(recoveredMarker);
    const recoveredAfterReload = true;

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const unexpectedConsoleErrors = consoleEvents.filter((item) => item.type === "error");
    const resultPassed = corruptPayloadRemoved
      && cacheWarningLocalized
      && writeFailureWarningLocalized
      && !failedDraftPersisted
      && !staleWarningAfterRecovery
      && recoveredAfterReload;
    const summary = {
      schemaVersion: "exploratory-storage-fault-recovery-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P2-062",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "LOCAL_STORAGE_CORRUPTION_AND_QUOTA_EMULATION",
      corruptPayloadRemoved,
      blankRecoveryState: true,
      cacheWarningLocalized,
      writeFailureWarningLocalized,
      failedDraftPersisted,
      recoveredDraftPersisted: true,
      staleWarningAfterRecovery,
      recoveredAfterReload,
      actionNon200Responses: actionObservations.filter((item) => item.status !== 200).length,
      failedNetworkRequests: failedNetworkRequestCount,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      realQuotaExhaustionClaimed: false,
      responseBodiesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(corruptPayloadRemoved).toBe(true);
    expect(failedDraftPersisted).toBe(false);
    expect(recoveredAfterReload).toBe(true);
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(cacheWarningLocalized, "storage corruption warning must match the active interface language").toBe(true);
    expect(writeFailureWarningLocalized, "auto-save failure warning must match the active interface language").toBe(true);
    expect(staleWarningAfterRecovery, "a successful subsequent write must clear the obsolete auto-save failure warning").toBe(false);
  }, { videoOnFailure: true });
});

test("an incompatible completed attempt pointer cannot hydrate another case or language @terminal-pointer-isolation", async ({ browser }, testInfo) => {
  const targetLanguage = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const sourceLanguage = targetLanguage === "zh" ? "en" : "zh";
  const attemptId = `qa-terminal-scope-${viewportSlug(testInfo)}`;
  const seed = await createCompletedAttemptSeed("P001", sourceLanguage, attemptId);

  await withEvidence(browser, testInfo, "terminal-pointer-scope-isolation", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    const requestIds = new Set();
    await page.addInitScript(({ selectedLanguage, sourceAttempt, sourceSavedState }) => {
      localStorage.setItem("hematuria-language", selectedLanguage);
      const sourceKey = `hematuria-attempt-v3:${sourceAttempt.caseId}:${sourceAttempt.mode}:${sourceAttempt.language}:${sourceAttempt.attemptId}`;
      localStorage.setItem(sourceKey, JSON.stringify(sourceSavedState));
      localStorage.setItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`, JSON.stringify(sourceAttempt));
      localStorage.setItem(`hematuria-attempt-pointer-v3:P002:free:${selectedLanguage}`, JSON.stringify(sourceAttempt));
    }, {
      selectedLanguage: targetLanguage,
      sourceAttempt: seed.attempt,
      sourceSavedState: seed.savedState
    });
    await installProductionTrainingApi(page, [], actionObservations, {
      resetStore: false,
      serverTokens: new Map([[attemptId, seed.token]]),
      requestIds,
      pageLabel: "scope-probe"
    });

    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(800);
    const crossLanguageReportVisible = await page.getByTestId("final-report").isVisible().catch(() => false);
    await expect.poll(() => actionObservations.length).toBeGreaterThan(0);
    const languageActions = [...actionObservations];
    const p001PointerCompatible = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      return pointer?.caseId === "P001" && pointer?.mode === "free" && pointer?.language === selectedLanguage;
    }, targetLanguage);

    const beforeCaseNavigation = actionObservations.length;
    await page.goto("/cases/P002/");
    await expect(page.getByText("P002", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(800);
    const crossCaseReportVisible = await page.getByTestId("final-report").isVisible().catch(() => false);
    await expect.poll(() => actionObservations.length).toBeGreaterThan(beforeCaseNavigation);
    const caseActions = actionObservations.slice(beforeCaseNavigation);
    const p002PointerCompatible = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P002:free:${selectedLanguage}`) || "null");
      return pointer?.caseId === "P002" && pointer?.mode === "free" && pointer?.language === selectedLanguage;
    }, targetLanguage);
    const displayedSubmittedStageCount = await page.locator("aside").first().locator("section").first().locator("button").count();
    await saveShot(page, testInfo, `terminal-pointer-scope-isolation-${targetLanguage}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownScopeConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of (401|409).*?(Unauthorized|Conflict)/i.test(item.text)
    );
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownScopeConsoleErrors.includes(item)
      && !knownEnglishKeyErrors.includes(item)
    );
    const resultPassed = !crossLanguageReportVisible
      && !crossCaseReportVisible
      && p001PointerCompatible
      && p002PointerCompatible;
    const summary = {
      schemaVersion: "exploratory-terminal-pointer-isolation-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P1-061",
      targetLanguage,
      sourceLanguage,
      viewport: testInfo.project.use.viewport,
      boundary: "INCOMPATIBLE_LOCAL_ATTEMPT_POINTER_EMULATION",
      crossLanguageReportVisible,
      crossCaseReportVisible,
      p001PointerCompatible,
      p002PointerCompatible,
      displayedStageButtonCount: displayedSubmittedStageCount,
      languageScopeRejected: languageActions.some((item) => item.status >= 400),
      languageScopeStatuses: languageActions.map((item) => item.status),
      languageScopeErrors: languageActions.map((item) => item.error).filter(Boolean),
      caseScopeRejected: caseActions.some((item) => item.status >= 400),
      caseScopeStatuses: caseActions.map((item) => item.status),
      caseScopeErrors: caseActions.map((item) => item.error).filter(Boolean),
      failedNetworkRequests: failedNetworkRequestCount,
      expectedScopeConsoleErrors: knownScopeConsoleErrors.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      medicalFactsEvaluated: false,
      responseBodiesRetained: false,
      requestIdsRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(crossLanguageReportVisible, "a completed attempt from another language must not hydrate the active language").toBe(false);
    expect(crossCaseReportVisible, "a completed attempt from another case must not hydrate the active case").toBe(false);
    expect(p001PointerCompatible).toBe(true);
    expect(p002PointerCompatible).toBe(true);
  }, {
    videoOnFailure: true,
    traceScreenshots: false,
    traceSnapshots: false
  });
});

test("malformed attempt pointers fail closed before terminal state hydration @malformed-pointer-fields", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const attemptId = `qa-malformed-pointer-${viewportSlug(testInfo)}`;
  const seed = await createCompletedAttemptSeed("P001", language, attemptId);
  const variants = [
    { id: "missing-schema", omit: ["schemaVersion"] },
    { id: "missing-case", omit: ["caseId"] },
    { id: "missing-mode", omit: ["mode"] },
    { id: "missing-language", omit: ["language"] },
    { id: "missing-participant", omit: ["participantId"] },
    { id: "missing-attempt-id", omit: ["attemptId"] },
    { id: "wrong-participant", patch: { participantId: "qa-other-participant" } }
  ];

  await withEvidence(browser, testInfo, "malformed-pointer-fields", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations, {
      resetStore: false,
      serverTokens: new Map([[attemptId, seed.token]]),
      requestIds: new Set(),
      pageLabel: "malformed-pointer"
    });
    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();

    const observations = [];
    for (const variant of variants) {
      await page.evaluate(({ selectedLanguage, sourceAttempt, sourceSavedState, scenario }) => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("hematuria-attempt-v3:") || key.startsWith("hematuria-attempt-pointer-v3:")) localStorage.removeItem(key);
        }
        const malformed = { ...sourceAttempt, ...(scenario.patch || {}) };
        for (const field of scenario.omit || []) delete malformed[field];
        const participantScope = malformed.participantId === "practice-user"
          ? ""
          : `:participant:${encodeURIComponent(malformed.participantId)}:${malformed.schemaVersion}`;
        const storageKey = `hematuria-attempt-v3:${malformed.caseId}:${malformed.mode}:${malformed.language}${participantScope}:${malformed.attemptId}`;
        localStorage.setItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`, JSON.stringify(malformed));
        localStorage.setItem(storageKey, JSON.stringify({ ...sourceSavedState, attempt: malformed }));
      }, {
        selectedLanguage: language,
        sourceAttempt: seed.attempt,
        sourceSavedState: seed.savedState,
        scenario: variant
      });
      const actionOffset = actionObservations.length;
      await page.reload();
      await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
      await page.waitForTimeout(500);
      const finalReportVisible = await page.getByTestId("final-report").isVisible().catch(() => false);
      const pointerAudit = await page.evaluate((selectedLanguage) => {
        const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
        return {
          compatible: Boolean(
            pointer?.attemptId
            && pointer?.caseId === "P001"
            && pointer?.mode === "free"
            && pointer?.language === selectedLanguage
            && pointer?.participantId === "practice-user"
            && pointer?.schemaVersion === "attempt-v3"
          ),
          identityFieldCount: ["attemptId", "caseId", "mode", "language", "participantId", "schemaVersion"]
            .filter((field) => typeof pointer?.[field] === "string" && pointer[field].length > 0).length
        };
      }, language);
      observations.push({
        variant: variant.id,
        finalReportVisible,
        pointerCompatible: pointerAudit.compatible,
        pointerIdentityFieldCount: pointerAudit.identityFieldCount,
        actionStatuses: actionObservations.slice(actionOffset).map((item) => item.status),
        actionErrors: actionObservations.slice(actionOffset).map((item) => item.error).filter(Boolean)
      });
    }

    await saveShot(page, testInfo, `malformed-pointer-fields-${language}`, false);
    const expectedNavigationAborts = networkEvents.filter((item) =>
      item.status === "FAILED"
      && item.failure === "net::ERR_ABORTED"
      && item.path === "/api/session/init/"
    );
    const failedNetworkRequestCount = networkEvents.filter((item) =>
      item.status === "FAILED"
      && !expectedNavigationAborts.includes(item)
    ).length;
    const knownScopeConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of (400|401|409).*?(Bad Request|Unauthorized|Conflict)/i.test(item.text)
    );
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownScopeConsoleErrors.includes(item)
      && !knownEnglishKeyErrors.includes(item)
    );
    const unsafeHydrationCount = observations.filter((item) => item.finalReportVisible || !item.pointerCompatible).length;
    const resultPassed = unsafeHydrationCount === 0;
    const summary = {
      schemaVersion: "exploratory-malformed-pointer-fields-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P1-061",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "MALFORMED_LOCAL_ATTEMPT_POINTER_EMULATION",
      variantCount: observations.length,
      unsafeHydrationCount,
      finalReportVisibleCount: observations.filter((item) => item.finalReportVisible).length,
      compatiblePointerCount: observations.filter((item) => item.pointerCompatible).length,
      observations,
      failedNetworkRequests: failedNetworkRequestCount,
      expectedNavigationAborts: expectedNavigationAborts.length,
      expectedScopeConsoleErrors: knownScopeConsoleErrors.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      medicalFactsEvaluated: false,
      responseBodiesRetained: false,
      requestIdsRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(observations, "all malformed pointers must be replaced before terminal state hydration").toEqual(
      observations.map((item) => expect.objectContaining({ finalReportVisible: false, pointerCompatible: true }))
    );
  }, {
    videoOnFailure: true,
    traceScreenshots: false,
    traceSnapshots: false
  });
});

test("attempt storage recovers its pointer after a transient API outage @attempt-storage-api-recovery", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? { summary: "History summary" }
    : { summary: "病史小结" };
  const marker = language === "en"
    ? "QA transient attempt storage recovery marker"
    : "QA临时attempt存储恢复标记";

  await withEvidence(browser, testInfo, "attempt-storage-api-recovery", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => {
      localStorage.setItem("hematuria-language", selectedLanguage);
      if (sessionStorage.getItem("qa-attempt-storage-restored") === "1") return;
      const original = {
        getItem: Storage.prototype.getItem,
        setItem: Storage.prototype.setItem,
        removeItem: Storage.prototype.removeItem
      };
      const isAttemptKey = (key) => String(key).startsWith("hematuria-attempt-v3:")
        || String(key).startsWith("hematuria-attempt-pointer-v3:");
      globalThis.__qaAttemptStorageFaultCounts = { get: 0, set: 0, remove: 0 };
      Storage.prototype.getItem = function getItem(key) {
        if (this === localStorage && isAttemptKey(key)) {
          globalThis.__qaAttemptStorageFaultCounts.get += 1;
          throw new DOMException("QA attempt storage unavailable", "SecurityError");
        }
        return original.getItem.call(this, key);
      };
      Storage.prototype.setItem = function setItem(key, value) {
        if (this === localStorage && isAttemptKey(key)) {
          globalThis.__qaAttemptStorageFaultCounts.set += 1;
          throw new DOMException("QA attempt storage unavailable", "SecurityError");
        }
        return original.setItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function removeItem(key) {
        if (this === localStorage && isAttemptKey(key)) {
          globalThis.__qaAttemptStorageFaultCounts.remove += 1;
          throw new DOMException("QA attempt storage unavailable", "SecurityError");
        }
        return original.removeItem.call(this, key);
      };
      globalThis.__qaRestoreAttemptStorage = () => {
        Storage.prototype.getItem = original.getItem;
        Storage.prototype.setItem = original.setItem;
        Storage.prototype.removeItem = original.removeItem;
        sessionStorage.setItem("qa-attempt-storage-restored", "1");
      };
    }, language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect.poll(() => actionObservations.filter((item) => item.action === "init-attempt").length).toBeGreaterThan(0);

    const faultCounts = await page.evaluate(() => {
      const counts = { ...globalThis.__qaAttemptStorageFaultCounts };
      globalThis.__qaRestoreAttemptStorage();
      return counts;
    });
    await page.getByLabel(copy.summary).fill(marker);
    const readStorageRecoveryState = () => page.evaluate(({ selectedLanguage, expectedMarker }) => {
      const pointerKey = `hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`;
      const pointer = JSON.parse(localStorage.getItem(pointerKey) || "null");
      const attemptKeys = Object.keys(localStorage).filter((key) => key.startsWith(`hematuria-attempt-v3:P001:free:${selectedLanguage}:`));
      const markerKey = attemptKeys.find((key) => {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        return saved?.answers?.historySummary === expectedMarker;
      });
      return {
        pointerPresent: Boolean(pointer?.attemptId),
        persistedMarkerPresent: Boolean(markerKey),
        persistedAttemptCount: attemptKeys.length
      };
    }, { selectedLanguage: language, expectedMarker: marker });
    await expect.poll(readStorageRecoveryState).toMatchObject({ persistedMarkerPresent: true });
    const beforeReload = await readStorageRecoveryState();

    await page.reload();
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(600);
    const afterReload = await page.evaluate(({ selectedLanguage, expectedMarker }) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const pointedState = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      const orphanMarkerCount = Object.keys(localStorage)
        .filter((key) => key.startsWith(`hematuria-attempt-v3:P001:free:${selectedLanguage}:`))
        .filter((key) => JSON.parse(localStorage.getItem(key) || "null")?.answers?.historySummary === expectedMarker)
        .length;
      return {
        pointerPresent: Boolean(pointer?.attemptId),
        markerRecovered: pointedState?.answers?.historySummary === expectedMarker,
        orphanMarkerCount
      };
    }, { selectedLanguage: language, expectedMarker: marker });
    await saveShot(page, testInfo, `attempt-storage-api-recovery-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) => item.type === "error" && !knownEnglishKeyErrors.includes(item));
    const resultPassed = beforeReload.pointerPresent && afterReload.markerRecovered && afterReload.orphanMarkerCount === 0;
    const summary = {
      schemaVersion: "exploratory-attempt-storage-api-recovery-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P1-063",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "ATTEMPT_STORAGE_API_UNAVAILABLE_EMULATION",
      storageFaultObserved: Object.values(faultCounts).some((count) => count > 0),
      faultCounts,
      beforeReload,
      afterReload,
      trainingInitStatuses: actionObservations.filter((item) => item.action === "init-attempt").map((item) => item.status),
      failedNetworkRequests: failedNetworkRequestCount,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      realStorageOutageClaimed: false,
      medicalFactsEvaluated: false,
      responseBodiesRetained: false,
      requestIdsRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(beforeReload.pointerPresent, "the recovered storage API must receive a pointer for the active attempt").toBe(true);
    expect(afterReload.markerRecovered, "a draft saved after storage recovery must survive reload").toBe(true);
    expect(afterReload.orphanMarkerCount).toBe(0);
  }, { videoOnFailure: true });
});

test("a transient attempt-state write failure preserves one history-log retry identity @history-log-storage-recovery", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? {
        input: "Enter an interview question",
        question: "Have you noticed any change in urine color?",
        reply: "I have not noticed.",
        paused: "Scoring sync paused",
        retry: "Retry sync",
        verified: "Scoring synced"
      }
    : {
        input: "输入问诊问题",
        question: "有没有留意尿液颜色变化？",
        reply: "我没有留意。",
        paused: "评分同步已暂停",
        retry: "重新同步",
        verified: "评分已同步"
      };

  await withEvidence(browser, testInfo, "history-log-storage-recovery", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    const historyRequestIds = [];
    const historyStatuses = [];
    let historyAllowed = false;
    await page.addInitScript((selectedLanguage) => {
      localStorage.setItem("hematuria-language", selectedLanguage);
      localStorage.setItem("hematuria-speech-preferences", JSON.stringify({ enabled: false, provider: "disabled" }));
    }, language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.route("**/api/agent-chat/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        replyText: copy.reply,
        matchedSlotIds: [],
        matchedFacts: [],
        provider: "fixture",
        generationSource: "fixture",
        isFallback: false
      })
    }));
    await page.route("**/api/training-action/**", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action !== "history-log") return route.fallback();
      historyRequestIds.push(String(body.requestId || ""));
      if (historyAllowed) {
        historyStatuses.push(200);
        return route.fallback();
      }
      historyStatuses.push(503);
      await new Promise((resolve) => setTimeout(resolve, 120));
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "qa_history_log_unavailable" })
      });
    });

    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: copy.input })).toBeEnabled();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem;
      globalThis.__qaAttemptWriteFailureCount = 0;
      Storage.prototype.setItem = function setItem(key, value) {
        if (
          this === localStorage
          && String(key).startsWith("hematuria-attempt-v3:")
          && globalThis.__qaAttemptWriteFailureCount === 0
        ) {
          globalThis.__qaAttemptWriteFailureCount += 1;
          Storage.prototype.setItem = originalSetItem;
          throw new DOMException("QA one-shot attempt write failure", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await page.getByRole("textbox", { name: copy.input }).fill(copy.question);
    await page.getByRole("textbox", { name: copy.input }).press("Enter");
    await expect(page.getByText(copy.reply, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(copy.paused, { exact: true })).toBeVisible({ timeout: 10_000 });

    const persistedBeforeReload = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return {
        oneShotWriteFailures: Number(globalThis.__qaAttemptWriteFailureCount || 0),
        pendingCount: Array.isArray(saved?.pendingHistoryLogs) ? saved.pendingHistoryLogs.length : 0,
        pendingAttempts: Number(saved?.pendingHistoryLogs?.[0]?.attempts ?? -1)
      };
    }, language);
    const callsBeforeReload = historyStatuses.length;
    await page.reload();
    await expect(page.getByText(copy.paused, { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    const automaticCallsAfterReload = historyStatuses.length - callsBeforeReload;
    historyAllowed = true;
    await page.getByRole("button", { name: copy.retry, exact: true }).click();
    await expect(page.getByText(copy.verified, { exact: true })).toBeVisible();
    await expect.poll(() => historyStatuses.filter((status) => status === 200).length).toBe(1);
    const readPendingHistoryState = () => page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return {
        pendingCount: Array.isArray(saved?.pendingHistoryLogs) ? saved.pendingHistoryLogs.length : 0
      };
    }, language);
    await expect.poll(readPendingHistoryState).toEqual({ pendingCount: 0 });
    const persistedAfterRecovery = await readPendingHistoryState();

    const uniqueRequestIdCount = new Set(historyRequestIds.filter(Boolean)).size;
    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownHistoryConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /status of 503.*Service Unavailable/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && !knownHistoryConsoleErrors.includes(item)
    );
    const resultPassed = persistedBeforeReload.oneShotWriteFailures === 1
      && persistedBeforeReload.pendingCount === 1
      && persistedBeforeReload.pendingAttempts === 3
      && automaticCallsAfterReload === 0
      && historyStatuses.filter((status) => status === 503).length === 3
      && historyStatuses.filter((status) => status === 200).length === 1
      && uniqueRequestIdCount === 1
      && persistedAfterRecovery.pendingCount === 0;
    const summary = {
      schemaVersion: "exploratory-history-log-storage-recovery-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: null,
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "ONE_SHOT_ATTEMPT_WRITE_FAILURE_AND_HISTORY_RETRY_EMULATION",
      persistedBeforeReload,
      automaticCallsAfterReload,
      historyRequestCount: historyStatuses.length,
      uniqueRequestIdCount,
      historyStatuses,
      persistedAfterRecovery,
      failedNetworkRequests: failedNetworkRequestCount,
      expectedHistoryConsoleErrors: knownHistoryConsoleErrors.length,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      questionTextRetained: false,
      requestIdsRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(resultPassed).toBe(true);
  }, { videoOnFailure: true });
});

test("the case catalog remains usable when browser storage reads and writes are unavailable @catalog-storage-unavailable", async ({ browser }, testInfo) => {
  const targetLanguage = ["qa-1280x720", "qa-360x800"].includes(testInfo.project.name) ? "en" : "zh";

  await withEvidence(browser, testInfo, "catalog-storage-unavailable", async ({ page, slug, consoleEvents, networkEvents }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(redact(error.message).slice(0, 500)));
    await page.addInitScript(() => {
      const originalGetItem = Storage.prototype.getItem;
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function getItem(key) {
        if (this === localStorage) throw new DOMException(`QA catalog storage read unavailable: ${String(key).slice(0, 40)}`, "SecurityError");
        return originalGetItem.call(this, key);
      };
      Storage.prototype.setItem = function setItem(key, value) {
        if (this === localStorage) throw new DOMException(`QA catalog storage write unavailable: ${String(key).slice(0, 40)}`, "SecurityError");
        return originalSetItem.call(this, key, value);
      };
    });
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
    await page.goto("/cases/");
    await page.waitForTimeout(1000);
    const englishButtonVisible = await page.evaluate(() =>
      [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "English")
    ).catch(() => false);
    if (targetLanguage === "en" && englishButtonVisible) {
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "English");
        button?.click();
      });
      await page.waitForTimeout(250);
    }
    const heading = targetLanguage === "en" ? "Case selection" : "病例选择";
    const searchLabel = targetLanguage === "en" ? "Search cases" : "搜索病例";
    const domAudit = await page.evaluate(({ expectedHeading, expectedSearchLabel }) => {
      const text = document.body?.innerText || "";
      const search = [...document.querySelectorAll("input")].find((item) =>
        item.getAttribute("aria-label") === expectedSearchLabel
        || item.getAttribute("placeholder")?.includes(expectedSearchLabel)
      );
      return {
        catalogHeadingVisible: [...document.querySelectorAll("h1,h2")].some((item) => item.textContent?.trim() === expectedHeading),
        searchUsable: Boolean(search && !search.disabled),
        applicationErrorVisible: /Application error: a client-side exception/i.test(text),
        caseCardCount: document.querySelectorAll('a[href*="/cases/P"]').length,
        htmlLanguage: document.documentElement.lang
      };
    }, { expectedHeading: heading, expectedSearchLabel: searchLabel }).catch(() => ({
      catalogHeadingVisible: false,
      searchUsable: false,
      applicationErrorVisible: true,
      caseCardCount: 0,
      htmlLanguage: ""
    }));
    const {
      catalogHeadingVisible,
      searchUsable,
      applicationErrorVisible,
      caseCardCount,
      htmlLanguage
    } = domAudit;
    await saveShot(page, testInfo, `catalog-storage-unavailable-${targetLanguage}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const consoleErrorCount = consoleEvents.filter((item) => item.type === "error").length;
    const expectedHtmlLanguage = targetLanguage === "en" ? "en" : "zh-CN";
    const resultPassed = caseCardCount === 42
      && htmlLanguage === expectedHtmlLanguage
      && pageErrors.length === 0
      && consoleErrorCount === 0;
    const summary = {
      schemaVersion: "exploratory-catalog-storage-unavailable-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P1-064",
      targetLanguage,
      viewport: testInfo.project.use.viewport,
      boundary: "CATALOG_LOCAL_STORAGE_GET_SET_UNAVAILABLE_EMULATION",
      caseCardCount,
      expectedCaseCardCount: 42,
      catalogHeadingVisible,
      searchUsable,
      applicationErrorVisible,
      languageButtonVisible: englishButtonVisible,
      htmlLanguage,
      expectedHtmlLanguage,
      pageErrorCount: pageErrors.length,
      consoleErrorCount,
      failedNetworkRequests: failedNetworkRequestCount,
      errorMessagesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(caseCardCount).toBe(42);
    expect(catalogHeadingVisible).toBe(true);
    expect(searchUsable).toBe(true);
    expect(applicationErrorVisible).toBe(false);
    expect(pageErrors).toEqual([]);
    expect(consoleErrorCount).toBe(0);
    expect(htmlLanguage).toBe(expectedHtmlLanguage);
  }, { videoOnFailure: true });
});

test("catalog progress ignores malformed pointers and unverified summaries @catalog-progress-integrity", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const labels = language === "en"
    ? { inProgress: "In progress", completed: "Completed", notStarted: "Not started" }
    : { inProgress: "进行中", completed: "已完成", notStarted: "未开始" };

  await withEvidence(browser, testInfo, "catalog-progress-integrity", async ({ page, slug, consoleEvents, networkEvents }) => {
    await page.addInitScript((selectedLanguage) => {
      localStorage.setItem("hematuria-language", selectedLanguage);
      localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:zh", "{qa-malformed-pointer");
      localStorage.setItem("hematuria-practice-attempt-summaries-v1", JSON.stringify([{ caseId: "P002" }]));
      localStorage.setItem("hematuria-attempt-v3:P003:free:zh:qa-orphan", JSON.stringify({
        attempt: {
          attemptId: "qa-orphan",
          caseId: "P003",
          mode: "free",
          language: "zh",
          participantId: "practice-user",
          schemaVersion: "attempt-v3"
        },
        activeStageNo: 3
      }));
    }, language);
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
    await page.goto("/cases/");
    const cards = {
      malformedPointer: page.locator('a[href$="/cases/P001/"]'),
      unverifiedSummary: page.locator('a[href$="/cases/P002/"]'),
      orphanAttempt: page.locator('a[href$="/cases/P003/"]')
    };
    await expect(cards.malformedPointer).toBeVisible();
    const statuses = {
      malformedPointerInProgress: await cards.malformedPointer.getByText(labels.inProgress, { exact: true }).isVisible().catch(() => false),
      unverifiedSummaryCompleted: await cards.unverifiedSummary.getByText(labels.completed, { exact: true }).isVisible().catch(() => false),
      orphanAttemptNotStarted: await cards.orphanAttempt.getByText(labels.notStarted, { exact: true }).isVisible().catch(() => false)
    };
    await saveShot(page, testInfo, `catalog-progress-integrity-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const consoleErrorCount = consoleEvents.filter((item) => item.type === "error").length;
    const resultPassed = !statuses.malformedPointerInProgress
      && !statuses.unverifiedSummaryCompleted
      && statuses.orphanAttemptNotStarted;
    const summary = {
      schemaVersion: "exploratory-catalog-progress-integrity-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P2-065",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "MALFORMED_POINTER_AND_UNVERIFIED_SUMMARY_CATALOG_EMULATION",
      statuses,
      falseProgressSignals: Number(statuses.malformedPointerInProgress) + Number(statuses.unverifiedSummaryCompleted),
      orphanAttemptAutoAdopted: !statuses.orphanAttemptNotStarted,
      failedNetworkRequests: failedNetworkRequestCount,
      consoleErrorCount,
      storageValuesRetained: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(consoleErrorCount).toBe(0);
    expect(statuses).toEqual({
      malformedPointerInProgress: false,
      unverifiedSummaryCompleted: false,
      orphanAttemptNotStarted: true
    });
  }, { videoOnFailure: true });
});

test("restart clears the active attempt even when the first remove call fails @restart-remove-failure", async ({ browser }, testInfo) => {
  const language = ["qa-1440x900", "qa-390x844"].includes(testInfo.project.name) ? "zh" : "en";
  const copy = language === "en"
    ? { summary: "History summary", submit: "Submit stage", restart: "Restart training" }
    : { summary: "病史小结", submit: "提交本阶段", restart: "重新开始训练" };
  const marker = language === "en"
    ? "QA restart storage cleanup marker"
    : "QA重启存储清理标记";

  await withEvidence(browser, testInfo, "restart-remove-failure", async ({ page, slug, consoleEvents, networkEvents }) => {
    const actionObservations = [];
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installProductionTrainingApi(page, [], actionObservations);
    await page.goto("/cases/P001/");
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await page.getByLabel(copy.summary).fill(marker);
    await page.getByRole("button", { name: copy.submit, exact: true }).click();
    await expect.poll(() => actionObservations.filter((item) => item.action === "stage-feedback" && item.status === 200).length).toBe(1);
    const beforeRestart = await page.evaluate((selectedLanguage) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return {
        attemptId: String(pointer?.attemptId || ""),
        submittedStageCount: saved?.submitted ? Object.keys(saved.submitted).length : 0
      };
    }, language);
    await page.evaluate(() => {
      const originalRemoveItem = Storage.prototype.removeItem;
      globalThis.__qaRestartRemoveFailureCount = 0;
      Storage.prototype.removeItem = function removeItem(key) {
        if (
          this === localStorage
          && String(key).startsWith("hematuria-attempt-v3:")
          && sessionStorage.getItem("qa-restart-remove-failure-count") !== "1"
        ) {
          globalThis.__qaRestartRemoveFailureCount += 1;
          sessionStorage.setItem("qa-restart-remove-failure-count", "1");
          Storage.prototype.removeItem = originalRemoveItem;
          throw new DOMException("QA one-shot restart remove failure", "SecurityError");
        }
        return originalRemoveItem.call(this, key);
      };
    });
    page.once("dialog", (dialog) => dialog.accept());
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("button", { name: copy.restart, exact: true }).click()
    ]);
    await expect(page.getByText("P001", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(600);
    const afterRestart = await page.evaluate(({ selectedLanguage, expectedMarker, previousAttemptId }) => {
      const pointer = JSON.parse(localStorage.getItem(`hematuria-attempt-pointer-v3:P001:free:${selectedLanguage}`) || "null");
      const saved = pointer?.attemptId
        ? JSON.parse(localStorage.getItem(`hematuria-attempt-v3:P001:free:${selectedLanguage}:${pointer.attemptId}`) || "null")
        : null;
      return {
        oneShotRemoveFailures: Number(sessionStorage.getItem("qa-restart-remove-failure-count") || 0),
        sameAttempt: pointer?.attemptId === previousAttemptId,
        submittedStageCount: saved?.submitted ? Object.keys(saved.submitted).length : 0,
        markerRetained: saved?.answers?.historySummary === expectedMarker
      };
    }, { selectedLanguage: language, expectedMarker: marker, previousAttemptId: beforeRestart.attemptId });
    await saveShot(page, testInfo, `restart-remove-failure-${language}`, false);

    const failedNetworkRequestCount = networkEvents.filter((item) => item.status === "FAILED").length;
    const knownEnglishKeyErrors = consoleEvents.filter((item) =>
      item.type === "error"
      && /same key|keys should be unique/i.test(item.text)
      && /Physical examination/i.test(item.text)
    );
    const unexpectedConsoleErrors = consoleEvents.filter((item) => item.type === "error" && !knownEnglishKeyErrors.includes(item));
    const resultPassed = afterRestart.oneShotRemoveFailures === 1
      && !afterRestart.sameAttempt
      && afterRestart.submittedStageCount === 0
      && !afterRestart.markerRetained;
    const summary = {
      schemaVersion: "exploratory-restart-remove-failure-v1",
      productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
      result: resultPassed ? "PASS_EMULATION" : "FAIL_EMULATION",
      defectId: resultPassed ? null : "HEM-P1-066",
      language,
      viewport: testInfo.project.use.viewport,
      boundary: "ONE_SHOT_ACTIVE_ATTEMPT_REMOVE_FAILURE_EMULATION",
      beforeRestart: {
        attemptPresent: Boolean(beforeRestart.attemptId),
        submittedStageCount: beforeRestart.submittedStageCount
      },
      afterRestart,
      trainingInitStatuses: actionObservations.filter((item) => item.action === "init-attempt").map((item) => item.status),
      failedNetworkRequests: failedNetworkRequestCount,
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      attemptIdsRetained: false,
      medicalFactsEvaluated: false,
      credentialsRetained: false
    };
    await writeFile(path.join(DIRS.reports, `7781586-${slug}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    expect(failedNetworkRequestCount).toBe(0);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(afterRestart).toEqual({
      oneShotRemoveFailures: 1,
      sameAttempt: false,
      submittedStageCount: 0,
      markerRetained: false
    });
  }, { videoOnFailure: true });
});

test("HEM-P1-046 numeric lab result exposes unit and reference range metadata", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "qa-1440x900", "One representative desktop trace is sufficient for the data metadata defect.");
  await withEvidence(browser, testInfo, "hem-p1-046-data-agent-metadata", async ({ page }) => {
    await installFullWorkflowApi(page);
    const representative = ORDER_RESULTS.find((item) => item.caseId === "P001" && item.orderId === "LAB-BL-001" && item.status === "final");
    expect(representative).toBeDefined();
    await page.route("**/api/training-action/**", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action !== "order") return route.fallback();
      const result = {
        ...representative,
        orderCategory: "检验/血液",
        synonyms: ["血常规"],
        result: representative.value || representative.impression,
        abnormalLevel: representative.abnormalFlags.join("、") || representative.status,
        teachingExplanation: "当前病例、当前阶段已开医嘱的结构化结果。",
        isKey: true,
        prerequisite: representative.prerequisites.join("、")
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-Training-State": "qa-fixture-state" },
        body: JSON.stringify({
          id: "qa-data-agent-metadata",
          input: body.input,
          matched: true,
          matchedOrders: [{ orderId: representative.orderId, displayName: "血常规" }],
          results: [result],
          message: "已返回结构化检验结果。",
          at: "2026-07-19T07:40:00.000Z",
          placedAt: "2026-07-19T07:40:00.000Z",
          stageNo: 2,
          status: "reported"
        })
      });
    });

    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "中文" }).click();
    await page.getByLabel("病史小结").fill("QA数据Agent元数据复现，不作医学判断。");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();
    await page.context().tracing.stop();
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
    await page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜").fill("血常规");
    await page.getByRole("button", { name: "开立并返回结果", exact: true }).click();
    const card = page.getByTestId("report-card").first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await saveShot(page, testInfo, "hem-p1-046-data-agent-metadata", false);
    const unit = card.getByText("单位", { exact: true }).locator("..").locator("dd");
    const referenceRange = card.getByText("参考范围", { exact: true }).locator("..").locator("dd");
    const observed = { unit: await unit.innerText(), referenceRange: await referenceRange.innerText() };
    expect(observed, "final numeric laboratory results must not render missing metadata as em dashes").toEqual({
      unit: expect.not.stringMatching(/^—$/),
      referenceRange: expect.not.stringMatching(/^—$/)
    });
  }, { videoOnFailure: true });
});

test("HEM-P1-047 structured report statuses are localized and preserve abnormal presentation", async ({ browser }, testInfo) => {
  const language = ["qa-1280x720", "qa-360x800"].includes(testInfo.project.name) ? "en" : "zh";
  const copy = language === "en"
    ? {
        historySummary: "History summary",
        submitStage: "Submit stage",
        nextStage: "Next Agent",
        orderPlaceholder: "Example: urinalysis and sediment, CTU, cystoscopy",
        orderAndReturn: "Order and return results"
      }
    : {
        historySummary: "病史小结",
        submitStage: "提交本阶段",
        nextStage: "进入下一阶段",
        orderPlaceholder: "例如：尿常规+尿沉渣、CTU、膀胱镜",
        orderAndReturn: "开立并返回结果"
      };
  const statusValues = ["final", "not_available", "not_performed"];
  const representatives = statusValues.map((status) => ORDER_RESULTS.find((item) => item.status === status));
  expect(representatives.every(Boolean)).toBe(true);

  await withEvidence(browser, testInfo, "hem-p1-047-data-agent-status", async ({ page }) => {
    await page.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await installFullWorkflowApi(page);
    await page.route("**/api/training-action/**", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action !== "order") return route.fallback();
      const results = representatives.map((representative, index) => ({
        caseId: "P001",
        orderId: `QA-STATUS-${index + 1}`,
        resultId: `qa-status-${index + 1}`,
        status: representative.status,
        value: "",
        unit: "",
        referenceRange: "",
        impression: "",
        abnormalFlags: representative.status === "final" ? ["positive"] : [],
        orderCategory: language === "en" ? "QA status contract" : "QA 状态合同",
        synonyms: [],
        result: `QA non-medical status fixture ${index + 1}`,
        abnormalLevel: representative.status === "final" ? "positive" : representative.status,
        teachingExplanation: language === "en"
          ? "QA-only presentation fixture; not a medical result."
          : "仅用于 QA 呈现复现，不是医学结果。",
        isKey: false,
        prerequisite: ""
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-Training-State": "qa-fixture-state" },
        body: JSON.stringify({
          id: "qa-data-agent-status-presentation",
          input: body.input,
          matched: true,
          matchedOrders: results.map((item) => ({ orderId: item.orderId, displayName: item.orderCategory })),
          results,
          message: language === "en" ? "QA status fixtures returned." : "已返回 QA 状态复现数据。",
          at: "2026-07-19T09:00:00.000Z",
          placedAt: "2026-07-19T09:00:00.000Z",
          stageNo: 2,
          status: "reported"
        })
      });
    });

    await page.goto("/cases/P001/");
    await page.getByLabel(copy.historySummary).fill(language === "en"
      ? "QA status presentation reproduction; no medical judgment."
      : "QA 状态呈现复现，不作医学判断。");
    await page.getByRole("button", { name: copy.submitStage, exact: true }).click();
    await page.getByRole("button", { name: copy.nextStage, exact: true }).click();
    await page.context().tracing.stop();
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
    await page.getByPlaceholder(copy.orderPlaceholder).fill("QA status contract");
    await page.getByRole("button", { name: copy.orderAndReturn, exact: true }).click();

    const cards = page.getByTestId("report-card");
    await expect(cards).toHaveCount(3);
    await cards.first().scrollIntoViewIfNeeded();
    const observedStatusLabels = [];
    const cardDataStatuses = [];
    for (let index = 0; index < 3; index += 1) {
      observedStatusLabels.push((await cards.nth(index).locator(".ui-status").innerText()).trim());
      cardDataStatuses.push(await cards.nth(index).getAttribute("data-status"));
    }
    const statusCounts = Object.fromEntries(statusValues.map((status) => [
      status,
      ORDER_RESULTS.filter((item) => item.status === status).length
    ]));
    const rawStatusLeakCount = observedStatusLabels.filter((label) => statusValues.includes(label)).length;
    const summary = {
      schemaVersion: 1,
      productionSha: "70ea9b3c7b31e11a84878de5c277cac60f35481c",
      status: rawStatusLeakCount || cardDataStatuses[0] !== "abnormal" ? "FAIL_LOCAL_QA" : "PASS_LOCAL",
      defectId: rawStatusLeakCount || cardDataStatuses[0] !== "abnormal" ? "HEM-P1-047" : null,
      language,
      viewport: testInfo.project.use.viewport,
      source: "deterministic_fixture_not_real_ai",
      providerCalls: 0,
      productionStructuredResultCount: ORDER_RESULTS.length,
      productionStructuredStatusCounts: statusCounts,
      observedStatusLabels,
      cardDataStatuses,
      rawStatusLeakCount,
      governedAbnormalFlagPresented: cardDataStatuses[0] === "abnormal",
      medicalValuesRetained: false
    };
    await writeFile(path.join(DIRS.reports, `hem-p1-047-data-agent-status-${viewportSlug(testInfo)}.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await saveShot(page, testInfo, `hem-p1-047-data-agent-status-${language}`, false);
    expect({ rawStatusLeakCount, governedAbnormalState: cardDataStatuses[0] }).toEqual({
      rawStatusLeakCount: 0,
      governedAbnormalState: "abnormal"
    });
  }, { videoOnFailure: true });
});

test("HEM-P1-048 English Data Agent UI does not expose Chinese catalog or report content", async ({ browser }, testInfo) => {
  resetMemoryAttemptStore();
  const attemptId = `qa-data-agent-ui-${viewportSlug(testInfo)}`;
  const remoteAddress = `qa-data-agent-ui-${viewportSlug(testInfo)}`;
  let handlerResponse = await invokeLocalTrainingAction({
    action: "init-attempt",
    caseId: "P008",
    attemptId,
    mode: "free",
    language: "en"
  }, "", remoteAddress);
  const handlerStatusCodes = [handlerResponse.statusCode];
  handlerResponse = await invokeLocalTrainingAction({
    action: "stage-feedback",
    caseId: "P008",
    attemptId,
    mode: "free",
    language: "en",
    stageKey: "history",
    submission: {}
  }, handlerResponse.token, remoteAddress);
  handlerStatusCodes.push(handlerResponse.statusCode);
  handlerResponse = await invokeLocalTrainingAction({
    action: "order",
    caseId: "P008",
    attemptId,
    mode: "free",
    language: "en",
    input: "CBC"
  }, handlerResponse.token, remoteAddress);
  handlerStatusCodes.push(handlerResponse.statusCode);
  expect(handlerStatusCodes).toEqual([200, 200, 200]);
  expect(handlerResponse.payload.results).toHaveLength(1);
  const productionOrderPayload = handlerResponse.payload;

  await withEvidence(browser, testInfo, "hem-p1-048-data-agent-english", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
    await installFullWorkflowApi(page);
    await page.route("**/api/session/init/**", (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "qa-data-agent-english-session",
          caseId: body.caseId,
          language: body.language,
          mode: body.runtimeMode || "free",
          patientOpeningStatement: "Hello doctor.",
          sessionCreatedAt: "2026-07-19T09:30:00.000Z",
          sessionExpiresAt: "2026-07-19T10:30:00.000Z",
          deploymentSha: "fixture-only",
          apiVersion: "qa-fixture",
          aiStatus: "available",
          profileSource: "local-simulation",
          cacheHit: false
        })
      });
    });
    await page.route("**/api/training-action/**", (route) => {
      const body = route.request().postDataJSON();
      if (body?.action !== "order") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-Training-State": "qa-fixture-state" },
        body: JSON.stringify(productionOrderPayload)
      });
    });

    await page.goto("/cases/P008/");
    await page.getByLabel("History summary").fill("QA bilingual Data Agent reproduction; no medical judgment.");
    await page.getByRole("button", { name: "Submit stage", exact: true }).click();
    await page.getByRole("button", { name: "Next Agent", exact: true }).click();
    const cjkControlCount = await page.locator("main button, main label").evaluateAll((nodes) => nodes
      .filter((node) => /[\u3400-\u9fff]/u.test(node.textContent || "")).length);
    await page.context().tracing.stop();
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
    await page.getByPlaceholder("Example: urinalysis and sediment, CTU, cystoscopy").fill("CBC");
    await page.getByRole("button", { name: "Order and return results", exact: true }).click();
    const card = page.getByTestId("report-card").first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const cjk = /[\u3400-\u9fff]/u;
    const reportCardContainsCjk = cjk.test(await card.innerText());
    const matchedOrderDisplayNameContainsCjk = (productionOrderPayload.matchedOrders || [])
      .some((item) => cjk.test(String(item.displayName || "")));
    const visibleFields = ["orderCategory", "result", "value", "unit", "referenceRange", "impression", "abnormalLevel", "teachingExplanation"];
    const returnedVisibleFieldCjkCount = productionOrderPayload.results.reduce((sum, item) => sum
      + visibleFields.filter((field) => cjk.test(String(item[field] || ""))).length, 0);
    const summary = {
      schemaVersion: 1,
      productionSha: "70ea9b3c7b31e11a84878de5c277cac60f35481c",
      status: cjkControlCount || reportCardContainsCjk ? "FAIL_LOCAL_QA" : "PASS_LOCAL",
      defectId: cjkControlCount || reportCardContainsCjk ? "HEM-P1-048" : null,
      language: "en",
      viewport: testInfo.project.use.viewport,
      source: "production_training_action_local_contract",
      providerCalls: 0,
      handlerStatusCodes,
      cjkControlCount,
      reportCardContainsCjk,
      matchedOrderDisplayNameContainsCjk,
      returnedVisibleFieldCjkCount,
      requestBodiesRetained: false,
      responseBodiesRetained: false,
      medicalValuesRetained: false
    };
    await writeFile(path.join(DIRS.reports, `hem-p1-048-data-agent-english-${viewportSlug(testInfo)}.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await saveShot(page, testInfo, "hem-p1-048-data-agent-english", true);
    expect({ cjkControlCount, reportCardContainsCjk, matchedOrderDisplayNameContainsCjk, returnedVisibleFieldCjkCount }).toEqual({
      cjkControlCount: 0,
      reportCardContainsCjk: false,
      matchedOrderDisplayNameContainsCjk: false,
      returnedVisibleFieldCjkCount: 0
    });
  }, { videoOnFailure: true });
});

test("HEM-P1-055 retry after satisfying an order prerequisite releases the configured report", async ({ browser }, testInfo) => {
  test.skip(
    !["qa-1440x900", "qa-390x844"].includes(testInfo.project.name),
    "One desktop and one mobile viewport provide representative UI evidence."
  );
  await withEvidence(browser, testInfo, "hem-p1-055-prerequisite-retry", async ({ page, consoleEvents }) => {
    const observations = [];
    await installProductionTrainingApi(page, observations);
    await page.goto("/cases/P001/");
    await page.getByLabel("病史小结").fill("QA阶段权限与检查前置条件恢复探针。");
    await page.getByRole("button", { name: "提交本阶段", exact: true }).click();
    await page.getByRole("button", { name: "进入下一阶段", exact: true }).click();

    const orderInput = page.getByPlaceholder("例如：尿常规+尿沉渣、CTU、膀胱镜");
    const submitOrder = page.getByRole("button", { name: "开立并返回结果", exact: true });
    await orderInput.fill("CTU");
    await submitOrder.click();
    await expect(page.getByText(/缺少前置条件：LAB-BL-003/)).toBeVisible();

    await orderInput.fill("肾功能");
    await submitOrder.click();
    await expect(page.getByTestId("report-card")).toHaveCount(1);
    const reportCardsBeforeRetry = await page.getByTestId("report-card").count();

    await orderInput.fill("CTU");
    await submitOrder.click();
    await expect(page.getByText("重复医嘱不会重复计入效率得分。", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    const reportCardsAfterRetry = await page.getByTestId("report-card").count();
    const retryObservation = observations[2] || {};
    const consoleErrorCount = consoleEvents.filter((item) => item.type === "error").length;
    const reportCardKeyWarningCount = consoleEvents.filter((item) => item.type === "error"
      && /unique "key" prop/i.test(item.text)
      && /ReportCard/.test(item.text)).length;
    const summary = {
      schemaVersion: 1,
      productionSha: "c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2",
      status: retryObservation.returnedReportCount === 1 && reportCardsAfterRetry > reportCardsBeforeRetry
        ? "PASS_LOCAL"
        : "FAIL_LOCAL_QA",
      defectIds: [
        "HEM-P1-055",
        ...(reportCardKeyWarningCount ? ["HEM-P2-056"] : [])
      ],
      viewport: testInfo.project.use.viewport,
      source: "production_training_action_local_ui_blackbox",
      providerCalls: 0,
      orderRequestCount: observations.length,
      orderObservations: observations,
      reportCardsBeforeRetry,
      reportCardsAfterRetry,
      expectedRetryReportCount: 1,
      consoleErrorCount,
      reportCardKeyWarningCount,
      requestBodiesRetained: false,
      responseBodiesRetained: false,
      medicalValuesRetained: false,
      credentialsRetained: false
    };
    await writeFile(
      path.join(DIRS.reports, `hem-p1-055-prerequisite-retry-${viewportSlug(testInfo)}.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );
    await saveShot(page, testInfo, "hem-p1-055-prerequisite-retry", true);
    expect({
      orderRequestCount: observations.length,
      firstUnmetPrerequisiteCount: observations[0]?.unmetPrerequisiteCount,
      controlReturnedReportCount: observations[1]?.returnedReportCount,
      retryDuplicateOrderCount: retryObservation.duplicateOrderCount,
      retryReturnedReportCount: retryObservation.returnedReportCount,
      reportCardsBeforeRetry,
      reportCardsAfterRetry,
      reportCardKeyWarningCount
    }).toEqual({
      orderRequestCount: 3,
      firstUnmetPrerequisiteCount: 1,
      controlReturnedReportCount: 1,
      retryDuplicateOrderCount: 1,
      retryReturnedReportCount: 1,
      reportCardsBeforeRetry: 1,
      reportCardsAfterRetry: 2,
      reportCardKeyWarningCount: 0
    });
  }, { videoOnFailure: true });
});

test("rapid double stage submission creates one feedback request and one timeline event", async ({ browser }, testInfo) => {
  test.skip(
    !["qa-1440x900", "qa-390x844"].includes(testInfo.project.name),
    "One desktop and one mobile project cover the submission idempotency probe."
  );
  await withEvidence(browser, testInfo, "stage-submit-double-click", async ({ page }) => {
    const api = await installFullWorkflowApi(page, { stageFeedbackDelayMs: 150 });
    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "中文" }).click();
    await page.getByLabel("病史小结").fill("QA fixture double-submit probe.");
    await page.context().tracing.stop();
    await page.context().tracing.start({ screenshots: false, snapshots: true, sources: false });
    await page.getByRole("button", { name: "提交本阶段", exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(page.getByText("QA fixture stage history recorded.", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    const submitEvents = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
      const saved = key ? JSON.parse(localStorage.getItem(key)) : null;
      return saved?.timeline?.filter((item) => item.type === "submit").length ?? 0;
    });
    const counts = api.counts();
    expect({
      feedbackRequests: counts.stageFeedback,
      uniqueRequestIds: counts.uniqueStageRequestIds,
      submitEvents
    }).toEqual({ feedbackRequests: 1, uniqueRequestIds: 1, submitEvents: 1 });
  }, { videoOnFailure: true });
});

test("mobile composer does not cover the opening patient statement", async ({ browser }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, "Mobile-only overlap audit.");
  await withEvidence(browser, testInfo, "mobile-opening-composer-overlap", async ({ page }) => {
    await page.goto("/cases/P001/");
    await page.getByRole("button", { name: "中文" }).click();
    const conversation = page.getByRole("log", { name: "模拟问诊对话" });
    const opening = conversation.getByText(/医生您好/).first();
    const input = page.getByRole("textbox", { name: "输入问诊问题" });
    await expect(opening).toBeVisible();
    await expect(input).toBeVisible();
    await page.context().tracing.stop();
    await page.context().tracing.start({ screenshots: false, snapshots: true, sources: false });
    const openingBox = await opening.boundingBox();
    const composerBox = await input.locator("xpath=..").boundingBox();
    expect(openingBox).toBeTruthy();
    expect(composerBox).toBeTruthy();
    expect(composerBox.y, "sticky composer must start below the opening statement").toBeGreaterThanOrEqual(openingBox.y + openingBox.height);
    await saveShot(page, testInfo, "mobile-opening-composer-no-overlap", false);
  }, { videoOnFailure: true });
});

test("fixture interview runs 20 turns, double-send guard, and refresh recovery", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "qa-390x844", "Long interaction is retained on the primary mobile viewport.");
  const transcript = [];
  await withEvidence(browser, testInfo, "fixture-20-turn-interview", async ({ page, slug }) => {
    const api = await installDeterministicApi(page, transcript);
    await page.goto("/cases/P001/");
    const input = page.getByRole("textbox", { name: "输入问诊问题" });
    await expect(input).toBeEnabled();
    const questions = [
      "血尿是什么时候开始的，是否反复？", "尿液是什么颜色，是肉眼还是镜下发现？", "是初始、终末还是全程血尿？", "有没有血块？",
      "有没有腰痛或排尿疼痛？", "有没有尿频、尿急、尿痛或排尿困难？", "有没有发热、寒战或尿潴留？", "有没有泡沫尿、水肿或高血压？",
      "以前有结石、感染、肿瘤或肾病吗？", "是否服用抗凝药或抗血小板药？有什么过敏？", "吸烟吗，有职业暴露吗？", "家族里有人有类似疾病吗？",
      "是否可能与月经、妊娠或妇科出血有关？", "做过手术、输血、泌尿操作或受过外伤吗？", "再确认一下，血尿第一次出现的时间？", "我总结您从来没有血尿，对吗？",
      "最近是否出现不能排尿等急症？", "是否有体重下降或乏力？", "过去是否接受过相关检查？", "还有哪些重要情况没有提到？"
    ];
    for (let index = 0; index < questions.length; index += 1) {
      await input.fill(questions[index]);
      await page.getByRole("button", { name: "发送" }).click();
      await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText(`这是脱敏的固定患者回答 ${index + 1}。`, { exact: true })).toBeVisible();
    }
    await expect.poll(() => api.counts()).toEqual({ patientCalls: 20, historyCalls: 20 });

    await input.fill("快速双击测试问题");
    const before = api.counts().patientCalls;
    await page.getByRole("button", { name: "发送" }).evaluate((button) => { button.click(); button.click(); });
    await expect.poll(() => api.counts().patientCalls).toBe(before + 1);
    const conversation = page.getByRole("log", { name: "模拟问诊对话" });
    await expect(conversation.getByText("快速双击测试问题", { exact: true })).toHaveCount(1);

    await page.reload();
    await expect(conversation.getByText("快速双击测试问题", { exact: true })).toHaveCount(1);
    await saveShot(page, testInfo, "training-p001-after-20-turn-refresh");
    await writeFile(path.join(DIRS.transcripts, `${slug}.json`), JSON.stringify({
      classification: "deterministic_fixture_not_real_ai",
      containsSecrets: false,
      containsDirectIdentifiers: false,
      turns: transcript
    }, null, 2), "utf8");
  }, { videoOnFailure: true });
});
