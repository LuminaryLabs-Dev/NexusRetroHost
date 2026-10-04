# Compatibility and qualification

| System | Content | Core | Native | Web/WASM | State |
|---|---|---|---|---|---|
| Game Boy | .gb | SameBoy | release gate | release gate | frame/history + profile observations |
| Game Boy Color | .gbc | SameBoy | release gate | release gate | frame/history + profile observations |
| SNES | .sfc/.smc | bsnes-libretro | handshake-qualified only | not in current release | unqualified |
| Other Nintendo systems | recognized only where documented | not bundled | unsupported | unsupported | unsupported |

The current web release contains exactly 50 bundled GB/GBC homebrew titles. Every bundle manifest pins the Homebrew Hub source commit, declared permissive license metadata, ROM byte size and SHA-256 identity.

The separate 50-ROM GBMicrotest engineering corpus remains unchanged. Its recorded native SameBoy result is 49 PASS / 1 FAIL with no host error; that corpus is not counted as the bundled game library.

A recognized file extension is not proof of compatibility. Commercial Nintendo content is not bundled.
