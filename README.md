# NexusRetroHost

NexusRetroHost runs Game Boy content through one C++20 libretro worker. The exact same worker source is compiled as a native executable or as WebAssembly with Emscripten.

```text
ROM
↓
Libretro Core
↓
C++ Emulator Worker
↓
FrameReceipt
↓
NexusEngine Core domains/history
↓
Player + State Inspector
```

## Authoritative builds

```bash
./scripts/build-native.sh
./scripts/build-wasm.sh
./scripts/build-pages.sh
./scripts/validate-release.sh
```

`build-pages.sh` builds the C++ worker to WASM, stages the web app and 50-game catalog under `dist/`, then validates the release.

## Library

- 50 bundled GB/GBC homebrew ROMs selected from pinned Homebrew Hub metadata with permissive redistribution licenses.
- 50 separate MIT GBMicrotest ROMs remain the engineering corpus; they are not counted as bundled games.
- Local GB/GBC ROM loading is supported.
- Commercial Nintendo ROMs are not bundled.

## Runtime

The worker contract is shared across native and WASM targets: initialize/hello, loadContent, step, reset, serialize, unserialize, readMemory and close.

NexusEngine owns observable session state, input descriptors, semantic observations, bounded history, snapshots and lifecycle receipts. The emulator remains authoritative for original game execution.

Save/restore binds emulator state to Nexus domain snapshots. Rewind restores checkpoints and replays recorded input.

## Validation

The Pages workflow calls the repo-owned scripts, builds the native worker, runs native integration and all 50 bundled games, builds the WASM Pages artifact, then drives the rendered WASM app in Chromium.

See `reports/VALIDATION.md`, `COMPATIBILITY.md`, `THIRD_PARTY.md`, `systems/registry.json` and `IMPLEMENTATION.md`.
