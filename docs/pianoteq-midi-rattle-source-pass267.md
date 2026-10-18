# MIDI-driven Rattle source values in the continuous chain, pass267

The primary NY continuous replay now generates its initial and frozen Rattle
source values from source MIDI, explicit block times and decoded preset pedal
assignments. The native values are comparison targets only. This removes a
control-value dependency, not the observed scheduler or complete voice-source
boundary.

## Input and timing boundary

`midi-rattle-timeline.mjs` requires the supported decoded assignment at A+1518,
`[2,3,4,6]`, and channel-zero A4 events with an explicit CC64 state at frame zero.
Pass80 established that this custom assignment routes CC64 to Rattle; the same
CC must not be called Rattle under a default Sustain assignment. Unsupported
assignments, missing initial state, inconsistent start frames and unsupported
channels fail explicitly.

Controller values use the already recovered `scalarMidiCcToEventValue()` decimal
stabilizer, not a fitted quantization rule or historical observation table.
The fixture's CC32/64/96/127/0 yield float32 values
0.25/0.5/0.7549999952316284/1/0. Starting values follow MIDI event order before
each note-on. Runtime sampling uses the independent absolute birth frame plus
the supplied consumer age. The CC changes occur at absolute frames
0,8000,11968,16000,19968 on the previously verified 64-sample clock.

The consumer age, voice execution chronology and dispatch choices are still
observed. No fixed worker lookahead is introduced. Tests exercise exact control
boundaries, cross-voice ages, zero tail state, input mutation isolation and
unsupported-input guards. Existing MIDI normalization and clock tests pass.

## Primary chain and synthetic intervention

The main replay passes **14,255,465 checks, zero mismatches**, including five
initial source values and all 3,317 frozen source reads. It reports
`rattleInitialValuesFromMidi:true`, `rattleSourceValuesStillObserved:false`,
`rattleTimelineSampledAtObservedConsumerAge:true` and
`rattleRuntimeSchedulingComputed:false`.

A private synthetic negative replaces those five initial targets and 3,317
frozen targets with 0.125. The replay fails with exactly 3,322 mismatches,
classified only as `midi-rattle:initial` and `midi-rattle:frozen`. Its own continuous
and consumer audio arrays, initial predictions, final states, tail envelopes,
Rattle audio, cross outputs and injection outputs remain identical to the
positive replay. Those output arrays also equal the preceding pass265 results.
The first negative command terminated before execution because its frozen
closure was not yet present; that log is retained separately. Only the corrected,
terminal replay supplies the negative evidence.

## Low-position and actual audio limits

The low-position fixture passes **615,547 checks, zero mismatches**. Its five
initial values now come from MIDI. That capture has no frozen-source commit
events, and its runtime coefficient branch still consumes observed global
source values. Its report therefore correctly retains
`rattleSourceValuesStillObserved:true` and
`rattleTimelineSampledAtObservedConsumerAge:false`. It is not treated as a second
complete runtime-source closure. The initial-only synthetic negative has exactly
five target mismatches.

Thirty private computed float32 tail/group WAVs (1,272,576 samples, all voices
starting at counter zero) are exported from the main positive report with
`writeVoiceTailStems()`. Every exported PCM float is independently checked
against the same-run native audio endpoint before writing. These are
directly compared voice intervals, not the final mixed stereo or a replacement
for full-length audio acceptance. Their manifest explicitly preserves remaining
observed model/control dependencies and `finalStereo:false`.

No new native final-stereo equality is claimed. Pass266's identical instrumented
WAVs and pass264/265's divergent native results remain unchanged evidence; the
underlying variability is still unresolved. Complete independent scheduling,
coupling, final feedback/mix, all notes/presets and the verified browser engine
remain open.

Private evidence: `pass267-runtime-v2/`, `pass267-default-v2-report.json`,
`pass267-low-v2-report.json`, `pass267-default-negative-report.json`,
`pass267-low-negative-report.json`, `pass267-midi-rattle-audit.json`, and
`pass267-computed-tail-stems/`. Model/preset data and raw audio remain private.
