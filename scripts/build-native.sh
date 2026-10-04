#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/build-native.mjs
test -x build/native/retro-worker || test -x build/native/Release/retro-worker
echo "STATE: BUILDABLE native worker PASS"
