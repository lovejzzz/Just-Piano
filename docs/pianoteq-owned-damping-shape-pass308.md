# Owned energy-dependent damping shape and bands, pass308

The complete supported offline baseline now computes the damping shape V7ec
and low/high frequency boundaries V7f0/V7f4 from model archives, MIDI-derived
voice velocity/release flags and carried modal energy. These three native
control snapshots are comparison targets on the new path. This does not close
the complete mechanical hammer/string/felt law or capture-free stereo gate.
Browser sound and UI are unchanged.

## Static source and arithmetic

Read-only REA of the pinned arm64 executable confirms the archive builder:
1c84e8..1c85b4, contained in1c5320, evaluates B3370/B33c0/B3410/B3460 at the
model note coordinate. It writes G1114/G1118/G111c/G1120, then limits G111c
to at most float32(G1120*float32(0.99)); native literal word0x3f7d70a4.
Evidence ev_544e84439137e7855758e143029439d305a7747c2fd3c4c44d473bdc79ae084b.
These ordinary scalar curves are available in the current decoded B2f10 archive
record. `archiveModalDampingProfile` uses validated archive curve modes and the
existing interpolation arithmetic; it does not read runtime curves.

43e2a4..2dc divides G1114 by max(float32(velocity squared),float32(0.0001))
and stores the result in Va04. G1118 becomes Va08, and G111c/G1120 become the
low/high coefficient controls. The voice velocity is the already independently
produced event velocity used by the source calculation. REA43dcb0 evidence
from pass306 is ev_e6f1904a6f9b129cb5d44def44d08e7e5e28c2f51c6cc5998dcfd1a8083b7074.

6e51bc..51e0 selects Va08 only when the release flag V924 equals exactly1
and total modal energy V258 is strictly below Va04; otherwise shape is1.
The flag comes from the owned key-release publication. This differs from a
bitwise flag check and from replacing the nondefault shape with a constant.
The prior complete6e4f5c evidence is
 ev_1f0eacc076243da74cfc41d5fba188fdd61878cec5fef2aa52bbd5c27d0e7d29.

951288 initializes total energy to1. After each computed block/pruning,
8dbbf4..8dbc64 adds cached modal energy into four SIMD accumulators over each
nonempty group's rounded four-lane extent, including padded tail lanes. The
final reduction is (lane0+lane2)+(lane1+lane3), with float32 rounding at each
addition. New `sumModalEnergy` reproduces that order using the engine's own
cached lane energies and compacted layout. There is no native aggregate energy
input. REA energy evidence:
ev_68fa2c87a93ea991542ed7c3d0f8d330a42525a1ace0f3c99e2320448a856ee0.
The private REA session closes normally, terminal0. No new native audio run,
Pedalboard, target mutation or protection changes occur in this pass.

## Integrated scope and full baseline verification

`--computed-damping-profile` requires the archive producer, owned MIDI key
release and complete worker-state coverage. Its fixed offline profile rejects
other controls/channels/messages and SysEx through the existing archive control
guard. External automation and dynamic profile edits remain unsupported.
All5 initial configurations and2,054 subsequent refreshes consume the owned
shape/bands. Native descriptors remain available only for comparisons of these
three values. Other native controls such as extraGain remain external.

The complete source run passes14,289,981 checks with zero differences:6,177
new checks beyond pass307. The own shape is1 for1,322 configurations and
1.2750000953674316 for737, matching every native control target. The model
threshold base is0.0022499999031424522; bands are500 and1000Hz. These are
archive-derived values for this note/model, not universal constants. Direct
comparison of the aggregate energy scalar is not newly captured; its static
reduction and effects on all baseline shape/coefficient/audio results are checked.

Fresh terminal audio SHA256 remains
 a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81.
Continuous audio remains
 fde7102595dcc4114a3ef036b63c463afcfcf1f89fc09e6fee14231807a1eb23.
Spatial4,135,872 and downstream7,015,168 checks pass. An independent Python WAV
read compares all889,344 PCM bytes of the complete148,224-frame stereo24/48k
output against the existing actual native recording, with exact equality:
070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29.
There is no alignment, trimming, normalization or tolerance change. The original
source/spatial/stereo observations still come from separate captures.

The fresh artifact records nativeDampingShapeAndBandsUsedForPrediction:false
and binds all current source/input/report hashes. A changed native shape
comparison target reports exactly one damping-profile:shape mismatch and exit1;
calculated audio hashes remain unchanged. The legacy profile path passes its
14,283,804 checks with identical audio. A contradictory artifact boundary flag
is rejected. Tests cover interpolation, native low/high clamp, strict threshold,
exact release flag, velocity normalization and a SIMD summation fixture that
differs from sequential scalar accumulation, plus padded/empty groups.
An initially requested standalone modal-energy-pruning test filename does not
exist; actual modal arithmetic, archive damping and new component checks pass.

## Remaining work

Extra-gain/auxiliary waveform production, other model/control profiles, source
publication and voice/cache scheduling, full contact-force coupling, nonzero
native-damper variability, capture-free full stereo, all88 keys/velocities/
pedals/presets, AudioWorklet integration, audible parameter edit/save/reload and
real-time performance remain unaccepted. Commercial source data, REA responses
and audio stay private. No full-engine acceptance gate is closed by this pass.
