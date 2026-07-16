const routeIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  if (/[?#]/.test(trimmed)) throw new Error("Invalid public base path");
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function publicPageHref(pathname: string, basePath = process.env.NEXT_PUBLIC_BASE_PATH || "") {
  const normalizedPath = `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
  return `${normalizeBasePath(basePath)}${normalizedPath}`;
}

export function publicCaseHref(
  caseId: string,
  query: Record<string, string> = {},
  basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
) {
  const normalizedId = caseId.trim();
  if (!routeIdPattern.test(normalizedId)) throw new Error("Invalid public case route ID");
  const search = new URLSearchParams(query).toString();
  return `${publicPageHref(`cases/${normalizedId}`, basePath)}${search ? `?${search}` : ""}`;
}
