import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = String(process.env.MAINLAND_HEALTHCHECK_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
  headless: true,
  args: process.env.MAINLAND_ALLOW_SELF_SIGNED === "1" ? ["--ignore-certificate-errors"] : []
});
const page = await browser.newPage();
const apiOrigins = [];
const stageResponses = [];

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/")) apiOrigins.push(url.origin);
});
page.on("response", async (response) => {
  if (new URL(response.url()).pathname !== "/api/training-action/") return;
  try {
    const body = response.request().postDataJSON();
    if (body?.action === "stage-feedback") stageResponses.push(response.status());
  } catch {
    // Ignore non-JSON requests; the application contract only sends JSON here.
  }
});

try {
  const navigation = await page.goto(`${baseUrl}/cases/P001/`, { waitUntil: "domcontentloaded" });
  assert.equal(navigation?.status(), 200);
  const composer = page.getByTestId("chat-composer");
  const input = composer.locator("textarea");
  const send = composer.locator("button.ui-button-primary");
  await input.waitFor({ state: "visible" });
  await input.fill("什么时候开始发现血尿？");
  await send.waitFor({ state: "visible" });
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return element instanceof HTMLButtonElement && !element.disabled;
  }, '[data-testid="chat-composer"] button.ui-button-primary');

  const agentResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/");
  const historyResponse = page.waitForResponse(async (response) => {
    if (new URL(response.url()).pathname !== "/api/training-action/") return false;
    try { return response.request().postDataJSON()?.action === "history-log"; } catch { return false; }
  });
  await send.click();
  const agent = await agentResponse;
  const history = await historyResponse;
  assert.equal(agent.status(), 200);
  assert.equal(history.status(), 200);
  const patient = await agent.json();
  assert.equal(patient.generationSource, "safe_mock");
  assert.equal(patient.isSafeMock, true);
  assert.notEqual(patient.generationSource, "live_ai");

  const attemptKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-")).sort());
  assert.ok(attemptKeysBefore.length > 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await composer.waitFor({ state: "visible" });
  const attemptKeysAfter = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-")).sort());
  assert.deepEqual(attemptKeysAfter, attemptKeysBefore, "refresh must retain the current attempt");

  const submitStage = page.locator("button.rounded-md.bg-clinic-blue").last();
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button.rounded-md.bg-clinic-blue")];
    const element = buttons.at(-1);
    return element instanceof HTMLButtonElement && !element.disabled;
  });
  const stageResponse = page.waitForResponse(async (response) => {
    if (new URL(response.url()).pathname !== "/api/training-action/") return false;
    try { return response.request().postDataJSON()?.action === "stage-feedback"; } catch { return false; }
  });
  await submitStage.evaluate((button) => {
    button.click();
    button.click();
  });
  await stageResponse;
  await page.waitForTimeout(500);
  assert.deepEqual(stageResponses, [200], "double click must emit one stage submission");
  assert.ok(apiOrigins.length > 0);
  assert.equal(apiOrigins.every((origin) => origin === new URL(baseUrl).origin), true, "all browser APIs must remain same-origin");

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    mock: true,
    checks: ["browser-page", "same-origin-api", "safe-mock-label", "refresh", "double-submit"],
    apiRequests: apiOrigins.length
  })}\n`);
} finally {
  await browser.close();
}
