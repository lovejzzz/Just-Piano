# Computed direct source and two-row excitation through stereo, pass284

The two-row global excitation is now calculated from an owned direct source,
room delay/feedback histories, allpass stages and FIR history. It replaces the
last observed global excitation audio input in the complete same-run stereo
path. Per-voice mono/spatial audio, coefficient/control production and remaining
configuration/dispatch are still observed; this is not capture-free synthesis.

## Successful capture and excluded startup failure

The first layout pre-registers two additional observation sites. Native child
3485 exits1 at startup with a cannot-run/reinstall warning, before capturing
audio. It is excluded. Both app signatures verify, input/resource hashes remain
unchanged, and separate uninstrumented original-app and debug-copy renders each
exit0. This does not establish the cause of that startup failure.

The accepted capture uses only the existing body and feedback boundaries for
the new observations: six pre-registered hardware IDs, five enabled, with the
unchanged raw/drive alternation. Child3885 exits0 with2320 global blocks,
3314 voice records, no collector errors or pending phase. All children and LLDB
are absent afterward. No code/data/register writes, protection changes,
unowned-exception continuations or Pedalboard calls occur.

The published collector retains only this successful observation layout.
Its ring/bank snapshots, payload and passive boundary functions are AST-identical
to those in the accepted frozen capture. The failed additional-site layout and
its full logs remain private rather than being retried or treated as proof.

Capture runtime SHA256:
`7273452f1969718e1aa34b84cdc866d35cf0fb84cc6b450ef4028d74422c7b35`.

## Direct source B238 is calculated, not inferred from output

The fourth voice mix level feeds an owned ordered mono accumulation K238.
Using the computed post-modal mono before the final36c scratch addition:

```text
direct = FMA(globalBody, state110, K238)
direct = FMA(driveScratch, state370, direct)
```

The inspected zero-gain branches skip modification. Queue return is inactive
throughout this fixture. The predictor checks K238 at the body boundary and
the completed B238 at the feedback boundary, without reading either as a
prediction input. Gains110/370 remain observed controls. No rounded inverse of
the final mono output is used to recover globalBody.

Computed B238 SHA256:
`2b74adbe94be688e21f537f1b9b55701a1baafea04954fa83d2ae49a7da58348`.

## Actual room calculation

The4d1998/0da098 branch has two output channels. Each observed channel has12
parallel comb paths, two serial allpasses and a post-comb FIR. The implementation
preserves scalar sample delays within64-sample vector rings, page-level lazy
clearing, ring cursor/fill updates and the original FMA/addition order.

Two controlled gain ramps are generated from owned previous-gain history and
the supplied current controls. A comb takes delayed source times its first
delayed gain ramp, then adds delayed comb history scaled by a nonlinear damping
term from the second delayed ramp. That damping term uses the inspected ARM
reciprocal estimate followed by two FRECPS/FMUL refinements, with float32
rounding at each step. The existing platform-independent reciprocal seed rule
is used; no native target function is called by the predictor.

Comb contributions are FMA-added in stored order. A four-output FIR preserves
its circular four-sample history and tap accumulation order. Serial allpasses
then calculate delayed input minus gain times current input plus gain times
their delayed output. The final channel delay and actual denormal/signed-zero
cleanup branches are retained. All rings and FIR histories start from owned
logical zero; native histories, cursor snapshots and output samples are targets.

Static delay/filter profiles and current room gain controls remain observed.
The two pedal generators have zero configured level throughout this fixture,
and automatic gain processing is disabled. The predictor assumes cold empty
pedal queues; those queues are not directly captured here. This is explicitly
reported as pedalZeroLevelBranchOnly:true, pedalColdEmptyQueueAssumed:true and
pedalQueuesObserved:false. Exact complete output verifies this restricted path,
not active pedal-noise generation or general room-program crossfades.

## Continuous state and authentic complete audio

Both the native-input component diagnostic and the final computed-B238 path
produce the same two-row audio hash. The latter consumes the bound mono/direct
report and binary from the same capture. Feedback and final excitation must
bind the identical mono producer report before final mixing.

| Stage | Comparisons | Differences |
| --- | ---: | ---: |
| Ordered key mono inputs | 554,326 | 0 |
| Per-key histories and B158 | 1,331,348 | 0 |
| Sensor levels | 1,720,237 | 0 |
| Drive and first modal input | 524,320 | 0 |
| Global mono and direct source | 1,405,920 | 0 |
| Room excitation with computed direct input | 1,259,596 | 0 |
| Lattice/delay feedback | 1,623,456 | 0 |
| Shared routing/caches | 5,166,292 | 0 |
| Full stereo, including excitation targets and writer PCM | 4,094,817 | 0 |

Room checks cover every output sample, ring metadata/lazy-clear flags and FIR
history on every block, plus4476 complete ring-page hashes at the recorded
checkpoints. They do not claim every ring page is hashed on every block.
There are283468 nonzero excitation samples across its two rows.

Computed excitation SHA256:
`7f04a9c9cc8ca63f80922b0944c38ea1deacb37480c030aab3a9741b1e4dd215`.
Both complete24-bit stereo/48kHz WAVs have148224 exported frames and identical
PCM. Independent Python WAV decoding confirms zero differing samples, peak
0.39563024044036865 and RMS0.04110141752969572. All148480 internal frames are
calculated; the actual writer omits the final256 internal frames. No alignment,
normalization, target extent fitting, cropping or relaxed tolerance is used.
PCM SHA256:
`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

One direct-audio target, one excitation target, one ring-page hash target and
one excitation target in final stereo are independently poisoned. Each fails
exactly once; computed direct/excitation/PCM hashes remain unchanged. Corrupted
direct and excitation binaries are rejected before their consumers write a new
report. Synthetic ring tests cover lazy clearing, unaligned delay reads, wrap,
gain addition and zero-gain state preservation; authentic output equivalence
comes from the complete native comparisons above.

The accepted private numerical closure is `pass284-runtime-v2`, with66
hash-listed files and committed versions of the other chat's two modified DSP
modules. Captures, commercial profiles, presets and WAVs remain private.

## Remaining work

The final report now states nativeTwoRowGlobalExcitationStillObserved:false
and nativeFeedbackSourcesStillObserved:false. No native global intermediate
audio drives this accepted path. Native per-voice mono/spatial audio still does.
Room/static drive profiles, sensor weights, per-key/global coefficients, gains,
initial sleep configuration, mix levels, raw-node/control lifecycle, routing,
contribution order, postprocessing configuration and writer dispatch remain
prediction inputs.

Next use the expanded continuous chain for a complete paired-order causal
experiment and derive remaining coefficient/control/profile production. Native
initialization variability and complete hammer/string/damper contact coupling
remain open. This remains five A4/v96 strikes with CC64 assigned to Rattle;
all88 keys, multiple velocities, other pedal/noise branches, factory presets,
AudioWorklet, parameter persistence, real-time performance and release are
still required. Counts overlap and do not represent a completion percentage.
No browser-engine switch, merge or deployment occurs.
