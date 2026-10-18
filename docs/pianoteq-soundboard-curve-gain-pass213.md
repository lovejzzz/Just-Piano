# Native soundboard curve gains (pass213)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 binary
identified in pass212. Original application text is unchanged; only read-only
hardware observations of the authorized debug copy were used.

`soundboard-curve-gain.mjs` computes the observed linear runtime curve branch
of the frequency gain builder. Runtime mode 2 extrapolates using the first or
last segment outside the knot interval. The interpolation rounds the new-row
product before fusing the old row. A single-output curve converts directly
from dB; a two-output curve first blends using the configured channel mix.
The dB conversion uses the recovered scalar expf implementation and exact
float32 coefficient, with an explicit zero-dB unity branch. The final gain
passes through pass212's reflected bidirectional smoothing.

Logarithmic X and special interpolation modes are rejected explicitly.
Two-output blending has synthetic coverage; the six native calls in this
profile all use one output. Constant and single-knot synthetic cases are
supported. No commercial curve knots are embedded in source code.

## Native validation

The isolated capture uses five hardware sites: curve entry, interpolation
completion, pre-smoothing output and the two known caller returns. It records
six calls, alternating global/channel curves across three channels. The process
exited 0 with no capture errors or pending calls.

| Independently computed stage | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Linear interpolation/extrapolation | 49,158 | 0 |
| dB-to-gain before smoothing | 49,158 | 0 |
| Final smoothed curve gains | 49,158 | 0 |

A separate same-run source capture uses six hardware sites. The existing replay
generates raw responses, conversion, trim, filtering, blending, leading-silence
processing and the spectral prefix from source-state observations. Curve gains
use the shaping object's captured curve configuration and controls, rather
than gain-call parameters or intermediate outputs. All six final gain arrays
(49,158 values) agree bit-for-bit. Independently derived call parameters also
match: source-derived bin spacing, global width 50, channel width 40, and
global channel mixes from the shaping blend vector. The one-output native
curves do not exercise the blend's effect on a two-output curve.

Negative controls with updated descriptor digests:

- Altering one curve knot produces 56 interpolation, 56 pre-smoothing and 112
  final-gain differences in the affected call; the other calls remain exact.
- Altering one final target produces exactly one mismatch; prediction hashes
  at every stage remain unchanged.

Synthetic checks cover extrapolation at both ends, two-output blending, exact
zero dB, constant curves, immutability, and unsupported-mode/input rejection.
The connected pass212 whitening replay remains a required regression.

```sh
node tests/soundboard-curve-gain.mjs
node scripts/pianoteq_replay_soundboard_curve_gain.mjs PRIVATE_CURVE_CAPTURE
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_CURVE_CHAIN
```

Private evidence directories are `pass213-curve-gain-v1`,
`pass213-curve-chain-v1` and `pass213-negative-controls`. Audio, knot arrays,
model configuration and raw observations stay outside Git.

## Still incomplete

This closes the observed curve-gain arithmetic, not the entire shaping function.
Applying the whitening and outer spectral power, combining gains into a
predicted inverse-FFT input, inverse reconstruction, final trimming and
resampling must still be connected and verified. Curve configuration and the
source matrices/observation groups still come from native observations.
Independent final IR nodes, complete voice coupling, final PCM, preset coverage
and browser integration remain incomplete.
