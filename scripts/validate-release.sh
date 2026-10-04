#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test -s dist/index.html
test -s dist/worker/retro-worker.js
test -s dist/worker/retro-worker.wasm
test -s dist/games/catalog.json
test "$(node -e 'const c=require("./dist/games/catalog.json");process.stdout.write(String(c.length))')" = "50"
node --check src/adapters/emulator-worker-kit.js
node --check src/adapters/wasm-worker-client.js
node --check src/web/bootstrap-browser.js
node --check src/web/browser-session.js
node --check src/web/app.js
node scripts/verify-game-library.mjs
grep -q 'retro-worker.wasm' dist/worker/retro-worker.js
echo "STATE: WEB_RELEASE_READY release validation PASS"
