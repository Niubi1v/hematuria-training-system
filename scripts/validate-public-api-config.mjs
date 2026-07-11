const raw = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
if (!raw) throw new Error("NEXT_PUBLIC_API_BASE_URL is required.");
const url = new URL(raw);
if (url.protocol !== "https:") throw new Error("NEXT_PUBLIC_API_BASE_URL must use HTTPS.");
if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("Production API base cannot use localhost.");
if (url.pathname !== "/") throw new Error("NEXT_PUBLIC_API_BASE_URL must be an origin without an API path.");
console.log(`Public API origin validated: ${url.origin}`);
