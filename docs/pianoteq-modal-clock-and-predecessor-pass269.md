# Modal-clock variability and MIDI predecessor selection, pass269

This pass narrows the native-repeatability investigation and removes native
old-voice identity as a selection input on the supported primary fixture. It
does not establish independent scheduling, general voice retirement or complete
stereo equivalence.

## Three authentic native renders

`pianoteq_capture_modal_clock_baseline.py` observes only `0x100472f50`, after
modal coefficient update and before block rendering. It records worker and
consumer counters, modal controls/coefficients/progress, published release and
pending control state. It verifies the authorized image text, uses a bounded
single hardware breakpoint and performs no target writes. The same primary
NY FXP/MIDI and explicit stereo24/48kHz/dither-off arguments are used throughout.

All three native processes exit zero with no collector errors. They contain
3,350,3,350,3,351 modal records and complete 148,224-frame WAVs. Each voice's
worker sequence starts at zero and advances contiguously by64. No duplicates
are removed or treated as equivalent updates.

`pianoteq_audit_modal_clock_baseline.py` verifies fixture/resource/preset/MIDI
hashes, frozen collector binding, exact arguments, terminal state, complete
worker chronology and complete WAV extents. Float32 comparisons include signed
zero. It keeps dynamic observations separate from timing/publication snapshots:

| Native pair | Common worker keys | Unmatched worker keys | Dynamic sequence | Complete PCM |
| --- | ---: | --- | --- | --- |
| 0/1 | 3,350 | none | Equal | Different, first frame10,830 |
| 0/2 | 3,350 | epoch2/counter26,240 | Equal only on common keys | Different, first frame10,830 |
| 1/2 | 3,350 | epoch2/counter26,240 | Equal only on common keys | Different, first frame12,354 |

The dynamic comparison covers velocity, `u`, release flag, Rattle value, modal
release progress, complete observed release-model polynomial/scales and all
three resulting duration/rate/gain values. Those fields match on all common
worker keys. Pair0/1 also has exactly the same complete worker-key extent.
Nevertheless, all three complete PCM hashes differ; pairwise difference RMS
is approximately1.87e-7..2.14e-7 of full scale. Timing/publication fields do vary:
for example, published release and consumer counter differ on some otherwise
identical worker keys.

This rejects the claim that the observed modal control/coefficient sequence
alone suffices to guarantee identical output. It does not establish that the
entire modal state or audio blocks are identical. Initial P/Q/frequency/phase
state and the remaining downstream paths still need direct comparison. No
alignment, cropping, normalization, fitted gain or tolerance establishes a pass.
The audit exits one because strict native repeatability fails. A synthetic
missing-worker-block artifact is separately rejected for broken chronology.

## Independent predecessor on the primary chain

The archive excitation producer now supplies the latest earlier MIDI note-on
epoch with the same note and channel. With `--computed-key-release`, the replay
selects this candidate and requires its own computed modal state to remain
active before using it. Pointer strings are opaque observation labels for
associated own state, not the rule selecting a predecessor. Unsupported inactive
predecessors fail instead of silently assuming a general retirement policy.

This replaces the native old-pointer choice and native old-presence branch in
the tested continuous five-strike path. Existing own age, velocity, history and
release-progress calculations consume the chosen own predecessor. The native
pointer is translated to an epoch only as a comparison target. Legacy paths
without the option retain observed selection.

The complete primary replay passes **14,262,168 checks, zero mismatches**,
including five predecessor identity comparisons. It reports
`oldVoiceSelectionStillObserved:false`, lifetime policy
`latest-same-key-own-modal-active`, and
`oldVoiceGeneralRetirementPolicyVerified:false`.

A private synthetic negative replaces all five native old-pointer targets with
an unknown opaque label. It fails with exactly five
`midi-old-voice:selection` mismatches. Own continuous/consumer/Rattle/cross/
injection/tail audio arrays, initial predictions and final states remain
unchanged, and equal the preceding pass268 result. Thirty private computed
voice/group WAVs again compare every float32 PCM sample with the native endpoint;
they remain voice intervals rather than accepted final stereo.

Remaining work includes full independent voice lifetime and scheduling, native
variation, complete contact/feedback/mix, all-key/preset coverage and the verified
browser engine. The next native comparison should inspect initial modal states
and identify the first differing audio stage, rather than assume different
release coefficients caused the final PCM difference.

Private evidence: `pass269-modal-clocks/`, `pass269-modal-clock-audit.json`,
`pass269-modal-clock-negative-result.json`, `pass269-runtime-v1/`,
`pass269-predecessor-report.json`, `pass269-predecessor-negative-report.json`,
`pass269-predecessor-audit.json`, and `pass269-predecessor-tail-stems/`.
All commercial inputs and raw captures/audio remain private. No merge or release
is implied by these partial results.
