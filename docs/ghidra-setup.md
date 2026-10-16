# Local REA / Ghidra setup

Installed Ghidra 12.1.4 from the official NSA GitHub release:
https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build

Archive: `ghidra_12.1.4_PUBLIC_20260921.zip`.
SHA-256 matched GitHub's asset digest:
`ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`.

Installation: `~/.local/share/ghidra/ghidra_12.1.4_PUBLIC`.
Uses existing Homebrew OpenJDK 21.0.11. The archive lacked the macOS native decompiler. Built the supplied source using:

```sh
make -j4 ghidra_opt ARCH_TYPE='-arch arm64' OSDIR=mac_arm_64
```

Installed the result as `Ghidra/Features/Decompiler/os/mac_arm_64/decompile`.
REA doctor confirmed its executable header is Mach-O arm64, Ghidra is 12.1.4, and the full JDK matches the host. All explicitly requested Ghidra scope checks passed. Other unconfigured optional providers/client registrations are unrelated to that result.

## Repeatable entry point

```sh
scripts/rea-local.sh doctor --provider ghidra --format json
scripts/rea-local.sh --mcp
```

The wrapper pins REA 6.5.0, sets Ghidra/JDK paths, grants a 4 GB JVM heap, and allows 15 minutes for initial analysis. It configures this project's CLI/MCP launch; it does not register a global Codex MCP server or require an app restart.

## Target isolation

Ghidra's REA adapter cannot select a slice of a universal Mach-O. `lipo -thin arm64` produced a separate analysis copy at:
`~/.local/share/just-piano-analysis/Pianoteq9-arm64`.

Derived copy SHA-256:
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

Pianoteq's installed executable and preset files are unchanged. Local binary copies and full raw analysis outputs stay outside the source repository in `~/.local/share/just-piano-analysis/`. REA owns a temporary, read-only Ghidra project and deletes it on normal closure. Reports preserve address and evidence references so observations can be checked against the same target digest.

## Verified analysis and saved evidence

REA opened the ARM64 target successfully and returned function pseudocode, cross-references, raw bytes and assembly. Initial analysis reported invalid-PNG and several VarnodeContext warnings; selected call sites were checked against assembly because pseudocode omitted floating-point arguments. Successful analysis is not a guarantee that every recovered function or type is correct.

The session was closed normally after exporting `~/.local/share/just-piano-analysis/evidence-bundle.json` (41 records, 7,843,103 bytes) and `analysis-snapshot.json` (41 evidence records, 7,844,794 bytes). Zero workflow entries in the snapshot means it is an evidence snapshot, not a persistent Ghidra project. The individual response files preserve additional raw outputs. Future function analysis reopens the derived ARM64 executable.

The isolated Pianoteq JSON-RPC probe was quit through its own loopback endpoint, and its process exited with status 0.
