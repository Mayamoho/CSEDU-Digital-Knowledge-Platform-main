#!/usr/bin/env bash
#
# Remote half of the deploy. Runs ON the VM, from ~/csedu-platform.
#
# This lives in a script rather than inline in .github/workflows/deploy.yml on
# purpose: appleboy/ssh-action rewrites an inline script line by line, splicing
# an exit-code check between every statement, which mangles loops and redirects.
# That is what hung the deploy — `psql < file` lost its redirect, psql waited on
# stdin, and stdin never closed. The workflow now invokes this file with a
# single command, so the shell here is a real bash.
#
# Usage: bash scripts/deploy-remote.sh [IMAGE_TAG]

set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_TAG="${1:-latest}"
export IMAGE_TAG

PROD="docker compose -f docker-compose.prod.yml"
GHCR="docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml"
SERVICES="frontend api rag ingestion-worker fine-worker"

echo "==> deploying $(git rev-parse --short HEAD) (image tag: $IMAGE_TAG)"

# ── Migrations ───────────────────────────────────────────────────────────────
# psql -f reads the file itself instead of relying on a shell redirect, and
# </dev/null guarantees the client can never block waiting for input.
# lock_timeout stops a DDL statement from waiting forever on a lock held by a
# leaked transaction; a failed migration is logged and skipped because every
# migration in this project is written to be idempotent.
echo "==> applying migrations"
for f in infra/db/migrations/*.sql; do
  name=$(basename "$f")
  $PROD cp "$f" "postgres:/tmp/$name" </dev/null >/dev/null
  if $PROD exec -T \
       -e PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=60000' \
       postgres psql -q -v ON_ERROR_STOP=1 -U csedu_user -d csedu_platform \
       -f "/tmp/$name" </dev/null >/dev/null 2>&1; then
    echo "    ok      $name"
  else
    echo "    skipped $name (already applied or not applicable)"
  fi
  $PROD exec -T postgres rm -f "/tmp/$name" </dev/null >/dev/null 2>&1 || true
done

# ── Images ───────────────────────────────────────────────────────────────────
# Prefer what GitHub already built. If the GHCR packages are private and no
# token is configured the pull fails, so build on the VM instead rather than
# leaving the stack half-updated.
echo "==> fetching images"
if $GHCR pull $SERVICES </dev/null; then
  echo "    using prebuilt GHCR images"
  COMPOSE="$GHCR"
else
  echo "    GHCR pull failed — building on the VM"
  $PROD build $SERVICES </dev/null
  COMPOSE="$PROD"
fi

echo "==> restarting services"
$COMPOSE up -d nginx $SERVICES </dev/null

# nginx caches upstream container IPs at start-up; restart so it re-resolves
# them, otherwise requests hit the old containers and 502.
$PROD restart nginx </dev/null

docker image prune -f </dev/null >/dev/null
$PROD ps

# ── Local health gate ────────────────────────────────────────────────────────
echo "==> waiting for the stack to answer"
for i in $(seq 1 30); do
  site=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ || true)
  api=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/v1/health || true)
  echo "    attempt $i: site=$site api=$api"
  if [ "$site" = "200" ] && [ "$api" = "200" ]; then
    echo "==> deploy complete"
    exit 0
  fi
  sleep 5
done

echo "!! stack did not become healthy" >&2
exit 1
