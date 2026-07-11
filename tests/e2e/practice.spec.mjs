import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
