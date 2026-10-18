# Upstream model configuration and lid gains in the full IR chain (pass233)

Date: 2026-10-17. The scalar builder from pass231 and curve-based lid gains from
pass232 now drive the complete response replay. The prediction no longer reads
the dispatcher's initialization configuration or gain-vector snapshot as inputs.
Those snapshots remain strict audit targets.

The upstream component record and preset state supply grid/excitation/propagation
controls, receiver plane/angle/separation/mirror controls, phase mode, bridge and
the lid curve. Model fields also supply the three shaping scalars, filter rate,
cutoff and adjustment scales, and normalization gain/rate. The supported
mode-zero producer supplies the constant zero impulse mix. The literal-model
source-position policy is explicit; other policies/families are not inferred.

## Native capture and validation boundary

Six read-only sites observe the selected model/preset source, propagation input
and raw completion, shaping input, normalized output and final dispatch. This
replaces the transient normalization-entry hook. Its three arguments are audited
against the dispatcher's configuration loads, which correspond to the native
normalization call arguments verified in earlier passes. The pre-normalization
shaped buffer is not captured in these runs; the independently reconstructed
and normalized result is checked against actual native normalized buffers and
their normalization metadata, then final dispatch/model nodes.

Three complete native source captures for the normal preset and three for the
partial-lid preset exit 0 without capture errors or pending resampling calls.
Each group checks 30 constructed words, five constructed bytes, four bridge
values and three lid gains, plus all newly model-derived scalar arguments.
All match bitwise. The complete calculation uses own grid, excitation, spatial
CG solution, matrices, receiver images, observation groups and spectral/time
processing; no native block cache or spectral target replaces the calculation.

| Profile | Final nine IR values | Bit differences |
| --- | ---: | ---: |
| Normal preset, lid position 1 | 70,464 | 0 |
| Partial lid, float32(0.37) | 76,032 | 0 |

For both profiles, final prediction hashes match an independently captured
single-process nine-node native model oracle. Source groups remain separate
native processes. The aggregate requires upstream scalar and lid-curve
construction when those inputs are supplied, alongside its previous matrix,
receiver and observation construction requirements.

## Dependency checks

Changing downstream configuration p, initialization p, one gain-vector target
and the recorded normalization gain produces the expected configuration/gain/
argument audit failures. Every predicted raw-through-final response stays
unchanged. Changing the upstream preset lid position by -2^-20 changes all six
raw responses (10,930 / 11,034 / 11,052 / 10,976 / 10,973 / 11,074 words) and
fails the old geometry/configuration/output targets. Both negative runs exit 1.
The latter is a raw-boundary dependency check; authentic full partial-lid native
verification uses the separate float32(0.37) preset captures above.

```sh
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_MODEL_GROUP_0 PRIVATE_MODEL_GROUP_1 PRIVATE_MODEL_GROUP_2
```

Private evidence: `pass233-model-chain-group0-v1` through `group2-v1`,
`pass233-nine-model-chain-audited.json`, `pass233-model-partial-lid-group0-v1`
through `group2-v1`, `pass233-partial-lid-nodes-v1`,
`pass233-nine-model-partial-lid.json` and `pass233-negative-controls`. Commercial
data, raw captures and native audio are not published.

## Remaining scope

Only the implemented scalar subset is constructed. Runtime rate/resampling
policy, blend controls, primary microphone configuration and later shaping
curve data still include captured sources. The model component records and
preset state themselves are still native observations: archive-to-record
construction remains required. Reports explicitly retain
fullDispatcherConfigurationComputed=false and fullModelToIrGenerationVerified=false.
Other model families/policies, complete coupled voice, final stereo PCM, all
notes/presets and browser AudioWorklet/persistence/performance acceptance remain
open. No merge, UI replacement or deployment occurs.
