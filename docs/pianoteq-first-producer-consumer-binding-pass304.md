# First voice same-call producer/consumer binding, pass304

This pass binds the first two *produced* primary blocks to their actual consumer
blocks within each of two normally completed native runs. It does not replace
any native prediction input, implement another DSP stage, or change browser sound.
The remaining four voices and continuous source production are not covered.

## Actual producer boundaries

REA and pinned ARM64 instructions identify only two callers of20b28c: the cache
producer4165d8 calls at416774, and the direct consumer path calls at4604c8.
Three fixed read-only hardware sites observe all threads:

- `20b28c` records the actual voice/matrix, caller, thread, internal counter,
pre-call controls and raw modal storage.
- `20b438` records the same voice/matrix after primary processing, onset/time
envelopes and inter-group spread, before returning to the caller.
- `4604cc` records the current consumer's three rows immediately after the direct
call or cache copy and before later voice processing.

Entry/exit pairing is per thread and checks voice/matrix identity. The producer
and consumer are keyed by the actual voice plus the first two block counters,
with production required to precede consumption. No consumer-side future modal
snapshot stands in for a producer state. Raw storage before initialization is
retained as words and is not assumed to be an active physical coefficient.

The cache worker increments reservation state, chooses a ring slot, calls
20b28c, and only then publishes the completed-block count. Its REA evidence ID is
`ev_0046df4ea68d1872407f5070ab7d39b3c69dd47acd2e5b2cfefc8f239a2830c0`.
The same query also resolves the direct caller and containing consumer. REA
closes normally with exit0. Inferred types alone are not numerical validation.

## Complete native runs with an explicitly limited observation scope

The A116c0.5 FXP, resource, MIDI, 48 kHz/24-bit/no-dither arguments and frozen
five-helper set are identical. Native PIDs59696 and59811 both exit0/state10;
their wrappers also exit0. All PIDs are absent afterward. Only the initial
SIGSTOP is resumed. No target writes, evaluation, stepping, injection,
protection changes or Pedalboard are used.

Each run has two producer and two consumer records. Both produced blocks come
through the cache path on native thread index26, entry mode1. All384 native
samples in each same-run producer/consumer binding are bit-identical. Both
cross-run produced blocks are also bit-identical. Pre-call voice controls,
post-call modal state and post-call voice controls match between runs. The first
pre-call raw modal storage differs, while its initialization flag is still set;
post-initialization equality and identical output prevent assigning audible
significance to that earlier storage difference.

The hook set retires after the first voice's second consumed block with no
pending call. Thus later audio renders normally but later producer/consumer
states are unobserved. Run0 has site hit counts[5,5,2]; run1 has[9,9,2]. The
extra calls before retirement are unselected future producer blocks, not missing
members of the declared first-two-block inventory.

Runtime SHA256:

- `444359281851f8a4a01b0761492a726e860c68444720605c79edd4c1b12653ac`
- `bd180a7c6136a0f83fca60e851fcbe75b72850d89eb61d9f1fb1278e30d78f58`

Both full WAVs have143,360 stereo frames. All PCM samples are compared, with no
alignment, cropping, normalization, padding or tolerance relaxation. They differ
in84,005 interleaved samples, maximum9 integer24-bit units, first at absolute
frame15,213. PCM SHA256:

- `fb5679f2f055c9526848a57073296782c2dfdaf2e6852bd1006c767729003655`
- `7bee28521f1ae759e884c778e9a7b9123b0f26eb338db01c709141655174ec2e`

A separate Node implementation independently verifies both384-sample bindings
and the complete PCM count, maximum and first differing frame. This pair does
not reproduce pass301/pass303's larger first-source difference and does not
explain it. Observation can affect native scheduling; a small observed difference
in this pair is not improved native determinism or independent-engine accuracy.

## Failed broad observation and rejection tests

The preceding five-voice, three-site all-thread attempt stops on an unowned
main-thread EXC_BREAKPOINT with16 of20 stage records and a pending producer call.
Native status remains nonterminal even though the LLDB wrapper exits0. It is not
resumed, is rejected by the auditor, and its log, partial WAV and snapshots remain
private. No partial first-four-voice records are promoted to a successful native
render. The first-voice plan is a focused investigation of the earliest difference,
not a replacement for the all-voice acceptance requirement.

The auditor pins frozen helpers and input bytes, launch arguments, native and
wrapper termination, complete declared stage inventories, caller/thread/call
identity, event precedence, sidecar lengths/digests and full WAV extents. Synthetic
tests reject missing/duplicate stages, impossible chronology, changed thread or
caller; a one-bit bound-audio difference fails exact binding. Private load-time
negatives reject incomplete native status despite wrapper0 and a one-bit sidecar
change. Shared modal inventory validation is extracted without changing pass303's
cleared-initialization requirement.

## Remaining work

The new evidence closes only the first-voice, first-two-block diagnostic linkage
between actual production and cache/direct consumption. It does not recover the
full mechanical contact law, establish a unique native-repeatability cause,
replace native runtime controls/profiles/scheduling, or accept MIDI-only stereo.
Next compare actual producer controls and coefficient production across the
cached/direct first-source cases, derive them from archive/MIDI/owned state,
and extend the linkage to all repeated strikes and complete tails without
resuming native exceptions. All original 88-key, velocity, pedal, preset,
AudioWorklet, audible persistence and real-time acceptance requirements remain.
Commercial profiles, binary/model data and raw audio remain outside Git.
