# Execution evidence

Tested pair: NexusEngine `2b5e070fab8c73986174b842559b96a7fd2db662`; NexusEngine-Kits `85709ae3752239c21039328206bf24f8e4f0f15c`. package-lock.json contains immutable Git dependencies. nexusretro.lock.json binds registry, source, tested native binaries, profile and corpus identities. Binary hashes describe the tested local builds, not universal cross-machine hashes.

- Clean isolated `npm ci --ignore-scripts`: PASS; public Engine observation, Kit adapter and browser PCM exports imported from installed packages.
- C++20 native worker Release build: PASS.
- SameBoy pinned source + open-source boot ROM build: PASS. bsnes pinned build and protocol handshake: PASS.
- Native integration against installed pinned packages: PASS. Tests exercise frame/history publication, committed resolution correspondence, Core/native save restore, deterministic input replay, checkpoint rewind, reset and duplicate/conflicting lifecycle IDs.
- Local Chromium browser against the actual localhost app: PASS. Upload, verified corpus profile, run/pause, raster dimensions, streaming audio, save/restore, rewind, Core inspector and no page errors. See ui-smoke.json and ui-smoke.png.
- Offline ROM integrity: 50/50 PASS.
- Native corpus: 49 PASS, 1 FAIL; zero TIMEOUT, UNSUPPORTED or HOST_ERROR. See corpus-sameboy.json. The process exits nonzero on a ROM failure; it is not suppressed or counted as passing.
- Kits full `npm run check`: PASS, including existing suites and new adapter boundary proofs.
- Core focused verification through the existing finite Editor harness: PASS. Full Core checks on both unchanged main and updated main remain blocked by unproven authoring-create metadata; the pre-existing indexeddb boundary failure is also unchanged. Core evidence records these comparisons. The absent persistent guided controller is not claimed as executed.

Do not interpret these checks as all-Nintendo or Mega Man X qualification. No commercial ROM, Nintendo BIOS, provider binary or GPU-console support is supplied. The imported suite is MIT; the strict public-domain corpus requirement remains unresolved. Actor-slot lifecycle and progression decoding require verified title-specific work.

Implementation uses a single C++ translation unit and a single browser page rather than the proposed file split; this keeps the tested protocol/lifecycle path together. The JSON contract files document the transport/profile/corpus shapes; native and Kit runtime validators enforce their operational constraints. The original detailed proposal is retained in IMPLEMENTATION.md and is not a claim that every proposed title/provider has been implemented.
