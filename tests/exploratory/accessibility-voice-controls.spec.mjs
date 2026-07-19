import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function installSafePracticeApi(page) {
  let patientCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      patientServiceConfigured: true,
      trainingStateConfigured: true,
      cloudTtsConfigured: false,
      allowedOriginConfigured: true,
      deploymentTier: "practice",
      gitSha: "qa-fixture",
      deploymentSha: "qa-fixture",
      apiVersion: "2.6.0"
    })
  }));
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt"
      ? { attemptId: body.attemptId, practiceOnly: true }
      : { recorded: true, requestId: body.requestId };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Training-State": "qa-redacted-state" },
      body: JSON.stringify(payload)
    });
  });
  await page.route("**/api/session/init/**", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `qa-session-${body.caseId}-${body.language}`,
        caseId: body.caseId,
        language: body.language,
        mode: body.mode,
        patientOpeningStatement: body.language === "en" ? "Hello doctor." : "医生您好。",
        sessionCreatedAt: "2026-07-19T00:00:00.000Z",
        sessionExpiresAt: "2026-07-19T01:00:00.000Z",
        deploymentSha: "qa-fixture",
        apiVersion: "2.6.0",
        aiStatus: "available",
        profileSource: "local-simulation",
        cacheHit: false
      })
    });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    const body = route.request().postDataJSON();
    if (body.probe) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "fixture", generationSource: "fixture", isFallback: false }) });
    }
    patientCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        replyText: body.language === "en" ? "This is a redacted patient reply." : "这是脱敏的固定患者回答。",
        matchedSlotIds: ["hematuria_onset"],
        matchedFacts: [],
        provider: "fixture",
        generationSource: "fixture",
        isFallback: false
      })
    });
  });
  return { patientCalls: () => patientCalls };
}

async function installSpeechMock(page) {
  await page.addInitScript(() => {
    const storageKey = "qa-speech-control-counts";
    const read = () => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || "null") || { speak: 0, pause: 0, resume: 0, cancel: 0 };
      } catch {
        return { speak: 0, pause: 0, resume: 0, cancel: 0 };
      }
    };
    const update = (key) => {
      const next = read();
      next[key] += 1;
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      window.__qaSpeechCounts = next;
    };
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
    const voices = [{ name: "QA Chinese Voice", voiceURI: "qa-zh", lang: "zh-CN", localService: true, default: true }];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: MockUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voices,
        addEventListener: () => {},
        removeEventListener: () => {},
        cancel: () => update("cancel"),
        pause: () => update("pause"),
        resume: () => update("resume"),
        speak: (utterance) => {
          update("speak");
          utterance.onstart?.();
        }
      }
    });
    window.__qaSpeechCounts = read();
  });
}

async function speechCounts(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("qa-speech-control-counts") || "{}"));
}

test("keyboard, visible focus, Escape, reduced motion, and touch targets", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installSpeechMock(page);
  const api = await installSafePracticeApi(page);
  await page.goto("/cases/P001/");

  const input = page.getByRole("textbox", { name: "输入问诊问题" });
  await expect(input).toBeVisible();
  await input.fill("第一行");
  await input.press("Shift+Enter");
  await input.type("第二行");
  await expect(input).toHaveValue("第一行\n第二行");

  const voiceSettings = page.getByRole("button", { name: /语音设置/ });
  await expect(voiceSettings).toBeEnabled();
  await input.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(voiceSettings).toBeFocused();
  const focusStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();

  await input.press("Enter");
  await expect(page.getByRole("log", { name: "模拟问诊对话" }).getByText("这是脱敏的固定患者回答。", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  expect(api.patientCalls()).toBe(1);

  await voiceSettings.click();
  const dialog = page.getByRole("dialog", { name: "语音设置" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const reducedMotion = await page.evaluate(() => ({
    media: matchMedia("(prefers-reduced-motion: reduce)").matches,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionMs: Number.parseFloat(getComputedStyle(document.querySelector(".ui-button-primary")).transitionDuration) * 1000
  }));
  expect(reducedMotion).toMatchObject({ media: true, scrollBehavior: "auto" });
  expect(reducedMotion.transitionMs).toBeLessThanOrEqual(1);

  if (testInfo.project.use.isMobile) {
    await voiceSettings.click();
    await expect(dialog).toBeVisible();
    const touchControls = [
      { name: "voice-settings", locator: voiceSettings },
      { name: "dialog-close", locator: dialog.getByRole("button", { name: "关闭" }) },
      { name: "voice-test", locator: dialog.getByRole("button", { name: "试听" }) },
      { name: "voice-stop", locator: dialog.getByTitle("停止") }
    ];
    const measurements = [];
    for (const control of touchControls) {
      const box = await control.locator.boundingBox();
      measurements.push({ name: control.name, width: box ? Math.round(box.width) : 0, height: box ? Math.round(box.height) : 0 });
    }
    const undersized = measurements.filter(({ width, height }) => width < 44 || height < 44);
    if (undersized.length) {
      const viewport = testInfo.project.use.viewport;
      const slug = `${viewport.width}x${viewport.height}`;
      const reportRoot = path.resolve("artifacts/exploratory-qa/reports");
      const screenshotRoot = path.resolve("artifacts/exploratory-qa/screenshots");
      await Promise.all([mkdir(reportRoot, { recursive: true }), mkdir(screenshotRoot, { recursive: true })]);
      await writeFile(path.join(reportRoot, `hem-p2-044-touch-targets-${slug}.json`), `${JSON.stringify({ minimumCssPixels: 44, viewport, measurements, undersized }, null, 2)}\n`, "utf8");
      await page.screenshot({ path: path.join(screenshotRoot, `hem-p2-044-touch-targets-${slug}-failure.png`), animations: "disabled", fullPage: true });
    }
    expect(undersized, "mobile touch targets smaller than 44x44").toEqual([]);
  }
});

test("browser speech supports pause, resume, stop, replay, case switch, and refresh", async ({ page }) => {
  await installSpeechMock(page);
  await installSafePracticeApi(page);
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  const dialog = page.getByRole("dialog", { name: "语音设置" });
  await expect(dialog).toBeVisible();
  await dialog.locator("select").first().selectOption("browser");

  await dialog.getByRole("button", { name: "试听" }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "fallback-browser");
  const afterPlay = await speechCounts(page);
  expect(afterPlay.speak).toBe(1);

  await dialog.getByTitle("暂停").click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "paused");
  expect((await speechCounts(page)).pause).toBe(1);

  await dialog.getByTitle("继续").click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "playing");
  expect((await speechCounts(page)).resume).toBe(1);

  await dialog.getByTitle("停止").click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "idle");
  const afterStop = await speechCounts(page);
  expect(afterStop.cancel).toBeGreaterThan(afterPlay.cancel);

  await dialog.getByRole("button", { name: "重播" }).click();
  await expect.poll(async () => (await speechCounts(page)).speak).toBe(2);
  await dialog.getByRole("button", { name: "试听" }).click();
  await dialog.getByRole("button", { name: "试听" }).click();
  await expect.poll(async () => (await speechCounts(page)).speak).toBe(4);

  const beforeSwitch = await speechCounts(page);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "病例库", exact: true }).last().click();
  await expect(page).toHaveURL(/\/cases\/$/);
  await page.locator('a[href$="/cases/P002/"]').click();
  await expect(page).toHaveURL(/\/cases\/P002\/$/);
  await expect.poll(async () => (await speechCounts(page)).cancel).toBeGreaterThan(beforeSwitch.cancel);

  await page.getByRole("button", { name: /语音设置/ }).click();
  const secondDialog = page.getByRole("dialog", { name: "语音设置" });
  await secondDialog.locator("select").first().selectOption("browser");
  await secondDialog.getByRole("button", { name: "试听" }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "fallback-browser");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /语音设置/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "idle");
});
