#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?usage: rollback-mainland.sh <image-tag> [env-file] [base-url]}"
ENV_FILE="${2:-.env.mainland}"
BASE_URL="${3:-https://staging.example.cn}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="hematuria-mainland:$TAG"
docker image inspect "$IMAGE" >/dev/null
export MAINLAND_IMAGE_TAG="$TAG"
docker compose --env-file "$ROOT/$ENV_FILE" -f "$ROOT/docker-compose.mainland.yml" up -d --no-build app nginx
node "$ROOT/scripts/healthcheck-mainland.mjs" "--base-url=$BASE_URL"
echo "Rollback to $IMAGE passed health validation."
