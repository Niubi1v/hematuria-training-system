import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsDirectory, "..");
export const manifestPath = path.join(repoRoot, "desktop", "runtime-manifest.json");
export const runtimeRoot = path.join(repoRoot, "desktop-runtime");
export const cacheRoot = path.join(repoRoot, ".desktop-cache");
export const tauriResourcesRoot = path.join(repoRoot, "src-tauri", "resources");

export function requireWindows() {
  if (process.platform !== "win32") {
    throw new Error("The desktop POC currently supports Windows x64 only.");
  }
}

export async function readRuntimeManifest() {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const modelModes = manifest?.models;
  if (
    manifest?.schemaVersion !== 1
    || manifest?.platform !== "windows-x86_64"
    || manifest?.node?.version !== "22.14.0"
    || manifest?.llamaCpp?.version !== "b10176"
    || manifest?.defaultModelMode !== "lightweight"
    || !modelModes
    || Object.keys(modelModes).sort().join(",") !== "lightweight,standard"
    || manifest?.model?.bundledInInstaller !== false
    || JSON.stringify(manifest.model) !== JSON.stringify(modelModes.lightweight)
  ) {
    throw new Error("desktop_runtime_manifest_invalid");
  }
  for (const [mode, item] of Object.entries(modelModes)) {
    if (
      item?.bundledInInstaller !== false
      || item?.thinkingMode !== "disabled"
      || !/^[A-Za-z0-9._-]{1,80}$/.test(String(item?.alias || ""))
      || !String(item?.fileName || "").endsWith(".gguf")
    ) {
      throw new Error(`desktop_model_manifest_invalid:${mode}`);
    }
  }
  for (const item of [manifest.node, manifest.llamaCpp, ...Object.values(modelModes)]) {
    if (!/^[a-f0-9]{64}$/.test(String(item.sha256 || "")) || !Number.isSafeInteger(item.size || item.archiveSize)) {
      throw new Error("desktop_runtime_manifest_digest_invalid");
    }
  }
  const llamaFiles = manifest?.llamaCpp?.files;
  if (!Array.isArray(llamaFiles) || llamaFiles.length === 0) {
    throw new Error("desktop_llama_file_manifest_missing");
  }
  const llamaPaths = new Set();
  for (const item of llamaFiles) {
    const normalized = String(item?.path || "").replaceAll("\\", "/");
    if (
      !normalized
      || normalized.startsWith("/")
      || normalized.includes("../")
      || path.posix.normalize(normalized) !== normalized
      || llamaPaths.has(normalized.toLowerCase())
      || !Number.isSafeInteger(item?.size)
      || item.size <= 0
      || !/^[a-f0-9]{64}$/.test(String(item?.sha256 || ""))
    ) {
      throw new Error("desktop_llama_file_manifest_invalid");
    }
    llamaPaths.add(normalized.toLowerCase());
  }
  if (!llamaPaths.has(String(manifest.llamaCpp.entryPoint || "").toLowerCase())) {
    throw new Error("desktop_llama_entrypoint_not_pinned");
  }
  for (const item of Object.values(manifest.buildTools || {})) {
    if (
      !/^[a-f0-9]{40}$/.test(String(item.sha1 || ""))
      || !/^[a-f0-9]{64}$/.test(String(item.sha256 || ""))
      || !Number.isSafeInteger(item.size)
    ) {
      throw new Error("desktop_build_tool_manifest_digest_invalid");
    }
  }
  return manifest;
}

export async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

export async function verifyFile(filePath, expectedSize, expectedSha256) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size !== expectedSize) return false;
    return (await sha256(filePath)) === expectedSha256;
  } catch {
    return false;
  }
}

export async function verifyPinnedFiles(root, specifications) {
  for (const specification of specifications) {
    const relative = String(specification.path).split("/");
    if (!(await verifyFile(
      path.join(root, ...relative),
      specification.size,
      specification.sha256
    ))) {
      return false;
    }
  }
  return true;
}

export async function downloadVerified(specification, destination) {
  const expectedSize = specification.size ?? specification.archiveSize;
  if (await verifyFile(destination, expectedSize, specification.sha256)) return destination;

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.partial-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const candidateUrls = [specification.url, ...(specification.fallbackUrls || [])];
  let lastError = null;
  try {
    for (const candidateUrl of candidateUrls) {
      await fsp.rm(temporary, { force: true });
      try {
        try {
          const response = await fetch(candidateUrl, {
            redirect: "follow",
            signal: AbortSignal.timeout(30 * 60 * 1000)
          });
          if (!response.ok || !response.body) {
            throw new Error(`desktop_runtime_download_failed:${response.status}`);
          }
          await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { flags: "wx" }));
        } catch (error) {
          if (process.platform !== "win32") throw error;
          await fsp.rm(temporary, { force: true });
          await run("curl.exe", [
            "--silent",
            "--show-error",
            "--fail",
            "--location",
            "--retry", "5",
            "--retry-all-errors",
            "--connect-timeout", "60",
            "--max-time", "3600",
            "--output", temporary,
            candidateUrl
          ]);
        }
        if (!(await verifyFile(temporary, expectedSize, specification.sha256))) {
          throw new Error("desktop_runtime_checksum_mismatch");
        }
        await fsp.rm(destination, { force: true });
        await fsp.rename(temporary, destination);
        return destination;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("desktop_runtime_download_failed");
  } finally {
    await fsp.rm(temporary, { force: true });
  }
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
      windowsHide: true,
      shell: false
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (${signal || code})`));
    });
  });
}

export function runPnpm(args, options = {}) {
  const npmExecPath = String(process.env.npm_execpath || "");
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return run(process.execPath, [npmExecPath, ...args], options);
  }
  return run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, options);
}

export async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

export function forbiddenPackagedPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");
  if (segments.some((segment) => [
    "node_modules", "tests", "test", "screenshots", "traces", "logs", "fonts"
  ].includes(segment))) return true;
  return /\.(?:map|pdb|lib|exp|dmp|gguf|ggml|sqlite|sqlite3|db|db-wal|db-shm|log|woff2?|ttf|otf)$/i.test(normalized);
}

export async function assertPackageTreeClean(root) {
  for (const file of await walkFiles(root)) {
    const relative = path.relative(root, file);
    if (forbiddenPackagedPath(relative)) {
      throw new Error(`desktop_package_contains_forbidden_file:${relative}`);
    }
  }
}

export async function copyFilesByExtension(source, destination, extensions) {
  const allowed = new Set(extensions.map((value) => value.toLowerCase()));
  async function copyDirectory(from, to) {
    await fsp.mkdir(to, { recursive: true });
    for (const entry of await fsp.readdir(from, { withFileTypes: true })) {
      const sourcePath = path.join(from, entry.name);
      const destinationPath = path.join(to, entry.name);
      if (entry.isDirectory()) await copyDirectory(sourcePath, destinationPath);
      else if (entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase())) {
        await fsp.copyFile(sourcePath, destinationPath);
      }
    }
  }
  await copyDirectory(source, destination);
}
