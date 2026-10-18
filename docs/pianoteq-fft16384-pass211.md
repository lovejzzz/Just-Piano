# Native ordered FFT16384 and inverse (pass211)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

`dsp/real-fft-16384.mjs` now computes the native ordered real transform and
unscaled inverse using independently generated pass210 coefficients:

- Six radix-4 stages for the 4096-element four-lane core, preserving the
  existing recovered float32/FMA operation order.
- The native real-lane final combination and inverse precombination.
- A data-independent word permutation between four-lane storage and ordered
  packed real/imaginary output, including DC/Nyquist at output positions 0/1.

The permutation transposes even frequency bands and cyclically reverses odd
bands. REA and ARM64 inspection of `FUN_1002a6a58` confirm the real/nonalias
interleave and reverse-copy paths. No captured permutation table or sample-value
lookup is used by the implementation. Integer word copies preserve signed zeros
and payload bits when the permutation is tested independently.

## Strict native comparison

The pass210 native oracle contains three forward calls and three inverse calls
from the actual shaping function. Each independently supplied call input is
processed using own coefficients, butterflies and reordering. Native output is
read only after prediction and compared as uint32 bit patterns.

| Calls | Values compared | Mismatches |
| --- | ---: | ---: |
| 3 forward transforms | 49,152 | 0 |
| 3 inverse transforms | 49,152 | 0 |
| Total | 98,304 | 0 |

The inverse remains unscaled, as in the native function. No normalization,
alignment or tolerance is used to obtain a match. Plan shape, six radix-4
factors, direction order, capture digests and terminal status are checked.

Negative controls:

- Modifying one forward input produces 16,377 mismatches in that transform;
  the other five independently supplied calls remain unchanged.
- Modifying one expected output produces exactly one mismatch and leaves all
  prediction hashes unchanged.

Synthetic checks cover impulse response, packed Nyquist, unscaled inverse,
input immutability, a full 16,384-word permutation bijection including arbitrary
bit patterns, and explicit unsupported-size/non-finite-input rejection.

## Existing-size regression

Shared stage functions retain their existing paths. Native-fixture replays:

| Existing check | Calls | Comparisons | Mismatches |
| --- | ---: | ---: | ---: |
| Forward FFT128, coefficients/core/output | 64 | 32,768 | 0 |
| Inverse FFT128, precombination/core/output | 64 | 32,768 | 0 |
| Forward FFT1024, worker output spectra | 129 | 132,096 | 0 |

The convolution-initialization guard test also passes. No previous PCM success
or failure is reclassified by these regression checks.

## Reproduction and remaining scope

```sh
node tests/real-fft-16384.mjs
node scripts/pianoteq_replay_fft16384.mjs PRIVATE_FFT_CAPTURE
```

Private native source: `pass210-fft16384-v2` under the local analysis directory.
Results, negative controls and regressions are in `pass211-fft` and
`pass211-fft-negatives`. The read-only REA reorder session completed its query
successfully and closed with exit code 0; raw pseudocode remains private.

This implements a fixed N=16,384 real profile. Other FFT sizes are not silently
routed through it. Each inverse oracle starts from its captured input spectrum;
the surrounding shaping computation has not yet generated that spectrum.
Spectral smoothing, nonlinear magnitude operations and curve gains remain to
be implemented and connected to normalization/resampling. Model-derived matrix
and observation construction, final nine IR nodes, complete voice, final stereo,
all presets and browser equivalence remain incomplete.
