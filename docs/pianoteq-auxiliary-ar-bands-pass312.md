# Auxiliary AR detail bands, pass312

This pass completes the candidate detail-band calculation through AR filtering,
post-filter decay, energy normalization and dB gain. It does not remove a native
prediction input. Synthesis filters, final equalization, edge windows and peak
normalization still prevent this generator from replacing the observed kind1
waveform bank. Neither the stereo renderer nor AudioWorklet imports it.

## Arithmetic recovered from the immutable image

The general two-polynomial path in 2ca5f4 calls 33eac8 for the first
min(input length, max(polynomial lengths)) samples, then 1b8d84 for the rest.
The candidate supports numerator and denominator lengths of at least two,
matching the currently decoded NY detail records. Single-coefficient wrapper
specializations are explicitly rejected, rather than assumed equivalent.

Read-only REA decompilation of both helpers completes with evidence
`ev_f0117325ae49b4a358c4503e3f8e051ffc400402610a7ca4352da583d865b667`.
The immutable arm64 SHA is
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
Instruction inspection resolves fused operations that decompiler expressions
do not preserve. The REA session closes normally with exit 0; it launches no
native Pianoteq process.

33eb68 begins with a rounded b[0]*x[n]. Available previous input terms use
FMADD at 33eb98; previous output terms use FMSUB at 33ebd0. The full-history
body changes the forward sum: 1b8e98..1b8f14 and 1b8f58..1b8f74 multiply
four lanes separately, then add them in ascending coefficient order. Remaining
scalar coefficients use FMADD at 1b8fa4. Feedback remains sequential FMSUB at
1b8fc4. The unnormalized sum is flushed to positive zero below float32 1e-20,
then multiplied by the rounded reciprocal of a[0]. Initial history is zero.

`filterAuxiliaryAR` preserves this prefix/body distinction and uses the existing
correctly rounded float32 fused helper. A straightforward all-fused recurrence
is demonstrably different after the prefix on a synthetic 21/21 fixture.

The post-filter envelope follows 6560d4..656100, including the double 1e-15
comparison used to flush the next envelope value. Energy at 656148..656240
adds separately rounded squares in ascending sample order for complete groups
of four; the final one to three samples use FMADD. FSQRT and FDIV at
656248..65624c produce the band norm scale. That scale and the subsequent dB
gain are applied in separate rounded multiplication passes. The recovered
expf helper computes nonzero gain using the image's float32 logarithmic
conversion constant. Degenerate/non-finite energy or output is rejected by
the candidate instead of accepted as a valid waveform.

## Verification and its limits

`node tests/auxiliary-ar-filter.mjs` compiles a separate C float/fmaf reference
with contraction disabled except for explicit fmaf calls. All 28,672 output
float32 words match across seven numerator/denominator shapes, covering the
prefix boundary, full four-product groups and scalar remainder. The test also
checks the analytic impulse response, the strict flush threshold, empty input,
invalid coefficients, and failure of the all-fused alternative. This reference
checks hardware arithmetic against the recovered recurrence; it is not a
captured Pianoteq intermediate or real-audio acceptance test.

`node tests/auxiliary-wavelet-bands.mjs` checks the integrated pre/post envelope,
filter, normalization, isolated per-band coefficient edits, dB gain and explicit
invalid/degenerate input rejection. `tests/auxiliary-wavelet-noise.mjs` still
passes. No commercial coefficients are embedded in those tests.

A private fresh calculation from the current NY archive covers all 25
descriptors and 225 bands: 2,200,675 samples are finite. The audit records source
archive SHA, per-band energy/scale/gain, extents and generated sample hashes.
It explicitly records nativeIntermediateComparison=false,
finalWaveformComparison=false and integratedIntoStereo=false. Commercial
descriptors, generated samples and private analysis evidence are not committed.

## Remaining acceptance work

Complete and verify symmetric-boundary synthesis and the final EQ/windows/peak
stages before replacing any observed kind1 bank table. Compare every generated
waveform sample and then complete auxiliary and stereo audio without fitting,
alignment, cropping or tolerance relaxation. The pass310 native audio comparison
is unchanged; it does not validate this unintegrated module. No new real-audio
comparison is claimed here.

Runtime model/control profiles, cue controls, source publication and voice
scheduling, complete mechanical coupling, native repeat variability and a
capture-free same-run MIDI-to-stereo path remain open. Full keyboard, velocity,
pedal/preset coverage, AudioWorklet integration, sound-preserving parameter
save/reload and measured realtime performance also remain open.
