import path from "node:path";
import {
  downloadVerified,
  readRuntimeManifest,
  requireWindows
} from "./desktop-common.mjs";

requireWindows();
const manifest = await readRuntimeManifest();
const argumentIndex = process.argv.indexOf("--data-dir");
const configuredDataDirectory = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : "";
const dataDirectory = configuredDataDirectory
  || process.env.HEMATURIA_DESKTOP_DATA_DIR
  || path.join(process.env.LOCALAPPDATA || "", "cn.hematuria.training.desktop");
if (!path.isAbsolute(dataDirectory)) throw new Error("desktop_model_data_directory_must_be_absolute");

const destination = path.join(dataDirectory, "models", manifest.model.fileName);
await downloadVerified(manifest.model, destination);
console.log(`Verified local model installed: ${destination}`);
