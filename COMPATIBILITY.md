# Compatibility and qualification

| System | Content recognition | Provider | Qualification |
|---|---|---|---|
| GB/GBC | .gb/.gbc, header bounds | SameBoy | Native GB frame/state/corpus tests executed; GBC catalog compatibility not established |
| SNES | .sfc/.smc | bsnes-libretro | Core compiled and handshake checked; commercial-title behavior and semantic profiles unqualified |
| NES/Famicom | iNES/.nes | Not bundled | Explicit no-provider error |
| GBA, N64, DS, 3DS, GameCube, Wii, Wii U, Switch | Filename classification where configured | Not bundled | Unsupported |

A recognized extension is not proof of compatibility. Pass the appropriate installed core and --system snes for SNES. Unknown semantic state is reported as unavailable. No claim that all Nintendo files run is made.

The 50 GBMicrotest cases completed with 49 PASS and 1 FAIL on the recorded SameBoy DMG configuration. halt_op_dupe_delay.gb reported actual=1, expected=85, marker=255. This is an emulator oracle failure, not a host error. The original suite targets a DMG-CPU-08; the selected provider model is DMG B. The report retains exact core binary identity. Requalification requires the recorded source commits, settings and ROM hashes.
