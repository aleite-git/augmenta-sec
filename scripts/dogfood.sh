#!/usr/bin/env bash
# scripts/dogfood.sh — Run AugmentaSec on its own codebase (local convenience).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Running augmenta-sec init"
node dist/index.js init .

echo "==> Running augmenta-sec scan (offline)"
node dist/index.js scan .

echo "==> Done. Results in .augmenta-sec/"
