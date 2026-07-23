#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-staging}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/work/mainland-backups"
mkdir -p "$TARGET"
IMAGE="hematuria-mainland:$TAG"
IMAGE_ID="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
printf '{"createdAt":"%s","gitSha":"%s","image":"%s","imageId":"%s","redisBackup":"Tencent Cloud managed backup; no data exported."}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SHA" "$IMAGE" "$IMAGE_ID" > "$TARGET/deployment-$STAMP.json"
echo "Wrote secret-free deployment manifest under work/mainland-backups."
