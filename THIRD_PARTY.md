# Third-party sources

- GBMicrotest: aappleby/gbmicrotest, commit `463eb6bc0fe31d61781ef63060ad6d74090c0255`, MIT. The 50 selected binary ROMs, assembly sources and license are in tests/corpus. They are **not public domain**.
- nlohmann/json: v3.12.0 single-header distribution, MIT notice preserved in native/retro-worker/vendor/nlohmann/json.hpp.
- libretro.h: copied from SameBoy commit `c458e7c5d2d350fb37a1931c40da9f758d28d240`, license notice preserved in the header.
- SameBoy: LIJI32/SameBoy commit above, MIT, built externally. Its open-source boot ROMs are used. No Nintendo BIOS is bundled.
- bsnes-libretro: libretro/bsnes-libretro commit `05439f96121d2b9d7ad7a5fc1f29d7eebdcc8c43`, GPL-3.0, built externally. Preserve its license and satisfy its source-distribution requirements when distributing compiled binaries.

Provider binaries are excluded from this repository. Their source repositories include component notices. Build tools and dependencies retain their respective licenses.
