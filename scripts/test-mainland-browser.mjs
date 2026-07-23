import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = String(process.env.MAINLAND_HEALTHCHECK_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const browser = await chromium.launch({ headless: true });
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
    if (response.request().postDataJSON()?.action === "stage-feedback") stageResponses.push(response.status());
  } catch {
    // Application requests are JSON; ignore unrelated responses.
  }
});

try {
  const navigation = await page.goto(`${baseUrl}/cases/P001/`, { waitUntil: "domcontentloaded" });
  assert.equal(navigation?.status(), 200);
  const composer = page.getByTestId("chat-composer");
  const input = composer.locator("textarea");
  const send = composer.locator("button.ui-button-primary");
  await input.fill("什么时候开始发现血尿？");
  await send.waitFor({ state: "visible" });
  const agentResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent-chat/");
  await send.click();
  const patient = await (await agentResponse).json();
  if (process.env.MAINLAND_EXPECT_LIVE_AI === "1") {
    assert.equal(patient.generationSource, "live_ai");
    assert.notEqual(patient.isFallback, true);
  } else {
    assert.equal(patient.generationSource, "safe_mock");
    assert.equal(patient.isSafeMock, true);
  }
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-")).sort());
  assert.ok(keysBefore.length > 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await composer.waitFor({ state: "visible" });
  const keysAfter = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("hematuria-attempt-")).sort());
  assert.deepEqual(keysAfter, keysBefore);
  const submit = page.locator("button.rounded-md.bg-clinic-blue").last();
  await submit.waitFor({ state: "visible" });
  await submit.evaluate((button) => {
    button.click();
    button.click();
  });
  await page.waitForTimeout(1000);
  assert.deepEqual(stageResponses, [200], "double click must create one stage submission");
  assert.ok(apiOrigins.length > 0);
  assert.equal(apiOrigins.every((origin) => origin === new URL(baseUrl).origin), true);
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    checks: ["same-origin-api", "generation-label", "refresh", "double-submit"],
    apiRequests: apiOrigins.length
  })}\n`);
} finally {
  await browser.close();
}
