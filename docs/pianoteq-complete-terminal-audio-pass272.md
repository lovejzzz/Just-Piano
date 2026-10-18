# Complete terminal audio pair and scheduling evidence, pass272

Two authentic native renders now provide complete terminal audio for all five
voices, including auxiliary channels, while producing different final stereo
PCM. This narrows the next investigation toward scheduling, accumulation and
downstream feedback/mixing. It does not establish which operation causes the
variation, or complete the independent synthesizer.

## Accepted complete observations

Both renders use the primary acceptance-manifest FXP/MIDI with the same normal
native CLI arguments: no preferences, multicore0, 48 kHz, stereo24, dither off.
Both native processes exit zero and retain full148,224-frame WAVs. A single
read-only hardware point0x100460f1c captures each voice's terminal groups and
auxiliary rows after time/terminal envelopes and before energy accounting.
There are no target code/register/state writes or protection patches.

Each run has3,314 contiguous64-sample blocks across five voices, with six float32
rows per block: three groups and three auxiliary channels. That is1,272,576
float32 samples per run. Last consumer counters are29,824/26,112/25,728/33,216/
96,896. Voice identity comes from first counter-zero terminal calls, not native
source-strike callbacks; this mode does not claim captured worker/input coverage.

The two frozen collector versions differ by the additional post-run diagnostic
method recording module/symbol names. This method is called only after the
render/owned-resume driver returns or throws. Versions and helper hashes are
reported separately, not silently labeled identical instrumentation. Both
callback paths record the same terminal layout at the same hardware site.

The audit binds each original run to its own frozen closure and launch manifest,
verifies all input hashes, normal terminal exit, collector errors, complete raw
audio extents/digests, every block hash, finite samples, five complete contiguous
voices, and the full native PCM. Private aggregate input directories contain
symlinks to the original run directories; source metadata/audio is not rewritten.
Duplicate aliases to the same original run are rejected.

| Comparison | Result |
| --- | --- |
| Complete voice/counter key coverage |3,314 matches, zero missing/excess blocks |
| Audio for every matching key, all six channels |Bit-exact; zero differing float32 words |
| Global chronological key order |Different; first difference at ordinal168 |
| First differing chronological keys |Voice1/counter2496 versus voice2/counter0 |
| Complete raw file byte sequence |Different; interleaving is retained |
| Complete final PCM |Different, first changed frame13,036 |
| Full WAV length |Both148,224 frames; no unmatched tail |
| PCM RMS difference |1.2906325638197663e-7 |

Two observed published-release controls differ despite equal keyed audio; the
first is voice0/counter3456,0.03435497730970383 versus0.033800866454839706.
Current control, Rattle and captured terminal/time-envelope values compare equal
at all corresponding keys. This is an observation, not proof that the release
field is irrelevant to every model or future block.

The auditor now separates `completeVoiceCounterAudioEqual` from
`chronologicalOrderEqual` and `completeByteSequenceEqual`. Keyed equality must
not be reported as complete stream equality when interleaving differs. An
explicit synthetic interleaving control checks this distinction. Strict native
repeatability remains false and the audit exits1; no alignment, cropping,
normalization or acceptance-tolerance change is applied.

## Retained failed repeat and next evidence needed

An intervening repeat stops after1,274 recorded blocks. The owned-resume driver
rejects an unowned EXC_BREAKPOINT; its actual-stop diagnostic shows the consumer
thread parked at the registered0x100460f1c point while a different thread reports
the exception at file address0x1804ecc0c, outside the application image. It is
not valid to reinterpret that other thread's exception as an owned audio point.
The run is excluded, and no incomplete WAV becomes accepted audio evidence.
Module/symbol diagnostics were added for future occurrences, without changing
the driver or authorizing any exception resume. All attempted processes are
terminal/absent before further attempts.

The next required capture should bind each terminal contribution to its actual
mix destination/block and accumulation order, then compare feedback, convolution
and final quantization. The different chronological ordering is a lead; MIDI-age
diagnostic clocks alone cannot establish final-WAV placement or prove causation.
Complete contact-force equivalence, capture-free final stereo, all presets and
browser AudioWorklet integration remain open.
