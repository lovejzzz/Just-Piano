# Connected soundboard shaping through inverse FFT (pass214)

Date: 2026-10-17. Immutable target is the same Pianoteq 9.2.5 ARM64 binary
identified in pass212. Capture is read-only on the authorized debug copy.

The replay now computes the complete spectrum supplied to the soundboard
shaper's inverse FFT, then computes that inverse transform itself. It begins
with the same-run source matrices, controls and observation groups and runs
state propagation, raw responses, conversion, trim, filtering, blending,
leading-silence processing, FFT, magnitude extraction and whitening. It then:

1. Applies the independently calculated whitening gain to complex bins and
   their magnitudes, retaining float32 operation order.
2. Calculates the peak of the weighted magnitude spectrum before removing DC.
3. Removes DC, adds peak times float32 1e-6 to the remaining magnitudes, and
   applies native powf with exponent float32(power minus 1).
4. Applies global and channel curve gains from independently interpolated
   shaping configuration.
5. Restores the packed Nyquist word with the native factor of two, applies the
   half scale to the ordered spectrum, and runs the own unscaled FFT16384 inverse.

No native intermediate FFT input, output, magnitude, whitening array or curve
gain array feeds prediction. These arrays are only strict comparison targets
when available. Configuration knots, source matrices and observation groups
are still native observations; this is not model-independent IR generation.

## Same-run native validation

The new capture uses five hardware sites: source entry, completed raw responses,
shaping entry, the FFT entry filtered to the known inverse call, and its return.
All three inverse calls completed, no pending call or capture error remains,
and the process exited 0. Original executable text was verified unchanged.

| Generated target | Values | Bit mismatches |
| --- | ---: | ---: |
| Three inverse FFT input spectra | 49,152 | 0 |
| Three unscaled inverse FFT outputs | 49,152 | 0 |
| Total | 98,304 | 0 |

Raw response and leading-silence target comparisons also pass in this same
run. There is no alignment, tolerance, normalization or output substitution in
the comparison. No Pedalboard path is used.

Synthetic checks cover gain order, DC removal, Nyquist restoration, unity
exponent, immutability and malformed-profile rejection. Negative controls
alter an inverse-input target with updated digest, then independently alter
the shaping power input. The target mutation must produce exactly one input
mismatch with all prediction hashes unchanged. The power mutation must change
all three predicted spectra and inverse outputs while leaving earlier leading
responses exact. The pass213 connected curve replay is also retained as a
regression.

```sh
node tests/soundboard-inverse-spectrum.mjs
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_INVERSE_CHAIN
```

Private evidence: `pass214-inverse-chain-v1` and `pass214-negative-controls`
under the local analysis root. Raw arrays, audio and configuration remain
private.

## Remaining boundary

The computed inverse output is the unscaled transform return, before later
time-domain reconstruction, clipping/trimming, normalization and sample-rate
conversion. Those stages still need connected native validation. Source
geometry-to-matrix construction and the final nine IR nodes remain incomplete.
This does not establish complete hammer/string/damper coupling, independent
final stereo PCM, all-preset equivalence or AudioWorklet integration.
