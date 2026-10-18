# Soundboard output arithmetic order (pass204)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

The pass203 output mismatch was not solely evidence of a worker snapshot race.
ARM64 inspection identified two errors in the JavaScript arithmetic order:

- The next-state product is rounded before the current-state product is fused
  into it (`0x1005ab24c/250`). The former implementation reversed this order.
- Entries accumulate with FMA into two separate 64-element vectors. Only after
  all entries in a group have accumulated does the kernel add contributions to
  the destination, using the native four-sample write order
  (`0x1005ab4d4..550`). The former implementation wrote each entry directly.

`dsp/soundboard-output-kernel.mjs` now preserves both orders. Its regression
test compares all 65 affected float bit patterns with an independent C float/
`fmaf` oracle compiled with `-ffp-contract=off`, including a nonzero destination
and three entries.

The new `scripts/pianoteq_verify_soundboard_output_capture.mjs` parses the
original variable-length groups, rejects empty or malformed input and
non-finite output, and compares uint32 bit patterns without a tolerance.

On the historical `pass203-soundboard-output-apply-v3.h0Vmzs` capture:

| Check | Result |
| --- | --- |
| Groups / entries | 322 / 4500 |
| Compared output values | 11,587 |
| Mismatches before correction | 346, reported by pass203 |
| Mismatches after correction | 0 |
| Maximum absolute difference | 0 |

Private result: `~/.local/share/just-piano-analysis/pass204-output-kernel/replay-v3.json`.
No target process was run or modified. The earlier v2 capture remains a
negative diagnostic (346 mismatches); it must not be silently substituted for
v3 or reported as passing.

The v3 capture records output at the next kernel entry, not an isolated return
on the same thread. Consequently `isolatedNativeReturnVerified=false` remains
explicit. The exact snapshot replay supports this arithmetic correction but
does not establish every worker/record boundary, independently constructed
observation records, the nine complete IR nodes, or model-to-PCM equivalence.
`soundboardIrComputeReimplemented`, `completeVoiceVerified`, and
`finalStereoAudioVerified` remain false.

Next: assemble all observation outputs from independently advanced blocks,
establish the response-to-node transformation, and compare all 71,168 IR values
against the private pack. State matrices and observation inputs must eventually
come from the model rather than native snapshots.
