# Computed voice spatial and mono endpoints, pass289

The continuous stereo diagnostic can now consume calculated voice endpoints:
nine spatial group rows, three auxiliary rows and one mono contribution into
global resonance. Native endpoint audio no longer supplies those inputs when
`--voice-report` and `--voice-audio` are selected together.

The producer still consumes six native terminal rows (three mono groups and
three auxiliary rows), observed after terminal/time envelopes. Its initial
spatial configuration remains captured. This is an upstream boundary change,
not an independent voice generator or a recovered hammer/string contact force.

## Actual mono and spatial calculation

The existing combine/restore, packed five-tap network, scalar sine, fade,
sleep-counter and auxiliary-distribution modules are joined in
`VoiceSpatialEndpoint64`. Each voice owns three zero-started ring histories,
fade progress and input/output sleep counters. Ring counters start from the
first tap delay, not an observed per-block cursor. Configuration changes and
unverified nonlinear branches are rejected.

At460ff8..461058, with a=voice94, b=voice98 and f=float32 rounding:

```text
keepA = f(1-a); keepB = f(1-b)
directGain = f(keepB + keepB)
p = f(a*keepB); q = f(b*keepA)
auxGain = f(f(p+q) + f(p+q))
mono[i] = fma32(combinedGroups[i], directGain, f(auxiliaryRow0[i]*auxGain))
```

The three groups first merge in native addition order. Before spatialization,
the existing restore operation subtracts the other groups with native FMA
rounding, preserving the non-exact merge/unmerge round trip. The three used
packed spatial rows advance continuously. Primary/auxiliary distribution then
uses the recovered94 fraction and returns all twelve output rows.

This E8 mono signal is an input into later global resonators. It must not be
renamed a verified nonlinear hammer/felt contact force.

## Authentic complete paired capture

The accepted collector pre-registers terminal460f1c and return85ede4 and
alternates their enable state. Only one is active at a time; no breakpoint is
created during rendering. Every terminal observation must have its actual
same-voice/workspace return, with matching age and complete row-major audio.
All6628 phase transitions are checked. Unrendered return calls are not observed
in this mode, and voice retirement/scheduling is not independently inferred.

Native child24449 exits0 with3314 paired/routed blocks over five voices, no
collector errors or pending pair, and a complete148224-frame native WAV. Its
PID is absent afterward. Target code, registers and data are never written;
unowned exceptions are not resumed and no protection mechanism is changed.

Capture runtime SHA256:
`91c8828cf6a1b9e826ad87358aff1055826e328ccf8297fc01a3c7319aa19346`.

All2863296 audio/state checks pass. The2757248 audio comparisons cover every
sample in all thirteen generated rows. Before/after state checks cover the
three used rings' complete hashes/cursors, fade counter and both sleep-counter
sets on every block. The complete input has19 mixed-sleep blocks and1178
all-inactive blocks, exercising those real native tail branches.

The actual configuration contains eight bank entries and eight gain metadata
entries; the three output rows use the inspected first three entries, with
unit gains. This does not claim the unused entries' history was reproduced.
No native ring history is restored into the predictor between blocks.

Generated thirteen-row artifact SHA256:
`acaeb5f9de90712dbc7263ef880f1d49dae28aa5f8fdf6fcbdb950aceb7319c9`.
Its complete extent is11028992 bytes, with3314 blocks of3328 bytes each.

## Complete stereo integration and evidence boundaries

The generated artifact's exact report, producer identity, source runtime,
successful PID, frozen helpers, fixture hashes, render arguments, phase audit,
full native source PCM and audio digests are verified before use. Every keyed
voice/counter is required. The consumer replaces all endpoint arrays before
rendering and refuses incomplete or changed artifacts without native fallback.

The successful pass284 run remains the full stereo/state reference. All3314
calculated keyed endpoint blocks also match that reference's corresponding
native spatial/auxiliary and mono samples exactly. Their chronological
contribution sequences differ in29 positions, first at index261. The predictor then uses calculated endpoints, dynamic global
coefficients/control, owned downstream histories and independent archive IR.
All7015168 signal/state checks and every24-bit sample in all148224 exported
stereo frames pass. Python independently decodes the generated WAV and checks
its complete bytes against the reference PCM. There is no alignment, trimming,
normalization or tolerance relaxation.

Complete computed PCM SHA256:
`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

Voice terminal inputs and their spatial profile come from the separate paired
capture; the initial global coefficient profile also remains external observed
configuration. Both boundaries are explicitly reported as separate captures.
The paired capture's own native PCM is911cc82694eef07a885a1236503ac961e1477027bd441beb9b620fed86dae119,
which differs from the full reference. This pass does not explain that native
variation or establish a same-run capture-free source chain.

## Negative controls and retained failures

Changing one mono output target or one ring-history hash target independently
causes exactly one failure with unchanged complete generated artifact hash.
A failed producer report and a corrupted computed-audio binary are rejected.
The stereo consumer rejects the failed source before writing either report or
WAV. The previous observed-endpoint coefficient diagnostic still returns exact
complete PCM after the optional source integration.

Two early captures reject incorrect three-entry bank/gain assumptions before
recording audio. Two subsequent simultaneous-site runs stop at unowned
EXC_BREAKPOINT exceptions after1664 and3072 saved pairs. Their native terminal
status remains false despite wrapper exit0. All failed logs/partial streams are
retained, their PIDs are confirmed absent before further attempts, and none is
accepted as complete evidence. A1664-block partial mathematical diagnostic is
labeled partialDiagnosticOnly and is superseded only for successful full
validation, not erased. The successful alternating mode does not establish the
cause or fix of the earlier exceptions.

The frozen57-file published numerical closure, complete captures, commercial
profiles, reports and WAVs remain private under pass289 prefixes. Development
continues in the separate temporary checkout because the original Documents
checkout's open() problem remains unresolved. Other-chat edits are preserved.

## Remaining work

Native terminal audio is now the voice input boundary. Its upstream excitation,
modal source, release injection, terminal/time envelopes and lifecycle still
need a fully independent same-run producer. Initial spatial taps/controls,
initial global model/coefficient/mapping profiles, per-key coefficients/gains,
raw pedal/node controls and remaining mix/routing/order/writer settings also
remain observed. Complete hammer/string/damper mechanics, native variability,
MIDI-only final audio, all88 keys/velocities/pedals/presets, browser AudioWorklet,
persistence and real-time performance remain unverified. No browser engine
switch, merge or deployment occurs.
