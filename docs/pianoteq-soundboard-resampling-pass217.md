# Rational soundboard resampling (pass217)

Date: 2026-10-17. Immutable target remains the Pianoteq 9.2.5 ARM64 executable
identified in pass212. This implements coefficient generation and the observed
mono resampling arithmetic without a captured filter table.

REA decompilation of the resampling wrapper, rational-plan builder, FIR design
and window routines was checked against ARM64 instructions. The implementation
uses nearest-integer continued fractions with the native 1e-5 stopping test.
It designs a low-pass impulse with float32-selected cutoff and a double-precision
Kaiser window (beta 10), using the native real-axis I0 power series. Coefficient
construction retains the window-times-numerator multiplication before the FIR
product. It then pads and transposes the impulse into polyphase float32 storage.

The mono application starts at half the filter length in upsampled units,
convolves backward over source samples, and advances by the rational denominator.
The native vector portion rounds each product before sequential addition;
the scalar remainder uses float32 FMA. The output frame count truncates the
double-precision rational length calculation. Storage rounds upward to 64
samples and the remaining words are zero-filled.

## Actual native evidence

The four-site read-only capture observes plan entry/completion and the known
mono call/return. It completed the three channels without errors and exited 0.

The native profile has ratio float32(48000/44100), quality 10, rational factors
160/147, filter length 3201 and 21 taps per phase. All these plan dimensions are
computed from the input ratio/quality; native metadata is only checked afterward.

| Independently generated target | Float32 values | Bit mismatches |
| --- | ---: | ---: |
| Polyphase coefficients | 3,360 | 0 |
| Three resampled mono outputs | 25,152 | 0 |

Each 7,651-sample input produces 8,327 computed frames in an 8,384-word buffer.
No native coefficient array is used for prediction. This isolated replay still
starts from captured normalized input responses; connecting the already-own
normalization outputs is the next step.

Negative controls update descriptor digests: one coefficient-target change
produces one coefficient mismatch and leaves all predicted outputs exact.
Changing one input sample changes 22 output words in the affected channel;
the other two channels and coefficient prediction remain exact.

Synthetic tests cover rational factors, exact identity copying including signed
zero, impulse alignment, output padding, empty/zero input and rejected inputs.
Only mono resampling and the captured 160/147 profile have native output proof;
other ratios and identity cases have synthetic coverage. Filter/ratio resource
bounds are explicit, and unsupported plans are rejected.

```sh
node tests/soundboard-resampling.mjs
node scripts/pianoteq_replay_soundboard_resampling.mjs PRIVATE_RESAMPLING_CAPTURE
```

Private evidence: `pass217-resampling-v1`, `pass217-negative-controls` and the
read-only `pass216-resampling-rea` session (closed successfully). Audio, native
buffers and raw pseudocode remain outside Git. No Pedalboard or target writes
were used.

This does not yet prove independent final IR nodes, model-derived source
matrices, complete coupled voice, final stereo PCM, all presets or browser
integration.
