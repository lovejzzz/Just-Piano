# Paired-channel correction and selective filter (pass207)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

`dsp/soundboard-response-filter.mjs` extends the independently computed and
trimmed responses through the next two wrapper operations:

1. For each flagged channel, find its unflagged reference by identity and kind,
   subtract that reference with the native FMA order, and multiply by the
   float32 adjustment ratio when the denominator is positive.
2. For flagged channels only, calculate first-order filter coefficients from
   sample rate and cutoff, using the recovered native double tangent. Preserve
   separate float products, the previous-input times zero FMA, and the fused
   feedback subtraction. Unflagged channels are copied unchanged.

The cutoff is capped using the wrapper's float32 operation order. Missing
references, metadata-width errors, invalid controls and non-finite output are
rejected explicitly. The implementation does not read native filter states.

## Native validation

The probe now uses six hardware breakpoints, adding the entry of the following
wrapper stage (`0x1006c5ce8`) as the filter output boundary. It captures the
wrapper configuration and channel identities at the preceding boundary, checks
state ownership, and writes source data privately. The unchanged-text debug
copy exits with status 0; the capture has no errors.

In this dry fixture:

- sample rate = 44,100; cutoff = 100;
- adjustment ratio = float32(340 / float32(0.0085)) = 39,999.99609375;
- channels 3/4/5 reference channels 0/1/2 respectively;
- three channels execute correction and filtering; three remain unchanged.

All six output channels have 7,651 samples. **45,906/45,906 float32 bit patterns
match**, with no tolerance. The three actively filtered channels account for
22,953 of those values. The upstream raw, conversion and trim comparisons also
remain exact in the same run: 230,472 values across the four stage boundaries.

Private capture and replay: `~/.local/share/just-piano-analysis/pass207-filter-v1/`.

Negative controls, retained in `pass207-filter-negatives/`:

- Changing cutoff from 100 to 101 changes only predictions for the three
  flagged channels and produces 22,541 filter-output mismatches.
- Changing one expected filtered sample produces exactly one mismatch and
  leaves every predicted output hash unchanged.

Affected tests: `node tests/soundboard-response-filter.mjs` and the existing
soundboard response, conversion and trim tests. Replay uses
`scripts/pianoteq_replay_soundboard_responses.mjs` with the private source config
and capture directory.

## Remaining scope

The filter controls and channel metadata still come from native configuration
snapshots. The matrices and observation records likewise are not independently
constructed from the instrument model. The next stage mixes/convolves response
channels, followed by leading-silence handling, further shaping, normalization
and resampling. The final nine IR nodes, complete voice and browser equivalence
remain unverified. The native denominator-nonpositive and cutoff-cap branches
have synthetic coverage only in this change.
