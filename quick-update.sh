#!/usr/bin/env bash
#
# Manual update, run ON the VM from ~/csedu-platform.
#
# Normally you do not need this: pushing to main runs the GitHub Actions
# pipeline, which tests, builds the images and deploys them in a few minutes.
# Use this when Actions is unavailable, or to redeploy without a new commit.
#
# The real work lives in scripts/deploy-remote.sh — the same script CI runs, so
# a manual deploy and an automated one do exactly the same thing. This file used
# to carry its own hard-coded migration list, which drifted: it named two
# migrations that do not exist and missed the ones added later.
#
# Usage:
#   ./quick-update.sh              # pull main, then deploy
#   ./quick-update.sh --no-pull    # deploy the working tree as-is

set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" != "--no-pull" ]; then
  echo "==> pulling latest main"
  git fetch origin
  git reset --hard origin/main
fi

exec bash scripts/deploy-remote.sh "${IMAGE_TAG:-latest}"
