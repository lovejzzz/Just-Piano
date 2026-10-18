# Reproducible continuous terminal source and bridge audit, pass290

The clean published checkout could not start the continuous archive-source
replay: four archive modules imported the missing
`runtime-context-from-archive.mjs`, and the MIDI Rattle path imported the missing
`midi-event-normalization.mjs`. Both implementations were recovered from the
private frozen numerical closure. The curve module is byte-identical across
the pass250, pass259 and pass270 closures. The MIDI module retains the recovered
calculation, but excludes its unused diagnostic native observation array and
lookup exports. No commercial model, preset or native audio is published.

The MIDI absolute block clock itself was already committed in pass265. Its
test, Rattle/release timeline tests and three affected archive tests now all
run successfully from this checkout. This is a repair of the published
dependency closure, not a newly recovered clock algorithm.

## Fresh computation and authentic terminal audio

The continuous source is rerun with `--archive-source`, the explicit 48 kHz
MIDI clock, own archive pitch/damping/duration sources, computed release model,
key release, terminal slopes and onset initialization, plus the original
owned-resume audit. It does not consume a historical prediction report.
The complete five-voice calculation passes 14,262,172 checks with zero
mismatches. All 3,314 terminal blocks include three computed group rows and
three processed auxiliary rows; initial auxiliary audio is still observed.

`pianoteq_audit_terminal_bridge.mjs` compares these freshly calculated rows
against the complete successful pass289 terminal capture, keyed by voice epoch
and continuous age. Every one of the 1,272,576 float32 samples is bit-identical.
The full row-major computed and native terminal streams both hash to:

`495c862c5c9e4991ea03e1f990aa375ba45a5ee6aa5145c705f9dc8c087ffba1`.

Changing one target sample by one bit causes exactly one mismatch and failure,
with the complete calculated stream digest unchanged. Duplicate, missing,
discontinuous, unbound or incomplete intervals are rejected. This audit is
diagnostic only and supplies no samples to another predictor.

The source capture SHA256 is
`845ecef901e2215062d7cae298bc6f232be44357a39cef07fb523bfc067a869f`;
the paired terminal runtime SHA256 is
`91c8828cf6a1b9e826ad87358aff1055826e328ccf8297fc01a3c7319aa19346`.
These are separate captures. Equality of keyed terminal rows does not prove
equal chronological contribution order, native final stereo repeatability,
or independent MIDI-only source generation.

Private evidence is stored under `~/.local/share/just-piano-analysis/`:
`pass290-fresh-terminal-report-v4.json`, its log, bridge audits, and retained
v1/v2 missing-import failure logs. The source reads the existing raw capture
and owned-resume audit; no new native target was launched in this pass.

## Remaining boundary

No new native numerical input dependency is declared removed here. The repair
makes the existing computed-source path reproducible from published code and
establishes its exact connection to the newer terminal observation boundary.
The next integration must use fresh calculated terminal outputs with bound
producer provenance, rather than silently feeding old report arrays into the
stereo chain. Auxiliary entry audio, Rattle table, some spectrum/runtime
controls, terminal enable/scale/time configuration, old-voice selection and
dispatch remain observed. Full hammer/string/damper mechanics, repeatability,
MIDI-only final audio and browser/preset/performance acceptance remain open.
