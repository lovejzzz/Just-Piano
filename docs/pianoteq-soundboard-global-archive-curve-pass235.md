# Global spectral curve sourced from archive (pass235)

Date: 2026-10-17. The complete IR replay now uses the model archive's
`child108.curve78` directly for global spectral shaping when archive inputs are
enabled. Native curve headers and arrays remain strict audit targets only.
This extends the selected scalar/lid archive sourcing in pass234.

The native producer at `0x1001baa00`–`0x1001baa54` copies the component curve at
`R+0x180` to dispatcher configuration `C+0xf0`, including its three vectors,
dimension and mode bytes. The version-5 serialized child curve at offset
`0x78` supplies that component curve. For all three supported NY components,
its 13 frequency knots and 13 ordinates match the observed shaping curve
bitwise. Dimension 1 and ordinary mode/log-X zero also match. The independent
curve-gain implementation already handles the interpolation and smoothing;
this change replaces its input source, without substituting spectral targets.

The aggregate verifier now requires archive global-curve construction whenever
`--archive-inputs` is supplied. Each group audits 26 words and three metadata
fields. Native pointer values and allocation headers are not recreated.

Both full nine-response native comparisons pass again: 70,464 final values
for open lid and 76,032 for float32(0.37), with zero bit differences. Each
group's 26 curve words and metadata also match. These reuse the terminal,
error-free native runs and single-process node oracles documented in pass233.

Dependency controls on group zero distinguish input from audit data:

- Altering one native global-curve ordinate by `+0.125`, with its descriptor
  digest updated, reports one curve audit mismatch. Raw through final computed
  responses remain exact against the original native outputs.
- Altering the corresponding actual decoded archive ordinate by `+0.125`
  leaves the six raw propagation responses unchanged and changes
  8,112 / 8,142 / 8,311 final dispatch words. The curve and output targets fail.

Both negative controls terminate with exit status 1. Commercial values and
private evidence remain outside the repository. Evidence names:
`pass235-nine-archive-open.json`, `pass235-nine-archive-partial.json`,
`pass235-negative-global-target-result.json` and
`pass235-negative-global-input-result.json`.

Channel-specific shaping curves, whitening amount/flag vectors, global-curve
mix vectors, primary microphone configuration and rate/blend policy still
include captured inputs. Full model-to-IR independence, complete coupled
voice and final stereo audio equivalence remain unverified. These are IR
component checks, not an end-to-end audible piano reproduction claim.
