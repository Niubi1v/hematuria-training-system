import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  desktopJson,
  expectSubmittedStageThree,
  orderReportsAndEnterStageThree,
  installDesktopRuntime,
  runtimeProbe,
  runtimeEvidence,
  saveHistoryDraft,
  seedCompletedPercentageFixture,
  startDesktopSidecar,
  submitHistoryAndEnterStageTwo
} from "./desktop-harness.mjs";
import {
  databaseCheckpoint,
  directoryFingerprint,
  fileSha256,
  writeSurfaceCheckpoint
} from "./surface-checkpoint.mjs";

test("real renderer persists through the real sidecar and SQLite", async ({ browser, baseURL }) => {
  assert.ok(baseURL);
  const surface = process.env.HEMATURIA_DESKTOP_RENDERER_SURFACE || "static-renderer";
  assert.match(surface, /^(development-renderer|static-renderer|staged-desktop)$/u);
  const pageOrigin = new URL(baseURL).origin;
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-renderer-contract-state-"));
  const rendererRoot = path.resolve(process.env.HEMATURIA_DESKTOP_CONTRACT_RENDERER_ROOT || ".");
  const r4Directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "HematuriaTraining", "MentorLocalAI-FinalCandidate");
  const r4Before = await directoryFingerprint(r4Directory);
  const p001Marker = `P001 renderer contract ${Date.now()}`;
  const p003Marker = `P003 random contract ${Date.now()}`;
  let sidecar;
  let context;
  let checkpoint;

  try {
    sidecar = await startDesktopSidecar({ allowedOrigin: pageOrigin, dataDirectory, installationMode: "development" });
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
    const stageResponsePromise = page.waitForResponse((response) => {
      try {
        const body = response.request().postDataJSON();
        return body?.action === "stage-feedback" && body?.stageKey === "history";
      } catch {
        return false;
      }
    });
    await submitHistoryAndEnterStageTwo(page, { caseId: "P001", language: "zh", marker: p001Marker });
    await orderReportsAndEnterStageThree(page);
    const stageResponse = await stageResponsePromise;
    const stageReplay = {
      body: stageResponse.request().postDataJSON(),
      idempotencyKey: stageResponse.request().headers()["x-idempotency-key"],
      stateToken: stageResponse.request().headers()["x-training-state"],
      responseStateToken: stageResponse.headers()["x-training-state"]
    };
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

    sidecar = await startDesktopSidecar({ allowedOrigin: pageOrigin, dataDirectory, installationMode: "development" });
    context = await browser.newContext({ baseURL });
    await installDesktopRuntime(context, sidecar.runtime, "zh");
    page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    await expectSubmittedStageThree(page, {
      baseURL,
      marker: p001Marker
    });
    await page.waitForLoadState("networkidle");
    const beforeReplay = (await desktopJson(page, "/api/desktop/state/bootstrap")).payload.serverStateRevision;
    const replayed = await desktopJson(page, "/api/training-action", stageReplay);
    assert.equal(replayed.status, 200);
    assert.equal(replayed.stateToken, stageReplay.responseStateToken);
    assert.equal((await desktopJson(page, "/api/desktop/state/bootstrap")).payload.serverStateRevision, beforeReplay);

    const observedSaves = [];
    const observeSave = (response) => {
      if (new URL(response.url()).pathname !== "/api/desktop/attempt/state") return;
      try {
        const body = response.request().postDataJSON();
        observedSaves.push({ action: body?.action, caseId: body?.caseId, language: body?.language, mode: body?.mode, status: response.status() });
      } catch {}
    };
    page.on("response", observeSave);
    let random;
    try {
      random = await saveHistoryDraft(page, {
        baseURL, caseId: "P003", language: "en", marker: p003Marker, requestedMode: "random"
      });
    } catch (error) {
      const view = await page.evaluate(() => ({ language: localStorage.getItem("hematuria-language"), url: location.href }));
      throw new Error(`${error.message}; view=${JSON.stringify(view)}; saves=${JSON.stringify(observedSaves)}`);
    } finally {
      page.off("response", observeSave);
    }
    expect(random).toEqual({ caseId: "P003", language: "en", durableMode: "free", status: 200 });
    await expectSubmittedStageThree(page, {
      baseURL,
      marker: p001Marker
    });
    await expect(page.getByTestId("diagnosis-builder")).toBeVisible();
    const restored = (await desktopJson(page, "/api/desktop/attempt/state", {
      body: { action: "load", caseId: "P001", mode: "free", language: "zh" }
    })).payload.snapshot;
    await seedCompletedPercentageFixture(page);
    await page.goto(new URL("/cases/P004/", page.url()).toString());
    await expect(page.getByTestId("final-percentage-score")).toHaveText(/^75\s*\/\s*100$/u);
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /answerSource|fallbackReason|requestedSlot|factState|rule_fallback|local_ai|\b360\b/iu
    );
    const exported = await desktopJson(page, "/api/desktop/evidence/export", { body: {} });
    assert.equal(exported.status, 200);
    const serialized = await fs.readFile(exported.payload.path, "utf8");
    assert.equal(Buffer.byteLength(serialized), exported.payload.size);
    assert.doesNotMatch(serialized, /stateToken|authToken|answerSource|prompt|reasoning|\b360\b/iu);
    const diagnostics = (await desktopJson(page, "/api/desktop/diagnostics")).payload;
    assert.equal(diagnostics.productIdentity, "hematuria-training-r5");
    assert.equal(diagnostics.productHead, sidecar.productHead);
    const evidence = (await desktopJson(page, "/api/desktop/evidence")).payload;
    checkpoint = {
      surface,
      productHead: sidecar.productHead,
      artifactSha: await fileSha256(path.join(rendererRoot, "out", "index.html")),
      installationMode: diagnostics.installationMode,
      case: "P001",
      language: "zh",
      trainingMode: "random",
      durableMode: random.durableMode,
      activeStage: restored.activeStageNo,
      submittedStageCount: Object.keys(restored.submitted || {}).length,
      ...databaseCheckpoint(path.join(dataDirectory, "hematuria.sqlite3")),
      idempotentReplay: true,
      cloudRequestCount: evidence.cloudRequestCount,
      localAcceptedCount: evidence.localAiAcceptedCount,
      fallbackCount: evidence.ruleFallbackCount,
      percentageOnlyBoundary: true,
      diagnosticExport: true,
      processCleanup: false,
      r4DataUnchanged: false
    };
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
    if (checkpoint) {
      checkpoint.processCleanup = true;
      checkpoint.r4DataUnchanged = r4Before === await directoryFingerprint(r4Directory);
    }
    try {
      await fs.rm(dataDirectory, { recursive: true, force: true });
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError) throw cleanupError;
  }
  await writeSurfaceCheckpoint(checkpoint);
});

test("fresh SQLite authority clears stale training cache without clearing preferences", async ({ browser, baseURL }) => {
  assert.ok(baseURL);
  const pageOrigin = new URL(baseURL).origin;
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-stale-webview-state-"));
  let sidecar;
  let context;
  try {
    sidecar = await startDesktopSidecar({ allowedOrigin: pageOrigin, dataDirectory });
    context = await browser.newContext({ baseURL });
    await installDesktopRuntime(context, sidecar.runtime, "en");
    await context.addInitScript(() => {
      localStorage.setItem("hematuria-language", "en");
      localStorage.setItem("hematuria-ai-mode", "rule");
      localStorage.setItem("hematuria-attempt-pointer-v3:P001:free:en", JSON.stringify({
        attemptId: "stale-attempt", productHead: "0000000000000000000000000000000000000000", activeStageNo: 7
      }));
      localStorage.setItem("hematuria-attempt-v3:P001:free:en:stale-attempt", JSON.stringify({ activeStageNo: 7 }));
      sessionStorage.setItem("hematuria-training-state-v4:stale-attempt", "stale-state-token");
    });
    const page = await context.newPage();
    const bootstrapped = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/desktop/state/bootstrap");
    await page.goto(new URL("/cases/P001/", baseURL).toString());
    await bootstrapped;
    const storage = await page.evaluate(() => ({
      aiMode: localStorage.getItem("hematuria-ai-mode"),
      language: localStorage.getItem("hematuria-language"),
      trainingKeys: [...Array(localStorage.length).keys()].map((index) => localStorage.key(index))
        .concat([...Array(sessionStorage.length).keys()].map((index) => sessionStorage.key(index)))
        .filter((key) => key?.startsWith("hematuria-attempt-") || key?.startsWith("hematuria-training-state-"))
    }));
    assert.deepEqual(storage, { aiMode: "rule", language: "en", trainingKeys: [] });
    assert.equal((await desktopJson(page, "/api/desktop/state/bootstrap")).payload.productHead, sidecar.productHead);
    await page.reload();
    assert.deepEqual(await page.evaluate(() => ({
      aiMode: localStorage.getItem("hematuria-ai-mode"),
      language: localStorage.getItem("hematuria-language")
    })), { aiMode: "rule", language: "en" });
  } finally {
    await context?.close();
    await sidecar?.stop({ removeData: false });
    await fs.rm(dataDirectory, { recursive: true, force: true });
  }
});
