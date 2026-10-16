# Native scalar expf arithmetic, pass 21

`dsp/native-scalar-exp.mjs` exports `nativeScalarExp(value)`. It rounds its input to binary32, then reconstructs the inspected macOS arm64 scalar `expf` algorithm using binary64 fused operations. It has no native-library, target-process, or browser `Math.exp` dependency. This is a scalar math component, not proof of complete piano audio fidelity.

## Independent system-library observation

An independent C process uses `dlsym(RTLD_DEFAULT, "expf")` and `dladdr`, then reads its own mapped system-library bytes. It neither attaches to Pianoteq nor reads its application code. The inspected host is macOS 26.5.1, build 25F80, arm64. The symbol belongs to `/usr/lib/system/libsystem_m.dylib`, image offset `0x5ac0`. A local read-only disassembly identifies the following arithmetic:

1. For finite `|x| < 128`, promote binary32 input to binary64. Form `z = FMA(184.6649652337873, x, 6755399441055744)` and `n = z − 6755399441055744`. The large shift supplies ties-to-even integer rounding.
2. Compute `r = FMA(184.6649652337873, x, −n)`. Select one of 128 binary64 table entries using the low seven bits of `z`. Construct the scale by adding `bits(z) << 45`, modulo 64 bits, to that entry.
3. Compute `p = FMA(C2, r, C1)`, then the ordinary binary64 product `p*r`, followed by `FMA(p*r, scale, scale)` and one binary32 rounding. `C2` has binary64 word `3eeebfbdff30d656`; `C1` is `3f762e4453e10dae`.
4. For `|x| >= 128`, the native branches already resolve to zero for negative inputs and infinity for positive inputs. Infinity and NaN follow their corresponding result classes.

The mathematical table consists of binary64 approximations to `2^(j/128)`, with `j << 45` subtracted from each raw word for exponent reconstruction. The repository contains these numerical constants and an independent arithmetic implementation. Observed machine-code bytes remain private.

Private evidence under `~/.local/share/just-piano-analysis/pass21-scalar-exp/` includes `probe.c`, `probe`, `expf.bin`, `table.bin`, the temporary disassembly object, `oracle.c`, `oracle`, `provenance.json`, and `replay.json`. Provenance hashes for the relevant observed byte ranges:

| Range | Bytes | SHA-256 |
|---|---:|---|
| Symbol, including inline constants | 180 | `c81eb35d0ba0ae459992ca695b66a4a68d2d8971a43672bdcc1f527e26725da9` |
| Polynomial constants and 128-entry table | 1040 | `e8ed30122c77d95f6109536236ffc64a71058be5656623e2eb65d58cef8f40fd` |

## Authentic return comparison

The separately captured `debug-pass21-pitch-exp/runtime.json` contains 64 actual scalar returns: 32 held and 32 released blocks. Its input is reconstructed as `f32(-controls['0x25c'] * time)`. All 64 reconstructed outputs match their observed binary32 return words. The existing vector exponential and a `Math.exp` wrapper do not supply this same contract.

The replayer also compares against an independent C executable calling the host system `expf`. The deterministic 60,461-input suite covers raw binary32 words across the full exponent space, neighbors of zero, subnormal and overflow boundaries, ±128, infinities and NaNs, and adjacent values around range-reduction ties. It has zero mismatches. The 168 NaN results are checked by classification; JavaScript does not promise stable NaN payload bits. Floating-point exception flags and errno are also outside the browser interface.

```sh
clang -O0 -fno-builtin-expf scripts/pianoteq_scalar_exp_oracle.c -o /tmp/piano-scalar-exp-oracle
node scripts/pianoteq_replay_scalar_exp.mjs \
  --capture "$HOME/.local/share/just-piano-analysis/debug-pass21-pitch-exp/runtime.json" \
  --oracle /tmp/piano-scalar-exp-oracle \
  --output "$HOME/.local/share/just-piano-analysis/pass21-scalar-exp/replay.json"
```

The oracle reads hexadecimal binary32 words from stdin and writes hexadecimal result words. Its body calls `expf` on a `volatile float` and uses `memcpy` for word conversion; build with `clang -O0 -fno-builtin-expf`. No Pianoteq payload is linked or executed by that executable.

This matches the inspected system algorithm. A different OS math-library version may have different last-bit results. The test is broad evidence, not an exhaustive enumeration of every binary32 input. Upstream physical control producers and complete audio rendering require separate validation.
