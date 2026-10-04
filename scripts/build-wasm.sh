#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for tool in git make emcc em++ emmake rgbasm rgblink rgbgfx; do command -v "$tool" >/dev/null || { echo "Missing build tool: $tool" >&2; exit 2; }; done
SAMEBOY="$ROOT/vendor-sources/sameboy"
COMMIT="c458e7c5d2d350fb37a1931c40da9f758d28d240"
if [ ! -d "$SAMEBOY/.git" ]; then
  mkdir -p "$ROOT/vendor-sources"
  git clone https://github.com/LIJI32/SameBoy.git "$SAMEBOY"
fi
test "$(git -C "$SAMEBOY" remote get-url origin)" = "https://github.com/LIJI32/SameBoy.git"
git -C "$SAMEBOY" fetch --quiet origin "$COMMIT"
git -C "$SAMEBOY" reset --hard "$COMMIT"
git -C "$SAMEBOY" clean -fdx
git -C "$SAMEBOY" checkout --quiet --detach "$COMMIT"
make -C "$SAMEBOY" -j2 CONF=release bootroms
emmake make -C "$SAMEBOY/libretro" -j2 platform=emscripten CC=emcc CXX=em++ BOOTROMS_DIR="$SAMEBOY/build/bin/BootROMs" BIN="$SAMEBOY/build/bin"
CORE="$SAMEBOY/libretro/sameboy_libretro_emscripten.bc"
test -f "$CORE"
mkdir -p "$ROOT/build/wasm"
em++ "$ROOT/native/retro-worker/src/main.cpp" "$CORE" \
  -I"$ROOT/native/retro-worker/vendor" -std=c++20 -O3 -DNEXUSRETRO_STATIC_CORE=1 -fexceptions \
  --no-entry -sDISABLE_EXCEPTION_CATCHING=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRetroWorker \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=536870912 -sFORCE_FILESYSTEM=1 -sNO_EXIT_RUNTIME=1 \
  -sENVIRONMENT=web,worker \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_nexusretro_dispatch","_nexusretro_binary_data","_nexusretro_binary_size"]' \
  -sEXPORTED_RUNTIME_METHODS='["FS","ccall"]' \
  -o "$ROOT/build/wasm/retro-worker.js"
test -s "$ROOT/build/wasm/retro-worker.js"
test -s "$ROOT/build/wasm/retro-worker.wasm"
echo "STATE: WORKER_READY WebAssembly worker PASS"
