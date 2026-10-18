# Independent cold key-resonance state, pass286

The continuous observed-voice engine no longer takes initial per-key sleep
flags or history-buffer sizes from a native snapshot. `createColdKeyResonance64`
consumes only the mode count, allocates `4 * ceil(modeCount / 2)` float32 values,
sets histories and previous input to positive zero and starts dormant.
The mode count is obtained from the selected coefficient-table length. Those
coefficient tables, their selection and key gains remain native inputs.

The fixture loader validates native cold geometry and zero-history targets
separately, then exports only `{modeCount}` per key. Native cold sleep flags are
absent from the predictor profile. A getter-denial test makes every initializer
property except modeCount inaccessible. This also prevents accidental reuse of
native previous input, history size or sleep state.

This is a canonical independent cold state, not a claim that the native
constructor has been recovered. With positive mode count and nonzero gain, zero
histories/previous input, a first absent-input block reaches dormancy from either
sleep flag; a first present-input block produces the same histories/output from
either flag. Tests cover both cases. Bypass branches preserve state and must not
be treated as a proof that arbitrary initial flags are equivalent. Native
post-block state checks remain authoritative for the actual fixture.

## Actual complete audio

The accepted pass284 capture is unchanged. The new private frozen closure
`pass286-runtime-v1` calculates all2320 internal blocks and579 real writer spans.
All7008208 signal/state checks pass, including every key's complete history hash,
previous input and post-block sleep flag. All148224 stereo24/48kHz PCM frames
match the native WAV exactly.

Computed PCM SHA256:
`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

A one-bit PCM-target change gives exactly one sample mismatch and an unchanged
computed PCM hash. Targets never drive the calculation. There is no alignment,
normalization, cropping, tolerance relaxation or historical-report input.
The other chat's two modified DSP modules remain untouched; their committed
versions are used in the frozen closure.

## Read-only REA investigation

REA/Ghidra12.1.4 reopens the pinned immutable ARM64 image and decompiles the key
dispatcher79d078, global coefficient updater3ca148 and state migration11eb8.
The session terminates normally with exit0 and launches no native app.
One incorrectly shaped procedure_callers request is rejected; its response is
retained and not treated as evidence. An interior address8ccb64 resolves to
8ccb30, a different operation, and supplies no key-constructor claim.

The migration instructions11f9c..11fb8 copy old key controls, sleep flag and
previous input, while11fdc..12020 can merge histories. Consequently the cold
initializer must not silently stand in for live model rebuilding or parameter
changes. Those transitions remain unimplemented in the independent engine.

The global updater3ca148 first takes a capped maximum across each mode's linked
key controls, then applies a selected control floor, an absolute change threshold,
and a rate-limited decay before writing recurrence coefficients. Its graph,
base fields, flags and runtime controls still need independent production and
authentic dynamic-coefficient validation. Decompilation alone does not remove
the observed coefficient tables from the running engine.

Private REA responses and full audio reports remain under pass286 prefixes in
the analysis directory. No new native render is accepted in this pass, and the
two failed pass285 captures remain excluded. Their exception cause is still
unresolved; no protection or exception handling is bypassed.

## Still required

This removes a narrow initialization dependency. Native voice audio, coefficient
tables, key gains, static room/drive profiles and remaining routing/control/
scheduling still prevent capture-free synthesis. Complete contact-force/string/
damper coupling, repeated-render causality, all-key/velocity/pedal/preset coverage,
browser integration, persistence and real-time performance remain open.
