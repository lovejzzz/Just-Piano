# Full route-entry audio and shared accumulation order, pass273

This pass proves a contribution-order effect in the shared routing caches for
two complete native runs. It does not yet prove the cause of every final PCM
difference or produce capture-free independent stereo.

## Later boundary than pass272

The terminal point0x100460f1c precedes group merge/restore, the spatial feedback
network and auxiliary distribution. Equal audio there is insufficient to assert
equal final voice contributions. The pinned application instructions and the
existing pass40 spatial implementation establish this boundary explicitly.

New single-site observations at0x10051fad4 capture the actual key-route entry:
three groups, each with three spatial rows, plus three auxiliary rows. Three
normal native renders each contain3,314 contiguous voice blocks,2,545,152
float32 samples and a complete148,224-frame stereo24/48kHz WAV. Every matching
voice/counter block is bit-exact across all three runs, including all twelve
rows. Observed cache heads, gains and selection masks also match. Global
interleaving and final PCM differ:

| Pair | First differing key order ordinal | First changed final PCM frame |
| --- | ---: | ---: |
|0/1|446|17,927|
|0/2|638|21,031|
|1/2|446|17,927|

The first pair's swapped entries both refer to cache frame17,920; pair0/2's
first swapped entries both refer to frame20,992. These are observed placement
checks, not by themselves a proof of downstream PCM causality. Whole raw stream
hashes retain different interleaving even where keyed audio is bit-exact.

## Same-run native shared outputs reproduced

The paired collector adds0x1006c2ac4, before workspace feedback processing, and
records all shared group/auxiliary outputs, four cache geometries, complete
validity flags, and the actual ordered contributor batch. Key entries additionally
record their actual routing tables. Both accepted paired native runs exit zero
without collector errors. Each has3,314 voice contributions,2,320 global blocks
and a full148,224-frame final WAV. All2,320 internal blocks remain checked; their
count is not cropped to the final WAV's2,316 blocks.

`pianoteq_replay_key_global_baseline.mjs` continuously updates its own caches
using the existing inspected float32 FMA, ceil-delay and lazy-clear arithmetic.
All initial cache data is generated as logical zero; the first observed outputs
and flags verify that assumption. Native shared audio never updates these states.
The complete original contributor batch is checked at each global call.

MIDI block-clock note starts and independently incremented per-voice ages supply
each contribution frame. Captured voice age, global ordinal and cache head are
comparison targets, not prediction inputs. Cache read heads start from own zero
and advance through own reads. Geometry, routing maps, incoming final voice
audio, contributor order and global call coverage remain observed boundaries.

| Replay | Checks | Differences | Complete global float32 SHA-256 |
| --- | ---: | ---: | --- |
|Paired A, original order|4,720,852|0|924d055c549271ca886bf9761734de114f535a31ba731912cc0f4272e6f17667|
|Paired B, original order|4,720,852|0|a0a7ce6eb03533e46ca62885b280ccf89d80b3a969d0434f2a361ab05dfdeace|

The two accepted collector versions differ in JSON persistence: the second
writes compact atomic snapshots instead of repeatedly exposing a temporary base
snapshot. Both hardware points are bound to main consumer thread index1 in these
paired runs. Frozen versions/helper hashes remain separately bound to each run.
Instrumentation can affect scheduling, so this is not represented as identical
uninstrumented execution.

## Bidirectional order exchange

Before accepting an alternate native order, the replayer requires identical
fixture/MIDI, complete native terminal states, frozen closures, normal render
arguments, all per-voice audio bytes, every routing table, all gains/selection
masks, equal cache geometries and identical MIDI contribution placement. It
reads only the alternate contributor sequence as the changed prediction input.

With A's source values and B's contribution order, the computed global stream
has B's complete native SHA above. With B's values and A's order it has A's
complete native SHA. Each swap differs from its original target in exactly1,242
float32 words and has zero non-audio metadata differences. The first changed
global block is298. Thus contribution order explains this pair's entire shared
cache audio difference, rather than merely correlating with it.

The original final PCM first differs at frame19,092, and both WAVs have148,224
frames. Feedback, cabinet convolution, final filtering and PCM quantization have
not yet been replayed for this pair; `finalPcmVerified` and the full-output
`causalExplanationProven` remain false. The narrower report field
`sharedCacheOrderEffectVerified` is true only for a validated alternate-order
replay that reproduces a distinct complete native global output.

Reversing every same-frame batch is a separate software counterfactual:125,381
global sample comparisons change, first at block203. It is not a third native
capture. One target audio ULP, one head target and one target global ordinal
are independently poisoned: each causes exactly one mismatch while the computed
global output SHA remains unchanged. These controls verify that targets do not
feed prediction state. Failed/alternate-target comparisons continue to exit1.

## Failed attempts, tools and remaining work

The first two paired attempts stop after partial capture when the existing
driver rejects an unowned exception in a different thread. Thread-index binding
does not itself resolve that debugger failure. Both are retained and excluded;
the replay rejects their nonterminal runtime before doing any audio computation.
No exception whitelist, target code/register/state write, protection patch or
Pedalboard is used. All attempted processes are now terminal/absent; failed
directories remain intact and are never reused as fresh captures.

The Python auditor now validates complete twelve-row key-stage evidence and
separates keyed audio equality from chronological stream equality. Its synthetic
controls additionally reject a missing spatial row, out-of-range cache head and
wrong native age. These checks are evidence-integrity tests, not sound quality
or whole-engine tests.
An additional private alternate-order control changes one source gain while
retaining the original audio. The replayer rejects it before prediction rather
than treating it as an allowed ordering experiment. Original artifacts remain
unchanged.

Next, carry these same complete shared streams through actual workspace
feedback, cabinet input/convolution and final PCM. The independent engine still
needs its own contribution dispatch order, upstream voice audio and routing
initialization. Other native variability, including changed repeated-strike
initialization, remains separate. No all-key/all-preset, browser or persistence/
performance gate closes on this component result.
