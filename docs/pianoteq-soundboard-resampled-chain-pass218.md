# Source-state to resampled soundboard responses (pass218)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 executable
identified in pass212. The authorized debug copy is observed read-only.

The same-run replay now computes all three soundboard responses through the
native 48-kHz resampling boundary. No captured raw response, block cache,
shaped response, normalized response, filter coefficient table, intermediate
spectrum or final resampled response feeds the prediction.

The remaining captured inputs are explicit: source sparse matrices,
observation geometry/groups, initial excitation configuration and shaping,
normalization and rate controls. This is a connected arithmetic reconstruction
from observed source state, not yet model-to-IR independence.

## Full observed computation

Source propagation produces six raw channels over 11,026 steps. The replay
computes conversion, common tail trimming, paired reference correction/filtering,
empty-kernel blending to three channels and leading-silence processing. Each
channel then receives independently generated FFT16384 coefficients and
butterflies, magnitude calculation, reflected smoothing/whitening, spectral
power and global/channel curve gains. The own inverse transform feeds quartic
decay correction, tail fade, amplitude restoration and copying into the
original response length. The own normalization output feeds a generated
160/147 Kaiser polyphase resampling plan and the exact mono application loop.

## Same-run native evidence

Six hardware sites capture source entry, completed raw responses, shaping
entry, normalization entry, resampling entry and its known caller return.
The process exited 0 with no capture errors and no pending resampling call.
Same-run source digest and matrix provenance checks pass.

| Comparison at observed boundaries | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Six raw responses | 69,522 | 0 |
| Three leading-silence outputs | 22,953 | 0 |
| Three entire shaped responses | 22,953 | 0 |
| Three normalized responses | 22,953 | 0 |
| Three final resampled buffers | 25,152 | 0 |

The normalization metadata also matches exactly. Each final buffer contains
8,327 computed frames plus zero padding to 8,384 samples. Neither prediction
nor comparison applies a fitted gain, tolerance or time alignment.

The initial connected verifier rejected this capture because its new resampling
block had been inserted before normalization. The stage order was corrected;
the failed verifier source is retained privately. Native capture was complete
and did not need restarting.

Negative controls change a final resampled target with its digest updated and
separately double the normalization gain input. The target change must produce
one mismatch with all prediction hashes unchanged. Changing gain must alter all
three resampled outputs while leaving earlier shaped outputs exact.

```sh
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_RESAMPLED_CHAIN
```

Private evidence: `pass218-resampled-chain-v1` and `pass218-negative-controls`.
Commercial data, raw arrays and native WAVs remain private. The capture uses
no Pedalboard path and does not modify target code, memory or registers.

## What this does not prove

This covers the observed three-response, fixed-size, linear-curve,
empty-blend-kernel profile. The full nine-node production/cache binding and
other branch profiles need additional verification. Source geometry and
model-derived sparse/observation construction still prevent fully independent
IR generation. Complete hammer/string/damper coupling, final stereo audio,
all notes/presets and AudioWorklet integration remain open. No merge or
deployment gate is reclassified by this intermediate success.
