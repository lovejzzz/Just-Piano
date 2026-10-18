# Explicit modal/envelope clock and computed base duration, pass306

The fresh baseline source path now takes modal block length, normalization
factor, envelope sample count and timestep from explicit rendering configuration
or fixed initialization constants. Envelope base duration comes from the
already independently calculated release model. Native timing descriptors are
comparison targets on this path. This removes a family of numerical timing
inputs; it does not own source publication, voice scheduling or all model controls.
Browser sound and UI are unchanged.

## Initialization evidence

Pinned instructions951204..951240 initialize the internal counter to zero,
store the float32 reciprocal of the configured sample rate at V+c, and copy
configured block length to V+768. The eight-byte literal at VM100b41a30/fileb41a30
is `0100000000000000`: uint32 refresh factor1 and initial phase0, stored at V+810.
43dd10..dedc shows the containing initialization passing the shared block length
into this configuration. Raw words and load/store types resolve Ghidra's loose
float typing of some integer configuration fields.

Read-only REA evidence for9511bc:
`ev_e7b9655aae8c96eb8c14ea5d3efb6be418bab34554f43ab6cb59981260df57e7`.
The session closes with exit0. There are no native target writes, stepping,
evaluation, injection, protection changes, Pedalboard or fresh native renders.

`modalRenderConfiguration()` copies and freezes explicit sample rate/block
size, computes the float32 timestep, and constructs factor1/phase0. The archive
binder exposes configuration validated by the bound MIDI block clock rather
than taking these values from a runtime capture. Complete source replay currently
supports64-sample blocks on this path. Component tests also exercise128-sample
configuration arithmetic; they do not establish native128-sample engine coverage.

The continuous entry point accepts `--computed-modal-clock` with a current
archive/MIDI source, computed release model and full worker coverage. Its release
progress uses `releaseModels[epoch].polynomial[0]` instead of the per-block native
base-duration field. Primary synthesis, onset progression and envelope progress
use the configured sample count. Damping energy normalization uses configured
block length and fixed initializer factor, and timestep comes from the same
explicit rate. Unsupported adaptive-factor or other profile branches are not
silently accepted; existing profile checks and all numerical comparisons remain.

## Complete baseline verification

The existing original-preset NY five-strike fixture uses48 kHz/64-sample blocks.
All3,349 envelope blocks use the new clock/model values. All5 initial coefficient
configurations and2,054 later refreshes compare their native block descriptors
without using them as normalization inputs.

Complete source checks:14,279,686, zero differences. This adds14,165 timing
comparisons to pass305's14,265,521 checks. The prior3,349 owned refresh decisions
remain enabled and pass. The fresh terminal artifact records both
`nativeModalClockUsedForPrediction:false` and
`nativeModalRefreshDecisionUsedForPrediction:false`; its current source closure
and all input/report hashes are checked before downstream use.

Calculated continuous audio SHA256:
`fde7102595dcc4114a3ef036b63c463afcfcf1f89fc09e6fee14231807a1eb23`.
Calculated complete six-row terminal audio SHA256:
`a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81`.

Spatial calculation passes4,135,872 checks and downstream calculation passes
7,015,168 checks with zero differences. The complete148,224-frame stereo24/48k
calculated WAV is byte-identical in its PCM payload to the existing complete
actual native baseline WAV. Python RIFF/WAV parsing independently checks all
889,344 PCM bytes, frame count, sample width, channel count and sample rate.
No alignment, trimming, normalization, padding or tolerance changes are used.
PCM SHA256:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

These are new full calculations against frozen real native recordings. The
source, spatial and final-stereo observations still come from separate captures;
this pass does not upgrade that premise or resolve native A116c0.5 variability.

## Negative and compatibility evidence

`--poison-modal-clock-target` flips the low integer bit of one noninitial sample
count comparison. It reports exactly one `modal-clock:samples` mismatch and
exits1. Both complete calculated continuous/terminal audio hashes are unchanged.
The failed comparison is not exported as a passed terminal artifact. The legacy
clock path, with the owned pass305 refresh policy still enabled, passes its
previous checks and produces exactly the same calculated audio hashes.

Unit tests check the actual native reciprocal word0x37aec33e, immutable
factor/phase, explicit rate/block handling and invalid clocks. A private synthetic
manifest with a changed clock prediction-boundary flag is rejected against its
bound report. Prior artifacts are not reused as prediction inputs after the
producer closure changes.

## Remaining boundaries

The two header-driven adjustment/decay ratios remain observed; the exploratory
ratio initialization analysis does not justify treating both continuous controls
as universally equal to1. Other coefficient/model profiles, source/key
publication, voice/cache scheduling, initial pedal/bypass modes and ownership/
retirement remain partly observed. Full mechanical hammer/string/felt coupling,
capture-free MIDI-to-stereo, all keys/velocities/pedals/presets, AudioWorklet,
audible parameter edit/save/reload and real-time performance remain open.
All commercial input data and actual/calculated recordings remain private.
