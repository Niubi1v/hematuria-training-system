import fs from "node:fs/promises";
import path from "node:path";
import {
  cacheRoot,
  downloadVerified,
  readRuntimeManifest,
  repoRoot,
  requireWindows,
  run,
  scriptsDirectory,
  verifyFile
} from "./desktop-common.mjs";

requireWindows();
const manifest = await readRuntimeManifest();
const nsisSpec = manifest.buildTools.nsis;
const pluginSpec = manifest.buildTools.nsisTauriUtils;
const localAppData = path.resolve(String(process.env.LOCALAPPDATA || ""));
if (!process.env.LOCALAPPDATA || !path.isAbsolute(localAppData)) {
  throw new Error("desktop_local_app_data_unavailable");
}

const tauriTools = path.join(localAppData, "tauri");
const nsisTarget = path.join(tauriTools, "NSIS");
const pluginRelative = path.join("Plugins", "x86-unicode", "additional", "nsis_tauri_utils.dll");
const requiredRelativePaths = [
  "makensis.exe",
  path.join("Bin", "makensis.exe"),
  path.join("Stubs", "lzma-x86-unicode"),
  path.join("Stubs", "lzma_solid-x86-unicode"),
  path.join("Include", "MUI2.nsh"),
  path.join("Include", "FileFunc.nsh"),
  path.join("Include", "x64.nsh"),
  path.join("Include", "nsDialogs.nsh"),
  path.join("Include", "WinMessages.nsh"),
  path.join("Include", "Win", "COM.nsh"),
  path.join("Include", "Win", "Propkey.nsh"),
  path.join("Include", "Win", "RestartManager.nsh")
];

async function ready() {
  try {
    await Promise.all(requiredRelativePaths.map((relative) => fs.access(path.join(nsisTarget, relative))));
    return verifyFile(path.join(nsisTarget, pluginRelative), pluginSpec.size, pluginSpec.sha256);
  } catch {
    return false;
  }
}

if (!(await ready())) {
  const downloads = path.join(cacheRoot, "downloads");
  const archive = await downloadVerified(nsisSpec, path.join(downloads, nsisSpec.fileName));
  const plugin = await downloadVerified(pluginSpec, path.join(downloads, pluginSpec.fileName));
  const extractRoot = path.join(cacheRoot, "extract", `nsis-${nsisSpec.version}`);
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(scriptsDirectory, "desktop-expand-runtime.ps1"),
    "-Archive", archive,
    "-Destination", extractRoot
  ], { cwd: repoRoot });
  const extracted = path.join(extractRoot, `nsis-${nsisSpec.version}`);
  const source = await fs.stat(path.join(extracted, "makensis.exe")).then(() => extracted);
  const temporary = path.join(tauriTools, `NSIS.partial-${process.pid}`);
  await fs.mkdir(tauriTools, { recursive: true });
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.cp(source, temporary, { recursive: true, force: true });
  await fs.mkdir(path.dirname(path.join(temporary, pluginRelative)), { recursive: true });
  await fs.copyFile(plugin, path.join(temporary, pluginRelative));
  await fs.rm(nsisTarget, { recursive: true, force: true });
  await fs.rename(temporary, nsisTarget);
}

if (!(await ready())) throw new Error("desktop_nsis_cache_verification_failed");
console.log(`Tauri NSIS ${nsisSpec.version} build tool cache verified.`);
