# NexusRetroHost

A C++20 libretro worker with NexusEngine as the lifecycle, input, semantic-state and committed-history engine. File, provider, memory, input, raster, audio, snapshot and corpus adapters live in NexusEngine-Kits. The native emulator executes the original game rules.

## Build and run

Validated on Linux x86-64; Windows/macOS remain unqualified. Requires Node 22+, CMake 3.20+, a C++20 compiler, Git and Make. Install dependencies with `npm ci`. Build the worker with `npm run build:native` (CMAKE can override the executable).

Build SameBoy with `npm run build:providers -- sameboy`. Install RGBDS 1.0.4 and set RGBDS to its executable directory when absent from PATH. Upstream build prerequisites apply. Build bsnes with `npm run build:providers -- bsnes`. Builds check out immutable source commits and retain upstream licenses; no provider binary or Nintendo BIOS is shipped.

```bash
export RETRO_CORE="$PWD/vendor-sources/sameboy/build/bin/sameboy_libretro.so"
npm test
npm run test:corpus
npm start -- --core "$RETRO_CORE"
```

Open the printed localhost URL. The fragment token authorizes API calls. Upload a supported ROM; Run/Pause/Step, reset, save/restore, bounded rewind, keyboard controls, audio and Core state inspection are available. Native libraries are trusted local code. The server binds only 127.0.0.1 and rejects foreign origins. Save slot: saves/browser.nrs. CLI: `node src/cli.js run --rom FILE --core LIBRARY --profile PROFILE --frames 120`. SNES: add `--system snes` and pass bsnes_libretro.so.

## State contract

The host waits for a complete native frame, copies memory, validates a hash-bound profile, stages an observation and synchronously ticks Nexus. A simulation commit participant publishes decoded meters/spatial/neutral descriptors and history together. History is an ECS resource bounded by both record count and UTF-8 bytes. Binary raster/audio/state blobs remain external. The browser automatically binds the bundled profile for exact corpus hashes. Other profiles can be passed through the CLI. Unknown game actors, health and progression are never inferred from pixels.

Save bundles bind content, core binary, settings and profile hashes and contain native state plus Core owner snapshots. Restore advances the epoch and attempts native/Core recovery on failure. Rewind uses native checkpoints and recorded inputs; up to 11 checkpoints/128 MiB are retained. The first checkpoint is after frame 1 because SameBoy cannot serialize before initialization. Reset clears replay history; restoring a file starts a new rewind window at its saved frame. Lifecycle operation IDs are recorded in the Core transaction ledger; identical IDs return their original receipt and conflicting reuse is rejected. This operational ledger is preserved across game rewinds/restores. Nexus tick identities remain monotonic across emulator rewinds.

`npm run corpus:verify` checks all 50 imported ROM hashes offline. `node scripts/import-corpus.mjs` fetches the pinned MIT source; `--source PATH` uses a local source checkout. The committed report records 49 passes and one emulator failure, with no host errors. The corpus is MIT, not public domain.

See [COMPATIBILITY.md](COMPATIBILITY.md), [THIRD_PARTY.md](THIRD_PARTY.md), [IMPLEMENTATION.md](IMPLEMENTATION.md), contracts/ and profiles/megaman-x/README.md. All-Nintendo provider coverage, verified Mega Man X semantic offsets, automatic actor lifetimes and a strict public-domain corpus remain unresolved. This repository does not claim those outcomes.
