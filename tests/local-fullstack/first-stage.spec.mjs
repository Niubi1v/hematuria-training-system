import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function safeAction(request) {
  try {
    const body = request.postDataJSON() || {};
    return {
      action: typeof body.action === "string" ? body.action : "",
      requestId: typeof body.requestId === "string" ? body.requestId : "",
      language: typeof body.language === "string" ? body.language : ""
    };
  } catch {
    return { action: "", requestId: "", language: "" };
  }
}

function collectApiEvidence(page) {
  const requests = [];
  const pending = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    const task = (async () => {
      let error = "";
      if (response.headers()["content-type"]?.includes("application/json")) {
        try {
          const payload = await response.json();
          error = typeof payload.error === "string" ? payload.error : "";
        } catch {
          // Status remains authoritative.
        }
      }
      requests.push({
        path: url.pathname,
        method: response.request().method(),
        status: response.status(),
        error,
        ...safeAction(response.request())
      });
    })();
    pending.push(task);
  });
  return { requests, pending };
}

async function waitForAttemptReady(page, language = "zh") {
  const name = language === "en" ? "Submit stage" : "提交本阶段";
  await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
}

async function gotoFreshCase(page, caseId, language = "zh") {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ desiredLanguage }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("hematuria-language", desiredLanguage);
  }, { desiredLanguage: language });
  await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
  await waitForAttemptReady(page, language);
}

async function submitStageOne(page, language = "zh", doubleClick = false) {
  const english = language === "en";
  const submit = page.getByRole("button", { name: english ? "Submit stage" : "提交本阶段", exact: true });
  const responsePromise = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/training-action/") return false;
    return safeAction(response.request()).action === "stage-feedback";
  });
  if (doubleClick) await submit.evaluate((button) => { button.click(); button.click(); });
  else await submit.click();
  const response = await responsePromise;
  let error = "";
  try { error = String((await response.json()).error || ""); } catch { /* status is enough */ }
  expect(response.status(), `stage-feedback failed: ${response.status()} ${error || "unknown_error"}`).toBe(200);
  await expect(page.getByRole("button", { name: english ? "Next Agent" : "进入下一阶段", exact: true })).toBeVisible();
}

async function enterSecondStage(page, language = "zh") {
  const english = language === "en";
  await page.getByRole("button", { name: english ? "Next Agent" : "进入下一阶段", exact: true }).click();
  await expect(page.getByText(english ? "Investigation Agent" : "第2阶段·检查决策", { exact: true }).first()).toBeVisible();
}

async function submitTimelineCount(page, caseId, language) {
  return page.evaluate(({ id, lang }) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith(`hematuria-attempt-v3:${id}:free:${lang}:`));
    const state = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return state?.timeline?.filter((item) => item.type === "submit" && item.stageNo === 1).length ?? 0;
  }, { id: caseId, lang: language });
}

async function waitForHealth(page) {
  await expect.poll(async () => page.evaluate(async () => {
    try {
      const response = await fetch("/api/health/");
      return response.status;
    } catch {
      return 0;
    }
  }), { timeout: 30_000 }).toBe(200);
}

test.describe.configure({ mode: "serial" });

test("health exposes a same-origin durable local full stack", async ({ page }) => {
  await page.goto("/");
  const health = await page.evaluate(async () => {
    const response = await fetch("/api/health/");
    const payload = await response.json();
    return {
      status: response.status,
      origin: new URL(response.url).origin,
      trainingStateConfigured: payload.trainingStateConfigured,
      durableAttemptStoreConfigured: payload.durableAttemptStoreConfigured,
      credentialSource: payload.durableAttemptStoreCredentialSource
    };
  });
  expect(health).toEqual({
    status: 200,
    origin: "http://127.0.0.1:3000",
    trainingStateConfigured: true,
    durableAttemptStoreConfigured: true,
    credentialSource: "upstash_rest"
  });
});

test("P003 zero-round submission enters stage two and survives refresh", async ({ page }) => {
  const evidence = collectApiEvidence(page);
  await gotoFreshCase(page, "P003", "zh");
  await submitStageOne(page, "zh");
  await enterSecondStage(page, "zh");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("第2阶段·检查决策", { exact: true }).first()).toBeVisible();
  await Promise.allSettled(evidence.pending);
  const feedback = evidence.requests.filter((item) => item.action === "stage-feedback");
  expect(feedback).toHaveLength(1);
  expect(new Set(feedback.map((item) => item.requestId)).size).toBe(1);
  expect(await submitTimelineCount(page, "P003", "zh")).toBe(1);
});

test("P001 one-round fallback interview submits once after a rapid double click", async ({ page }) => {
  const evidence = collectApiEvidence(page);
  await gotoFreshCase(page, "P001", "zh");
  const input = page.getByRole("textbox", { name: "输入问诊问题" });
  await input.fill("小便痛不痛？");
  const patientResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/");
  const historyResponse = page.waitForResponse((response) => safeAction(response.request()).action === "history-log");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  expect((await patientResponse).status()).toBe(200);
  expect((await historyResponse).status()).toBe(200);
  await submitStageOne(page, "zh", true);
  await Promise.allSettled(evidence.pending);
  const feedback = evidence.requests.filter((item) => item.action === "stage-feedback");
  expect(feedback).toHaveLength(1);
  expect(new Set(feedback.map((item) => item.requestId)).size).toBe(1);
  expect(await submitTimelineCount(page, "P001", "zh")).toBe(1);
});

test("English and both language-switch directions create valid isolated attempts", async ({ page }) => {
  await gotoFreshCase(page, "P001", "en");
  await submitStageOne(page, "en");

  await gotoFreshCase(page, "P001", "zh");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await waitForAttemptReady(page, "en");
  await submitStageOne(page, "en");

  await gotoFreshCase(page, "P001", "en");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await waitForAttemptReady(page, "zh");
  await submitStageOne(page, "zh");
});

test("Redis initialization outage fails closed, then recovers without a doomed stage request", async ({ page }) => {
  const redisName = "hematuria-local-redis";
  const stopResult = spawnSync("docker", ["stop", redisName], { encoding: "utf8", windowsHide: true });
  if (stopResult.status !== 0) throw new Error("local_redis_stop_failed");
  try {
    const evidence = collectApiEvidence(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("hematuria-language", "zh");
    });
    await page.goto("/cases/P003/", { waitUntil: "domcontentloaded" });
    const retry = page.getByRole("button", { name: "重新初始化训练会话", exact: true });
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "训练会话尚未就绪", exact: true })).toBeDisabled();
    await expect(page.getByText("初始化训练会话时网络连接失败", { exact: false })).toBeVisible();
    await Promise.allSettled(evidence.pending);
    expect(evidence.requests.filter((item) => item.action === "stage-feedback")).toHaveLength(0);

    const startResult = spawnSync("docker", ["start", redisName], { encoding: "utf8", windowsHide: true });
    if (startResult.status !== 0) throw new Error("local_redis_start_failed");
    await waitForHealth(page);
    await retry.click();
    await waitForAttemptReady(page, "zh");
    await submitStageOne(page, "zh");
    await enterSecondStage(page, "zh");
  } finally {
    const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", redisName], {
      encoding: "utf8",
      windowsHide: true
    });
    if (!String(running.stdout).trim().includes("true")) {
      spawnSync("docker", ["start", redisName], { encoding: "utf8", windowsHide: true });
    }
  }
});
