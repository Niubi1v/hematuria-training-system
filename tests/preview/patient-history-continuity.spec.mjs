import { expect, test } from "@playwright/test";

import {
  createPreviewProtectionHeaders,
  resolvePreviewBlackboxConfig,
  shouldAttachPreviewProtection
} from "../../scripts/preview-blackbox-config.mjs";

const preview = resolvePreviewBlackboxConfig(process.env);
if (preview.blocked) throw new Error(`${preview.reason}: ${preview.message}`);

const enabled = process.env.PATIENT_HISTORY_CONTINUITY_ACCEPTANCE === "1";
const cases = [
  { id: "P001", sex: "male", complaint: "hematuria", hypertensionMedication: true },
  { id: "P003", sex: "male", complaint: "hematuria", personalHistory: true },
  { id: "P004", sex: "male", complaint: "hematuria" },
  { id: "P006", sex: "female", complaint: "hematuria" },
  { id: "P007", sex: "male", complaint: "hematuria" },
  { id: "P013", sex: "male", complaint: "hematuria" },
  { id: "P026", sex: "female", complaint: "hematuria" },
  { id: "P029", sex: "male", complaint: "hematuria" },
  { id: "P037", sex: "female", complaint: "health_check_finding" },
  { id: "P042", sex: "male", complaint: "health_check_finding" }
];
const englishCaseIds = new Set(["P001", "P006", "P013", "P037", "P042"]);
const unknownZh = /不太清楚|不知道|没(?:有)?(?:特别)?(?:注意|留意)|记不(?:太)?清|没有可靠的信息/;
const unknownEn = /not sure|do not know|did not notice|have not noticed|cannot recall|do not have reliable information/i;

function safeBody(request) {
  try { return request.postDataJSON() || {}; } catch { return {}; }
}

function isAction(response, action) {
  return new URL(response.url()).pathname === "/api/training-action/"
    && response.request().method() === "POST"
    && safeBody(response.request()).action === action;
}

function isSessionInit(response, language) {
  return new URL(response.url()).pathname === "/api/session/init/"
    && response.request().method() === "POST"
    && safeBody(response.request()).language === language;
}

function percentile(values, ratio) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function parseTiming(value) {
  const parsed = {};
  for (const item of String(value || "").split(",")) {
    const match = item.trim().match(/^([a-z]+);dur=(\d+(?:\.\d+)?)$/i);
    if (match) parsed[match[1].toLowerCase()] = Number(match[2]);
  }
  return parsed;
}

async function installProtection(page) {
  const headers = createPreviewProtectionHeaders(preview);
  let bootstrap = true;
  await page.route((url) => shouldAttachPreviewProtection(url.toString(), preview.baseURL), async (route) => {
    const requestHeaders = {
      ...route.request().headers(),
      "x-vercel-protection-bypass": headers["x-vercel-protection-bypass"]
    };
    if (bootstrap) {
      requestHeaders["x-vercel-set-bypass-cookie"] = headers["x-vercel-set-bypass-cookie"];
      bootstrap = false;
    }
    await route.continue({ headers: requestHeaders });
  });
}

async function openCase(browser, caseId, language) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installProtection(page);
  const zhAttempt = page.waitForResponse((response) => isAction(response, "init-attempt"));
  const zhSession = page.waitForResponse((response) => isSessionInit(response, "zh"));
  const navigation = await page.goto(`/cases/${caseId}/`, { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(new URL(preview.baseURL).origin);
  expect((await zhAttempt).status()).toBe(200);
  expect((await zhSession).status()).toBe(200);
  if (language === "en") {
    const enAttempt = page.waitForResponse((response) => isAction(response, "init-attempt")
      && safeBody(response.request()).language === "en");
    const enSession = page.waitForResponse((response) => isSessionInit(response, "en"));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "English", exact: true }).click();
    expect((await enAttempt).status()).toBe(200);
    expect((await enSession).status()).toBe(200);
  }
  return { context, page };
}

async function ask(page, language, question, expectedFact, options = {}) {
  const english = language === "en";
  const input = page.getByRole("textbox", { name: english ? "Enter an interview question" : "输入问诊问题" });
  const send = page.getByRole("button", { name: english ? "Send" : "发送", exact: true });
  const patientPending = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/agent-chat/" && response.request().method() === "POST");
  const historyPending = page.waitForResponse((response) => isAction(response, "history-log"));
  await input.fill(question);
  const startedAt = Date.now();
  await send.click();
  const patient = await patientPending;
  const payload = await patient.json();
  const history = await historyPending;
  const durationMs = Date.now() - startedAt;
  const headers = await patient.allHeaders();
  const timing = parseTiming(headers["server-timing"] || headers["x-hematuria-timing"]);
  const unknown = (english ? unknownEn : unknownZh).test(String(payload.replyText || ""));
  const matchedFacts = payload.matchedFacts || [];

  await page.waitForTimeout(3000);
  return {
    expectedFact,
    status: patient.status(),
    historyStatus: history.status(),
    answerSource: payload.generationSource,
    provider: payload.provider,
    providerConfigured: payload.providerConfigured,
    providerHttpSuccess: payload.providerHttpSuccess,
    model: payload.usedModel,
    thinkingMode: payload.thinkingMode,
    thinkingExecuted: payload.thinkingExecuted,
    matchedFact: expectedFact
      ? (matchedFacts.includes(expectedFact) ? expectedFact : "")
      : (matchedFacts[0] || ""),
    unknown: options.allowUnknown ? false : unknown,
    expectedPartialUnknown: Boolean(options.allowUnknown && unknown),
    fallback: payload.isFallback,
    fallbackReason: payload.fallbackReason || "",
    durationMs,
    providerMs: timing.provider,
    firstTokenMs: timing.firsttoken
  };
}

async function runChiefComplaintFlow(browser, caseData, language) {
  const opened = await openCase(browser, caseData.id, language);
  try {
    const first = await ask(
      opened.page,
      language,
      language === "en" ? "What brought you in today?" : "哪里不舒服？",
      "chief_complaint"
    );
    const second = await ask(
      opened.page,
      language,
      language === "en" ? "How long has this been going on?" : "多久了？",
      "hematuria_onset"
    );
    return [first, second];
  } finally {
    await opened.context.close();
  }
}

test("@preview-history-continuity preserves governed facts across real Flash follow-ups", async ({ browser }, testInfo) => {
  test.skip(!enabled, "Set PATIENT_HISTORY_CONTINUITY_ACCEPTANCE=1 for the bounded Preview acceptance run.");
  test.setTimeout(20 * 60 * 1000);
  const samples = [];

  for (const caseData of cases) {
    samples.push(...(await runChiefComplaintFlow(browser, caseData, "zh")).map((sample) => ({
      caseId: caseData.id,
      language: "zh",
      ...sample
    })));
  }

  for (const caseData of cases.filter((item) => englishCaseIds.has(item.id))) {
    samples.push(...(await runChiefComplaintFlow(browser, caseData, "en")).map((sample) => ({
      caseId: caseData.id,
      language: "en",
      ...sample
    })));
  }

  const medication = await openCase(browser, "P001", "zh");
  try {
    for (const [question, expectedFact, options = {}] of [
      ["有没有其他疾病？", "past_medical_history_summary"],
      ["有高血压吗？", "hypertension_history"],
      ["吃什么药？", "medication_name"],
      ["这个药怎么吃？", "medication_frequency", { allowUnknown: true }],
      ["还有没有吃其他药？", "other_medications"]
    ]) {
      samples.push({
        caseId: "P001",
        language: "zh",
        ...(await ask(medication.page, "zh", question, expectedFact, options))
      });
    }
  } finally {
    await medication.context.close();
  }

  const personal = await openCase(browser, "P003", "zh");
  try {
    samples.push({ caseId: "P003", language: "zh", ...(await ask(personal.page, "zh", "抽烟吗？", "smoking_history")) });
    samples.push({ caseId: "P003", language: "zh", ...(await ask(personal.page, "zh", "喝酒吗？", "alcohol_history")) });
  } finally {
    await personal.context.close();
  }

  const durations = samples.map((sample) => sample.durationMs);
  const providerDurations = samples.map((sample) => sample.providerMs).filter(Number.isFinite);
  const firstTokenDurations = samples.map((sample) => sample.firstTokenMs).filter(Number.isFinite);
  const summary = {
    scenario: "preview-history-continuity",
    cases: cases.length,
    femaleCases: cases.filter((item) => item.sex === "female").length,
    healthCheckCases: cases.filter((item) => item.complaint === "health_check_finding").length,
    zhLiveAi: samples.filter((sample) => sample.language === "zh" && sample.answerSource === "live_ai").length,
    enLiveAi: samples.filter((sample) => sample.language === "en" && sample.answerSource === "live_ai").length,
    erroneousUnknowns: samples.filter((sample) => sample.unknown).length,
    contextLosses: samples.filter((sample) => !sample.matchedFact).length,
    fallbacks: samples.filter((sample) => sample.fallback).length,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    providerP95Ms: percentile(providerDurations, 0.95),
    firstTokenP95Ms: percentile(firstTokenDurations, 0.95),
    samples
  };
  await testInfo.attach("preview-history-continuity", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json"
  });
  console.log(`PATIENT_HISTORY_CONTINUITY_EVIDENCE ${JSON.stringify(summary)}`);
  expect(samples.every((sample) => sample.status === 200 && sample.historyStatus === 200)).toBe(true);
  expect(samples.every((sample) => sample.providerConfigured === true)).toBe(true);
  expect(samples.every((sample) => sample.provider === "deepseek")).toBe(true);
  expect(samples.every((sample) => sample.model === "deepseek-v4-flash")).toBe(true);
  expect(samples.every((sample) => sample.thinkingMode === "disabled" && sample.thinkingExecuted === false)).toBe(true);
  expect(summary.zhLiveAi).toBeGreaterThanOrEqual(10);
  expect(summary.enLiveAi).toBeGreaterThanOrEqual(5);
  expect(summary.erroneousUnknowns).toBe(0);
  expect(summary.contextLosses).toBe(0);
  expect(summary.fallbacks).toBe(0);
});
