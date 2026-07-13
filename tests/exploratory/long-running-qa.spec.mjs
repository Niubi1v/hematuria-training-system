import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("artifacts/exploratory-qa");
const CASE_ROUTES = JSON.parse(await readFile(path.resolve("data/cases_public.json"), "utf8"))
  .map(({ id, displayCaseId }) => ({ routeId: id, displayCaseId }));
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

async function withEvidence(browser, testInfo, scenario, run, { videoOnFailure = true } = {}) {
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

  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  try {
    await run({ page, slug });
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
