#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/generate-catalog.mjs
node scripts/verify-game-library.mjs
./scripts/build-wasm.sh
node scripts/build-web.mjs
./scripts/validate-release.sh
