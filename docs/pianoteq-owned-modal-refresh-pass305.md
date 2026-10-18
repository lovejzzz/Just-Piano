# Owned modal coefficient-refresh decisions, pass305

The fresh continuous baseline path now calculates the modal refresh decision
from its own modal layout, release coefficients, pitch trajectory and position
warmup state. Native `dispatch.required` is a comparison target on this path.
It no longer selects whether the coefficients are refreshed. This removes one
dynamic boolean dependency, not native source publication or voice scheduling.
The browser worklet and its sound are unchanged.

## Implementation and supported branch

`ModalRefreshPolicy` owns sequential64-sample calls and previous gain/rate.
Initial coefficients refresh once. With logical modes remaining, nonzero
position gain keeps refreshing energy-dependent damping; gain/rate transitions,
an applied pitch transient and position warmup can also require refresh. An
empty pruned voice skips subsequent refresh. Signed-zero comparisons follow
native FCMP behavior, and malformed or discontinuous state is rejected.

REA for6e4f5c and its setters returns evidence
`ev_1f0eacc076243da74cfc41d5fba188fdd61878cec5fef2aa52bbd5c27d0e7d29`.
The pinned instructions at6e538c..5428 establish that nonzero position gain forces
the ordinary refresh path even when its scalar value has not changed. The
native pitch transient's own applied/latch decision is used, rather than simply
comparing a proposed pitch with the previous cached coefficient pitch. REA
closes normally with exit0; no native process or protected state is modified.

The optional `--computed-dispatch` path requires computed key/release controls,
archive pitch/damping, complete worker coverage and the existing fixed-position
profile. Extra gain must be zero and block factor one. A nonunit release shape
is accepted only while nonzero computed gain already forces refresh. Other
profiles are rejected; this is not a general implementation of every controller,
coefficient override or adaptive refresh mode. Remaining explicit profiles and
publication timing remain native dependencies. The legacy path remains available.

## Complete baseline results

All five existing baseline voices, including their entire observed tails, are
processed. The owned policy matches every one of3,349 native decision targets:

| Voice epoch | Calls | Refreshes including initial | Skips |
| --- | ---: | ---: | ---: |
|0|474|383|91|
|1|416|382|34|
|2|410|384|26|
|3|527|475|52|
|4|1522|435|1087|
|Total|3349|2059|1290|

Complete source checks:14,265,521, zero differences. This is the previous
14,262,172 source checks plus all3,349 decision comparisons. Freshly calculated
six-row terminal audio has1,272,576 samples and SHA256
`a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81`.
The new artifact binds the current156-file producer closure and explicitly
records `nativeModalRefreshDecisionUsedForPrediction:false`. Previous artifacts
are not reused as prediction inputs after changing the producer.

Spatial calculation passes all4,135,872 checks. Complete downstream calculation
passes all7,015,168 checks and the full148,224-frame stereo24/48 kHz native PCM,
without alignment, trimming, normalization, padding or tolerance changes. PCM
SHA256 for calculated and actual target audio:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

These are fresh calculations against existing complete, hash-bound actual native
recordings. No fresh native render is claimed. The baseline is the original
A116c0 preset; the modified A116c0.5 repeatability investigations are distinct.
Source, spatial and final-stereo reference captures remain separate, with the
same previously declared cross-capture and native-profile limitations.

## Negative and regression evidence

`--poison-dispatch-target` flips exactly one noninitial decision comparison.
The complete run reports one `dispatch:owned-required` difference and exits1.
Calculated continuous and terminal audio hashes remain identical to the positive
run, proving that this target cannot change the computed audio on the new path.
The failed report is not exported as a passed terminal artifact.

The legacy run still passes14,262,172 checks and produces the same complete
continuous and terminal audio hashes. Unit tests cover persistent nonzero gain,
gain/rate transitions, pitch/warmup, empty modes, signed zero and sequential
clock/input rejection. An altered artifact prediction-boundary flag is rejected
against its bound producer report. Shared source inputs, private model fields
and recorded native results are unchanged.

The first trial rejected a nonunit release shape under an unnecessarily narrow
initial profile guard, before publishing a report. Its failure log remains
private. Pinned native control flow establishes unconditional refresh while gain
is nonzero; the supported branch was expanded on that basis, with nonunit shape
and zero gain still rejected. No numerical tolerance or audio acceptance condition
was changed to obtain the passing result.

Private pass305 artifacts contain the positive/legacy/negative reports, fresh
terminal/spatial data and calculated full WAV. Commercial models, presets,
recordings, binary bytes and runtime traces remain outside Git.

## Remaining scope

Model controls/profiles, source/key publication and producer/consumer scheduling,
voice ownership/retirement and other raw pedal/bypass initialization remain
partly observed. Nonzero-damper native variability and full mechanical
hammer/string/felt coupling remain unresolved. Capture-free MIDI-to-stereo,
all88 keys, velocities, pedals and presets, the same engine in AudioWorklet,
audible edit/save/reload and real-time performance are still open. This local
refresh dependency removal does not close any of those full-engine gates.
