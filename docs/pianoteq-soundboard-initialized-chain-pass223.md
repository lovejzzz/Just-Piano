# Configuration-derived initialization in the nine-response chain (pass223)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 executable
identified in pass212. Commercial configuration, matrices and raw native audio
remain private.

The nine-response calculation now uses pass222's own initialization rather than
captured propagation-state h/tau, state size, excitation samples or excitation
index. Propagation T/p/q/r and conversion mode/speed are also read from the
observed configuration layout and independently checked against the native
call arguments. The density coefficient follows the dispatcher's fixed float32
literal. Boundary/index arrays are calculated, but sparse matrix construction
still consumes native matrices.

## Connected native evidence

Fresh six-site read-only captures select each of the three source groups. At
the selected source entry they record geometry configuration and bridge
coordinates, in addition to the existing matrix/observation configuration and
downstream comparison targets. All three processes exited 0 without capture
errors or pending calls.

The aggregate verifier reruns configuration initialization and the entire
response chain for all three groups, checks same-run source provenance, and
compares each final prediction's byte digest with the nine-node native oracle
from pass219. Every predicted array also passes its same-run strict native
dispatcher comparison.

| Final response group | Values compared | Bit mismatches |
| --- | ---: | ---: |
| Nodes 0–2 | 25,152 | 0 |
| Nodes 3–5 | 22,656 | 0 |
| Nodes 6–8 | 22,656 | 0 |
| Total | 70,464 | 0 |

The report explicitly requires configuration initialization when its inputs are
present. All three groups report initializationComputed=true,
sourceExcitationUsedForPrediction=false and sourceGridScalarsUsedForPrediction=false.
The geometry/configuration controls are still captured inputs. Each source
group is captured in a separate process; the nine-node comparison oracle comes
from one process. This distinction remains explicit.

## Dependency negative controls

- Mutating captured source h, tau, p, excitation samples and excitation index
  produces four initialization-audit failures, while every raw, shaped,
  normalized and final response remains bit-identical. Those fields no longer
  drive prediction.
- Doubling the configuration's excitation-amplitude control changes every raw
  response and all three final channels. The corresponding captured argument
  audit fails as expected.

The pass222 isolated geometry replay also passes after extending the control
mapping. No native state arrays replace the new calculations, and no tolerance,
alignment or fitted gain is used.

```sh
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NINE_NODE_CAPTURE PRIVATE_INITIALIZED_GROUP_0 PRIVATE_INITIALIZED_GROUP_1 PRIVATE_INITIALIZED_GROUP_2
```

Private evidence: `pass223-initialized-group0-v1` through
`pass223-initialized-group2-v1`, `pass223-nine-initialized-audited.json` and
`pass223-negative-controls`.

## Remaining dependency

Model-to-IR independence remains false: sparse A/C coefficients, observation
groups and later shaping/normalization configuration are still captured. The
next construction targets are the sparse-matrix and observation builders, using
the now-own grid and boundary indices. Other model branches, complete coupled
voice, final stereo PCM, all notes/presets, browser integration and persistence/
performance acceptance remain open. Nothing has been merged or deployed.
