# Ordered key mono inputs through complete stereo, pass282

All three global modal input signals now come from owned ordered accumulation
of per-voice mono contributions. They replace the native pre-drive input and
the other two native modal inputs in the complete same-run stereo calculation.
Native per-voice mono audio, mix coefficients, key indices and contribution
order remain inputs. Existing mono B158 and modal coefficients remain observed;
this is not a capture-free voice engine or complete mechanical coupling.

## Native repeat comparison locates an upstream boundary

The new auditor compares complete accepted pass278 and pass281 captures by
voice epoch and sample counter. All3314 matched twelve-row voice blocks are
bit-exact. Routing maps, gains, masks, layouts and placement match. Their raw
chronological stream hashes differ because41 entries change position across
16 contribution batches. The first changed order is global block241.

At the same block, the pre-drive input and existing mono first differ. Over
the whole render, pre-drive input differs in246 float32 words across16 blocks;
existing mono differs in40551 words across635 blocks. Drive scratch is equal
throughout. The post-body/lattice-input mono differs in133007 words. Complete
native PCM differs in128619 samples, first at frame15426. No alignment, crop,
normalization or tolerance turns this comparison into an audio pass.

These observations do not prove that order alone explains the final PCM. The
earlier twelve-row voice capture omits mono workspace E8, which supplies another
ordered accumulation path. The complete paired causal exchange and native
initialization variability remain open. The auditor explicitly reports
causalExplanationProven:false.

## Actual ordered arithmetic and continuous native targets

The existing key-route hook now optionally captures mono E8, four voice mix
levels at F0..FC, key index, slot reset flag and prior slot mono. It adds no
hardware hook. The full collector retains six registered/five active points,
including the unchanged raw/drive alternation. Accepted child97494 exits0
without collector errors or pending phases, with3314 voice records and2320
global blocks; it and LLDB are absent afterward.

Instructions51fc9c..51fd20 first copy-and-scale a voice mono contribution into
an empty per-key slot, then FMA-add subsequent same-key contributions in actual
arrival order. They also FMA-add mono into global lanes1c8,200 and238 using the
other three levels. Instructions898144..898154 add populated slots into190 in
ascending key order. `accumulateKeyMono64` owns zero-started per-block slots and
global lanes and implements these two distinct orders. Captured slot histories
and reset flags are targets, never prediction state.

All2320 first/second/third modal input blocks and live slot intermediates pass
554326 comparisons with zero differences. MIDI supplies contribution frames
and incremented ages; observed retirement and within-frame order remain.
The calculated238 lane has no direct pre-body native target in this layout;
directLaneVerified:false is retained and it is not substituted downstream.

Computed three-input float32 SHA256:
`8490851197551a965b007ca72061a702e0c453b8af3e973937e65c577dfaaab0`.
Complete capture runtime SHA256:
`09bc714a90fc2523b4d97b23c444564ed11825916f584301251a05a4c4c3dcf1`.

## Same-run complete real audio

The drive adapter uses the computed first input, then adds computed nonlinear
scratch. The modal producer uses that same first input and the computed second
and third inputs. Both require identical bound key-input report/audio hashes.
Computed sensor levels, continuous modal states, feedback, shared caches,
independent archive IR/cold banks and final stereo remain connected.

Integration review found an initial modal-consumer revision still rebuilding
the first input from its old native pre-drive source. That revision is retained
privately but is not the accepted dependency-removal proof. The corrected v2
consumer uses the computed source and adds a target-only pre-drive check.

| Stage | Comparisons | Differences |
| --- | ---: | ---: |
| Ordered key inputs and live slots | 554,326 | 0 |
| Raw-key/sensor levels | 1,720,237 | 0 |
| Drive and computed first input | 524,320 | 0 |
| Continuous modal state and final mono, v2 | 960,480 | 0 |
| Lattice/delay feedback | 1,623,456 | 0 |
| Shared caches | 5,166,292 | 0 |
| Complete stereo/writer PCM | 3,797,857 | 0 |

The complete computed and native24-bit stereo/48kHz WAVs contain148224 frames
and match in every PCM sample. Independent Python wave decoding confirms the
full extent and equality. All2320 internal blocks are calculated; the actual
writer omits the last256 internal frames, as in preceding passes. There is no
extent fitting, alignment, normalization or cropping. PCM SHA256:
`869e64a72067f3aa586ca6ec79ceb419c34672771b7103c2edb9c84b2a762509`.

A poisoned modal-input target fails exactly once with unchanged computed input
hash. The corrected consumer's poisoned pre-drive target also fails exactly
once with unchanged complete computed mono hash. A changed input binary is
rejected before producing a drive report. Synthetic arithmetic tests demonstrate
same-key float32 order sensitivity, ascending per-key merging and zero-gain
branches; they do not establish native all-key or audible coverage.

Private proof artifacts use prefix `pass282-`. The accepted numerical closure
is `pass282-runtime-v2`, with59 hash-listed files. The other chat's modified
modal-poles and partitioned-convolution files remain untouched; this closure
retains their committed versions. Commercial material, captures and WAVs stay
private.

This remains the primary five-strike A4/v96 fixture with CC64 assigned to
Rattle, not an all-key, sustain-pedal or all-preset acceptance. Comparison
counts overlap and are not a completion percentage.

## Remaining work

Final reports state computedKeyInputsSource:true and
nativeModalInputAudioUsedForPrediction:false. The inherited combined flag
nativeModalInputsAndExistingMonoStillObserved remains true because existing
mono is still observed; nativeExistingMonoStillObserved explicitly identifies
that boundary.

Next recover the per-key processing at89812c..898138/79d078, which contributes
to existing mono B158, and test paired mono-contribution/order exchanges.
Per-voice mono/spatial audio, mix levels, key identities/order, raw-node and
control lifecycle, static sensor/drive material, drive gain, coefficient
versions, two-row global excitation and remaining routing/post/writer controls
remain native prediction inputs. Complete hammer/string/damper coupling,
capture-free MIDI rendering, all88 keys/velocities/pedals/presets, AudioWorklet,
persistence, performance and release remain incomplete. No merge, deployment or
browser-engine switch is performed.
