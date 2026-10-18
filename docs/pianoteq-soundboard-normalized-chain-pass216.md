# Complete observed shaping and normalization chain (pass216)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 binary
identified in pass212. Source configuration and raw model observations stay
private.

The connected source-state replay now compares the entire shaped response,
including the final reconstructed-span copy and outside zeros. It then feeds
that own shaped response into the pass210 normalization implementation. Native
shaped arrays are no longer prediction inputs to normalization in this replay.

The calculation runs from source-state propagation through raw observation
responses, conversion, trimming, paired filtering, empty-kernel blending,
leading-silence processing, FFT16384, whitening, spectral power, global/channel
curve gains, inverse FFT and time reconstruction. It copies the corrected span
into the original-length response, calculates the ordered absolute sum, derives
the rate-normalized coefficient with its floor, and applies the gain/mix path.

## Same-run evidence

The existing five-site read-only shaping capture collected fresh source state,
raw responses, shaping configuration, shaped output and normalized output. The
native process completed normally, exited 0, and recorded no errors. The source
JSON digest and sparse matrix paths bind to this same native run.

| Predicted native target | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Three entire shaped buffers | 22,953 | 0 |
| Three normalized buffers | 22,953 | 0 |
| Normalization coefficient metadata words | 3 | 0 |

Each output channel has 7,651 samples. Native normalization controls in this
profile are gain 0.00070821528788656, rate 44100, impulse mix 0. These controls
are captured configuration inputs, not recovered model-to-control mapping.
The reference arrays are only read for strict uint32 comparison. No tolerance,
time alignment or fitted gain is applied to make the comparison pass.

Negative controls change one normalized target sample with a valid updated
digest, then separately double the configured normalization gain. The target
change must produce one mismatch with prediction hashes unchanged. The gain
change must alter all three normalized predictions without changing shaped
predictions. These controls distinguish calculation from fixture substitution.

```sh
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_NORMALIZED_CHAIN
```

Private evidence is in `pass216-normalized-chain-v1` and
`pass216-negative-controls`. Actual native WAVs and intermediate captures remain
private. No Pedalboard or target writes are used.

## Remaining scope

This closes the observed fixed FFT16384, linear-curve, empty-blend-kernel
shaping profile through normalization. Other sizes, special curve modes and
nonempty blend kernels are not claimed. This does not remove captured source
matrices, observation geometry or commercial configuration dependencies.
Resampling from 44.1 to 48 kHz is still pending; final IR-node construction,
complete coupled voice, final stereo PCM, all presets and browser integration
remain incomplete. The research calculation has not replaced the approximate
AudioWorklet engine.
