# Independent MIDI block clock and repeated-strike observations, pass265

The continuous replay now optionally takes explicit `renderConfiguration`
(`sampleRate`, `blockSize:64`) from the archive input contract. The new pure
`midi-block-clock.mjs` integrates format-zero PPQ MIDI tempo changes with integer
arithmetic, then floors each absolute event time to a 64-sample block. The
producer computes an old voice's sample count from the difference between its
birth frame and the current strike's frame. Native host rate and old counters
are comparison targets only on this path. Legacy callers without this explicit
configuration retain observed inputs and report that dependency.

For the pinned five-strike A4/velocity-96 fixture at 48 kHz, births are
`4800,10496,12992,14976,20992`; successive ages are
`5696,2496,1984,6016`. Flooring relative tick differences instead of absolute
births would get the last age wrong. Tests also exercise tempo integration,
running status, control changes, invalid tempo, truncated input and unsupported
block size. This is an offline clock implementation, not a complete independent
voice scheduler. Old-voice selection and the execution chronology remain observed.

## Continuous-chain evidence

The primary replay passes 14,252,143 checks and the low-position replay passes
615,542 checks, both with zero mismatches. Each includes five explicit sample-rate
comparisons and four independently calculated old-counter comparisons. Both
report `oldVoiceCounterStillObserved:false` and
`repeatHostRateStillObserved:false`. Complete own continuous/consumer output
arrays, initial predictions, final voice states and tail envelopes equal their
pass259 counterparts. These are local intermediate replay results; both still
report `finalStereoAudioVerified:false` and `fullConsumerTailImplemented:false`.

A private synthetic negative changes all five captured rate targets by one and
all four old-counter targets by 64. The replay fails with exactly nine mismatches
(five `event-clock:host-rate`, four `event-clock:old-voice-count`), while its own
output arrays, predictions and states remain unchanged. This demonstrates that
these native fields no longer drive the predictions. The initial negative command
terminated on a misspelled damping path before replay; its log is retained, and
the corrected command completed with the expected failure above.

## Authentic repeated-strike audio

`pianoteq_capture_strike_baseline.py` observes one owned hardware breakpoint at
`0x10035ef10` in the authorized debug copy. It reads bounded strike inputs and
canonicalizes old-voice pointers to epochs without writing target code or state.
Six separate two-strike runs terminate successfully and each has two records
with no collector errors. Their complete WAVs each contain 121,856 frames.

Runs 0,1,2,3,5 have identical measured inputs (including randomized velocities,
old count 5696 and old release 0.07182499021291733), yet contain three distinct
complete PCM hashes. Run 4 instead observes old release 0.07375817745923996 and
adds a fourth PCM hash. Thus there is variation both outside the measured input
set and, in one run, already in the old release at this boundary. Host rate,
pedal value, threshold, old count and velocities agree across all six runs.
This does not identify the underlying cause or establish independent stereo
equivalence. The next useful observation is the origin/update of old release
before the second strike and the post-strike state for runs with identical inputs.

The earlier collector import failure launched no target; that failed directory
is retained separately. All model/preset data, captures and actual WAVs remain
private under `~/.local/share/just-piano-analysis/`: `pass265-strike-baseline-v2/`,
`pass265-clock-and-strike-audit.json`, the two positive reports and the negative
target/report. The complete NY acceptance matrix remains open. No deployment
or complete-engine claim follows from these checks.
