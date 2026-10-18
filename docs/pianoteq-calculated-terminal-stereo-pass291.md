# Fresh calculated terminal source through complete stereo, pass291

The complete stereo diagnostic now accepts terminal audio produced by the
continuous archive-source calculation during this run. It no longer uses the
native three terminal groups or the three already-processed auxiliary terminal
rows as spatializer prediction inputs on this path. Native auxiliary audio
before terminal processing, plus remaining runtime controls and scheduling,
are still inputs to the upstream source calculation. This is not capture-free
MIDI-to-stereo equivalence or a completed hammer/string/damper model.

## Producer and integration

`pianoteq_replay_release_continuous_chain.mjs --terminal-artifact=<new-private-directory>`
writes six-row float32 samples directly from its newly computed terminal
outputs. It requires the current archive-source path, explicit pitch, damping,
duration, repeat-model and owned-resume inputs, computed release/key/slopes and
onset initialization, and successful complete source comparisons. Historical
prepared-report input is rejected on this export path.

`pianoteq_terminal_artifact.mjs` binds the audio, all 3,314 indexed voice
intervals, the producer report, explicit argument/input files, current MIDI,
model/preset/resource/context and the 148-file transitive local source closure.
Every voice starts at age zero and advances by 64 samples. The reader verifies
these bindings before supplying calculated samples. Native-dependent source
boundaries remain explicit in the manifest. Native observations remain present
for verification; they are not substituted for a missing calculated block.

The spatial producer's matching `--terminal-artifact` option uses these six
calculated rows and compares the corresponding native rows only as targets.
Its output feeds the existing computed-voice endpoint reader and continuous
coefficient/global-resonance/feedback/IR/stereo chain. The stereo report now
distinguishes calculated terminal audio from observed terminal audio, while
retaining `nativeAuxiliaryEntryStillObserved:true` on this calculated path.

## Real audio and state validation

The fresh complete source run passes 14,262,172 checks with zero differences.
The computed terminal artifact is 5,090,304 bytes, SHA256:

`a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81`.

Its order follows the continuous source report's actual keyed output order;
the separate spatial capture has a different chronological order. Each lookup
requires the exact voice epoch and sample age. No summation-order independence
or native scheduling equivalence is inferred from keyed equality.

The full spatial verification passes 4,135,872 checks, including every one of
the 1,272,576 calculated terminal source samples and the existing audio/ring/
fade/sleep checks. All 13 generated endpoint rows remain byte-identical to the
previous verified spatial artifact:

`acaeb5f9de90712dbc7263ef880f1d49dae28aa5f8fdf6fcbdb950aceb7319c9`.

The complete downstream calculation passes all signal/state comparisons and
all 148,224 exported stereo frames, 48 kHz, 24-bit, with zero sample differences.
Python independently reads both WAVs, checks their complete format and frame
extent, and compares all PCM bytes. The complete PCM SHA256 remains:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

There is no alignment, trimming, normalization or relaxed tolerance. The source,
spatial and full-stereo references come from separate complete captures of the
same pinned fixture. Their own final native WAVs are not assumed identical.
The comparison proves this diagnostic chain against the full reference; it
does not resolve the outstanding native repeatability question.

## Rejection and regression checks

The six affected MIDI/archive tests pass. Corrupted terminal audio, a failed
source report (with its manifest digest updated), and an omitted indexed
interval are independently rejected. The spatial CLI rejects the corrupted
source before emitting its requested report or audio. A poisoned mono target
fails without changing generated endpoint audio; a poisoned PCM target fails
without changing the complete generated WAV.

Private evidence remains under `~/.local/share/just-piano-analysis/` with
`pass291-` prefixes: source report/log/artifact, spatial and stereo reports,
binary endpoints, WAVs and negative-control results. No new native process was
launched, no target memory/code was changed, and no commercial data is committed.

## Remaining work

The native auxiliary entry audio, Rattle source table, remaining spectrum and
registry/control context, terminal enable/scale/time conditions, modal/source
runtime controls and voice/dispatch scheduling still require independent
producers. Initial spatial/global/per-key profiles, raw pedal/node inputs,
contribution order and remaining routing/output controls also remain observed.
Full mechanical coupling, repeatability, independent MIDI-only rendering,
88-key/velocity/pedal/preset coverage, browser integration, parameter persistence
and real-time acceptance remain open. No browser switch, merge or deployment
is performed.
