# Release publication and native repeated-strike variability, pass266

This pass investigates the unresolved native repeatability gate. It does not
remove another prediction dependency or establish full-engine equivalence.

## What the copy boundary actually publishes

Pinned ARM64 disassembly at `0x1004604bc..0x1004604d8` shows two paths before
publication: a cache-read branch, or the direct processing call `0x10020b28c`.
Both converge on a load from voice `+0xab0` into `s0` and a store of `s0` into
voice `+0x2f24`. The published value therefore comes from the current modal
release position, not a release value stored alongside the consumed cached
audio block. The direct processing path calls `0x100472f20`; its arithmetic at
`0x100472f80..0x100472fcc` advances modal release position using timestep,
block length and the minimum of duration and five times base duration. This
is the already implemented release-progress control, not a recovered mechanical
felt contact-force law.

`pianoteq_capture_release_copy_baseline.py` observes one hardware site immediately
before that store, `0x1004604d0`, in the authorized debug copy. It records both
counters, old/new release, modal position, source position and raw cache counters.
It verifies the image text and callback ownership, bounds reads and record count,
and performs no target writes. The frozen collector used in the private capture
gave provisional names `cacheReadIndex`, `cacheWriteIndex`, and
`cachedBlocksRemaining` to offsets `2f78`, `2f7c`, and `2f80`. The checked-in
collector instead uses offset-based names: those labels are not a proof of
the fields' full producer/consumer semantics. The audit binds the actual frozen
collector's digest and accepts its recorded field names without relabelling data.

## Authentic six-run results

The same two-strike diagnostic FXP/MIDI/settings as pass265 are used: 48 kHz,
24-bit stereo, dither off, separate native CLI processes, a single read-only
hardware site. All six processes exit zero with no collector errors. Each has
1,943 publication records, covering both voices with contiguous 64-sample consumer
counters. Every prior release equals the preceding published value, and every
publication register equals the observed modal source. Total verified records:
11,658.

All six complete WAVs have 121,856 frames and identical PCM SHA-256
`d61c97ccdbaff072dc9462738667da2bc773c43e81d59d8d1b37d726a76a3242`.
All 15 pairwise comparisons include the complete extent, without alignment,
cropping, normalization, gain fitting or a tolerance.

Their internal publication snapshots are not all identical. Across runs, observed
modal-minus-consumer counter differences include 64, 320, 448 and 512 samples.
For example, at the first voice's consumer counter zero, run0 has modal counter
448 and release 0.003878787625581026; run1 has counter512 and release
0.004432900343090296. Both produce identical complete audio. Thus variation in
this published lead alone does not imply audible/PCM variation.

At consumer counter5632, immediately preceding the second strike's MIDI age5696,
all six runs publish release0.07182499021291733 from modal counter6144. This is
consistent with the common old release in five pass265 strike-boundary runs;
the different old release from pass265 run4 is not reproduced here. These
instrumented results do not overturn pass264's divergent uninstrumented renders
or explain pass265's different PCM with identical strike inputs. Observation can
affect scheduling; the unobserved native repeatability gate remains open.

## Audit and next unresolved boundary

`pianoteq_audit_release_copy_baseline.py` checks fixture/model/resource hashes,
collector binding, identical explicit arguments, terminal status, one-site
read-only flags, complete publication continuity and all complete WAV bytes.
A private synthetic negative changes the second record's prior release in one
run; the audit rejects the broken continuity before reporting a comparison.
It is not a native experiment. All raw data and WAVs remain private.

The next investigation must distinguish when worker release/source-control
updates differ before a strike from variation elsewhere despite equal strike
inputs. A fixed lookahead cannot simply be assumed to reproduce native output.
Independent scheduling, remaining observed controls, complete coupled voices,
final stereo, all-key/preset coverage and browser integration remain incomplete.

Private evidence: `pass266-release-copy-baseline/`,
`pass266-release-copy-audit.json`, and
`pass266-release-copy-negative-result.json` under the private analysis directory.
REA's hash-bound read-only session `pass266-release-publication-rea-v2/` completed
with three successful decompilations and process exit zero. The publication site
resolves to `FUN_100460110`; the other queries resolve to `FUN_100472f20` and
`FUN_10020b28c`. The decompiled cache branch and common publication assignment
agree with the pinned disassembly above. The large containing function carries
a type-propagation warning, so inferred types are not treated as numerical proof.
The live register/source equality and continuity checks supply the independent
runtime evidence. The earlier REA session opened and closed without queries;
it is retained separately and was terminal before this session was started.
