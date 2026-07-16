import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const rawBaseURL = String(process.env.QA_DEPLOYED_BASE_URL || "").trim();
if (!rawBaseURL) throw new Error("QA_DEPLOYED_BASE_URL is required.");
const baseURL = new URL(rawBaseURL);
if (baseURL.protocol !== "https:" || baseURL.username || baseURL.password || baseURL.search || baseURL.hash) {
  throw new Error("QA_DEPLOYED_BASE_URL must be a credential-free HTTPS base URL.");
}
if (!baseURL.pathname.endsWith("/")) baseURL.pathname += "/";

const caseIds = Array.from({ length: 42 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`);
const reportRoot = path.resolve("artifacts/exploratory-qa/reports");
const screenshotRoot = path.resolve("artifacts/exploratory-qa/screenshots");

test("P001-P042 deployed catalog clicks, direct URLs, refresh, and bilingual routes", async ({ page }, testInfo) => {
  testInfo.setTimeout(600_000);
  const origin = baseURL.origin;
  const counts = { catalogZh: 0, catalogEn: 0, clicks200: 0, direct200: 0, refresh200: 0 };
  await page.route("**/api/**", (route) => route.abort("blockedbyclient"));
  page.on("dialog", (dialog) => dialog.accept());

  const assertShell = async (caseId, language) => {
    expect(new URL(page.url()).origin).toBe(origin);
    await expect(page.getByText(caseId, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", {
      name: language === "en" ? "Hematuria 7-Agent Clinical Reasoning Workspace" : "血尿7阶段临床思维训练工作台"
    })).toBeVisible();
  };

  const preflightResponse = await page.goto(new URL("cases/", baseURL).toString(), { waitUntil: "domcontentloaded" });
  expect(preflightResponse?.status()).toBe(200);
  const hrefs = await page.locator('a[href*="/cases/"]').evaluateAll((links) => links.map((link) => link.href));
  const caseHrefs = hrefs.filter((href) => /\/cases\/[^/]+\/(?:index\.html)?$/.test(new URL(href).pathname));
  const displayRouteCount = caseHrefs.filter((href) => /\/cases\/P\d{3}\/(?:index\.html)?$/.test(new URL(href).pathname)).length;
  await page.getByRole("button", { name: "English", exact: true }).click();
  const englishHrefCount = (await page.locator('a[href*="/cases/"]').evaluateAll((links) => links.map((link) => link.href)))
    .filter((href) => /\/cases\/[^/]+\/(?:index\.html)?$/.test(new URL(href).pathname)).length;
  const preflight = {
    environment: baseURL.hostname.endsWith("github.io") ? "github-pages" : "external-deployment",
    baseURL: baseURL.toString(),
    viewport: testInfo.project.use.viewport,
    catalogHrefCount: caseHrefs.length,
    displayRouteCount,
    nonDisplayRouteCount: caseHrefs.length - displayRouteCount,
    englishHrefCount
  };
  await mkdir(reportRoot, { recursive: true });
  await writeFile(path.join(reportRoot, `deployed-route-preflight-${testInfo.project.name}.json`), `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  if (displayRouteCount !== 42 || caseHrefs.length !== 42 || englishHrefCount !== 42) {
    await mkdir(screenshotRoot, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotRoot, `github-pages-display-route-mismatch-${testInfo.project.name}-failure.png`),
      fullPage: true,
      animations: "disabled"
    });
  }
  expect(preflight).toMatchObject({ catalogHrefCount: 42, displayRouteCount: 42, nonDisplayRouteCount: 0, englishHrefCount: 42 });

  for (const caseId of caseIds) {
    const catalogResponse = await page.goto(new URL("cases/", baseURL).toString(), { waitUntil: "domcontentloaded" });
    expect(catalogResponse?.status(), `${caseId} catalog`).toBe(200);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    const catalogLink = page.locator(`a[href*="/cases/${caseId}/"]`);
    await expect(catalogLink).toHaveCount(1);
    counts.catalogZh += 1;
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(catalogLink).toHaveCount(1);
    counts.catalogEn += 1;
    await page.getByRole("button", { name: "中文", exact: true }).click();

    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await catalogLink.click();
    const clickResponse = await navigation;
    if (clickResponse) expect(clickResponse.status(), `${caseId} catalog click`).toBe(200);
    await assertShell(caseId, "zh");
    counts.clicks200 += 1;

    const directResponse = await page.goto(new URL(`cases/${caseId}/`, baseURL).toString(), { waitUntil: "domcontentloaded" });
    expect(directResponse?.status(), `${caseId} direct`).toBe(200);
    await assertShell(caseId, "zh");
    counts.direct200 += 1;

    await page.evaluate(() => localStorage.setItem("hematuria-language", "en"));
    const englishResponse = await page.reload({ waitUntil: "domcontentloaded" });
    expect(englishResponse?.status(), `${caseId} English refresh`).toBe(200);
    await assertShell(caseId, "en");
    await page.evaluate(() => localStorage.setItem("hematuria-language", "zh"));
    const refreshResponse = await page.reload({ waitUntil: "domcontentloaded" });
    expect(refreshResponse?.status(), `${caseId} Chinese refresh`).toBe(200);
    await assertShell(caseId, "zh");
    counts.refresh200 += 1;
  }

  const invalid = await page.goto(new URL("cases/P999/", baseURL).toString(), { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).origin).toBe(origin);
  expect(invalid?.status()).toBe(404);
  expect(counts).toEqual({ catalogZh: 42, catalogEn: 42, clicks200: 42, direct200: 42, refresh200: 42 });

  await mkdir(reportRoot, { recursive: true });
  await writeFile(path.join(reportRoot, `deployed-route-matrix-${testInfo.project.name}.json`), `${JSON.stringify({
    environment: baseURL.hostname.endsWith("github.io") ? "github-pages" : "external-deployment",
    baseURL: baseURL.toString(),
    viewport: testInfo.project.use.viewport,
    counts,
    invalid404: invalid?.status() === 404,
    source: "deployed-browser-shell-no-api-no-real-ai"
  }, null, 2)}\n`, "utf8");
});
