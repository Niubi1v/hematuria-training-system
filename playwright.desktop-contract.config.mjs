import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HEMATURIA_DESKTOP_RENDERER_PORT || 43171);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("HEMATURIA_DESKTOP_RENDERER_PORT is invalid");
const baseURL = `http://127.0.0.1:${port}`;
const noProxy = [process.env.NO_PROXY, process.env.no_proxy, "127.0.0.1", "localhost"]
  .filter(Boolean)
  .join(",");
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;
const rendererRoot = path.resolve(process.env.HEMATURIA_DESKTOP_CONTRACT_RENDERER_ROOT || ".");
if (!fs.existsSync(path.join(rendererRoot, "out", "index.html"))) {
  throw new Error("desktop_renderer_output_missing: run the desktop Next build before this contract");
}
const node = process.execPath.includes(" ") ? `"${process.execPath}"` : process.execPath;
const serverScript = path.join(rendererRoot, "scripts", "serve-static.mjs");
const quotedServerScript = serverScript.includes(" ") ? `"${serverScript}"` : serverScript;

export default defineConfig({
  testDir: "./tests/desktop",
  testMatch: "renderer-contract.spec.mjs",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: process.env.CI ? undefined : "chrome",
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  webServer: {
    command: `${node} ${quotedServerScript}`,
    cwd: rendererRoot,
    url: `${baseURL}/cases/P001/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port)
    }
  }
});
