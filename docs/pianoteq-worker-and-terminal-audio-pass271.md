# Native worker and terminal audio evidence, pass271

This pass records actual float32 audio bytes, rather than inferring audio
equivalence from parameter names, initialization states or coefficient traces.
It does not remove a prediction dependency, establish an independent full
stereo render, or explain the native repeated-strike variability.

## Complete single-site worker captures

Three renders use the primary private FXP/MIDI from the acceptance manifest,
48 kHz, stereo24, dither off, no preferences and multicore=0. The normal native
CLI renders to completion. A single read-only hardware point at 0x100472fd0
captures three groups of 64 float32 samples per worker block. Text identity is
checked before launch; target code, registers and state are never written.

The matrix header is [rows, rowCapacity, columns, rowPitch]. Instructions
0x1006906ec..0x100690710 and 0x1007d8fa4..0x1007d8fb0 establish row-major
addressing: samples inside a row are contiguous and the fourth integer is the
row pitch. Two initial layout failures are retained privately and excluded.

The complete successful worker-only observations are:

| Run | Worker blocks | Final WAV frames |
| --- | ---: | ---: |
| 0 | 3,350 | 148,224 |
| 1 | 3,351 | 148,224 |
| 2 | 3,351 | 143,360 |

Runs0/1 have identical bytes in all 3,350 common worker blocks. Run1 contains
one extra numerically zero block in voice3; therefore the complete worker
sequences are not equal. Their final PCM first differs at frame12,365, with
common PCM RMS difference2.186387773381596e-7. This motivates inspection
downstream, but it does not prove an isolated downstream cause.

Run2 differs in708 common worker blocks (134,156 float32 words), as well as
having a final WAV shorter by4,864 frames. The earliest differing worker sample
by a diagnostic MIDI clock is voice4/endCounter3520/row0/sample10. That clock
is not an established mapping to the final WAV. No missing block or shorter
tail is discarded, aligned, normalized or accepted with an enlarged tolerance.

## Multi-site failures and observation boundaries

Worker-plus-terminal attempts preserve failures instead of treating nonempty
partial files as complete evidence. An ordinary Python-imported worker callback
initially produced no worker records. Explicit forwarding through the
LLDB-imported owner enables worker callbacks; binding the combined save writer
after callback registration preserves both stages in final metadata.

Nevertheless, subsequent runs have missing consumer blocks or an unowned
EXC_BREAKPOINT stop. A same-thread input/terminal attempt also stops with an
unowned exception. The existing owned-resume guard remains unchanged and rejects
these stops. A batch LLDB shell exit of zero is insufficient: runtime terminal
state, native exit status, collector errors, complete chronology and byte
coverage must all pass. None of these partial multi-site attempts establishes
same-run worker/terminal equivalence.

The consumer point0x100460908 is downstream of worker and delay processing,
before release injection. Terminal point0x100460f1c is after the voice's terminal
and time envelopes, before energy accounting. The latter records three group
rows plus three auxiliary rows. A separate terminal-only mode uses one hardware
site and assigns identities at each first counter-zero terminal call. These
are explicitly not observations of the original MIDI source-strike site.
The first terminal-only trial also encounters an unowned EXC_BREAKPOINT after
1,792 saved blocks. The process is absent after LLDB exits; no repeat is started
while it is live. This is failed partial evidence, not a complete native render.
No accepted terminal-stage repeatability result is available from this pass.

## Reproducible audit

`pianoteq_audit_worker_audio_baseline.py` binds fixture/resource/MIDI/preset
hashes, exact render arguments, frozen collector/helper hashes, successful native
terminal state, every block's position and digest, whole stream extent/digest,
finite float32 values, five contiguous voices and complete stereo PCM. Paired
consumer mode additionally requires identical ordered stage keys. Terminal-only
mode does not claim worker or consumer input coverage.

`test_worker_audio_audit.py` tests a synthetic valid inventory and rejection of
empty evidence, missing records, counter gaps, wrong offsets, wrong matrix pitch,
truncation and changed audio bytes. An extra zero block remains a strict
sequence difference. These integrity controls are not authentic audio validation.

The next required step is to obtain accepted complete downstream observations
and then locate divergence through feedback/mixing. No browser integration or
complete physical contact-force equivalence is established by this pass.
