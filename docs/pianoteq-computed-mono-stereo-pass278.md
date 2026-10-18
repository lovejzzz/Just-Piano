# Continuous global modal producer through complete stereo, pass278

The pre-lattice mono signal is now calculated from three continuously carried
global modal kernels, their existing mono input and the drive scratch addition.
It feeds the owned lattice/delay route from pass277 and the independent IR/cold
convolution/stereo path. Complete148224-frame stereo24/48kHz PCM matches the
same native run byte for byte. Native body output, pre-lattice mono output and
three-row feedback output are no longer prediction inputs in this path.

The three modal inputs, existing mono input, drive scratch, dynamic coefficient
versions, static configuration and remaining runtime routing/dispatch still come
from native. This is not a capture-free MIDI renderer or full mechanical coupling.

## Actual calculation and corrected operand direction

The existing GlobalModalRecurrence64 arithmetic now covers the complete primary
fixture: vector counts512/32/192, own zero initial histories, own previous input,
five-call cleanup cycle, mixed FMA order and ordered accumulation into the existing
mono input. Every pre/post history is checked by its complete float32 byte hash;
counters and previous inputs are checked separately. Native states are never
loaded as the next block's state.

The first kernel has50 distinct coefficient tables and154 table transitions;
the other two remain stable. These are still observed coefficient inputs, not
independently generated controls. There are112256 nonzero existing-input samples,
so that input cannot be replaced by zero.

The first attempted composition fails143672 checks. Its retained report exposes
an incorrect reading of matrix-add argument direction. At8dbc80, x0 is the
destination and x1 the source, and zero gain returns without modifying samples.
The relevant actual operations are:

```text
B238 += state[0x110] * bodyMono
B238 += state[0x370] * driveScratch
bodyMono += state[0x36c] * driveScratch
```

Thus the lattice input is bodyMono plus queue return and the final scratch
addition; B238 is a separate destination. The corrected collector reads the
actual0x36c gain and the replayer preserves the zero-gain branch and FMA order.
The queue-return branch is inactive for every block in these runs. No nonzero
queue program is claimed verified.

## Separate body targets and complete same-run integration

A three-point standalone capture at drive entry829d48, body return6c2bf8 and
lattice entry6ca950 checks all2320 body outputs and final mono targets directly.
Native process86089 exits0 without errors. Continuous replay has366560 checks,
zero differences and143680 nonzero final-mono samples. Changing one body target
or one final-mono target causes exactly one mismatch, exit1 and unchanged
computed mono SHA256 in each negative control.

The full capture instead retains five active sites: key route, drive entry,
global feedback route, cabinet entry and writer. It has no separate body-return
or per-block stereo target. Its2320 post-body state histories and final mono
targets are checked, then all exported stereo samples are checked at the actual
writer. This distinction is recorded as bodyOutputTargetBlocks0 and
perBlockStereoFloatTargetObserved:false, rather than counting missing targets.

One full integration attempt rejects an incorrect assumption of one compiled
spatial program. Selection now follows the actual single active descriptor into
the bounded compiled-program vector. Another attempt rejects reading the scratch
through its already-released matrix descriptor. The accepted collector retains
the scratch storage address from drive entry, proves it is within the allocated
parent stack frame, and requires the original SP/FP bounds still active at the
later read. It does not dereference the expired descriptor or infer samples from
the target. Both failed attempts have native exit0 but collector errors and are
excluded. No debugger exception policy, target code/data/registers or protection
logic is changed. No Pedalboard is used.

Accepted full native process86780 exits0, with3314 voice records,2320 mono/global
blocks and579 actual256-frame writer spans. All involved processes are absent.
FXP/MIDI, binary text and resource pins remain those of pass277. Numerical runs
use a frozen47-file private closure; the other chat's two modified DSP files are
preserved and their committed versions are used in that closure.

|Same-run calculation|Checks|Differences|
|---|---:|---:|
|Global modal states and final mono|218080|0|
|Computed mono into owned lattice and delay route|1623456|0|
|Shared caches and computed feedback|5166292|0|
|Own IR/cold banks through complete writer PCM|3797857|0|

Checks overlap and history hashes cover many samples; counts are not an
instrument-completion percentage. Every stage validates the preceding computed
artifact's exact source hash, successful native PID, block order, length and
producer report. Supplying another run's mono report/audio is rejected before
producing feedback. In the full capture, poisoning a mono target causes one
failure with unchanged computed mono; poisoning a final feedback target causes
one failure with unchanged complete computed PCM.

Computed/native PCM SHA256:
`73db05c64ecd0281cf1aece3fb637d9abb2a27f8b17fbbb177f5e9262b913401`.
An independent Python WAV read confirms all148224 frames equal, peak
0.39563024044036865 and RMS0.041101412384660536. All579 writer spans are consumed;
the final256 internal frames not passed to the writer retain the pass277 policy.
No alignment, cropping, normalization or wider tolerance is used.

Computed mono SHA256:
`b2f3739f1e45515c73a1ad5730e03d5675cc39e618f66f38d7cb771aad5d07ce`.
Full capture runtime SHA256:
`f85f657056b3d559a167c439449c78bd5e0f0de010b49677ffe88220868d592c`.

## Remaining work

The next upstream work is drive generation at829d48 and its filtering, the three
modal input sources, the existing mono input and independent dynamic coefficient
production. A fixed-block whole-stream hash audit finds none of these inputs is
simply one of the12 already computed shared rows; no row-copy shortcut is used.
Voice audio, two-row global excitation, routing/configuration, contribution
order, post profile and writer termination also remain observed. Native output
variation remains open: this run's native PCM differs from previous runs.

This is still the five-strike A4/v96 fixture with CC64 mapped to Rattle, not an
all-key, all-velocity, sustain-pedal or factory-preset acceptance. Complete
hammer/string/damper coupling, capture-free sound, AudioWorklet, parameter
persistence, real-time performance and release remain open. Commercial model
data, coefficient tables, captures and audio stay private. No merge/deployment.
