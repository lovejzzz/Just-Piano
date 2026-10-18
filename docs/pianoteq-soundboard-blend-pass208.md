# Paired soundboard response blending (pass208)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

The dry fixture executes the empty-kernel branch of `FUN_1006c5ce8`.
`dsp/soundboard-response-blend.mjs` independently combines the main channels
with their filtered auxiliary partners, then discards the auxiliary channels.
It preserves the separately rounded main-channel multiplication and native
fused auxiliary addition. Exact-zero and exact-one scales follow the native
vector helper's special branches. The convolving branch is explicitly rejected.

## Same-run comparison

The probe's `PIANOTEQ_CAPTURE_BLEND=1` layout captures source inputs, raw
workers, completed raw responses, trimmed responses, filtered responses and
blended responses using six hardware breakpoints. It omits a direct conversion
snapshot to remain within that limit; conversion is still calculated on the
path to the trimmed target, and was directly verified in pass206.

Observed configuration:

- main channels: 3; total input channels: 6;
- kernel length: 0; flags: 0;
- float32 amounts: approximately 0.9, 0.9, 0.2;
- output channels: 3, each containing 7,651 samples.

All **22,953 blended output values match native float32 bit patterns**. The raw,
trimmed and filtered targets in the same run also have zero mismatches. No
native block caches or intermediate response samples are prediction inputs.
Coefficients and channel layout remain explicit captured configuration inputs.

Negative controls change the first amount to 0.8: only the first blended
prediction changes, producing 7,444 mismatches, while all upstream predictions
remain unchanged. Mutating one expected blended sample produces exactly one
mismatch and leaves all prediction hashes unchanged. Evidence remains private
in `pass208-blend-negatives/`.

The successful native process exits with status 0; capture errors are empty.
Private evidence: `~/.local/share/just-piano-analysis/pass208-blend-v2/`.
Replay uses the source config and capture directory with
`scripts/pianoteq_replay_soundboard_responses.mjs`.

The earlier v1 run stopped on concurrent hardware-breakpoint/trace events and
did not complete. Its diagnostics are retained and rejected as an oracle. A
bounded launcher now records initial-launch and owned breakpoint/trace resumes,
rejects unrelated stops, and records the actual terminal process state. The v2
run required only the initial launch resume. No process PC, registers or memory
are changed by the capture scripts.

## Remaining scope

The source matrices, observation groups and wrapper configuration still need
construction from the instrument model. This stage produces three intermediate
responses, not the final nine IR nodes. Leading-silence processing, additional
shaping, normalization and resampling remain ahead. Nonempty convolution
kernels remain unsupported here. Whole-piano, final stereo and browser
equivalence gates remain false.

Affected tests: `node tests/soundboard-response-blend.mjs` and existing response,
filter, conversion and trim checks.
