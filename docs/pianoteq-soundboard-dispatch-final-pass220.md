# First complete dispatcher output group (pass220)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 executable
identified in pass212.

The own source-state calculation now reaches the first dispatcher's completed
output vector, after resampling, the final float32(44100/outputRate) multiplier
and copying normalization metadata. It no longer stops at the intermediate
resampling buffer. Pass219 separately establishes that these three dispatcher
outputs bind directly to nodes 0–2 in the observed nine-node model.

## Same-run native verification

Six read-only hardware sites capture source entry, raw response completion,
shaping/normalization/resampling entries and dispatcher completion. The native
process exited 0 without errors or pending calls. Same-run source provenance
checks pass.

The replay calculates the complete propagation, response processing, spectral
shaping, time reconstruction, normalization, generated-coefficient resampling
and final rate multiplier. The final three 8,384-word output arrays contain
25,152 float32 values; all match native uint32 bit patterns. The three
normalization metadata words also match. No native output arrays feed prediction.

The native final scale is 0.918749988079071, derived from the captured output
rate rather than fitted against samples. Synthetic tests cover rate scaling,
signed zero, input ownership and rejected rates/input. Negative controls change
one final target sample and independently double a normalization input gain:
the former must produce one mismatch with all prediction hashes unchanged;
the latter must change every final channel while preserving shaped outputs.

```sh
node tests/soundboard-dispatch-output.mjs
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE_SOURCE_JSON PRIVATE_FINAL_CHAIN
```

Private evidence: `pass220-final-chain-v1` and `pass220-negative-controls`.
Raw buffers, configuration and native audio remain private.

## Remaining boundary

This validates the first dispatcher group from captured source matrices,
observation groups and configuration. The other two dispatcher groups still
need connected independent calculations; source geometry/matrix/observation
construction remains captured. Nine-node model independence, full voice
coupling, final stereo PCM, all presets and browser integration remain open.
The success does not authorize merge or deployment before the full goal passes.
