# MIDI key release and coupled voice publication, pass268

The primary continuous chain can now compute modal `u` and its release flag
with `--computed-key-release`, using MIDI, archive release curves, independently
produced velocities and the same-run computed release progress of adjacent
voices. Native `u`/flag snapshots are comparison targets. Observed event/worker
chronology still schedules publication; this is not an autonomous full engine
or a recovered mechanical hammer/felt contact-force law.

## Actual coupling condition and the failed first model

The first private prototype applied the shared MIDI key position to every
live voice. It mismatched 593 of 3,349 modal control states, all after the final
note-off in the older voices. That failure remains in
`pass268-prototype-key-result.json` and was not relabelled a pass.

Two new one-site native note-off captures show linked-voice counts 1,2,3,4,5
at successive note-offs: all five voices remain linked at the last event.
Therefore missing voice-list membership does not explain the old controls.
Two separate one-site handoff captures at `0x10020df90` show that the oldest
three voices already have no pending update at this boundary, while the two
newest receive the falling key position. The old voices' skipPending flags are
zero. The difference is upstream of consumption, rather than that skip guard.

Pinned instructions `0x1005e2100..0x1005e2164` supply the missing branch. Traverse
the linked voices from newest to oldest. With release active and a preceding
voice, suppress publication to the current voice when

```
f32(f32(previous.velocity * previous.publishedRelease) * f32(1.5))
    > f32(current.velocity * current.publishedRelease)
```

That branch marks voice+c98 and advances to the next link without writing a
new pending position/flag. It does not unlink the voice. The current voice still
becomes the preceding voice for the next comparison. Equality does not suppress.
The no-previous, held-key and ordinary zero-override cases follow the normal
publication path. This supplies a concrete dependency between the repeated
voices' computed release progress and later damping controls.

## Independent producer

`archive-key-release-controls.mjs` evaluates the scalar curves at base+3c28,
3c78 and3cc8. The decoded archive represents them as mar_param(2f10) fields
d18,d68,db8. The existing model-curve evaluator supplies explicit float32
linear-clamp behavior. Five native note-off calls in each of two runs validate
these three controls plus the source release value: 20 comparisons per run,
zero mismatches, with bound fixture/resource/collector/arguments.

`midi-key-release-timeline.mjs` reuses the verified event-table mapping,
note-off velocity response and FMA key integrator. The supported branch is
ordinary channel-zero A4, zero MIDI note-off velocity, amplitudeScale=1,
unit key/soft caps and the decoded Rattle pedal assignment. Other pedal controls,
unsupported note/channel/velocity inputs and inconsistent block times fail.
The custom CC64 assignment is Rattle, so it does not supply Sustain drive.

The replay freezes a manager update once per observed absolute consumer block.
Its suppression calculation reads only its own carried velocities and most
recent computed published release values, defaulting to zero before the first
copy. Pending controls are handed to each own voice at the observed commit
event. No fixed 512-sample lookahead is assumed. Native record order, consumer
clock, dispatch and other runtime context remain explicit dependencies.

## Numerical and actual-audio evidence

The primary run passes **14,262,163 checks, zero mismatches**, including 3,349
`u` and 3,349 release-flag comparisons. The independently calculated 5,849
suppression decisions are a model statistic, not a direct native branch-hit
count. The report sets `releaseFlagAndUObserved:false`,
`computedKeyRelease:true`, and `keyUpdateSchedulingStillObserved:true`.

A private synthetic negative changes all 6,698 captured `u`/flag targets.
The replay fails with exactly those 6,698 mismatches, while its own continuous,
consumer, Rattle, cross, injection and tail audio arrays, initial predictions
and final states remain unchanged. They also equal the preceding pass267
results. Thirty float32 voice/group WAVs, all starting at counter zero, contain
1,272,576 computed samples; each PCM float is checked against the native endpoint
before export. These are voice endpoints, not final stereo acceptance.

The low-position regression without the new option passes 615,547 checks. Its
capture lacks the commit timing needed by this producer, so modal key inputs
remain observed there; the new option explicitly requires complete commits.
Tests cover held/released/retriggered keys, exact ramp values, strict strength
comparison boundaries, mutation isolation and unsupported-input guards.

All four new native processes exit zero without collector errors. The two
note-off captures have five records each; handoff captures have 3,315 and 3,314
records. All complete native WAVs contain 148,224 stereo24/48kHz frames. Their
six complete pairwise PCM comparisons all differ, with first changes at frames
10,244,13,036 or13,896 and difference RMS about1.59e-7..3.38e-5 of full scale.
No alignment, trimming, normalization or fitted gain is used. This does not
prove that the newly recovered branch caused every native audio difference.
Native variability and the complete independent stereo gate remain unresolved.

Private artifacts: `pass268-noteoff-voice-links/`, `pass268-release-handoff/`,
`pass268-runtime-v2/`, `pass268-default-final-report.json`,
`pass268-key-negative-report.json`, `pass268-key-controls-audit.json`,
`pass268-computed-key-tail-stems/` and both final note-off control audit reports.
All commercial archives, captures and raw audio remain private. Full scheduling,
mechanical coupling, final mix, all notes/presets and browser integration are
still incomplete; no merge or deployment follows from this local pass.
