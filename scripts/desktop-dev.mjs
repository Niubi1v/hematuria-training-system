import path from "node:path";
import {
  assertPackageTreeClean,
  repoRoot,
  requireWindows,
  run,
  runPnpm,
  scriptsDirectory
} from "./desktop-common.mjs";

requireWindows();
const desktopBuildEnvironment = {
  ...process.env,
  NEXT_PUBLIC_RUNTIME_TARGET: "desktop",
  NEXT_PUBLIC_API_BASE_URL: ""
};

await runPnpm(["run", "desktop:prepare"]);
await runPnpm(["run", "build"], { env: desktopBuildEnvironment });
await assertPackageTreeClean(path.join(repoRoot, "out"));
await run(process.execPath, [path.join(scriptsDirectory, "desktop-stage-resources.mjs")]);
await runPnpm(["exec", "tauri", "dev"], { env: desktopBuildEnvironment });

