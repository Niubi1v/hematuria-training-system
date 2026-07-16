import fs from "node:fs";
import path from "node:path";
import cases from "../data/cases.json";
import results from "../data/order_results_structured.json";

const out = path.resolve(process.cwd(), "out");
if (!fs.existsSync(out)) throw new Error("out/ is missing; run the production build first.");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

const studentAssets = files(path.join(out, "_next", "static")).filter((file) => /\.js$/.test(file));
const bundle = studentAssets.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const hiddenSamples = [
  ...(cases as Array<Record<string, unknown>>).flatMap((item) => [String(item.diagnosis || ""), String(item.standardSummary || "")]),
  ...(results as Array<Record<string, unknown>>).flatMap((item) => [String(item.value || ""), String(item.impression || "")])
].map((item) => item.trim()).filter((item) => item.length >= 24);
const leaks = [...new Set(hiddenSamples.filter((sample) => bundle.includes(sample)))];
if (leaks.length) throw new Error(`Student bundle contains ${leaks.length} hidden answer sample(s): ${leaks.slice(0, 3).join(" | ")}`);
if (/sk-[A-Za-z0-9_-]{16,}|AZURE_SPEECH_KEY\s*[:=]\s*["'][^"']+/i.test(bundle)) throw new Error("Potential API secret found in static bundle.");
if (/(?:127\.0\.0\.1|localhost):3001/i.test(bundle)) throw new Error("Static bundle contains the retired cross-origin E2E API fallback.");

const expectedRoute = path.join(out, "cases", "P008", "index.html");
if (!fs.existsSync(expectedRoute)) throw new Error("GitHub Pages refresh route is missing: cases/P008/index.html");
const routeHtml = fs.readFileSync(expectedRoute, "utf8");
if (!routeHtml.includes("/hematuria-training-system/_next/") && process.env.NEXT_PUBLIC_BASE_PATH) throw new Error("Static route does not contain the configured GitHub Pages base path.");
console.log(`Static bundle scan passed across ${studentAssets.length} JavaScript assets.`);
