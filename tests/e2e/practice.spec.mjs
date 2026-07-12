import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "playwright-training-state-secret-with-adequate-length";
const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");

async function trainingApi(body, token = "") {
  let statusCode = 200;
  let payload;
  const headers = {};
  const req = { method: "POST", body, headers: token ? { "x-training-state": token } : {}, socket: { remoteAddress: `pw-${Math.random()}` } };
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; }, status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }, end() { return this; }
  };
  await trainingHandler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

test("public deployment exposes practice navigation without teacher answers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "血尿临床思维训练系统" })).toBeVisible();
  await expect(page.getByText("不可用于正式 OSCE")).toBeVisible();
  await expect(page.getByRole("link", { name: /教师/ })).toHaveCount(0);
});

test("case route renders seven locked stages and no disease tag", async ({ page }) => {
  await page.goto("/cases/P008/");
  await expect(page.getByText("P008", { exact: true }).first()).toBeVisible();
  await expect(page.locator("aside button")).toHaveCount(7);
  await expect(page.getByText(/Case tags|疾病标签|膀胱结石/)).toHaveCount(0);
  await expect(page.getByText(/漏问项|得分点/)).toHaveCount(0);
});

test("case catalog switches public complaint language", async ({ page }) => {
  await page.goto("/cases/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Case selection" })).toBeVisible();
  await expect(page.getByText(/Hematuria/i).first()).toBeVisible();
});

test("primary practice pages have no serious accessibility violations", async ({ page }) => {
  for (const route of ["/", "/cases/", "/cases/P008/"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious, `${route}: ${serious.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("automatic voice profile follows patient sex, language, and age", async ({ page }) => {
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-gender", "male");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "zh-CN-YunxiNeural");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-age-group", "older");

  await page.goto("/cases/P002/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-gender", "female");
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "zh-CN-XiaoxiaoNeural");
  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: /Voice settings/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "en-US-JennyNeural");

  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /Voice settings/ }).click();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-cloud-voice", "en-US-GuyNeural");
});

test("cloud TTS failure visibly falls back to the matched browser voice", async ({ page }) => {
  await page.addInitScript(() => {
    class MockUtterance {
      constructor(text) { this.text = text; this.onstart = null; this.onend = null; this.onerror = null; }
    }
    const voices = [{ name: "Microsoft Yunxi Online Natural", voiceURI: "yunxi", lang: "zh-CN", localService: false, default: true }];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: MockUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => voices, addEventListener: () => {}, removeEventListener: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
      speak: (utterance) => { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 800); }
    } });
  });
  await page.route("**/api/tts/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "cloud_tts_unavailable" }) }));
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: /语音设置/ }).click();
  await page.getByRole("button", { name: "试听" }).click();
  await expect(page.getByText("云语音暂时不可用，已切换为浏览器语音。")).toBeVisible();
  await expect(page.getByTestId("voice-profile")).toHaveAttribute("data-speech-state", "fallback-browser");
});

test("English patient reply stays English and language switch creates a separate attempt", async ({ page }) => {
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "e2e-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor. My urine has been red.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "- I do not have pain or fever.", matchedSlotIds: ["pain", "fever_chills"], isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("Do you have pain or fever?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I do not have pain or fever.").first()).toBeVisible();
  await expect(page.getByText("这个我不太清楚")).toHaveCount(0);
  const englishPointer = await page.evaluate(() => Object.keys(localStorage).find((key) => key.includes("attempt-pointer-v3:P001:free:en")));
  expect(englishPointer).toBeTruthy();
});

test("rule fallback keeps reconnection available and recovery replaces the reply without duplicate evidence", async ({ page }) => {
  let sessionCalls = 0;
  let historyLogCalls = 0;
  const sessionBodies = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    sessionCalls += 1;
    const request = route.request().postDataJSON();
    sessionBodies.push(request);
    const sessionId = request.forceRefresh ? "session-new" : "session-old";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId, caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    const request = route.request().postDataJSON();
    if (request.probe) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }) });
    const recovered = request.sessionId === "session-new";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recovered
      ? { replyText: "我吸烟，大约每天一包。", matchedSlotIds: ["smoking"], matchedFacts: ["smoking=current"], provider: "deepseek", isFallback: false, fallbackReason: "" }
      : { replyText: "我吸烟，大约每天一包。", matchedSlotIds: ["smoking"], matchedFacts: ["smoking=current"], provider: "rule", isFallback: true, fallbackReason: "provider_timeout" }) });
  });
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") historyLogCalls += 1;
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("您吸烟吗？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("当前由规则库回答，可随时重新连接AI。")).toBeVisible();
  const reconnect = page.getByRole("button", { name: "重新连接AI", exact: true });
  expect(await reconnect.count()).toBe(1);
  await reconnect.evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByText("已重新连接AI")).toBeVisible();
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("您吸烟吗？", { exact: true })).toHaveCount(1);
  await expect(conversation.getByText("我吸烟，大约每天一包。", { exact: true })).toHaveCount(1);
  expect(historyLogCalls).toBe(1);
  expect(sessionCalls).toBeGreaterThanOrEqual(2);
  expect(sessionBodies.filter((body) => body.forceRefresh === true)).toHaveLength(1);
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:zh:"));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  expect(saved.messages.filter((item) => item.role === "student")).toHaveLength(1);
  expect(saved.askedSlots).toContain("smoking");
  expect(saved.collected.smoking).toBe(true);
  expect(saved.timeline.filter((item) => item.type === "ask")).toHaveLength(1);
  expect(saved.timeline.filter((item) => item.type === "technical")).toHaveLength(1);
});

test("offline reconnect sends no request and can recover after the online event", async ({ page, context }) => {
  let healthCalls = 0;
  let sessionCalls = 0;
  await page.route("**/api/health/**", (route) => { healthCalls += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }); });
  await page.route("**/api/session/init/**", (route) => { sessionCalls += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: `session-${Date.now()}`, caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }); });
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "", matchedSlotIds: [], matchedFacts: [], provider: "deepseek", isFallback: false }) }));
  await page.goto("/cases/P001/");
  await expect.poll(() => sessionCalls).toBe(1);
  await page.waitForTimeout(500);
  expect(sessionCalls).toBe(1);
  // The network-listener effect is registered before the session-init effect.
  // Observing the first session request therefore gives a deterministic
  // hydration/listener-ready boundary before emulating an offline transition.
  await expect.poll(() => sessionCalls).toBeGreaterThan(0);
  await context.setOffline(true);
  await expect(page.getByText("当前处于离线状态，既有训练记录已保留。")).toBeVisible();
  const before = healthCalls;
  await page.getByRole("button", { name: "重新连接AI", exact: true }).click();
  expect(healthCalls).toBe(before);
  await context.setOffline(false);
  await expect(page.getByText("网络已恢复，可以重新连接AI。")).toBeVisible();
  await page.getByRole("button", { name: "重新连接AI", exact: true }).click();
  await expect(page.getByText("已重新连接AI")).toBeVisible();
  expect(healthCalls).toBeGreaterThan(before);
});

test("AI reply renders before history log synchronization and uses one sync notice", async ({ page }) => {
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "I first noticed the red urine this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") await new Promise((resolve) => setTimeout(resolve, 1500));
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did you first notice it?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Simulated patient conversation").getByText("I first noticed the red urine this morning.")).toBeVisible({ timeout: 700 });
  await expect(page.getByText("This answer is saved. Scoring is synchronizing.")).toBeVisible();
  await expect(page.getByText("The question log could not be verified; it will not count toward scoring.")).toHaveCount(0);
  await expect(page.getByText("Scoring is synchronized.")).toBeVisible();
});

test("history log transient failure retries one idempotent request without replacing the AI reply", async ({ page }) => {
  let historyCalls = 0;
  const historyRequestIds = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "retry-sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "It started this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") {
      historyCalls += 1;
      historyRequestIds.push(body.requestId);
      if (historyCalls === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_log_unavailable" }) });
    }
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did it start?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Simulated patient conversation").getByText("It started this morning.")).toBeVisible({ timeout: 700 });
  await expect(page.getByText("This answer is saved. Scoring is synchronizing.")).toBeVisible();
  await expect(page.getByText("Scoring is synchronized.")).toBeVisible();
  expect(historyCalls).toBe(2);
  expect(new Set(historyRequestIds).size).toBe(1);
  await expect(page.getByLabel("Simulated patient conversation").getByText("It started this morning.")).toHaveCount(1);
  await expect(page.getByText("The question log could not be verified; it will not count toward scoring.")).toHaveCount(0);
});

test("rapid double send creates one patient request and one conversation turn", async ({ page }) => {
  let patientCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "double-send-session", caseId: "P001", language: "zh", mode: "free", patientOpeningStatement: "医生您好。", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", async (route) => {
    patientCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "今天早上开始的。", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) });
  });
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByPlaceholder("输入问诊问题").fill("什么时候开始的？");
  const send = page.getByRole("button", { name: "发送" });
  await send.evaluate((button) => { button.click(); button.click(); });
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await expect(conversation.getByText("今天早上开始的。", { exact: true })).toBeVisible();
  expect(patientCalls).toBe(1);
  await expect(conversation.getByText("什么时候开始的？", { exact: true })).toHaveCount(1);
  await expect(conversation.getByText("今天早上开始的。", { exact: true })).toHaveCount(1);
});

test("twenty interview turns do not reinitialize the active language session", async ({ page }) => {
  let sessionCalls = 0;
  let patientCalls = 0;
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => {
    sessionCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "twenty-turn-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) });
  });
  await page.route("**/api/agent-chat/**", (route) => {
    patientCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: `Patient answer ${patientCalls}.`, matchedSlotIds: [], matchedFacts: [], provider: "deepseek", generationSource: "live_ai", isFallback: false }) });
  });
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await expect.poll(() => sessionCalls).toBe(2);
  const initializedLanguageSessions = sessionCalls;
  const input = page.getByPlaceholder("Enter an interview question");
  for (let turn = 1; turn <= 20; turn += 1) {
    await input.fill(`Question ${turn}?`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Simulated patient conversation").getByText(`Patient answer ${turn}.`, { exact: true })).toBeVisible();
  }
  expect(sessionCalls).toBe(initializedLanguageSessions);
  expect(patientCalls).toBe(20);
  await expect(page.getByLabel("Simulated patient conversation").getByText("Patient answer 20.", { exact: true })).toHaveCount(1);
});

test("page refresh resumes the same pending history log request", async ({ page }) => {
  let historyCalls = 0;
  const historyRequestIds = [];
  await page.route("**/api/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", patientServiceConfigured: true, trainingStateConfigured: true, cloudTtsConfigured: false, allowedOriginConfigured: true, deploymentTier: "practice", gitSha: "e2e-sha", deploymentSha: "e2e-sha", apiVersion: "2.6.0" }) }));
  await page.route("**/api/session/init/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "refresh-sync-session", caseId: "P001", language: "en", mode: "free", patientOpeningStatement: "Hello doctor.", sessionCreatedAt: new Date().toISOString(), sessionExpiresAt: new Date(Date.now() + 1_800_000).toISOString(), deploymentSha: "e2e-sha", apiVersion: "2.6.0", aiStatus: "available", profileSource: "local-simulation", cacheHit: false }) }));
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "It began this morning.", matchedSlotIds: ["hematuria_onset"], matchedFacts: ["onset=today"], provider: "deepseek", generationSource: "live_ai", isFallback: false }) }));
  await page.route("**/api/training-action/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "history-log") {
      historyCalls += 1;
      historyRequestIds.push(body.requestId);
      if (historyCalls === 1) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const payload = body.action === "init-attempt" ? { attemptId: body.attemptId, practiceOnly: true } : { recorded: true, requestId: body.requestId };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Training-State": `e2e-${body.attemptId}` }, body: JSON.stringify(payload) });
  });
  await page.goto("/cases/P001/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Enter an interview question").fill("When did it begin?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("This answer is saved. Scoring is synchronizing.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("hematuria-attempt-v3:P001:free:en:"));
    const saved = key ? JSON.parse(localStorage.getItem(key)) : null;
    return saved?.pendingHistoryLogs?.length || 0;
  })).toBe(1);
  await page.reload();
  await expect(page.getByLabel("Simulated patient conversation").getByText("It began this morning.", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Scoring is synchronized.")).toBeVisible();
  expect(historyCalls).toBeGreaterThanOrEqual(2);
  expect(new Set(historyRequestIds).size).toBe(1);
});

test("public teacher and RCT routes do not expose formal functions", async ({ page }) => {
  await page.goto("/teacher/");
  await expect(page.getByText(/演示|practice|正式考核/i).first()).toBeVisible();
  await expect(page.getByText(/标准诊断|standard diagnosis|评分关键词/i)).toHaveCount(0);
  await page.goto("/rct/");
  await expect(page.getByText(/正式研究采集未在公开站启用|不采集研究数据|authenticated backend/i).first()).toBeVisible();
});

test("P008 exact orders and server-validated scoring resist forged answers", async () => {
  const attemptId = `pw-p008-${Date.now()}-${Math.random()}`;
  let response = await trainingApi({ action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "zh" });
  response = await trainingApi({ action: "order", caseId: "P008", attemptId, input: "血常规" }, response.token);
  expect(response.payload.results.every((item) => item.orderId === "LAB-BL-001")).toBe(true);
  expect(JSON.stringify(response.payload)).not.toMatch(/CTU|乳果糖|肠道准备/);

  response = await trainingApi({ action: "stage-feedback", caseId: "P008", attemptId, stageKey: "diagnosis", submission: {
    diagnosis: "急性阑尾炎", diagnosticEvidence: "右下腹压痛", differentials: "胃炎；胆囊炎；胰腺炎", confirmatoryTests: "腹部平片"
  } }, response.token);
  expect(response.payload.score).toBe(0);
  expect(response.payload.warnings.join(" ")).toMatch(/不符/);

  const scored = await trainingApi({ action: "score", caseId: "P008", attemptId, events: [{ type: "treatment_action", actionId: "definitive", metadata: { validated: true } }] }, response.token);
  expect(scored.payload.total).toBeLessThan(100);
});
