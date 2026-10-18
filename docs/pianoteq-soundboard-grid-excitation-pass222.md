# Grid, boundary and excitation construction (pass222)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 executable
identified in pass212. Raw configuration and native observations remain private.

Independent modules now calculate the grid and boundary state initialized before
propagation, plus its differentiated Gaussian excitation. Input consists of
configuration scalars and four bridge coordinates; native index/state arrays
are comparison targets only.

Grid spacing follows the stability bound with the native double coefficient
and float32 products/square root. Grid counts use nearest rounding, not the
truncation suggested by decompiled casts. Boundary classification preserves
the native x-major insertion order and float32 FMA test. Bridge coordinates are
quantized/interpolated in the observed order. The excitation position is the
first bridge entry nearest the configured source row.

The excitation builder clamps width to at least two time intervals, calculates
a Gaussian with the native mixed float/double amplitude normalization and
scalar expf, appends zero, and differentiates using float32 inverse interval.
Its scalar tail preserves the fused coordinate subtraction. Unsupported
reversed/non-descending bridge configurations and resource bounds are explicit.

## Native verification

A four-site read-only capture observes grid entry/completion and excitation
entry/completion for all three source groups. Every call completed without
errors, the pending state is clear, and the process exited 0.

| Independently computed target | Words compared | Mismatches |
| --- | ---: | ---: |
| h, tau, grid counts and state size | 15 | 0 |
| Boundary scale and excitation index | 9 | 0 |
| Active grid indices | 3,258 | 0 |
| Inactive grid indices | 1,242 | 0 |
| Bridge indices | 114 | 0 |
| Differentiated excitation samples | 12 | 0 |

Native excitation arguments also match their configuration-derived values.
All three grids contain 29×49 cells and 1,500 states, with 1,086 active indices,
414 inactive indices and 38 bridge indices. The source positions select indices
620, 650 and 680. These are outcomes of the calculation, not embedded index tables.

Negative controls with updated digests: a target-index mutation produces one
mismatch with all prediction hashes unchanged; a source-position change moves
only the predicted source index; an amplitude-input change changes all four
excitation samples and fails the independently derived argument check. Other
groups remain exact.

Synthetic checks cover complete/disjoint grid partitions and order, nearest
bridge selection, both stability methods, the alternate boundary branch,
narrow and wider excitations and input rejection. Native proof currently covers
the three configurations in this fixture; synthetic branches are not counted
as native coverage.

```sh
node tests/soundboard-grid.mjs
node scripts/pianoteq_replay_soundboard_geometry.mjs PRIVATE_GEOMETRY_CAPTURE
```

Private evidence: `pass222-geometry-v1`, `pass222-negative-controls` and the
completed read-only REA evidence under `pass219-geometry-rea`.

Sparse matrix construction and observation-record construction remain open.
The new initialization still needs connection to the full nine-response chain;
no complete voice, final stereo audio, preset or browser gate changes here.
