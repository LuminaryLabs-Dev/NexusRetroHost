# Third-party sources

- NexusEngine: pinned by `nexusretro.lock.json`.
- NexusEngine-Kits: pinned by `nexusretro.lock.json`.
- SameBoy: LIJI32/SameBoy commit `c458e7c5d2d350fb37a1931c40da9f758d28d240`, MIT. Native and Emscripten builds use the same libretro core source.
- bsnes-libretro: commit `05439f96121d2b9d7ad7a5fc1f29d7eebdcc8c43`, GPL-3.0; native handshake qualification only.
- GBMicrotest: aappleby/gbmicrotest commit `463eb6bc0fe31d61781ef63060ad6d74090c0255`, MIT. These 50 engineering ROMs are not public domain and are not the bundled game library.
- Homebrew Hub database: gbdev/database commit `50293559a496a3e20382fbf6a2e84b70ec622f88`. The 50 bundled GB/GBC ROMs are selected only from entries declaring MIT, Zlib/ZLib, or BSD-3-Clause game licenses. Each local manifest preserves the exact metadata/content paths and upstream repository when supplied.
- nlohmann/json: v3.12.0 single-header distribution, MIT.
- libretro.h: sourced from the pinned SameBoy tree.

No commercial Nintendo ROM or Nintendo BIOS is bundled.
