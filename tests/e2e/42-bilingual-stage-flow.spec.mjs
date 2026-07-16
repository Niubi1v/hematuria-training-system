import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "playwright-42-stage-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "10000";

const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");
const publicCases = require("../../data/cases_public.json");

const labels = {
  zh: {
    submit: "提交本阶段",
    next: "进入下一阶段",
    finish: "完成训练并生成最终报告",
    noConsult: "暂不需要会诊",
    diagnosis: "最可能诊断",
    evidence: "诊断依据",
    differentials: "至少 3 个鉴别诊断",
    analysis: "各鉴别诊断的支持点与反对点",
    reflection: "学习反思"
  },
  en: {
    submit: "Submit stage",
    next: "Next Agent",
    finish: "Finish training and generate final report",
    noConsult: "No consultation for now",
    diagnosis: "Most likely diagnosis",
    evidence: "Diagnostic evidence",
    differentials: "At least 3 differential diagnoses",
    analysis: "Supportive and opposing points for each differential",
    reflection: "Reflection"
  }
};

async function routeTrainingApis(context, observations) {
  await context.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      patientServiceConfigured: true,
      trainingStateConfigured: true,
      durableAttemptStoreConfigured: true,
      cloudTtsConfigured: false,
      allowedOriginConfigured: true,
      deploymentTier: "practice",
      gitSha: "e2e-42-stage",
      deploymentSha: "e2e-42-stage",
      apiVersion: "2.6.0"
    })
  }));

  await context.route("**/api/session/init/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    observations.push({
      action: "session-init",
      attemptId: body.attemptId,
      caseId: body.caseId,
      language: body.language,
      status: 200
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `matrix-session-${body.attemptId}`,
        caseId: body.caseId,
        language: body.language,
        mode: body.runtimeMode || "free",
        patientOpeningStatement: body.language === "en"
          ? "Hello doctor. I came because I noticed blood in my urine."
          : "医生您好，我是发现尿里有血来就诊的。",
        sessionCreatedAt: new Date().toISOString(),
        sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(),
        deploymentSha: "e2e-42-stage",
        apiVersion: "2.6.0",
        aiStatus: "available",
        profileSource: "local-simulation",
        cacheHit: false
      })
    });
  });

  await context.route("**/api/training-action/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const url = new URL(request.url());
    let statusCode = 200;
    let payload = {};
    const responseHeaders = {};
    const requestHeaders = request.headers();
    const req = {
      method: "POST",
      body,
      headers: {
        ...requestHeaders,
        origin: url.origin,
        host: url.host,
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.slice(0, -1)
      },
      socket: { remoteAddress: `matrix-${body.attemptId || Math.random()}` }
    };
    const res = {
      setHeader(name, value) { responseHeaders[name.toLowerCase()] = String(value); },
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return this; },
      end() { return this; }
    };

    await trainingHandler(req, res);
    observations.push({
      action: body.action,
      stageKey: body.stageKey || "",
      attemptId: body.attemptId,
      caseId: body.caseId,
      language: body.language,
      requestId: body.requestId,
      status: statusCode,
      error: payload?.error || ""
    });
    const headers = { "Access-Control-Expose-Headers": "X-Training-State" };
    if (responseHeaders["x-training-state"]) headers["X-Training-State"] = responseHeaders["x-training-state"];
    await route.fulfill({ status: statusCode, contentType: "application/json", headers, body: JSON.stringify(payload) });
  });
}

async function submitAndAdvance(page, language) {
  const copy = labels[language];
  const submit = page.getByRole("button", { name: copy.submit, exact: true });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  const next = page.getByRole("button", { name: copy.next, exact: true });
  await expect(next).toBeVisible({ timeout: 15_000 });
  await next.click();
}

async function completeSevenStages(page, caseId, language) {
  const copy = labels[language];
  await page.goto(`/cases/${caseId}/`);
  await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();

  await submitAndAdvance(page, language);
  await submitAndAdvance(page, language);

  await page.getByLabel(copy.diagnosis, { exact: true }).fill(language === "en" ? "Training diagnosis" : "训练用诊断");
  await page.getByLabel(copy.evidence, { exact: true }).fill(language === "en" ? "Sufficient training evidence." : "这里填写足够长度的训练依据。" );
  await page.getByLabel(copy.differentials, { exact: true }).fill(language === "en" ? "Option one; Option two; Option three" : "选项一；选项二；选项三");
  await page.getByLabel(copy.analysis, { exact: true }).fill(language === "en" ? "Each option has supporting and opposing training points." : "每个选项均填写支持点与反对点作为训练占位。" );
  await submitAndAdvance(page, language);

  await page.getByRole("radio", { name: copy.noConsult, exact: true }).check();
  await submitAndAdvance(page, language);
  await submitAndAdvance(page, language);
  await submitAndAdvance(page, language);

  await page.getByLabel(copy.reflection, { exact: true }).fill(language === "en"
    ? "I will improve the structure of my next training attempt."
    : "下一次训练我会进一步改进问诊结构和总结。"
  );
  await page.getByRole("button", { name: copy.finish, exact: true }).click();
  await expect(page.getByTestId("final-report")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("final-report")).toContainText("/ 360");
}

test("42 cases complete all seven UI stages in Chinese and English @full-stage-matrix", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The exhaustive matrix runs once; mobile has a dedicated complete journey.");
  test.setTimeout(900_000);
  resetMemoryAttemptStore();
  const observations = [];

  for (const language of ["zh", "en"]) {
    const context = await browser.newContext();
    await context.addInitScript((selectedLanguage) => localStorage.setItem("hematuria-language", selectedLanguage), language);
    await routeTrainingApis(context, observations);
    for (const caseData of publicCases) {
      const caseId = caseData.displayCaseId || caseData.id;
      const page = await context.newPage();
      await completeSevenStages(page, caseId, language);
      await page.close();
    }
    await context.close();
  }

  expect(publicCases).toHaveLength(42);
  expect(observations.filter((item) => item.action === "session-init" && item.status === 200)).toHaveLength(84);
  expect(observations.filter((item) => item.action === "init-attempt" && item.status === 200)).toHaveLength(84);
  expect(observations.filter((item) => item.action === "stage-feedback" && item.status === 200)).toHaveLength(588);
  expect(observations.filter((item) => item.action === "score" && item.status === 200)).toHaveLength(84);
  expect(observations.filter((item) => item.status !== 200)).toEqual([]);
});

test("mobile completes a representative seven-stage journey @full-stage-matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The mobile contract runs in the mobile project.");
  test.setTimeout(120_000);
  resetMemoryAttemptStore();
  const observations = [];
  await page.addInitScript(() => localStorage.setItem("hematuria-language", "en"));
  await routeTrainingApis(page.context(), observations);
  await completeSevenStages(page, "P001", "en");
  expect(observations.filter((item) => item.action === "stage-feedback" && item.status === 200)).toHaveLength(7);
  expect(observations.filter((item) => item.action === "score" && item.status === 200)).toHaveLength(1);
  expect(observations.filter((item) => item.status !== 200)).toEqual([]);
});
