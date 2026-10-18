# Initial-state repeatability and archive repeat horizon, pass270

This pass compares authentic initialization snapshots with complete native PCM
and removes the old voice's repeat-horizon value as a native prediction input.
Neither result closes complete independent stereo or native repeatability.

## Three complete initialization observations

`pianoteq_capture_initial_state_baseline.py` uses the single hardware site
`0x100864d28`. It records five unique sample-counter-zero starts, then disables
observation while the rest of the normal CLI render completes. Target image
text is verified before launch. No target code/register/state writes occur.
All three processes exit zero without collector errors and produce complete
148,224-frame stereo24/48kHz/dither-off WAVs using the same primary FXP/MIDI.

Each run captures 184,192,192,192,192 lanes, including padded inactive lanes.
Snapshots include P/Q, energy, frequencies, modal decay, effective decay,
recurrence coefficients, layout/pruning/control fields, onset double-precision
state/filter history, repeat inputs, support history and random state.
Reserved+7fc is preserved as its raw integer word instead of an interpreted
float. Only opaque addresses, thread identity and voice labels are excluded
from value comparisons; reserved words and padding remain compared.

`pianoteq_audit_initial_state_baseline.py` binds the native fixture/resource/
preset/MIDI, frozen collector, exact arguments, successful terminal state, five
complete starts and complete audio extents. Numeric comparisons preserve signed
zero and the full onset-double precision. Its results are:

| Native pair | Captured initialization values | Complete PCM |
| --- | --- | --- |
| 0/1 | All five voices equal | Different; first frame11,331, RMS2.489e-7 |
| 0/2 | Voice2 differs; other four equal | Different; first frame11,331, RMS2.446e-5 |
| 1/2 | Voice2 differs; other four equal | Different; first frame11,884, RMS2.446e-5 |

In run2's third voice (epoch2), repeat attenuation is0.4502611756324768 versus
0.45145276188850403 in runs0/1. Repeat age, old velocity, histories, observed
random state and onset fields match. P,Q and energy differ in183 lanes;
effective decay differs in192, radius and A in3, and B in2. A normalization
control also differs. These are observed correlations, not a controlled proof
that one scalar alone caused the full PCM change.

Pair0/1 proves that equal captured initial values are insufficient to guarantee
equal final audio; unobserved state and later processing remain possible
sources. Run2 also proves that initialization is not invariant across every
native repetition. No alignment, trimming, normalization, gain fitting or
tolerance converts any pair to a pass. The audit exits one on strict PCM failure.
Four private synthetic controls verify rejection of a missing start and
detection of a reserved-word change, padded-lane P change and one-ULP onset
double change. They are integrity tests, not native experiments.

## Repeat-horizon prediction input removed

The pinned instructions at `0x1001c6514..0x1001c6528` evaluate base+2150 into
per-note G+37c. The voice initializer at `0x10007aac0..0x10007aac4` copies that
field into voice+2f20, which the repeated-strike calculation reads as old.duration.
The existing `archiveRepeatedStrikeFields()` already evaluates this second
curve of decoded base+2100. The running producer now uses its own generated
field rather than the captured voice value. This is the repeat eligibility/
attenuation horizon, not a newly established GUI Damping Duration mapping.

Both positive replays now report `oldRepeatDurationStillObserved:false`:

| Replay | Checks | Mismatches |
| --- | ---: | ---: |
| Primary NY with independent key controls/selection | 14,262,172 | 0 |
| Low-position regression | 615,551 | 0 |

A private negative changes all four captured old durations to2. It fails with
exactly four `archive-repeat:duration` comparisons while its own output audio,
predictions and final states remain unchanged. A separate in-memory synthetic
model-curve edit doubles the generated horizon and changes independently
calculated repeat attenuation. Original model/preset/resource files are not
modified and that sensitivity check is not a native rendering experiment.

All primary continuous/consumer/Rattle/cross/injection/tail arrays remain equal
to pass269. Thirty newly written private float32 voice/group WAVs contain
1,272,576 samples checked against native audio endpoints before export. These
are complete compared voice intervals from counter zero, not final mixed
stereo. General scheduling/retirement, remaining context, mechanical coupling,
feedback/final mix, all notes/presets and verified browser integration remain
incomplete. Next compare complete per-voice audio blocks with the final mix to
locate the earliest differing signal stage.

Private evidence: `pass270-initial-states/`, `pass270-initial-state-audit.json`,
`pass270-initial-negative-results.json`, `pass270-runtime-v1/`,
`pass270-default-report.json`, `pass270-low-report.json`,
`pass270-duration-negative-report.json`, `pass270-duration-audit.json`,
`pass270-duration-model-counterfactual.json`, and
`pass270-computed-duration-tail-stems/`. Commercial inputs, raw snapshots and
audio remain private. No merge or deployment is implied.
