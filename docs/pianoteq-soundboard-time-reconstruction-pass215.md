# Connected soundboard time reconstruction (pass215)

Date: 2026-10-17. The immutable target remains the Pianoteq 9.2.5 ARM64 binary
identified in pass212. Five earlier spectral stages now feed time reconstruction
without using native inverse-transform outputs as prediction inputs.

## Recovered computation

After the independently computed inverse FFT, the shaper scales by 1/N. The
original time buffer and inverse buffer have N+2 words; the two extended packed
words lie outside the inverse transform itself and are still scaled.

For a nonzero span L with L+5 at least 20, the head/tail window is floor((L+5)/10)
samples. Absolute sums accumulate sequentially in float32. The tail starts at
index L, including its padding word, then proceeds backward. Four sums form the
float32 ratio (originalTail/originalHead)/(inverseTail/inverseHead).

For sample i the correction is float32(ratio raised to
(float32(i times float32(1/(L-1))))^4),
with the native two double pow calls and their actual argument rounding. This
multiplies the scaled inverse response. The last window+1 samples then receive
an expf fade from unity to approximately -20 dB. Intermediate multiply,
division, log(10) coefficient and final conversion preserve native float32
ordering. A final gain restores the original whole response's ordered absolute
sum; the shaped denominator has the observed float32 1e-10 floor. The corrected
span is copied back into the original-length buffer, preserving outside zeros.

Short spans skip the decay correction/fade branch. Undefined nonpositive decay
ratios are rejected explicitly, not silently repaired or accepted as validated.

## Same-run native evidence

A six-hardware-site capture records source state, completed raw responses,
shaping configuration, head/tail sums, correction weights, and the final span
immediately before its native copy. It completed all three channels without
errors and exited 0. No target memory, code or registers are modified.

The connected replay computes state propagation, raw responses, conversion,
trim, filtering, blending, leading-silence processing, forward FFT, magnitudes,
whitening, outer power, curve gains, inverse FFT and reconstruction itself.

| Comparison | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Padded original time buffers | 49,158 | 0 |
| Scaled inverse time buffers | 49,158 | 0 |
| Decay correction weights | 22,541 | 0 |
| Final reconstructed spans | 22,541 | 0 |
| Head/tail sum metadata | 12 | 0 |

The three native spans contain 7,444, 7,471 and 7,626 samples. No native
reconstruction weights, inverse samples, target spans, or sum metadata feed
prediction. Native descriptors are read only for comparison. Source matrices,
observation groups and configuration curves are still captured inputs.

Synthetic tests cover the padding-inclusive tail index, unity correction,
quartic weighting path, fade endpoints, amplitude restoration, short spans,
immutability and invalid input/ratio rejection. Negative controls change one
final target sample and separately a channel curve input. The target mutation
must produce one mismatch without changing prediction hashes; the curve
mutation must change the affected channel's reconstruction while preserving
other channels and the original time buffer.

```sh
node tests/soundboard-time-reconstruction.mjs
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_RECONSTRUCTION_CAPTURE
```

Private evidence: `pass215-reconstruction-v1` and `pass215-negative-controls`.
Commercial configuration, raw arrays, pseudocode and audio remain outside Git.

## Remaining scope

The complete buffer after native copy and subsequent normalization still need
connected comparison. Resampling and final IR-node construction remain open,
as do model-derived source geometry/matrices, complete hammer/string/damper
coupling, final stereo audio, all presets and browser integration. Matching
these time fragments is not proof of final audio equivalence.
