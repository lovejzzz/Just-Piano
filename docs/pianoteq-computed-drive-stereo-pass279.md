# Nonlinear drive generation through complete stereo, pass279

The drive scratch and the first modal input after drive addition now come from
an owned nonlinear generator. They feed the continuous global modal/mono,
lattice/delay, shared-cache and independent IR/cold-bank stereo path. Complete
148224-frame stereo24 PCM still matches the accepted pass278 native WAV byte for
byte. Neither native drive scratch nor the already-modified first modal input
is used to predict those two signals.

Level/gain controls,21 static profile words and a24256-sample static waveform
remain observed inputs. Other modal inputs, the existing mono input, coefficient
versions, voice audio, global excitation and remaining runtime configuration/
dispatch also remain observed. This is not yet capture-free MIDI-to-stereo,
complete mechanical coupling or an accepted browser engine.

## Actual generator and continuous state

The new GlobalDriveCore64 follows829d48 before the separately controlled12a100
filter. It carries eight float32 history fields, previous level, peak, waveform
cursor and direction without loading subsequent native state snapshots. Cold
histories are required to be positive zero; the initial level sentinel, cursor,
direction and reset flag are checked. The native global direction word is a
target in the dedicated capture, not a per-block input to the model.

The first recurrence uses a separate multiply and fused update for the control
level, then subtracts the preceding history term. Its absolute difference drives
two recursive filters. A gain-dependent shape controls a native-order powf and
a third recursive filter. Each filter preserves the order:

```text
y = FMA(-a, previousY, FMA(b0, input, float32(b1 * previousX)))
```

The implementation also retains small-value stabilization, direction-dependent
cursor reset, the output floor, ring-index fallback, waveform multiplication and
history clearing when output becomes inactive. Model coefficients and waveform
samples are private configuration, not repository constants. The existing
recovered nativeScalarPowf arithmetic is reused with its committed dependencies.

In the primary fixture, controls are isolated nonpositive level pulses and the
drive gain is always zero. This does not silence the generator: its shape remains
active. There are88178 powf calls,88177 nonzero output samples and one history
reset. Positive-level stabilization and other profile/filter branches require
additional native coverage.

## Dedicated authentic core capture

Three main-thread hardware points observe drive entry829d48, the owned12a100
filter entry and the actual6c2be0 caller return. Native process88460 exits0 with
2320 complete calls, no errors or pending records. The unmodified owned-resume
driver is used; no target code/data/register writes, exception relaxation,
protection changes or Pedalboard occur. The process is now absent.

The requested filter gain, stored gain and active counter are all zero on every
call. Thus12a100 returns immediately; all148480 raw-core and final scratch
samples match. Nonzero gain or active-filter states are explicitly unverified.
The caller's first modal input is computed with float32 addition of its original
input and the owned drive output, then checked against the actual modified input.

The dedicated replay performs953520 checks with zero differences, covering
before/core-after/return state words and controls, raw output, final scratch and
modified input. A one-bit output-target perturbation produces exactly one
mismatch and unchanged computed drive/input hashes. Synthetic tests cover a
known waveform, cursor fallback, silence reset and the disabled-gain branch.

## Static material and same-run complete audio

The profile exporter requires the positive dedicated report, hashes the frozen
collector closure and checks the same FXP/resource pins. It exports only21 static
numeric words and the waveform, with source hashes. No dynamic histories,
per-block control records, pointers or audio outputs are exported. This is still
an observed static profile, explicitly profileGeneratedFromArchive:false.
Independent waveform/profile generation from model resources remains required.

The full calculation reuses pass278's immutable accepted capture, not a newly
selected reference. All time-varying levels, gains, caller input and final audio
targets come from that run. The one-time static profile comes from the new
dedicated run with the same preset/resource pins. Native source-waveform
generation has not thereby become independent.

The full-run drive adapter constructs its own zero histories and compares every
used static and dynamic field against pass278's before-call targets. It computes
both the scratch and modified first modal input, with373520 checks and zero
differences. Those computed samples are consumed directly by the global modal
producer. Other modal inputs and existing mono remain native sources.

|Calculation|Checks|Differences|
|---|---:|---:|
|Dedicated core, states, scratch and input addition|953520|0|
|Drive from full-run controls and bound static profile|373520|0|
|Computed drive into continuous global modal/mono|515040|0|
|Computed mono into lattice/delay feedback|1623456|0|
|Shared caches and feedback|5166292|0|
|Own IR/cold banks through complete writer PCM|3797857|0|

Counts overlap and do not measure instrument coverage. Each stage binds its
producer report, complete source hash, block order, binary extent and output
hash. A deliberately altered drive binary is rejected before producing mono.
Poisoning the full-run scratch target causes exactly one mismatch without
changing either computed drive or modified-input hashes. A final feedback-target
control likewise fails one check while retaining exact complete PCM.

Computed/native complete PCM SHA256 remains:
`73db05c64ecd0281cf1aece3fb637d9abb2a27f8b17fbbb177f5e9262b913401`.
An independent Python WAV read verifies all148224 stereo24/48kHz frames. Peak
is0.39563024044036865 and RMS0.041101412384660536. All579 native writer spans
are checked, with no crop, alignment, normalization or tolerance change.

Computed drive SHA256:
`a9d847e9c319c61c6825e17d4d347f3adb325f182ec8918c3bd894e527661338`.
Static profile SHA256:
`e58882a3b3b30147d73598e888201d15dcbb42d2bd00115060a96a87a72a215a`.

Numerical runs use frozen private closures; the final closure has52 files. Other
chat modifications are preserved, and the committed versions of its two changed
DSP modules are used. Commercial profiles, waveform material, captures and WAVs
remain private. No merge or deployment is performed.

## Remaining dependencies

The next work is deriving level/gain controls and the static drive profile/wave
from MIDI/model data, then recovering the original pre-drive input, other modal
inputs, existing mono and dynamic coefficient producers. Optional nonzero drive
filtering and queue programs remain uncovered. Voice production, hammer/string/
damper coupling, native repeatability, all keys/velocities/pedals/presets,
AudioWorklet, parameter persistence, performance and release remain open. The
browser's current simpler synth is unchanged.

A fixed-clock source-event audit also shows the drive level pulses do not
directly coincide with the five CC64 controller updates. Their actual producer
still needs tracing; no controller lookup or fitted pulse table is substituted.
