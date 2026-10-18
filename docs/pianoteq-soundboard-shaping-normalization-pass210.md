# Shaping capture, FFT coefficients and normalization (pass210)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

## New same-run evidence

The shaping probe captures source matrices and excitation, completed raw
responses, the shaping function's inputs/outputs, and normalization outputs.
It uses five read-only hardware breakpoints and captures all worker records at
the completed-buffer boundary, avoiding per-worker concurrent breakpoint stops.
No native block cache is read for prediction.

The successful `pass210-shaping-v3` process exits with status 0 and no capture
errors. The complete upstream replay produces the shaping input independently:
all six raw responses and all three shaping-input responses match exactly.
The matrix, observation and wrapper configuration sources remain captured.

The native shaping scalar inputs are 0.5, 500 and 50. This is an active
frequency-domain/nonlinear path. It cannot be treated as an identity stage.
Three shaped outputs and their normalized outputs were captured for the same
run; each contains 7,651 samples.

Failed v1/v2 shaping attempts are retained. The first recorded no target hits;
the second stopped on an unowned debugger exception and was not resumed past
that condition. Forwarded callbacks now have checked registrations, and the
successful probe removes the worker-entry breakpoint entirely.

## Independent normalization

`dsp/soundboard-response-normalization.mjs` recovers the ordered float32 absolute
sum, sample-rate division, normalization floor, gain scale and optional impulse
mix. Native metadata at each response's `+0x60` is used only as a comparison.

The isolated normalizer consumes the captured shaped responses explicitly;
the shaping computation is still missing. Native comparison results:

| Check | Result |
| --- | --- |
| Output values | 22,953 / 22,953 bit-identical |
| Normalization metadata scalars | 3 / 3 bit-identical |
| Native impulse mix | 0 |
| Captured shaped inputs still required | true |

Increasing gain by 1% changes all three predictions and produces 22,541 output
mismatches. Mutating one expected normalized sample produces one mismatch and
leaves every prediction hash unchanged. These controls remain private in
`pass210-normalization-negatives/`. Nonzero impulse mix and the floor branch
have synthetic tests but no native positive case in this fixture.

## FFT16384 setup coefficients

A second probe uses three hardware sites around the exact shaping FFT call
sites. It captures three forward and three inverse calls, including setup,
inputs and outputs, with ownership checks at the return addresses. The
successful `pass210-fft16384-v2` process exits normally with no capture errors.

The native real setup is N=16,384, Ncvec=2,048, scalar core=4,096 with six radix-4
factors. The first FFT capture's incorrect Ncvec assertion is retained as a
failure; the setup constructor proves real Ncvec=N/8.

`dsp/real-fft-16384-coefficients.mjs` generates the coefficients using recovered
float arithmetic and native scalar sin/cos, without reading captured tables.
For each of the six captured plans:

- all 12,288 final-combination coefficients match bit for bit;
- all 4,062 twiddle positions read by the radix stages match bit for bit;
- 34 unused twiddle positions are excluded and not claimed as modeled.

That is 16,350 verified coefficient positions per plan. **The FFT transform
outputs themselves have not yet been independently reproduced.** The forward
and inverse input/output oracles now exist to verify that next step.

## Reproduction and remaining work

```sh
node tests/soundboard-response-normalization.mjs
node tests/real-fft-16384-coefficients.mjs
node scripts/pianoteq_verify_soundboard_normalization.mjs PRIVATE_SHAPING_CAPTURE
node scripts/pianoteq_verify_fft16384_coefficients.mjs PRIVATE_FFT_CAPTURE
```

Private evidence is under `~/.local/share/just-piano-analysis/`, specifically
`pass210-shaping-v3`, `pass210-fft16384-v2` and `pass210-shaping-rea`. REA's two
read-only batches succeeded for all eight requested functions; its session
closed with exit code 0. Raw decompilations and commercial data are not in Git.

Next: reproduce ordered FFT16384 and inverse output, then spectral smoothing,
nonlinear magnitude shaping and curve gains. Connect that output to the verified
normalizer and resampling path. Matrix/observation construction from the model
also remains open. `shapingComputed`, `fullIrNodesGenerated`, complete voice,
final stereo, all-preset equivalence and browser integration remain false.
