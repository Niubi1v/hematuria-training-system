#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-local}"
ENV_FILE="${2:-.env.mainland}"
BASE_URL="${3:-http://127.0.0.1:8080}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$MODE" != "local" && "$MODE" != "managed" ]]; then
  echo "Usage: $0 [local|managed] [.env.mainland] [base-url]" >&2
  exit 2
fi
if [[ ! -f "$REPO_ROOT/$ENV_FILE" ]]; then
  echo "Missing environment file." >&2
  exit 2
fi
if grep -Eq '<[^>]+>' "$REPO_ROOT/$ENV_FILE"; then
  echo "Refusing deployment while placeholder values remain." >&2
  exit 2
fi
export NEXT_PUBLIC_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
export NEXT_PUBLIC_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
compose=(docker compose --env-file "$REPO_ROOT/$ENV_FILE" -f "$REPO_ROOT/docker-compose.mainland.yml")
if [[ "$MODE" == "local" ]]; then
  compose+=(-f "$REPO_ROOT/docker-compose.mainland.local.yml" --profile local)
fi
"${compose[@]}" up -d --build --remove-orphans
node "$REPO_ROOT/scripts/healthcheck-mainland.mjs" "--base-url=$BASE_URL"
echo "Mainland $MODE staging is healthy. No cloud purchase, DNS, ICP, or Production action was performed."
