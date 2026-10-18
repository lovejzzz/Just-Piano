# Same-run key coordinates, drive levels and complete stereo, pass281

The complete primary-fixture stereo path now consumes computed drive levels
from its own raw-key and sensor histories in the same native run. Native key
coordinates, sensor pairs, levels, drive scratch, modified first modal input,
pre-lattice mono and feedback outputs remain comparison targets. This closes
pass280's cross-run component boundary without claiming a capture-free engine.

## Complete capture and phase ownership

The accepted private capture is `pass281-key-level-stereo/run-2`. Native child
96141 exits normally with status0,2320 global blocks,3314 voice records,
579 writer spans, no collector errors and no pending phase. The child and LLDB
are absent after completion. Runtime SHA256:
`6fe214cfb0d1c5c00bd365da8c71cc45e42ce2cc73a102857c092baea1ed8613`.

All six hardware hook IDs are registered before launch. Five are enabled at
once. Raw entry096558 and drive entry829d48 alternate; key publication,
feedback route, cabinet and writer hooks remain enabled. All4640 transitions
are recorded and checked against consecutive64-frame block ordinals. One
zero-time initialization from6b95e8 precedes rendering. Sensor histories and
raw-node histories start at zero; the initializer is computed, not imported.

Raw entry snapshots the source controls and sensor pairs before calculation.
The following drive entry observes completed raw keys, sensor pairs and level.
The raw buffer descriptor is the pointer loaded from host+2f8, as confirmed by
096584/096670. The cap register at sensor entry is not observed in this layout:
cap comes from the raw source controls, while level and all sensor histories
are checked directly. Reports explicitly state capRegisterCompared:false;
pass280's separate sensor-entry proof retains direct cap-register coverage.

Run0 contains a collector error from initially treating host+2f8 as an inline
descriptor. Run1 ends at an unowned EXC_BREAKPOINT after171 global blocks.
Both are preserved and excluded. Run1's child is absent before retry. The
owned-resume policy is unchanged; no unowned exception is resumed. There are
no target code/data/register writes, protection changes or Pedalboard calls.

## Same-run numerical and real audio evidence

| Stage | Comparisons | Differences |
| --- | ---: | ---: |
| Raw keys, initialization, sensor pairs and levels | 1,720,237 | 0 |
| Nonlinear drive and modified first modal input | 375,840 | 0 |
| Continuous modal state and pre-lattice mono | 515,040 | 0 |
| Lattice/delay feedback | 1,623,456 | 0 |
| Shared routing/cache accumulation | 5,166,292 | 0 |
| Cabinet, postprocessing and complete writer PCM | 3,797,857 | 0 |

Seven nonzero levels arise from29 threshold crossings and29 timer expiries.
Computed levels SHA256:
`5a1221cc10d57cb01072e6e17c271bb9916dc8ab8057e73118c5949af86bac4d`.
Drive SHA256:
`a9d847e9c319c61c6825e17d4d347f3adb325f182ec8918c3bd894e527661338`.
The drive report binds the complete level sidecar, producer report and binary
to the same native PID, runtime, frame chronology and mono sidecar.

The complete native and computed24-bit stereo WAVs each contain148224 frames
at48kHz. Independent Python wave decoding confirms every PCM sample is equal,
including the actual exported tail. PCM SHA256:
`ceb2595134388819fdb4df621e93da157fcf9479ba548fc79d1a2341cff462fc`.
Peak is0.39563024044036865; RMS is0.04110141691713187. All148480 internal frames
are computed; the final256 are not submitted by the native writer. No target
extent is fitted, cropped, aligned or normalized.

Changing one level target in either the level producer or drive consumer fails
exactly one comparison and leaves computed level/drive hashes unchanged.
Changing one cabinet target similarly fails exactly once with unchanged PCM.
A damaged level binary is rejected before a drive report is written. Synthetic
contract tests also reject different PIDs, failed proofs, observed-level claims,
missing hook phases and changed frame chronology; they establish provenance
checks only, not acoustic equivalence.

The private numerical closure contains56 hash-listed files. Its protected
modal-poles and partitioned-convolution modules use committed versions, leaving
the other chat's working modifications untouched. Captures, model material,
static drive profile and WAVs remain private.

## Remaining dependencies and next work

The final report now states nativeDriveLevelUsedForPrediction:false and
computedLevelsSource:true. Native drive gain is still observed. Raw-node
velocities, flags/lists, host/key controls, sensor weights, initial reset
configuration and the static drive waveform/profile are still observed.
Pre-drive input, the other modal inputs, existing mono, coefficient versions,
voice audio, two-row global excitation, routing/configuration, contribution
order, post profile and writer dispatch also remain prediction inputs.

This run's native PCM differs from pass279 despite identical pinned input
files, while levels and drive scratch agree. It adds a same-run exact closure,
not an explanation of native repeat variability. That gate remains open.

Next remove the observed node/control lifecycle through MIDI and model data,
derive static drive material from resources, and replace voice production and
mechanical contact inputs. Complete hammer/string/damper coupling and a
capture-free MIDI-to-stereo render remain unproven. All88 keys, multiple
velocities, pedal/preset coverage, AudioWorklet integration, persistence,
performance and release remain required. No browser engine switch, merge or
deployment occurs in this pass.
