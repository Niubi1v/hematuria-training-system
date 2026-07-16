import { expect, test } from "@playwright/test";

import {
  createPreviewProtectionHeaders,
  resolvePreviewBlackboxConfig,
  shouldAttachPreviewProtection
} from "../../scripts/preview-blackbox-config.mjs";

const preview = resolvePreviewBlackboxConfig(process.env);
if (preview.blocked) throw new Error(`${preview.reason}: ${preview.message}`);
const protectionAudits = new WeakMap();

function safeRequestMetadata(request) {
  let body = {};
  try { body = request.postDataJSON() || {}; } catch { /* Non-JSON request. */ }
  return {
    action: typeof body.action === "string" ? body.action : undefined,
    caseId: typeof body.caseId === "string" ? body.caseId : undefined,
    language: typeof body.language === "string" ? body.language : undefined,
    stageKey: typeof body.stageKey === "string" ? body.stageKey : undefined
  };
}

function createSanitizedEvidence(page, scenario) {
  const evidence = {
    scenario,
    protection: protectionAudits.get(page) || { sameOriginRequests: 0, cookieBootstrapRequests: 0, crossOriginRequests: 0 },
    responses: [],
    deployment: undefined
  };
  const pending = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    const task = (async () => {
      const request = response.request();
      const item = {
        path: url.pathname,
        method: request.method(),
        status: response.status(),
        ...safeRequestMetadata(request)
      };
      if (response.headers()["content-type"]?.includes("application/json")) {
        try {
          const payload = await response.json();
          item.error = typeof payload.error === "string" ? payload.error : undefined;
          item.generationSource = typeof payload.generationSource === "string" ? payload.generationSource : undefined;
          item.provider = typeof payload.provider === "string" ? payload.provider : undefined;
          item.isFallback = typeof payload.isFallback === "boolean" ? payload.isFallback : undefined;
        } catch { /* Evidence remains status-only. */ }
      }
      evidence.responses.push(item);
    })();
    pending.push(task);
  });
  return { evidence, pending };
}

async function attachSanitizedEvidence(testInfo, collector) {
  await Promise.allSettled(collector.pending);
  const body = JSON.stringify(collector.evidence, null, 2);
  await testInfo.attach("sanitized-preview-evidence", { body, contentType: "application/json" });
  console.log(`PREVIEW_BLACKBOX_EVIDENCE ${JSON.stringify(collector.evidence)}`);
}

async function installProtectionBypass(page) {
  const headers = createPreviewProtectionHeaders(preview);
  const cookieBootstrapHeader = headers["x-vercel-set-bypass-cookie"];
  const scopedHeaders = { "x-vercel-protection-bypass": headers["x-vercel-protection-bypass"] };
  let cookieBootstrapSent = false;
  const audit = { sameOriginRequests: 0, cookieBootstrapRequests: 0, crossOriginRequests: 0 };
  protectionAudits.set(page, audit);
  await page.route((url) => shouldAttachPreviewProtection(url.toString(), preview.baseURL), async (route) => {
    audit.sameOriginRequests += 1;
    const requestHeaders = { ...route.request().headers(), ...scopedHeaders };
    if (!cookieBootstrapSent) {
      requestHeaders["x-vercel-set-bypass-cookie"] = cookieBootstrapHeader;
      cookieBootstrapSent = true;
      audit.cookieBootstrapRequests += 1;
    }
    await route.continue({ headers: requestHeaders });
  });
}

function isTrainingAction(response, action) {
  if (new URL(response.url()).pathname !== "/api/training-action/" || response.request().method() !== "POST") return false;
  return safeRequestMetadata(response.request()).action === action;
}

async function assertApplicationReached(page, navigationResponse) {
  const current = new URL(page.url());
  if (current.hostname === "vercel.com" || current.pathname.startsWith("/login") || current.pathname.startsWith("/sso-api")) {
    throw new Error(`BLOCKED_PREVIEW_AUTH: request ended at ${current.hostname}${current.pathname}; application handlers were not reached.`);
  }
  expect(current.origin).toBe(new URL(preview.baseURL).origin);
  if (navigationResponse) expect(navigationResponse.status()).toBe(200);
}

async function gotoCase(page, caseId) {
  const response = await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
  await assertApplicationReached(page, response);
  await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
}

async function gotoCaseWithReadyAttempt(page, caseId) {
  const initialized = page.waitForResponse((response) => isTrainingAction(response, "init-attempt"));
  await gotoCase(page, caseId);
  const response = await initialized;
  let error = "";
  try { error = String((await response.json()).error || ""); } catch { /* Status remains authoritative. */ }
  expect(response.status(), `init-attempt ${caseId} failed: HTTP ${response.status()} ${error || "unknown_error"}`).toBe(200);
}

async function switchLanguage(page, label, textboxName) {
  const accept = (dialog) => dialog.accept();
  page.once("dialog", accept);
  await page.getByRole("button", { name: label, exact: true }).click();
  page.off("dialog", accept);
  await expect(page.getByRole("textbox", { name: textboxName })).toBeVisible();
}

async function askOneLiveAiQuestion(page, language) {
  const english = language === "en";
  const input = page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: english ? "Send" : "发送", exact: true });
  await expect(input).toBeVisible();
  await input.fill(english ? "When did you first notice blood in your urine?" : "您最早什么时候发现尿里有血？");
  await expect(send).toBeEnabled();

  const patientResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/" && response.request().method() === "POST");
  const historyResponse = page.waitForResponse((response) => isTrainingAction(response, "history-log"));
  await send.click();

  const patient = await patientResponse;
  expect(patient.status()).toBe(200);
  const patientPayload = await patient.json();
  expect(patientPayload.generationSource).toBe("live_ai");
  expect(patientPayload.isFallback).toBe(false);
  expect(String(patientPayload.provider || "").toLowerCase()).not.toContain("rule");

  const history = await historyResponse;
  expect(history.status()).toBe(200);
  await expect(page.getByText(english ? "Scoring synced" : "评分已同步", { exact: true })).toBeVisible();
  await expect(page.getByText(english ? "AI service connected" : "人工智能服务已连接", { exact: true })).toBeVisible();
}

async function submitFirstStage(page, language, doubleClick = false) {
  const english = language === "en";
  const submit = page.getByRole("button", { name: english ? "Submit stage" : "提交本阶段", exact: true });
  await expect(submit).toBeEnabled();
  const responses = [];
  const listener = (response) => { if (isTrainingAction(response, "stage-feedback")) responses.push(response); };
  page.on("response", listener);
  const stageResponse = page.waitForResponse((response) => isTrainingAction(response, "stage-feedback"));
  if (doubleClick) await submit.evaluate((button) => { button.click(); button.click(); });
  else await submit.click();
  const stage = await stageResponse;
  expect(stage.status()).toBe(200);
  await expect(page.getByRole("button", { name: english ? "Next Agent" : "进入下一阶段", exact: true })).toBeVisible();
  await page.waitForTimeout(750);
  expect(responses).toHaveLength(1);
  page.off("response", listener);
}

async function enterSecondStage(page, language) {
  const english = language === "en";
  await page.getByRole("button", { name: english ? "Next Agent" : "进入下一阶段", exact: true }).click();
  await expect(page.getByText(english ? "Investigation Agent" : "第2阶段·检查决策", { exact: true }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await installProtectionBypass(page);
});

test("protected Preview homepage and health reach the application", async ({ page }, testInfo) => {
  const collector = createSanitizedEvidence(page, "homepage-health");
  try {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    await assertApplicationReached(page, response);
    await expect(page.getByRole("heading", { name: "血尿临床思维训练系统" })).toBeVisible();
    const health = await page.evaluate(async () => {
      const response = await fetch("/api/health/", { method: "GET" });
      const payload = await response.json();
      return {
        status: response.status,
        apiVersion: payload.apiVersion,
        gitSha: payload.gitSha,
        deploymentSha: payload.deploymentSha,
        patientServiceConfigured: payload.patientServiceConfigured,
        trainingStateConfigured: payload.trainingStateConfigured,
        durableAttemptStoreConfigured: payload.durableAttemptStoreConfigured,
        durableAttemptStoreCredentialSource: payload.durableAttemptStoreCredentialSource
      };
    });
    expect(health.status).toBe(200);
    expect(health.trainingStateConfigured).toBe(true);
    expect(health.durableAttemptStoreConfigured).toBe(true);
    expect(["upstash_rest", "vercel_kv_rest", "mixed_rest"]).toContain(health.durableAttemptStoreCredentialSource);
    collector.evidence.deployment = health;
  } finally {
    await attachSanitizedEvidence(testInfo, collector);
  }
});

test("P003 zero-round Chinese submission enters stage two", async ({ page }, testInfo) => {
  const collector = createSanitizedEvidence(page, "P003-zero-round-zh");
  try {
    await gotoCaseWithReadyAttempt(page, "P003");
    await submitFirstStage(page, "zh");
    await enterSecondStage(page, "zh");
  } finally {
    await attachSanitizedEvidence(testInfo, collector);
  }
});

test("P001 Chinese live-AI round survives refresh and double submission", async ({ page }, testInfo) => {
  const collector = createSanitizedEvidence(page, "P001-one-round-zh-refresh-double-submit");
  try {
    await gotoCaseWithReadyAttempt(page, "P001");
    await askOneLiveAiQuestion(page, "zh");
    const patientMessages = await page.getByText("标准化患者", { exact: true }).count();
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertApplicationReached(page);
    await expect(page.getByText("标准化患者", { exact: true })).toHaveCount(patientMessages);
    await submitFirstStage(page, "zh", true);
    await enterSecondStage(page, "zh");
  } finally {
    await attachSanitizedEvidence(testInfo, collector);
  }
});

test("P001 English live-AI round submits and enters stage two", async ({ page }, testInfo) => {
  const collector = createSanitizedEvidence(page, "P001-one-round-en");
  try {
    await gotoCaseWithReadyAttempt(page, "P001");
    await switchLanguage(page, "English", "Enter an interview question");
    await askOneLiveAiQuestion(page, "en");
    await submitFirstStage(page, "en");
    await enterSecondStage(page, "en");
  } finally {
    await attachSanitizedEvidence(testInfo, collector);
  }
});

test("P001 switches Chinese to English and back without reusing an invalid attempt", async ({ page }, testInfo) => {
  const collector = createSanitizedEvidence(page, "P001-zh-en-zh");
  try {
    await gotoCaseWithReadyAttempt(page, "P001");
    await switchLanguage(page, "English", "Enter an interview question");
    await switchLanguage(page, "中文", "输入问诊问题");
    await submitFirstStage(page, "zh");
    await enterSecondStage(page, "zh");
  } finally {
    await attachSanitizedEvidence(testInfo, collector);
  }
});
