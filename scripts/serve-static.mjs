import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "out");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const basePath = `/${String(process.env.BASE_PATH || "").replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function insideRoot(filePath) {
  const relative = normalize(filePath).replace(root, "");
  return relative === "" || relative.startsWith(sep);
}

function resolveRequest(url = "/") {
  let cleanPath = decodeURIComponent(url.split("?")[0] || "/");
  if (basePath) {
    if (cleanPath === basePath) cleanPath = "/";
    else if (cleanPath.startsWith(`${basePath}/`)) cleanPath = cleanPath.slice(basePath.length);
    else return undefined;
  }
  const candidates = [];
  const direct = resolve(root, `.${cleanPath}`);

  candidates.push(direct);
  if (cleanPath.endsWith("/")) {
    candidates.push(join(direct, "index.html"));
  } else {
    candidates.push(`${direct}.html`);
    candidates.push(join(direct, "index.html"));
  }

  return candidates.find((candidate) => insideRoot(candidate) && existsSync(candidate) && statSync(candidate).isFile());
}

if (!existsSync(root)) {
  console.error("Cannot find ./out. Run npm run build first.");
  process.exit(1);
}

createServer((req, res) => {
  const resolvedPath = resolveRequest(req.url);
  const filePath = resolvedPath || join(root, "404.html");
  if (!existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(resolvedPath ? 200 : 404, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}).listen(port, host, () => {
  console.log(`Static preview: http://${host}:${port}${basePath || "/"}`);
});
