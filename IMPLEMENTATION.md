## Review result

Your correction fits NexusEngine’s existing ownership rules:

- **Emulator backends, file loaders, memory decoders, device input, display and storage adapters become Kits.**
- **Observed game state goes into existing Core domains wherever their meaning matches.**
- **The ECS buffer records committed observations and their history.**

I reviewed [NexusEngine at `784e514`](https://github.com/LuminaryLabs-Dev/NexusEngine/tree/784e514722febf8fb09ca55a058b2736e93679bd) and [NexusEngine-Kits at `a7abd13`](https://github.com/LuminaryLabs-Dev/NexusEngine-Kits/tree/a7abd1340d8f695abc8974121fdd2ef4112413c0). RetroHost currently contains only its README.

**Two requirements need precise limits:** supporting every Nintendo system requires multiple emulator providers; decoding meaningful game state requires profiles for individual games. A file running successfully does not automatically expose its player, health, enemies or level.

**Corpus finding:** I verified 50 existing, redistributable Game Boy test files under MIT. I did **not** verify 50 strictly public-domain files. The exact proposed corpus is listed below, clearly labeled as MIT.

---

## 1. Concrete repository structure

Use **C++20 for the native emulator worker**, with NexusEngine running in the JavaScript host. This connects to NexusEngine’s current ESM implementation without requiring a Rust or C++ rewrite of the engine.

### `NexusRetroHost`: add these files

| Proposed path | Exact responsibility |
|---|---|
| `package.json` | ESM package; scripts for native build, headless execution, corpus import and tests. |
| `nexusretro.lock.json` | Pin Engine, Kits, emulator sources, binaries, profiles and corpus hashes. |
| `src/bootstrap.js` | Create Engine, install the selected Core domains and external Kits in dependency order. |
| `src/session-controller.js` | Implement load, run, pause, step, reset, save, restore and close commands. |
| `src/core-selection.js` | Select a provider using detected system and required capabilities. |
| `src/frame-driver.js` | Request a native step, await its result, then synchronously tick Nexus. |
| `src/cli.js` | Headless commands and machine-readable reports. |
| `src/ui/game-library.js` | Select local content; show detected system and provider. |
| `src/ui/player.js` | Viewport, controller bindings, pause, frame step and save slots. |
| `src/ui/state-inspector.js` | Display Core-owned state, history cursor, provenance and unknown fields. |
| `contracts/worker-protocol.schema.json` | Validate request and response envelopes. |
| `contracts/game-profile.schema.json` | Validate memory mappings, identity restrictions and conversions. |
| `contracts/corpus-entry.schema.json` | Validate source, license, hashes, system and test oracle. |
| `native/retro-worker/CMakeLists.txt` | Build the C++ worker. |
| `native/retro-worker/src/main.cpp` | Process lifecycle and protocol dispatch. |
| `native/retro-worker/src/libretro_host.cpp` | Load the core and implement frontend callbacks. |
| `native/retro-worker/src/memory_map.cpp` | Resolve exposed memory regions and copy requested ranges. |
| `native/retro-worker/src/frame_capture.cpp` | Capture video, audio and memory from the same completed step. |
| `native/retro-worker/src/state_store.cpp` | Serialize and restore emulator state. |
| `native/retro-worker/src/protocol.cpp` | Encode/decode bounded binary messages. |
| `profiles/gbmicrotest/` | Test result mappings and execution settings. |
| `profiles/megaman-x/` | Authored SNES mappings, separated by verified ROM hash/revision. |
| `tests/corpus/manifest.json` | The explicit 50-file selection. |
| `tests/corpus/roms/gbmicrotest/` | Imported test binaries. |
| `tests/corpus/licenses/gbmicrotest-MIT.txt` | Preserve the author’s license. |
| `scripts/import-corpus.mjs` | Fetch pinned files, verify hashes and write an import receipt. |
| `tests/integration/` | Native worker, state publication, restore and corpus proofs. |

**Dependency pinning:** the reviewed Kits package pins a different Engine commit from current Engine main. `nexusretro.lock.json` must identify a tested pair. Installing both moving `main` branches is insufficient.

---

## 2. Exact Core connections

Use public package exports. Kits must not import `NexusEngine/src/...`.

| State or operation | Existing Core connection | Required RetroHost behavior |
|---|---|---|
| ROM identity and content descriptors | `nexusengine/domains/asset/registry` | Register content hash, system, size and source identity. File reads belong to a loader Kit. |
| Controller actions and bindings | `nexusengine/domains/interaction/input` | Store semantic actions; console button translation belongs to an input adapter Kit. |
| Actor identity | `nexusengine/domains/actor/registry` | Register only actors identified by a profile. |
| Character representation | `nexusengine/domains/actor/creature`, `/character` | Create profile-backed character records and bindings. |
| Player possession/control | `nexusengine/domains/actor/player` | Bind a controller to the observed character using `player.register()` and `player.possess()`. |
| Positions and bounds | `nexusengine/domains/spatial/contracts` | Publish spatial descriptors with explicit coordinate space and units. |
| Health, ammo, lives and similar meters | `nexusengine/domains/simulation/runtime` | Use `simulation.resources.register()` and `.set()` where meter semantics fit. |
| Observation arbitration | Same simulation export, with resolution enabled | Use `submitObservation()`, `registerObservationSource()` and an explicit `setResolutionPolicy()`. |
| Progress and checkpoints | Existing simulation progression domains | Publish only fields whose meaning is verified by the game profile. |
| Lifecycle orchestration | `nexusengine/domains/runtime/sequence` | Register Kit-provided sequence nodes for load/run/pause/reset/restore. |
| Portable snapshot data and digests | `nexusengine/domains/runtime/data` | Version observations and snapshots; calculate canonical state digests. |
| Save slots and recovery contracts | `nexusengine/domains/runtime/persistence` | Keep slot metadata in Core; filesystem writes in a storage adapter Kit. |
| Operation identity | `nexusengine/domains/runtime/transaction` | Identify load/reset/restore requests and prevent duplicate application. |
| Output, audio and UI descriptors | Existing presentation domains | Describe output; actual texture upload, playback and widgets remain Kits/product code. |
| Inspector subscriptions | Engine event/resource/query surfaces | Read committed state through Engine surfaces. |

There is no dedicated Core health domain in the inspected files. The existing generic simulation resource service is the appropriate initial owner.

Several Core services maintain internal state and expose snapshots; they are not all individual ECS components. The historical ECS buffer must account for those domain snapshots.

### Mapping rules

For Mega Man X:

- Player identity → actor/character/player.
- Position → spatial, retaining SNES coordinate conventions.
- Health and weapon energy → simulation resource meters.
- Stage/checkpoint → progression only after verifying the field’s meaning.
- Enemy slot → actor identity including slot generation, so reused memory slots do not appear to be the same enemy.
- Unmapped RAM → memory inspection, with no invented semantic label.

Do not run Nexus movement or damage systems over those observed values. The emulator already executes the original game rules.

---

## 3. Adapter Kits to implement

Reusable platform adapters belong in **NexusEngine-Kits**. Mega Man X profiles and RetroHost UI composition belong in **NexusRetroHost**.

For each reusable Kit, add:

`kits/<domain>/<kit-name>/{index.js,kit.json,README.md,LIMITATIONS.md,source-parity.md,smoke.test.mjs}`

Then add its authoritative manifest under `manifests/kits/`, package export and generated registry/catalog entries. This follows the [existing Kits rules](https://github.com/LuminaryLabs-Dev/NexusEngine-Kits/blob/a7abd1340d8f695abc8974121fdd2ef4112413c0/AGENTS.md).

| Kit directory | Proposed factory | Concrete behavior |
|---|---|---|
| `kits/host/native-emulator-worker-kit/` | `createNativeEmulatorWorkerKit()` | Spawn, handshake, supervise and terminate the native worker. |
| `kits/emulation/libretro-provider-kit/` | `createLibretroProviderKit()` | Expose content loading, stepping, reset, serialization and provider capabilities. |
| `kits/asset/nintendo-content-loader-kit/` | `createNintendoContentLoaderKit()` | Read files, detect formats, calculate hashes and validate content before loading. |
| `kits/emulation/emulator-memory-observer-kit/` | `createEmulatorMemoryObserverKit()` | Copy profile-requested memory ranges after completed emulation steps. |
| `kits/simulation/observed-game-state-adapter-kit/` | `createObservedGameStateAdapterKit()` | Decode profile observations and prepare changes for existing Core owners. |
| `kits/input/console-input-adapter-kit/` | `createConsoleInputAdapterKit()` | Convert semantic input into console button packets. |
| `kits/presentation/raster-frame-provider-kit/` | `createRasterFrameProviderKit()` | Present frame buffers with correct pitch, format, aspect and duplicate-frame handling. |
| `kits/presentation/pcm-audio-provider-kit/` | `createPcmAudioProviderKit()` | Queue/resample PCM and recover from underruns. |
| `kits/persistence/filesystem-snapshot-adapter-kit/` | `createFilesystemSnapshotAdapterKit()` | Write and read complete save bundles atomically. |
| `kits/diagnostics/rom-test-runner-kit/` | `createRomTestRunnerKit()` | Execute corpus cases, evaluate their oracle and emit diagnostic receipts. |

Capabilities such as `emulation:frame-step`, `emulation:memory-observation` and `emulation:serialize` are **proposed tokens**, not existing Engine APIs.

Each Kit needs idempotent installation, reset behavior, declared snapshot behavior and explicit disposal of processes/subscriptions. The inspected runtime Kit definition does not provide a general `uninstall` hook; implement disposal through the Kit’s exposed API and the host lifecycle.

Registry entries remain candidates until their behavior is proved. A manifest alone does not establish working support.

---

## 4. Specific NexusEngine changes

The inspected simulation resolution code has three relevant limitations:

1. Its default policy does not convert observations into domain state.
2. Its state patch application currently writes resources, not arbitrary actor/component changes.
3. Its committed-frame record is not a bounded history of complete observed game state.

Add two generic capabilities.

### A. Bounded observation history under runtime data

Proposed files:

- `src/core-domains/runtime/data/observation/subdomain.manifest.js`
- `src/core-domains/runtime/data/observation/contracts.js`
- `src/core-domains/runtime/data/observation/kits/observation-history-kit/index.js`
- `src/core-domains/runtime/data/observation/kits/observation-history-kit/state.js`
- `src/core-domains/runtime/data/observation/kits/observation-history-kit/kit.manifest.js`
- `tests/core-kits/observation-history-smoke.mjs`

Proposed public export:

```js
import {
  createObservationHistoryKit
} from "nexusengine/domains/runtime/data/observation";
```

Proposed API:

```js
history.appendCommitted(record);
history.getFrame({ sessionId, epoch, sourceFrame });
history.list({ after, limit });
history.setRetention({ maxFrames, maxBytes });
history.getSnapshot();
history.loadSnapshot(snapshot);
history.reset();
```

Store the ring in an ECS resource. Enforce both count and byte limits.

**Initial settings:** 600 semantic frames, 64 MiB maximum history. Keep video, PCM and emulator save blobs outside this ring; records contain their hashes/references.

History is a historical record. Active values remain owned by actor, spatial, simulation and other Core domains.

### B. Validated observation commits in simulation resolution

Modify:

- `src/core-domains/simulation/kits/simulation-kit/resolution.js`
- `src/core-domains/simulation/kits/simulation-kit/index.js`
- The simulation manifest and public contract documentation.
- Focused resolution tests.

Add a generic commit-participant contract:

```js
resolution.registerCommitParticipant({
  id,
  prepare,
  apply,
  rollback
});
```

Required behavior:

1. Validate the receipt, frame identity and every proposed domain change.
2. Prepare changes without mutating active state.
3. Apply all prepared changes synchronously.
4. Roll back previously applied participants if application fails.
5. Publish the committed receipt/history entry only after success.

Buffer commit notifications until successful completion, so subscribers cannot observe a partially applied frame.

Keep ROM offsets, console formats and game-specific decoding outside this Core capability.

For both additions, update the owning manifests, public exports and generated Core catalog using the repository’s existing generation scripts. These are proposed additions; they do not exist today.

---

## 5. Native worker contract and frame order

### Requests

Define these commands in `worker-protocol.schema.json`:

- `hello`
- `loadContent`
- `step`
- `reset`
- `serialize`
- `unserialize`
- `close`

Each request carries:

```text
protocolVersion
requestId
sessionId
epoch
command
payload
```

Each completed step returns:

```text
sessionId, epoch, sourceFrame
contentHash, coreHash, settingsHash, profileHash
inputPacket
video metadata and binary payload reference
audio metadata and binary payload reference
copied memory ranges
emulator-state digest where supported
```

Use length-prefixed messages with binary payloads. Do not serialize complete video frames into JSON arrays. Keep logs on a separate channel from protocol traffic.

### Libretro implementation

Implement the frontend callbacks for environment, video, audio and input, plus the load/run/reset/serialize lifecycle.

Memory observation must handle exposed memory descriptors and provider-specific gaps. A generic system-RAM pointer is not a universal CPU address space.

**Initial Game Boy provider:** SameBoy. Its Libretro implementation exposes HRAM beginning at `0xFF80`, which matches the proposed test oracle. Its documented core license is MIT. [GitHub](https://github.com/LIJI32/SameBoy/blob/master/libretro/libretro.c?utm_source=chatgpt.com)

**Initial SNES provider:** evaluate and pin bsnes for the Mega Man X path. Its GPL terms need to be reflected in the provider distribution. Snes9x has noncommercial restrictions and should not be silently chosen for a commercial product. [GitHub](https://github.com/bsnes-emu/bsnes/blob/master/LICENSE.txt?utm_source=chatgpt.com)

### Frame execution

NexusEngine’s `tick()` is synchronous. The integration must therefore work as follows:

1. Host collects a frame’s input packet.
2. Host requests `step` from the worker.
3. Worker finishes the step and copies memory/output.
4. Host places the completed receipt into an inbox.
5. Nexus `input`/`simulate` systems validate and decode that receipt.
6. Nexus `resolve` commits the prepared Core changes.
7. Nexus `cleanup` appends history and releases consumed payloads.

For headless tests, one completed worker step produces one Nexus commit. During normal playback, host display ticks may differ from emulated frames; retain both identities.

Increment `epoch` after load, reset or restore. Reject responses from previous epochs.

---

## 6. Game profiles, saves and rewind

### `contracts/game-profile.schema.json`

Require:

- Supported content hashes and revisions.
- System and provider requirements.
- Memory address space, bank and offset.
- Field width, signedness, endianness and fixed-point conversion.
- Coordinate space and units.
- Actor slot identity/generation rules.
- Validity conditions and bounds.
- Destination Core domain.
- Profile version and digest.

A profile applies only to its verified content identities. Unknown revisions can still run, but semantic fields remain unavailable.

For Mega Man X, exact RAM addresses must be verified against the selected ROM revision. This review does not establish those addresses.

### Save bundle

Every save must contain:

- Emulator serialized state.
- Core domain snapshots.
- Content/core/profile/settings hashes.
- Frame and epoch.
- Controller/input state.
- Integrity manifest.

Restore into a paused session, validate compatibility, restore the emulator and Core state together, then start a new epoch.

**Rewind requires emulator checkpoints plus input replay.** Restoring an ECS observation alone cannot restore CPU, graphics, audio, mapper or peripheral state.

Initial checkpoint policy: every 60 emulated frames, subject to a separate memory budget.

---

## 7. Exact 50-file test corpus

### Verified source

Use [aappleby/gbmicrotest at `463eb6b`](https://github.com/aappleby/gbmicrotest/tree/463eb6bc0fe31d61781ef63060ad6d74090c0255).

I checked that all 50 paths below exist under `bin/`. Preserve its [MIT license](https://github.com/aappleby/gbmicrotest/blob/463eb6bc0fe31d61781ef63060ad6d74090c0255/LICENSE).

These are **Game Boy test programs**, not 50 games and not public-domain files. The author provides prebuilt binaries and documents a memory-based result protocol. [GitHub](https://github.com/aappleby/gbmicrotest?utm_source=chatgpt.com)

```text
timer_tima_inc_256k_a.gb
timer_tima_inc_256k_b.gb
timer_tima_inc_256k_c.gb
timer_tima_inc_256k_d.gb
timer_tima_inc_256k_e.gb
timer_tima_inc_256k_f.gb
timer_tima_inc_256k_g.gb
timer_tima_inc_256k_h.gb
timer_tima_inc_256k_i.gb
timer_tima_inc_256k_j.gb
timer_tima_inc_256k_k.gb
timer_tima_reload_256k_a.gb
timer_tima_reload_256k_b.gb
timer_tima_reload_256k_c.gb
timer_tima_reload_256k_d.gb
timer_tima_reload_256k_e.gb
timer_tima_reload_256k_f.gb
timer_tima_reload_256k_g.gb
timer_tima_reload_256k_h.gb
timer_tima_reload_256k_i.gb
oam_read_l0_a.gb
oam_read_l0_b.gb
oam_read_l0_c.gb
oam_read_l0_d.gb
oam_read_l1_a.gb
oam_read_l1_b.gb
oam_read_l1_c.gb
oam_read_l1_d.gb
oam_read_l1_e.gb
oam_read_l1_f.gb
vram_read_l0_a.gb
vram_read_l0_b.gb
vram_read_l1_a.gb
vram_read_l1_b.gb
vram_write_l0_a.gb
vram_write_l0_b.gb
vram_write_l1_a.gb
vram_write_l1_b.gb
halt_bug.gb
halt_op_dupe.gb
halt_op_dupe_delay.gb
lcdon_to_ly1_a.gb
lcdon_to_ly1_b.gb
lcdon_to_ly2_a.gb
lcdon_to_ly2_b.gb
div_inc_timing_a.gb
div_inc_timing_b.gb
int_timer_halt.gb
int_timer_incs.gb
int_timer_nops.gb
```

### Import changes

`import-corpus.mjs` must:

1. Fetch these exact files from the immutable commit.
2. Copy the license and selected test source for oracle inspection.
3. Calculate SHA-256 for every imported file.
4. Write `manifest.json` and an import receipt.
5. Reject missing files, changed hashes and duplicate entries.
6. Support an offline verification mode.

Hashes should be calculated from downloaded binaries, not invented from Git blob identifiers.

### Test oracle

The documented protocol uses:

| Address | Meaning |
|---|---|
| `0xFF80` | Actual result |
| `0xFF81` | Expected result |
| `0xFF82` | `0x01` pass; `0xFF` fail |

Verify each selected test’s initialization/completion sequence before accepting a result. An uninitialized byte matching a marker must not count as completion.

Use a pinned DMG model, deterministic startup settings and an initial timeout of 120 frames. Report:

`PASS`, `FAIL`, `TIMEOUT`, `UNSUPPORTED`, `HOST_ERROR`.

These timing tests may expose genuine emulator inaccuracies. Do not turn an observed failure into an expected pass without evidence.

### Strict public-domain requirement

[SaveTest-N64](https://github.com/meeq/SaveTest-N64) provides an explicitly public-domain/Unlicense candidate, but it does not supply a 50-file corpus. [GitHub](https://github.com/meeq/SaveTest-N64?utm_source=chatgpt.com)

If public-domain-only is mandatory, the external 50-file requirement remains unresolved. The MIT corpus is an explicitly identified alternative, not fulfillment of that license constraint.

---

## 8. “All Nintendo files”: exact support accounting

Add `systems/registry.json` with a separate record for each system:

```text
systemId
recognizedFormats
providerKit
providerSourceCommit
supportedHardware
firmwareRequirements
memoryObservationCapabilities
serializationCapabilities
verifiedCorpus
supportStatus
```

Use statuses:

- `recognized`
- `loadable`
- `playable`
- `state-observable`
- `verified`

Start with Game Boy and SNES. NES/Famicom, GBA, N64, DS, GameCube/Wii, 3DS and Switch require their own provider integrations, peripherals, content handling and verification.

The 50 Game Boy tests prove nothing about SNES compatibility. Add a separate SNES suite and a local Mega Man X acceptance case. The SNES test repositories inspected include explicitly MIT and Zlib-licensed options. [GitHub](https://github.com/gilyon/snes-tests?utm_source=chatgpt.com)

---

## 9. Required acceptance tests

| Proposed test | Pass condition |
|---|---|
| `worker-handshake.test.mjs` | Reject incompatible protocol/core identities. |
| `content-load.test.mjs` | Load valid content; reject malformed input cleanly. |
| `frame-envelope.test.mjs` | Video, audio and observed memory share one receipt identity. |
| `epoch-fencing.test.mjs` | Old worker responses cannot mutate a new session. |
| `observation-commit.test.mjs` | Invalid mapping changes no Core state; failed application rolls back. |
| `history-retention.test.mjs` | Frame and byte limits remain enforced during long runs. |
| `snapshot-roundtrip.test.mjs` | Restore reproduces subsequent observations for the pinned provider/settings. |
| `input-replay.test.mjs` | Recorded input reproduces the same semantic digests. |
| `gbmicrotest-corpus.test.mjs` | Execute all 50 files and emit individual verdicts and evidence. |
| `megaman-x-local.test.mjs` | Load a supplied supported revision; observe verified player/health/position fields; save and restore consistently. |

Implementation order is dependency-driven: **native worker → provider Kit → receipt transport → Core observation commit/history → profile adapter → 50-file runner → SNES/Mega Man X profile → playback UI**.

This is a source-reviewed implementation specification. No repositories were changed, ROMs imported or emulator executions performed during the review.