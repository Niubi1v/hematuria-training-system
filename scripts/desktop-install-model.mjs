import path from "node:path";
import { createRequire } from "node:module";
import {
  downloadVerified,
  readRuntimeManifest,
  requireWindows
} from "./desktop-common.mjs";

const require = createRequire(import.meta.url);
const { r5DataDirectory } = require("../server/desktopCompatibility.js");

requireWindows();
const manifest = await readRuntimeManifest();
const argumentIndex = process.argv.indexOf("--data-dir");
const modeArgumentIndex = process.argv.indexOf("--model-mode");
const modelMode = String(
  modeArgumentIndex >= 0
    ? process.argv[modeArgumentIndex + 1]
    : process.env.HEMATURIA_DESKTOP_MODEL_MODE || manifest.defaultModelMode
);
const model = manifest.models[modelMode];
if (!model) throw new Error("desktop_model_mode_invalid");
const configuredDataDirectory = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : "";
const dataDirectory = configuredDataDirectory
  || process.env.HEMATURIA_DESKTOP_DATA_DIR
  || r5DataDirectory(process.env.LOCALAPPDATA);
if (!path.isAbsolute(dataDirectory)) throw new Error("desktop_model_data_directory_must_be_absolute");

const destination = path.join(dataDirectory, "models", model.fileName);
await downloadVerified(model, destination);
console.log(`Verified ${modelMode} local model installed: ${destination}`);
