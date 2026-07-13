import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("artifacts/exploratory-qa");
const CJK = /[\u3400-\u9fff]/;
const TEACHER_META = /根据原始病史|根据病例资料|病例资料显示|未主动诉|需追问|教师提示|标准答案|评分点|标准病例摘要/i;

function viewportSlug(testInfo) {
  return testInfo.project.name.replace(/^qa-/, "");
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
}

function redact(value) {
  return String(value)
    .replace(/("(?:authorization|set-cookie|cookie|x-training-state|api[-_ ]?key|secret|token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, "$1\"[REDACTED]\"")
    .replace(/('(?:authorization|set-cookie|cookie|x-training-state|api[-_ ]?key|secret|token)'\s*:\s*)'(?:\\.|[^'\\])*'/gi, "$1'[REDACTED]'")
    .replace(/((?:authorization|set-cookie|cookie|x-training-state)\s*[:=])[^\r\n]*/gi, "$1 [REDACTED]")
    .replace(/((?:api[-_ ]?key|secret|token)\s*[:=])\s*[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:sig|signature|token|key)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/([a-z]:\\users\\)[^\\\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(?:bearer\s+)?[a-z0-9_-]{32,}\b/gi, "[REDACTED]");
}

async function withLiveEvidence(page, testInfo, scenario, run) {
  testInfo.annotations.push({ type: "qa-scenario", description: scenario });
  const slug = `${safeSlug(scenario)}-${viewportSlug(testInfo)}`;
  const dirs = {
    screenshots: path.join(ROOT, "screenshots"),
    traces: path.join(ROOT, "traces"),
    reports: path.join(ROOT, "reports")
  };
  await Promise.all(Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })));
  const consoleEvents = [];
  const networkEvents = [];
  const responseTasks = [];
  const requestStart = new Map();

  page.on("console", (message) => consoleEvents.push({
    at: new Date().toISOString(),
    type: message.type(),
    text: redact(message.text()).slice(0, 1500)
  }));
  page.on("request", (request) => requestStart.set(request, Date.now()));
  page.on("requestfailed", (request) => networkEvents.push({
    method: request.method(),
    path: new URL(request.url()).pathname,
    status: "FAILED",
    durationMs: Date.now() - (requestStart.get(request) || Date.now()),
    failure: redact(request.failure()?.errorText || "unknown")
  }));
  page.on("response", (response) => {
    const task = (async () => {
    const request = response.request();
    const event = {
      method: request.method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
      durationMs: Date.now() - (requestStart.get(request) || Date.now()),
      resourceType: request.resourceType()
    };
    if (event.path.startsWith("/api/") && request.method() === "POST") {
      try {
        const body = request.postDataJSON();
        event.request = {
          ...(body?.action ? { action: String(body.action).slice(0, 40) } : {}),
          ...(body?.caseId ? { caseId: String(body.caseId).slice(0, 16) } : {}),
          ...(body?.language ? { language: String(body.language).slice(0, 8) } : {}),
          ...(body?.mode ? { mode: String(body.mode).slice(0, 24) } : {})
        };
      } catch { /* No request payload is retained. */ }
    }
    if (response.status() >= 400 && event.path.startsWith("/api/")) {
      try {
        const payload = await response.json();
        if (payload?.error) event.error = String(payload.error).slice(0, 100);
      } catch { /* Non-JSON errors are represented by status only. */ }
    }
    networkEvents.push(event);
    })();
    responseTasks.push(task);
  });

  await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
  try {
    await run({
      screenshot: async () => {
        const target = path.join(dirs.screenshots, `${slug}-failure.png`);
        await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
        await testInfo.attach(path.basename(target), { path: target, contentType: "image/png" });
      }
    });
  } catch (error) {
    const target = path.join(dirs.screenshots, `${slug}-failure.png`);
    await page.screenshot({ path: target, fullPage: true, animations: "disabled" }).catch(() => {});
    throw error;
  } finally {
    await page.context().tracing.stop({ path: path.join(dirs.traces, `${slug}.zip`) }).catch(() => {});
    await Promise.allSettled(responseTasks);
    await writeFile(path.join(dirs.reports, `${slug}-console.json`), `${JSON.stringify(consoleEvents, null, 2)}\n`, "utf8");
    await writeFile(path.join(dirs.reports, `${slug}-network.json`), `${JSON.stringify(networkEvents, null, 2)}\n`, "utf8");
  }
}

test.use({ video: "retain-on-failure" });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const video = page.video();
  if (!video) return;
  const scenario = testInfo.annotations.find((item) => item.type === "qa-scenario")?.description || safeSlug(testInfo.title);
  const target = path.join(ROOT, "videos", `${safeSlug(scenario)}-${viewportSlug(testInfo)}.webm`);
  await mkdir(path.dirname(target), { recursive: true });
  await page.close().catch(() => {});
  await video.saveAs(target).catch(() => {});
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("hematuria-speech-preferences", JSON.stringify({ enabled: false, provider: "auto", manualOverrides: {}, rate: 1, pitch: 1 }));
  });
});

test("live English session opening stays in English", async ({ page }, testInfo) => {
  await withLiveEvidence(page, testInfo, "live-english-opening-language", async ({ screenshot }) => {
    await page.evaluate(() => localStorage.setItem("hematuria-language", "en"));
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/session/init/")
      && response.request().method() === "POST");
    await page.goto("/cases/P001/");
    const response = await responsePromise;
    const payload = await response.json();
    expect(response.status(), `session init error=${String(payload?.error || "none")}`).toBe(200);
    expect(payload.language, "the persisted English preference must initialize an English session").toBe("en");
    await expect(page.getByText(payload.patientOpeningStatement, { exact: true })).toBeVisible();
    await screenshot();
    expect(CJK.test(String(payload.patientOpeningStatement || "")), "English session opening must not contain Chinese characters").toBe(false);
  });
});

test("switching from Chinese to English starts an authorized attempt", async ({ page }, testInfo) => {
  await withLiveEvidence(page, testInfo, "live-language-switch-authorization", async ({ screenshot }) => {
    const initialResponse = page.waitForResponse((response) => response.url().includes("/api/session/init/")
      && response.request().method() === "POST"
      && response.request().postDataJSON()?.language === "zh");
    await page.goto("/cases/P001/");
    await initialResponse;
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/session/init/")
      && response.request().method() === "POST"
      && response.request().postDataJSON()?.language === "en");
    await page.getByRole("button", { name: "English" }).click();
    const response = await responsePromise;
    const payload = await response.json();
    if (response.status() !== 200) await screenshot();
    expect(response.status(), `session init error=${String(payload?.error || "none")}`).toBe(200);
  });
});

test("live patient API does not expose teacher meta language", async ({ page }, testInfo) => {
  await withLiveEvidence(page, testInfo, "live-p004-clots-teacher-meta", async ({ screenshot }) => {
    const initPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/session/init/") || response.request().method() !== "POST") return false;
      const body = response.request().postDataJSON();
      return body?.caseId === "P004" && body?.language === "zh";
    });
    await page.goto("/cases/P004/");
    expect((await initPromise).status()).toBe(200);

    const input = page.getByRole("textbox", { name: "输入问诊问题" });
    await input.fill("有血块吗？");
    const answerPromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/agent-chat/") || response.request().method() !== "POST") return false;
      return response.request().postDataJSON()?.studentInput === "有血块吗？";
    });
    await input.press("Enter");
    const response = await answerPromise;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    await expect(page.getByLabel("模拟问诊对话").getByText("有血块吗？", { exact: true }).first()).toBeVisible();
    await screenshot();
    expect(TEACHER_META.test(String(payload.replyText || "")), "Patient API must not return teacher-only prompting language").toBe(false);
  });
});
