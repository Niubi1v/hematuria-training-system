import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertPackageTreeClean,
  repoRoot,
  requireWindows,
  run,
  runPnpm,
  scriptsDirectory
} from "./desktop-common.mjs";

requireWindows();
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const productHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
const desktopBuildEnvironment = {
  ...process.env,
  NEXT_PUBLIC_RUNTIME_TARGET: "desktop",
  NEXT_PUBLIC_API_BASE_URL: "",
  NEXT_PUBLIC_GIT_SHA: productHead
};

await runPnpm(["run", "desktop:prepare"]);
await run(process.execPath, [path.join(scriptsDirectory, "desktop-prepare-build-tools.mjs")]);
await runPnpm(["run", "build"], { env: desktopBuildEnvironment });
await assertPackageTreeClean(path.join(repoRoot, "out"));
await run(process.execPath, [path.join(scriptsDirectory, "desktop-stage-resources.mjs")]);
await runPnpm(["exec", "tauri", "build", "--bundles", "nsis"], { env: desktopBuildEnvironment });
await run("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", path.join(scriptsDirectory, "desktop-package-portable.ps1"),
  "-Version", String(packageJson.version)
]);
await run(process.execPath, [
  path.join(scriptsDirectory, "desktop-write-artifact-manifest.mjs")
]);
await run(process.execPath, [
  path.join(scriptsDirectory, "scan-desktop-package.mjs"),
  "--require-artifacts"
]);

console.log("Desktop build complete: NSIS installer plus portable ZIP.");
