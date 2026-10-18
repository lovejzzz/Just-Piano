# Nine-node dispatcher provenance (pass219)

Date: 2026-10-17. Immutable target remains the Pianoteq 9.2.5 ARM64 executable
identified in pass212. This is native provenance evidence, not an independent
nine-node generation claim.

A new three-site read-only capture observes dispatcher entry, completed output
vectors and the model constructor's nine-node list in one process. It binds
each final node to its producer, comparing all words rather than inferring the
relationship from lengths or function names.

| Final nodes | Dispatcher call | Channels | Values | Bit mismatches |
| --- | ---: | --- | ---: | ---: |
| 0–2 | 0 | 0–2 | 25,152 | 0 |
| 3–5 | 1 | 0–2 | 22,656 | 0 |
| 6–8 | 2 | 0–2 | 22,656 | 0 |
| Total | | | 70,464 | 0 |

All three calls use mode 2, input rate 44,100, output rate 48,000 and duration
0.25. The first group contains 8,384 words per channel; the other groups contain
7,552. The final node buffers exactly match the dispatcher outputs in their
concatenated order. No additional taper or scale is needed between these two
observed boundaries in this profile.

ARM64 inspection shows that the dispatcher still applies float32(44100/outputRate)
after the previously verified resampling boundary, then preserves normalization
metadata in its output vector. At 48 kHz this scale is 0.918749988079071. The
pass218 response is therefore an intermediate buffer, not yet the final node.

The fresh self-contained v2 capture completed all three dispatchers and all nine
nodes with no errors or pending calls; the native process exited 0. Its helper
uses only tracked capture dependencies. The earlier v1 evidence is retained
privately. Changing one node target with its digest updated causes exactly one
binding mismatch.

```sh
node scripts/pianoteq_verify_soundboard_dispatch_nodes.mjs PRIVATE_DISPATCH_NODE_CAPTURE
```

Private evidence: `pass219-dispatch-nodes-v2`, `pass219-node-negative` and the
retained `pass219-dispatch-nodes-v1`. Source/configuration, raw node buffers and
native audio remain private. No target writes or Pedalboard path are used.

This identifies three separate computations that must be reproduced. It does
not replace their inputs with model-derived geometry or prove final stereo
audio. The first group's independent computation must reach the dispatcher
scale, and the other two groups still need their own source-state validation.
