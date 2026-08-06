import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  expectSubmittedStageTwo,
  installDesktopRuntime,
  runtimeProbe,
  runtimeEvidence,
  saveHistoryDraft,
  startDesktopSidecar,
  submitHistoryAndEnterStageTwo
} from "./desktop-harness.mjs";

test("real renderer persists through the real sidecar and SQLite", async ({ browser, baseURL }) => {
  assert.ok(baseURL);
  const pageOrigin = new URL(baseURL).origin;
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-renderer-contract-state-"));
  const p001Marker = `P001 renderer contract ${Date.now()}`;
  const p003Marker = `P003 random contract ${Date.now()}`;
  let sidecar;
  let context;

  try {
    sidecar = await startDesktopSidecar({ allowedOrigin: pageOrigin, dataDirectory });
    context = await browser.newContext({ baseURL });
    await installDesktopRuntime(context, sidecar.runtime, "zh");
    let page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    const bootstrap = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/desktop/state/bootstrap");
    const first = await saveHistoryDraft(page, {
      baseURL,
      caseId: "P001",
      language: "zh",
      marker: p001Marker
    });
    expect(first).toEqual({ caseId: "P001", language: "zh", durableMode: "free", status: 200 });
    await submitHistoryAndEnterStageTwo(page, { caseId: "P001", language: "zh", marker: p001Marker });
    expect((await bootstrap).status()).toBe(200);
    const probe = await runtimeProbe(page);
    expect(probe).toEqual({
      runtimeTarget: "desktop",
      apiBaseUrl: sidecar.origin,
      tokenValid: true,
      productHead: ""
    });
    expect(await runtimeEvidence(page)).toEqual({
      cloudRequestCount: 0,
      productHead: sidecar.productHead,
      runtimeTarget: "desktop"
    });
    await context.close();
    context = undefined;
    await sidecar.stop({ removeData: false });
    sidecar = undefined;

    sidecar = await startDesktopSidecar({ allowedOrigin: pageOrigin, dataDirectory });
    context = await browser.newContext({ baseURL });
    await installDesktopRuntime(context, sidecar.runtime, "zh");
    page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    await expectSubmittedStageTwo(page, {
      baseURL,
      caseId: "P001",
      language: "zh",
      marker: p001Marker
    });

    const random = await saveHistoryDraft(page, {
      baseURL,
      caseId: "P003",
      language: "en",
      marker: p003Marker,
      requestedMode: "random"
    });
    expect(random).toEqual({ caseId: "P003", language: "en", durableMode: "free", status: 200 });
    await expectSubmittedStageTwo(page, {
      baseURL,
      caseId: "P001",
      language: "zh",
      marker: p001Marker
    });
    await expect(page.getByTestId("investigation-selection-summary")).toBeVisible();
  } finally {
    let cleanupError;
    try {
      await context?.close();
    } catch (error) {
      cleanupError = error;
    }
    try {
      await sidecar?.stop({ removeData: false });
    } catch (error) {
      cleanupError ||= error;
    }
    try {
      await fs.rm(dataDirectory, { recursive: true, force: true });
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError) throw cleanupError;
  }
});
