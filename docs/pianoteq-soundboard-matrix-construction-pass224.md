# Configuration-derived sparse matrices (pass224)

Date: 2026-10-17. Immutable ARM64 target and private evidence policy follow
pass223. Five read-only hardware breakpoint sites record three complete matrix
construction calls; the native process exited 0 without pending calls or errors.

The independently generated active grid gives a 1086-square reduced Laplacian.
The native solver solves L x = -1 using conjugate gradients, starting from zero.
It does not compute an eigenvector. All three observed groups use 105 updates
and 106 convergence checks. The stopping comparison uses the float32 residual
norm widened to double and the RHS norm times the widened float32 1e-7 tolerance.
The final residual norm is 0.0000028244255645404337.

The solution is divided by its peak absolute value and scattered onto the
1500-element grid. The local multiplier is baseScale *
((contrast - 1) * shape + 1) / contrast, with the recovered float32 operation
order and FMA. Bridge rows additionally receive
(baseScale + bridgeScaleAdd) / baseScale. C retains active rows of the scaled
full Laplacian. A multiplies the scaled Laplacian by C and retains active rows.
Inactive columns in active rows remain present.

Rounding matters: CG sparse products use FMA; matrix-matrix products use a
separately rounded float32 multiply followed by a float32 add. An initial FMA
implementation failed 2261 A coefficients; the corrected instruction order
passes without changing any tolerance or target.

| Comparison, per group | Values/entries | Bit differences |
| --- | ---: | ---: |
| Initial/RHS/final solution/shape plus first five iteration traces | 26,478 | 0 |
| Reduced Laplacian | 5,278 | 0 |
| A | 13,948 | 0 |
| C | 5,430 | 0 |

Every matrix row length, column index and coefficient is checked. Iteration
traces compare solution, preconditioned residual, residual and matrix product;
the capture's historical `p` label means preconditioned residual, not direction.
All three groups pass. Configuration and bridge coordinates are inputs; native
matrices, solution and spatial shape are comparison targets only.

Negative controls: mutating one captured solution word fails its comparison
while leaving all predicted matrices unchanged. Changing configuration contrast
leaves CG unchanged but changes all 13,948 A and 5,425 C coefficients and fails
the native argument audit. These are intentional failed verification runs.

```sh
node tests/soundboard-matrix-construction.mjs
node scripts/pianoteq_replay_soundboard_matrices.mjs PRIVATE_MATRIX_CAPTURE
```

Private evidence: `pass224-matrix-solver-v1/replay.json`,
`pass224-negative-controls`, `pass224-sparse-rea`. REA queries cover the matrix
builder, CG loop/termination and sparse multiplication kernel. This closes
matrix construction only for the observed configuration profile. It does not
establish independent observation-group construction, full model loading,
complete coupled voice, all presets or final browser audio.
