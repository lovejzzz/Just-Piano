# Soundboard spectral smoothing and whitening (pass212)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

The independently calculated soundboard response now feeds the native-sized
FFT, magnitude extraction, reflected bidirectional smoothing and whitening.
This extends the same-run source-state replay; native spectra and whitening
outputs are comparison targets, never prediction inputs in the connected test.

## Recovered arithmetic

Smoothing reflects the N-bin input on both sides to form 3N bins, filters forward
and backward with zero initial state on each pass, then extracts the central N.
The first-order low-pass coefficients use double-precision tan before their
final float32 conversion. Rounding tan early breaks native equivalence.

Whitening adds 0.001 times the spectrum peak, smooths using binSpacing/width,
and computes a float32 sequential band mean around 3000 Hz. The lower band
index applies ceil before division; it is not a plain truncation. The gain
uses the native powf implementation and a cosine taper from 1000 to 3000 Hz.
The exponent uses float32 FMA. The alternative limiter flag adds a second
smoothing pass; this branch currently has synthetic coverage only.

The connected prefix derives FFT size from the trimmed nonzero span and
explicitly supports N=16384. It preserves native DC/Nyquist packing, the factor
of two, SIMD magnitude FMA versus scalar-tail operation order, and the
float32 frequency spacing derived from the source time interval.

## Actual native evidence

All three capture processes exited 0 with completed records and no capture
errors. Five or fewer read-only hardware breakpoints were used. The original
executable text is unchanged. No Pedalboard path is involved.

| Comparison | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Nine isolated smoothing outputs | 73,737 | 0 |
| Smoothing coefficients and initial-state words | 45 | 0 |
| Three isolated whitening outputs | 24,579 | 0 |
| Connected generated magnitude spectra | 24,579 | 0 |
| Connected generated whitening gains | 24,579 | 0 |

The native whitening profile has amount=0, width=500, flags=1 and bin spacing
2.691814661026001. Nonzero amount, fractional width and flags=0 have synthetic
checks, not claimed native validation. The connected run also revalidates raw
responses and leading-silence outputs against that same native process.

Negative controls update descriptor hashes so the numerical comparison is
actually exercised: one smoothing input change produces 468 differing outputs;
one smoothing target change produces exactly one mismatch without changing
prediction hashes. One connected whitening target change produces exactly one
mismatch with all prediction hashes unchanged. Changing channel 0's shaping
amount changes its gain prediction, leaves magnitudes and other channels
unchanged, and fails the independently checked parameter mapping.

Private captures: `pass212-smoothing-v1`, `pass212-whitening-v1`, and
`pass212-whitening-chain-v1` under the local analysis root. Negative controls
are in `pass212-negative-controls`. Raw arrays, audio, model configuration and
REA pseudocode remain private. REA decompilation of the coefficient setup
completed and its session closed with exit code 0.

```sh
node tests/soundboard-spectrum-smoothing.mjs
node tests/soundboard-spectrum-whitening.mjs
node scripts/pianoteq_replay_soundboard_smoothing.mjs PRIVATE_SMOOTHING_CAPTURE
node scripts/pianoteq_replay_soundboard_whitening.mjs PRIVATE_WHITENING_CAPTURE
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_CHAIN_CAPTURE
```

## Remaining boundary

This proves intermediate arithmetic from captured source matrices and
observation groups. Those model-derived structures are not independently
constructed yet. Outer spectral power, global/channel curve gains, complete
inverse reconstruction and resampling still prevent independent final IR
generation. Complete voice coupling, final stereo audio, all presets and
AudioWorklet integration remain open. The captured WAV is authentic native
output, but this pass does not claim independent final-audio equivalence.
