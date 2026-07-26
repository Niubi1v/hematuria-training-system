import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CASES = JSON.parse(await readFile(path.resolve("data/cases_public.json"), "utf8"))
  .map((item) => ({
    caseId: item.displayCaseId || item.id,
    openingZh: String(item.studentChiefComplaint || "").trim() || "医生您好。",
    openingEn: String(item.chiefComplaintEn || "").trim() || "Hello doctor."
  }));
const PRODUCTION_BASELINE = process.env.QA_PRODUCTION_BASELINE || "unknown";
const ARTIFACT_PREFIX = process.env.QA_ARTIFACT_RUN_PREFIX
  ? `${process.env.QA_ARTIFACT_RUN_PREFIX.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "")}-`
  : "";
const REPORT_ROOT = path.resolve("artifacts/exploratory-qa/reports");
const SCREENSHOT_ROOT = path.resolve("artifacts/exploratory-qa/screenshots");
const TRACE_ROOT = path.resolve("artifacts/exploratory-qa/traces");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function viewportSlug(testInfo) {
  const viewport = testInfo.project.use.viewport;
  return `${viewport.width}x${viewport.height}`;
}

async function installSafeCaseApi(page) {
  const cases = new Map(CASES.map((item) => [item.caseId, item]));
  await page.route("**/api/health/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      patientServiceConfigured: true,
      trainingStateConfigured: true,
      cloudTtsConfigured: false,
      deploymentTier: "practice",
      deploymentSha: "qa-fixture",
      apiVersion: "qa-fixture"
    })
  }));
  await page.route("**/api/training-action/**", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Training-State": "qa-redacted-state" },
      body: JSON.stringify(
        body.action === "init-attempt"
          ? { attemptId: body.attemptId, practiceOnly: true }
          : { recorded: true }
      )
    });
  });
  await page.route("**/api/session/init/**", (route) => {
    const body = route.request().postDataJSON();
    const caseItem = cases.get(body.caseId);
    const language = body.language === "en" ? "en" : "zh";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: `qa-a11y-${body.caseId}-${language}`,
        caseId: body.caseId,
        language,
        mode: body.mode || body.runtimeMode || "free",
        patientOpeningStatement: language === "en" ? caseItem?.openingEn : caseItem?.openingZh,
        sessionCreatedAt: "2026-07-26T00:00:00.000Z",
        sessionExpiresAt: "2026-07-26T01:00:00.000Z",
        deploymentSha: "qa-fixture",
        apiVersion: "qa-fixture",
        aiStatus: "available",
        profileSource: "local-simulation",
        cacheHit: false
      })
    });
  });
  await page.route("**/api/agent-chat/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      replyText: "",
      matchedSlotIds: [],
      matchedFacts: [],
      provider: "fixture",
      generationSource: "fixture",
      isFallback: false
    })
  }));
}

test("P001-P042 bilingual practice pages have no serious or critical WCAG violations", async ({ page, context }, testInfo) => {
  testInfo.setTimeout(900_000);
  const slug = viewportSlug(testInfo);
  const findings = [];
  const consoleErrors = [];
  const applicationHttpFailures = [];
  let pageScans = 0;
  let firstFailureScreenshot = "";
  let runError = null;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(page.url() || "http://127.0.0.1").origin
      && response.status() >= 400
      && !url.pathname.includes("/_next/static/webpack/")) {
      applicationHttpFailures.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });

  await mkdir(REPORT_ROOT, { recursive: true });
  await mkdir(TRACE_ROOT, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });

  try {
    await installSafeCaseApi(page);
    await page.goto("/");
    for (const language of ["zh", "en"]) {
      await page.evaluate((value) => localStorage.setItem("hematuria-language", value), language);
      for (const item of CASES) {
        const response = await page.goto(`/cases/${item.caseId}/`, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${item.caseId}/${language} page status`).toBe(200);
        await expect(page.getByText(item.caseId, { exact: true }).first()).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", language === "en" ? "en" : "zh-CN");
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const serious = results.violations.filter((violation) =>
          violation.impact === "critical" || violation.impact === "serious"
        );
        pageScans += 1;
        if (serious.length) {
          findings.push({
            caseId: item.caseId,
            language,
            violations: serious.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              nodeCount: violation.nodes.length
            }))
          });
          if (!firstFailureScreenshot) {
            await mkdir(SCREENSHOT_ROOT, { recursive: true });
            firstFailureScreenshot = path.join(
              SCREENSHOT_ROOT,
              `${ARTIFACT_PREFIX}case-accessibility-matrix-${slug}-${item.caseId}-${language}-failure.png`
            );
            await page.screenshot({ path: firstFailureScreenshot, animations: "disabled", fullPage: true });
          }
        }
      }
    }
  } catch (error) {
    runError = error;
  }

  const tracePath = findings.length || runError
    ? path.join(TRACE_ROOT, `${ARTIFACT_PREFIX}case-accessibility-matrix-${slug}-failure.zip`)
    : "";
  if (tracePath) await context.tracing.stop({ path: tracePath });
  else await context.tracing.stop();

  const report = {
    schemaVersion: "exploratory-case-accessibility-v1",
    productionBaseline: PRODUCTION_BASELINE,
    viewport: testInfo.project.use.viewport,
    result: runError || findings.length || consoleErrors.length || applicationHttpFailures.length
      ? "FAIL_EMULATION"
      : "PASS_EMULATION",
    expectedCases: 42,
    languages: ["zh", "en"],
    expectedPageScans: 84,
    pageScans,
    wcagTags: WCAG_TAGS,
    seriousOrCriticalViolationCount: findings.reduce(
      (total, item) => total + item.violations.length,
      0
    ),
    affectedCaseLanguagePairs: findings.map(({ caseId, language }) => `${caseId}:${language}`),
    findings,
    consoleErrorCount: consoleErrors.length,
    applicationHttpFailureCount: applicationHttpFailures.length,
    runError: runError ? String(runError.message || runError).slice(0, 500) : null,
    failureScreenshot: firstFailureScreenshot ? path.basename(firstFailureScreenshot) : null,
    failureTrace: tracePath ? path.basename(tracePath) : null,
    fixtureOnly: true,
    realDeviceClaimed: false,
    credentialsRetained: false,
    patientTextRetained: false,
    medicalTruthAdjudicated: false
  };
  await writeFile(
    path.join(REPORT_ROOT, `${ARTIFACT_PREFIX}case-accessibility-matrix-${slug}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  if (runError) throw runError;
  expect(pageScans).toBe(84);
  expect(findings, "serious/critical WCAG violations").toEqual([]);
  expect(consoleErrors, "unexpected console errors").toEqual([]);
  expect(applicationHttpFailures, "application HTTP failures").toEqual([]);
});
