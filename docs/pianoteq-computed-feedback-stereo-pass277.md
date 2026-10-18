# Computed feedback through complete stereo PCM, pass277

The scalar lattice and delay route from pass276 now supply the actual feedback
input of the same-run shared mix, cabinet and stereo calculation. The complete
148224-frame stereo24/48kHz PCM matches the native file byte for byte. Native
three-row feedback samples are comparison targets only in this path. The mono
source before that lattice, two-row global excitation, voice audio and several
runtime configuration/dispatch inputs remain observed. This is not yet an
independent MIDI-to-stereo engine or a browser sound-quality acceptance.

## Same-run observation and complete output extent

The accepted native process83358 exits0 without collector errors or pending
calls. It records3314 voice contributions,2320 global blocks,2320 lattice calls,
2320 cabinet entries and579 actual writer spans of256 stereo frames. The primary
FXP/MIDI, executable text and resource pins remain unchanged from pass274.
All involved processes are now absent.

Two earlier six-active-point attempts stopped on unowned EXC_BREAKPOINT events
after partial capture. Both failures are preserved and excluded. The accepted
layout uses five active points: voice route entry, scalar-lattice input, global
feedback route, cabinet entry and actual writer conversion. It does not register
the IR-copy or per-block stereo observation points. The unchanged owned-resume
driver rejects unowned exceptions; no target code/data/register writes,
protection changes or Pedalboard are used.

Independent archive IR and cold convolution banks make the IR-copy hook
unnecessary. The actual writer float inputs validate the exported stereo path
directly. They cover every exported sample before quantization. There is no
per-block final-stereo target in this new capture; the last256 internal frames
are not submitted to the native writer and are not claimed as independently
observed final-stereo targets. All2320 upstream source/feedback blocks are
checked, and the final WAV must have exactly the extent of all579 native spans.
No waveform trimming, offset search, normalization or tolerance increase occurs.

## Continuous feedback is a calculation input

At0x1006ca950, the collector reads the actual mono source, static lattice
geometry and pre-call ring/cursor targets. Its global owner comes from the real
0x1006c2c6c caller. The same block's completed lattice output, ring hashes,
wrapper output, feedback cache metadata and final three-row feedback target are
read at0x1006c2fd4. Global ordinals bind this sidecar to the full capture.

The numerical producer owns zero-initialized lattice histories, unsigned cursor
updates, wrapper identity behavior for this profile and continuously advancing
delay-cache states. Initial static geometry, tap coefficients and mappings are
still observed. Subsequent native histories, cursors, output rows and cache flags
are targets, not state updates. The producer exports2320×3×64 float32 samples.

The shared-cache runner and complete stereo runner both require the same positive
producer report and computed-feedback binary. Their loader verifies the exact
sidecar hash, successful native PID, block ordinals/count, binary extent/hash and
producer status before accepting it. Both downstream reports retain these
artifact hashes. A report and feedback binary from pass276's different native
run are rejected before producing a shared report.

## Authentic numerical and audio results

|Calculation|Checks|Differences|
|---|---:|---:|
|Continuous lattice, wrapper and feedback route|1474976|0|
|MIDI/shared caches and computed-feedback injection|5166292|0|
|Independent IR/cold banks through complete writer/stereo|3797857|0|

The final-stage count includes all writer float targets and all actual feedback
targets, and excludes the removed per-block stereo target. Checks across stages
overlap; their sum is not an instrument coverage metric.

Complete computed/native PCM SHA256:
`8a5830b71dcb394e73a41de4c13d67a9e0c2b2ca75abf9266f4c01e66bde2ab5`.
An independent Python WAV read confirms all148224 stereo24 frames equal. Peak
is0.39563024044036865; RMS is0.0411014137745662.

Computed feedback binary SHA256:
`7b8577977593dbaa18035d7f51d6630e310c0f01e563c67667accd883167731d`.
Capture runtime SHA256:
`7bb82ee1ad495bf501d643a2face917aa201c617c0a1c774b6ca9cf9cef8f078`.

Poisoning one native feedback target in the final runner causes exactly one
internal mismatch, exit1 and unchanged complete computed PCM. Poisoning one
lattice output target likewise causes exactly one producer mismatch and
unchanged computed feedback. These controls establish that those target values
do not drive the prediction. Existing scalar impulse/history/FMA checks pass.
The updated runners also reproduce the previous pass274 full shared and stereo
positive results with their original PCM hash.

Numerical verification uses a frozen45-file private closure. The other chat's
working changes to modal-poles and partitioned-convolution are preserved; the
closure uses their committed versions. Results do not validate those unrelated
working changes. Raw sources, coefficients, archives and audio stay private.

## Remaining dependencies and next action

The fixture is five repeated A4/v96 strikes, with its historical CC64-to-Rattle
mapping. It is not a sustain-pedal, all-note, all-velocity or all-preset test.
The accepted native PCM differs from earlier accepted runs; native variation
is retained and not explained away by a same-run match.

The next upstream boundary is the mono body/drive source entering the lattice.
Its complete producer must be connected to owned state, along with the two-row
global excitation and complete independent voice production. Voice routing
configuration, contribution order, post profile and writer termination also
remain observed. Full mechanical coupling, native repeatability, keyboard/pedal/
preset coverage, AudioWorklet integration, persistence, performance and release
remain open. No merge or deployment is performed.

The private computation sequence is:

```sh
node scripts/pianoteq_replay_feedback_allpass_continuous.mjs PRIVATE_SIDECAR NEW_FEEDBACK_REPORT --output-feedback=NEW_FEEDBACK_BINARY
node scripts/pianoteq_replay_key_global_baseline.mjs PRIVATE_RUN NEW_SHARED_REPORT --global-output=NEW_SHARED_BINARY --feedback-report=NEW_FEEDBACK_REPORT --feedback-audio=NEW_FEEDBACK_BINARY
node scripts/pianoteq_replay_key_stereo_baseline.mjs PRIVATE_RUN NEW_SHARED_REPORT NEW_STEREO_REPORT --ir-pack=PRIVATE_GENERATED_IR_PACK --feedback-report=NEW_FEEDBACK_REPORT --feedback-audio=NEW_FEEDBACK_BINARY --output-wav=NEW_WAV
```
