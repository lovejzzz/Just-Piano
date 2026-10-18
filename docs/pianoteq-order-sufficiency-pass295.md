# Native render-order sufficiency through complete PCM, pass295

For one complete native pair, changing only the observed voice contribution
order is sufficient to reproduce the complete PCM difference exactly. This
does not establish a unique internal cause, explain every native variation, or
remove the independent engine's scheduling/control/profile dependencies.

## Complete single-site target capture

The first attempt repeats the accepted full collector with frozen identical
helpers and render arguments. Native PID32311 stops after854 global blocks and
2,325 voice blocks at an unowned EXC_BREAKPOINT, subcode10051fad4. Its runtime
stays terminal:false despite wrapper exit0. The stop is not resumed. Logs and
partial streams are retained; its PID is absent before the next attempt. This
capture is excluded from every accepted order/audio premise.

The new compact collector uses one fixed read-only hardware site,51fad4, to
observe all final voice spatial/auxiliary/mono endpoints, routing metadata,
cache heads and chronological order. Global controls/states and writer calls
are deliberately not observed. Native PID32840 exits0 with3,314 consecutive
voice blocks over five voices, no collector errors and a full148,224-frame
stereo24/48k WAV; the PID is absent afterward. Target code/data/registers are
never written and no protection mechanism is changed.

The compact runtime SHA256 is
`fef8f842e96886dc37e6d64853d072e409a38638c9c7da813ce3aeef9376d9f1`.
The reference is the complete accepted pass284 capture, runtime
`7273452f1969718e1aa34b84cdc866d35cf0fb84cc6b450ef4028d74422c7b35`.

## Exact observed premise

The compact loader binds the full helper/stream/fixture digests and normal
render arguments. MIDI supplies absolute voice placement and ages. It requires
bit-identical keyed voice samples (all12 spatial/auxiliary rows and mono), mix
levels, routing, key indices, masks and gains, plus equal actual cache-head
coordinates and identical per-block voice inventories.

All3,314 keyed blocks match the reference. Only10 global contribution batches
have a different within-block order. The native WAVs differ in83,270 interleaved
PCM samples, first at frame14,990, with maximum absolute difference8 in24-bit
integer units. Both files are compared over their complete native extent.

The compact target's global profiles/controls/states and actual writer call
sequence are unobserved. They are not declared equal to the reference. The full
order-only premise auditor and `--order-from` path retain stricter requirements
for a future complete paired capture; no accepted full-state pair is claimed.

## Actual sufficiency experiment

The computed-coefficient stereo runner's `--compact-order-from` path keeps the
reference model/profile/control stream, independently carried downstream states,
generated IR, calculated per-voice endpoints and reference export spans fixed.
Only the observed contribution order changes. Target voice samples are compared
for equality before rendering, but never replace calculated predictor samples.

Let F(P,V,O) denote this diagnostic engine with fixed reference controls/profiles
P, the calculated voice signals V, and contribution order O. The complete runs
establish:

```text
F(P,V,reference order) = complete native reference PCM
F(P,V,compact order)   = complete native compact PCM
```

Both equalities hold for every sample of all148,224 stereo frames, without
alignment, trimming, normalization or relaxed tolerance. Python independently
decodes both complete WAVs and confirms byte equality. PCM SHA256 values are:

- Reference: `070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.
- Changed order: `1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`.

This proves order sufficiency for this observed pair. It does not prove that the
compact run's unobserved internal configurations were identical, or that order
is the only possible cause of every native repeat difference. Compact reports
explicitly set `orderOnlyPremiseVerified:false`,
`targetGlobalControlsAndStatesObserved:false` and
`referenceControlsReusedForCompactTarget:true`. Internal target comparisons
unavailable in the compact capture are skipped and not counted as native passes.
Coefficient/scalar checks against the reference retain an explicit reference
runtime identity; they are not attributed to unobserved compact-target state.

## Negative controls and remaining work

A one-bit PCM target negative reports exactly one differing sample while
retaining the identical complete calculated WAV. A one-bit change to a reference
voice mono sample makes the compact premise loader reject the experiment.
Identical runs are rejected as a distinct-order experiment. The failed partial
capture is rejected before an output report/WAV is produced. Syntax and focused
MIDI/release/envelope regressions pass. Original-order complete stereo remains
exact after adding the optional experiment.

Private captures, audio, reports, negative controls and failure evidence use
pass295 prefixes under `~/.local/share/just-piano-analysis/`. Commercial data is
not committed. No native numerical dependency is newly removed in this pass:
contribution order/lifetime, generated waveform/profile inputs and remaining
runtime controls still require independent producers. A MIDI-driven independent
scheduler, general initialization variability and the full NY/all-key/velocity/
pedal/preset/browser/persistence/performance acceptance remain open. No merge,
deployment or complete-replica claim follows from this pair's exact result.
