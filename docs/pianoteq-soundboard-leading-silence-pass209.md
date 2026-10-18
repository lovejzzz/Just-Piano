# Native leading-silence processing (pass209)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

`dsp/soundboard-leading-silence.mjs` implements `FUN_10019dfc4`:

- Scan each predicted response until its first nonzero float.
- With mode zero, remove the minimum shared prefix and shorten each response.
- With nonzero mode, shift each response by its own prefix and append zeros,
  preserving each response's original length.

Signed zero is counted as zero; no energy threshold is used. The implementation
reads only predicted responses and the explicit native configuration flag.

## Same-run native comparison

The new `PIANOTEQ_CAPTURE_LEADING=1` layout uses six hardware breakpoints:
source, workers, completed raw responses, filter output, blend output and the
following shaping-stage entry (`0x10069c084`). Conversion and trim still execute
independently, with their results checked indirectly through later boundaries;
their direct snapshot comparisons remain available in previous capture layouts.

Processing metadata is read from the wrapper configuration fields previously
bound to the live filter arguments. All source matrices, excitation, observation
records and target responses in the successful fixture belong to the same run.
The process exits with status 0 and capture errors are empty.

Actual mode: 1. Independently computed prefix lengths: **207, 180, 25**.
All three outputs remain 7,651 samples long: **22,953/22,953 float32 bit patterns
match**, with no tolerance. The raw, filtered and blended same-run comparisons
also retain zero mismatches.

Private evidence: `~/.local/share/just-piano-analysis/pass209-leading-v1/`.
Replay uses the source config and capture directory with
`scripts/pianoteq_replay_soundboard_responses.mjs`.

Negative controls in `pass209-leading-negatives/`:

- Changing mode to zero is rejected by the unchanged target's length check.
- Changing one expected output produces one mismatch and leaves every leading
  response prediction hash unchanged.

Synthetic tests cover both modes, signed zeros, all-zero input, tiny nonzero
values, input immutability and invalid input. The native positive case here
covers mode 1; mode-zero native runtime coverage remains open.

## Next boundary

The following wrapper call is `FUN_10069c084`; ARM64 binds its three scalar
inputs to configuration offsets `+0xf8/+0x15c/+0x158` and its vector inputs to
`+0xe0/+0xc8/+0x108/+0x1c8/+0x1b0`. Those bindings identify the next capture
inputs; their full numerical semantics and output still need validation.

Model-derived matrix/observation construction, the convolving blend branch,
remaining shaping, normalization and resampling remain incomplete. The current
responses are intermediate outputs, not the nine final IR nodes or a complete
piano render. Whole-piano audio and browser equivalence remain false.

Affected tests: `node tests/soundboard-leading-silence.mjs` plus the existing
response, blend, filter, conversion and trim tests.
