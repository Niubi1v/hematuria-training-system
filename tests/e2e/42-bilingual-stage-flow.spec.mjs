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
    evidence: "诊断依据（从已采集证据中选择）",
    differential: (index) => `鉴别诊断 ${index}`,
    support: (index) => `鉴别诊断 ${index} 支持证据`,
    reflection: "学习反思"
  },
  en: {
    submit: "Submit stage",
    next: "Next stage",
    finish: "Finish training and generate final report",
    noConsult: "No consultation for now",
    diagnosis: "Most likely diagnosis",
    evidence: "Diagnostic evidence from collected findings",
    differential: (index) => `Differential diagnosis ${index}`,
    support: (index) => `Differential ${index} supporting evidence`,
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

  await context.route("**/api/agent-chat/**", async (route) => {
    const body = route.request().postDataJSON();
    const isOnsetQuestion = /多久|how long|when did/i.test(String(body.question || ""));
    observations.push({
      action: "agent-chat",
      attemptId: body.attemptId,
      caseId: body.caseId,
      language: body.language,
      status: 200
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        replyText: body.language === "en"
          ? (isOnsetQuestion ? "It began recently." : "I noticed a change in my urine.")
          : (isOnsetQuestion ? "最近开始的。" : "我发现小便有变化。"),
        matchedSlotIds: [isOnsetQuestion ? "hematuria_onset" : "chief_complaint"],
        matchedFacts: [],
        isFallback: true,
        publicReplyState: "governed"
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
  const caseNumber = String(Number(caseId.replace(/^P/, ""))).padStart(2, "0");
  await expect(page.getByText(language === "en" ? `Case ${caseNumber}` : `病例 ${caseNumber}`, { exact: true }).first()).toBeVisible();

  const interviewInput = page.getByRole("textbox", { name: language === "en" ? "Enter an interview question" : "输入问诊问题" });
  const sendButton = page.getByRole("button", { name: language === "en" ? "Send" : "发送", exact: true });
  for (const question of language === "en"
    ? ["Where do you feel unwell?", "How long has this been happening?"]
    : ["哪里不舒服？", "多久了？"]) {
    await interviewInput.fill(question);
    await expect(sendButton).toBeEnabled();
    await sendButton.click();
    await expect(interviewInput).toHaveValue("");
  }

  await page.getByRole("textbox", { name: language === "en" ? "History summary" : "病史小结" }).fill(language === "en" ? "Collected history item one.\nCollected history item two." : "已采集病史项目一。\n已采集病史项目二。");
  await submitAndAdvance(page, language);
  await submitAndAdvance(page, language);
  await expect(page.getByTestId("diagnosis-builder")).toBeVisible();

  await page.getByLabel(copy.diagnosis, { exact: true }).fill(language === "en" ? "Training diagnosis" : "训练用诊断");
  const diagnosticEvidence = page.getByRole("group", { name: copy.evidence, exact: true });
  await diagnosticEvidence.getByRole("checkbox").nth(0).check();
  await diagnosticEvidence.getByRole("checkbox").nth(1).check();
  for (let index = 1; index <= 3; index += 1) {
    await page.getByLabel(copy.differential(index), { exact: true }).fill(language === "en" ? `Training option ${index}` : `训练选项${index}`);
    await page.locator("summary").filter({ hasText: copy.support(index) }).click();
    await page.getByRole("group", { name: copy.support(index), exact: true }).getByRole("checkbox").first().check();
  }
  await submitAndAdvance(page, language);
  await expect(page.getByTestId("consultation-builder")).toBeVisible();

  await page.getByRole("radio", { name: copy.noConsult, exact: true }).check();
  await submitAndAdvance(page, language);
  await expect(page.getByTestId("treatment-order-workbench")).toBeVisible();
  await submitAndAdvance(page, language);
  await expect(page.getByTestId("perioperative-checklist")).toBeVisible();
  await submitAndAdvance(page, language);
  await expect(page.getByTestId("complete-training")).toBeVisible();

  await page.getByLabel(copy.reflection, { exact: true }).fill(language === "en"
    ? "I will improve the structure of my next training attempt."
    : "下一次训练我会进一步改进问诊结构和总结。"
  );
  await page.getByRole("button", { name: copy.finish, exact: true }).click();
  await expect(page.getByTestId("final-report")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("final-percentage-score")).toContainText("/ 100");
  expect(await page.getByTestId("final-report").innerText()).not.toMatch(/360 score|360-point|final 360 score|raw score|原始360分|360分制/i);
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
