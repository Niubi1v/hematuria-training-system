import fs from "node:fs/promises";
import path from "node:path";
import {
  cacheRoot,
  downloadVerified,
  readRuntimeManifest,
  repoRoot,
  requireWindows,
  run,
  runtimeRoot,
  scriptsDirectory,
  verifyPinnedFiles
} from "./desktop-common.mjs";

requireWindows();

const manifest = await readRuntimeManifest();
const nodeDestination = path.join(runtimeRoot, "node", manifest.node.fileName);
const llamaDestination = path.join(runtimeRoot, "llama");
const llamaStamp = path.join(llamaDestination, ".runtime.json");
const downloads = path.join(cacheRoot, "downloads");
const llamaArchive = path.join(downloads, manifest.llamaCpp.archiveName);

await downloadVerified(manifest.node, nodeDestination);
await downloadVerified(manifest.llamaCpp, llamaArchive);

let llamaReady = false;
try {
  const stamp = JSON.parse(await fs.readFile(llamaStamp, "utf8"));
  llamaReady = stamp.sha256 === manifest.llamaCpp.sha256
    && stamp.version === manifest.llamaCpp.version
    && await verifyPinnedFiles(llamaDestination, manifest.llamaCpp.files);
} catch {
  llamaReady = false;
}

if (!llamaReady) {
  const extractRoot = path.join(cacheRoot, "extract", `llama-${manifest.llamaCpp.version}`);
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(scriptsDirectory, "desktop-expand-runtime.ps1"),
    "-Archive", llamaArchive,
    "-Destination", extractRoot
  ], { cwd: repoRoot });

  async function findEntry(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = await findEntry(absolute);
        if (nested) return nested;
      } else if (entry.isFile() && entry.name.toLowerCase() === manifest.llamaCpp.entryPoint.toLowerCase()) {
        return absolute;
      }
    }
    return null;
  }

  const entryPoint = await findEntry(extractRoot);
  if (!entryPoint) throw new Error("desktop_llama_archive_missing_entrypoint");
  const temporaryRuntime = `${llamaDestination}.partial-${process.pid}`;
  await fs.rm(temporaryRuntime, { recursive: true, force: true });
  await fs.cp(path.dirname(entryPoint), temporaryRuntime, { recursive: true, force: true });
  if (!(await verifyPinnedFiles(temporaryRuntime, manifest.llamaCpp.files))) {
    await fs.rm(temporaryRuntime, { recursive: true, force: true });
    throw new Error("desktop_llama_extracted_files_failed_integrity");
  }
  await fs.writeFile(path.join(temporaryRuntime, ".runtime.json"), JSON.stringify({
    version: manifest.llamaCpp.version,
    sha256: manifest.llamaCpp.sha256
  }, null, 2));
  await fs.rm(llamaDestination, { recursive: true, force: true });
  await fs.rename(temporaryRuntime, llamaDestination);
}

console.log(`Desktop runtime ready: Node ${manifest.node.version}; llama.cpp ${manifest.llamaCpp.version}`);
