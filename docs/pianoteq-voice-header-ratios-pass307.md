# Archive-initialized voice header ratios, pass307

The supported fixed-control offline baseline now calculates modal adjustment
ratio V784 and decay scale V7f8 from archive-initialized paired controls. Their
native snapshots are comparison targets on this path. This removes two scalar
inputs, not the remaining model profiles, source publication or voice scheduling.
Browser audio and UI are unchanged.

## Read-only source evidence

The thin arm64 executable remains SHA256
8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094.
REA initializer/update evidence:
ev_432561daf64fd169f3039df18fbf49a07368f2c801957810c5c1de3310dfa2b5.
Consumer evidence:
ev_83a9ec55ff3e0b67530698b7fb4d92a5b1841de2a1dc592c45d68b7ec8d0376e.
The read-only session terminates normally with exit0. No native rendering,
target mutation, protection changes or Pedalboard is used in this pass.

35ed60 allocates/selects a voice and calls07a60c before715f98. Constructor19e798
and its base0f6624 do not initialize these paired controls. 07a60c copies the
shared model words at+1a8/+1ac to both initial and current voice header fields:
H150=H154 and H158=H15c. 714530 populates the shared words from the preset
interface fields+470/+588. The decoded inputs are A470.a and A588.scalars[0].
The baseline values are1.1999999284744263 and1.100000023841858, respectively;
they are not literal1. Source event handler53f47c cases0x12/0x13 updates the
current H154/H15c for selected key/channel/voice identifiers. It leaves the
initial pair unchanged. Those event semantics must be retained for future
parameter automation rather than replacing every ratio with a constant.

Consumer460260..4602e8 establishes the arithmetic:

- Equal spread controls produce adjustmentRatio1 before any limiting branch.
- Otherwise clamp each spread to at least float32(0.001), divide current by
  initial, then apply the native small-initial upward-change limiter when
  current>initial and float32(20/initial)>50. The multiplier is computed as
  float32(float32(initial*50)/20); each operation rounds separately.
- Decay scale is float32(initial impedance/current impedance).
- Setters125e24 and2731c0 feed V8f0 andV8f8;6e4f5c publishes them into the
  coefficient inputs V784 andV7f8. Initialization715f98 also establishes the
  initial adjustment1 and impedance division.

`dsp/voice-header-ratios.mjs` implements this law and archive initialization.
The integrated flag `--computed-header-ratios` supports fixed offline controls,
channel-zero note events and CC64 with the decoded fourth-pedal Rattle
assignment[2,3,4,6]. Other MIDI controls, other messages/channels and any SysEx
are rejected. The MIDI parser now exposes a SysEx count so those messages cannot
silently disappear before the profile guard. External host automation and
native0x12/0x13 event production are not supported by this integrated profile.
Nonidentity arithmetic has component tests, not fresh native audio coverage.

## Complete existing baseline audio verification

The fresh full source calculation passes14,283,804 checks with zero differences.
This adds4,118 ratio comparisons over5 initial configurations and2,054 later
refreshes. Both modal angle initialization/refresh and damping refresh use the
calculated ratios, while native values are retained for comparisons only.
The artifact binds current source/input/report hashes and records
nativeHeaderRatiosUsedForPrediction:false. Other native runtime controls and
scheduling remain explicitly observed; independentMidiToStereo remains false.

The full six-row terminal audio SHA256 remains
 a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81.
The continuous audio SHA256 remains
 fde7102595dcc4114a3ef036b63c463afcfcf1f89fc09e6fee14231807a1eb23.
Spatial checks4,135,872 and downstream checks7,015,168 pass without differences.
Python WAV parsing independently confirms all889,344 PCM bytes of the complete
148,224-frame stereo24-bit/48kHz result equal the existing actual native WAV:
070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29.
No new native render, alignment, trimming, normalization or tolerance change is
claimed. Source/spatial/stereo observations still come from separate captures.

A deliberately perturbed native comparison target reports exactly one
header-ratio:adjustment failure and exit1; both calculated audio hashes remain
unchanged. The legacy observed-ratio path passes14,279,686 checks with the same
calculated audio. A contradictory artifact prediction-boundary flag is rejected.
Component tests cover reciprocal direction, equal controls before limiting,
small/ordinary initial controls, invalid input and unsupported MIDI/SysEx.

## Open requirements

Dynamic ratio event mapping and audio equivalence, full hammer/string/felt
coupling, other coefficient/model profiles and auxiliary waveforms, publication,
cache/voice scheduling, native nonzero-damper variability, capture-free MIDI to
stereo, all88 keys/velocities/pedals/presets, AudioWorklet integration, audible
parameter save/reload and realtime performance remain open. Commercial inputs,
private REA responses and all audio artifacts remain outside Git.
