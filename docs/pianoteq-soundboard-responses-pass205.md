# Complete raw soundboard responses (pass205)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

The corrected output kernel is now composed with the full propagation loop.
`computeSoundboardResponses()` streams each generated 64-step block directly
to every observation channel, without storing or consuming native block caches.
The callback addition to `runSoundboardCompute()` preserves existing captures.

## Native evidence

`scripts/pianoteq_capture_soundboard_responses.py` uses three read-only hardware
breakpoints: propagation input, output worker entry, and `0x1005a91c8` before
raw-response resizing. It binds worker record addresses and output pointers to
the completed propagation's own record array. No target memory, register or PC
is modified and no target expressions are evaluated.

The successful v3 run captures scalar inputs, excitation, sparse matrices,
six observation records, and all six completed raw responses in the same run.
The unchanged-text debug copy exits with status 0; capture errors are empty.
All commercial input arrays and WAV files remain private.

| Check | Result |
| --- | --- |
| Propagation steps | 11,026 |
| Blocks advanced | 173 |
| Observation channels | 6 |
| Samples per channel | 11,587 |
| Compared float32 bit patterns | 69,522 |
| Mismatches | 0 |
| Native block cache used for prediction | false |

The generated first block also hashes identically to every captured first-block
cache. The replay compares uint32 patterns and rejects non-finite targets,
incomplete captures, corrupt descriptors, and malformed group vectors.

Multiplying the first excitation sample by 1.001 produces 67,938 response
mismatches; the unmodified same-run source produces none. In the earlier
first-block diagnostic, changing one expected output changes only the comparison
result and leaves the prediction hash unchanged.

Reproduce locally with:

```sh
node scripts/pianoteq_replay_soundboard_responses.mjs PRIVATE/source.json PRIVATE_CAPTURE_DIRECTORY
node tests/soundboard-response.mjs
```

Private evidence: `~/.local/share/just-piano-analysis/pass205-responses-v3/` and
`pass205-computed-output/full-same-run-responses.json`.

## Failed attempt and remaining boundary

The v1 probe used the later trimming-function entry. Its ownership assertion
failed because propagation transforms the worker buffers into different output
buffers before that call. That failed capture is retained and is not treated as
a passing oracle. The v2 probe moved to the earlier boundary and passed using
historical matrices; v3 adds same-run source capture.

The matrices and observation groups are still native snapshots. This proves
their consumption through the complete raw-response simulation, not their
construction from the instrument model. Six raw observation responses are also
not the nine final IR nodes. The native propagation postprocessing and wrapper
include derivative conversion, trimming/tapering, channel operations, filtering,
normalization and resampling; those transformations still need independent
implementation and native targets.

REA recovered the response-postprocessing functions in the same immutable
session, with all three batches passing. These private decompilations are not
committed. `sourceMatricesConstructedFromModel=false`, `fullIrNodesGenerated=false`,
`completeVoiceVerified=false`, and `finalStereoAudioVerified=false` remain.
