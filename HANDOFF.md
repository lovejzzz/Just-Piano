# Just Piano — continuation handoff

Updated 2026-10-18. Read this before changing the engine, server or analysis runs.

## Current outcome and scope

The goal remains the complete independent browser piano: all 88 keys, multiple
velocities, pedals and factory presets, full mechanical hammer/string/damper/
soundboard calculation, actual complete native audio verification, then the same
engine in AudioWorklet with audible parameter edit/save/reload and measured
realtime performance. Retain the dark cinematic UI. **This goal is not complete.**

Research commit **97dcd59ffc394d8220a1c5284ab3bacfd85c6a56** and audition/handoff
commit **d7a78e6** are pushed to `origin/codex/cinematic-piano`. The current change
adds actual realtime synthesis using a subset of the recovered modules, with an
explicit experimental voice bridge. Continue pushing verified work to this branch.
Do not merge/deploy before full acceptance or upload private model/audio data.

## Canonical workspace and preserved work

- Canonical: `/Users/tianxing/ClaudeCodeProjects/Just Piano`.
- Check `/Users/tianxing/ClaudeCodeProjects/project-locations.json` before opening
  or moving anything. Do not return active work to iCloud.
- Old directory: `/Users/tianxing/Documents/ChatGPT/Just Piano`, preserved.
- Backup: `/Users/tianxing/ClaudeCodeProjects/.migration-backups/2026-10-18/Just Piano-original`.
- The migration inventory and merge candidates are beside that backup. Fourteen
  divergent original paths still need reconciliation. Many recovered research
  files are deliberately untracked. Do not blanket-stage, clean, reset, overwrite
  or infer that these belong to the current change. The original Git object store
  contains an unreadable cloud object; canonical uses the verified independent clone.

## What the user can hear now

With `--model-archive`, the realtime keyboard now uses
`research-piano-worklet.mjs` and `dsp/realtime-research-engine.mjs` at 48 kHz.
`research-model-worker.mjs` calculates all 88 note templates from base/preset
fields using the source/coupled pole modules and builds 125 generated auxiliary
waveforms. No native context/control snapshot, pointer, prediction file or
rendered note WAV is an input. All playable inputs route to this worklet. Model
preparation is off the audio thread; the worklet owns note state and synthesizes
128-frame stereo quanta, with reusable modal scratch. Limits: 24 voices and
2,048 lanes, quiet/released voice stealing. The optional offline WAV player is
collapsed and not used by key events.

**Not the full latest offline engine:** native voice initialization/control laws,
velocity-dependent physical source recalculation, hammer contact/feedback,
continuous damper coupling, full spatial/convolution chain and factory presets
remain unresolved. Explicit source runtime defaults, velocity spectrum/gain,
release gate, scheduling and body/mix are experimental choices. The six UI
voicings are edits of this one model, not six distinct instrument models. Static
hosting without the private endpoint still runs the original `piano-worklet.js`.
Do not describe local integration as public deployment or native equivalence.

Pass315 regression regenerated source→spatial→stereo after the kernel scratch
change: source 14,292,040 checks / zero mismatches; final WAV identical in its
entirety to pass314. Private outputs are `pass315-live-regression-*`. This is
regression of the observed offline fixture, not equivalence of the live adapter.
Detailed verification: `docs/realtime-audioworklet-pass315.md`.
Live private-model audit: `live-browser-model-audit.json`; synthetic live tests:
`node tests/realtime-research-engine.mjs`. Initial preparation measured ~15 sec
in Node; browser can be longer. Node 12-note chord measured ~713 ms CPU per sec; do not claim broad latency/performance acceptance.

Start the local listening server from canonical:

```sh
PIANO_ANALYSIS="$HOME/.local/share/just-piano-analysis"
python3 scripts/serve_local_preview.py \
  --wav "$PIANO_ANALYSIS/pass314-final-v4-stereo.json.wav" \
  --audit "$PIANO_ANALYSIS/pass314-final-v4-verification.json" \
  --render-revision 97dcd59 \
  --model-archive "$PIANO_ANALYSIS/pass265-excitation-current-inputs.json" --port 8000
```

Open `http://localhost:8000/`. This server binds only 127.0.0.1. It verifies the
complete PCM SHA against the audit before starting, serves no-cache public app
assets and fixed private model/audition endpoints, and supports WAV range requests.
The model response projects only baseFields/presetFields; original resource and
preset SHA bindings are checked at startup. No native context or private paths
are returned.
It does not expose the analysis directory. `verified-preview.js` is localhost-only;
the service worker excludes private endpoints from caching. Normal `npm run serve`
remains plain static hosting without the private audition. The server session may
not survive an app restart; use the command above. Inspect port/PID/cwd before
replacing a server and do not disturb unrelated processes.

## Latest independently computed boundary

Read `docs/ny-closed-loop-acceptance.json` and
`docs/pianoteq-owned-auxiliary-source-selection-pass314.md`.

Pass310 independently decodes the current NY kind2 release cue FLAC resource and
resamples it; all 31,616 native storage samples match. Pass313 completes the kind1
auxiliary waveform generator: seeded noise, two envelopes around AR filtering,
normalization, dyadic synthesis, static EQ, ceil-sized sine-squared windows and
descriptor peak scaling. All nine captured 96,000-word source tables match exactly.
The whole current bank contains 25 descriptors × 5 seed variants = 125 entries.

Pass314 integrates the generated bank into the continuous source/stereo chain.
MIDI note plus **freshly calculated** initialization detunes selects reflected
neighbor keys; row index selects variant modulo count. Local kind/key/variant
identities replace native bank pointers. All 30 selected primary/secondary
bindings match: **2,880,000 sample checks, zero differences**. Native source
waveforms and native pointer identities are comparison-only in this mode.

Important implementation files:

- `dsp/auxiliary-generated-bank.mjs`, `auxiliary-generated-waveform.mjs`.
- `dsp/auxiliary-wavelet-noise.mjs`, `auxiliary-ar-filter.mjs`,
  `auxiliary-wavelet-bands.mjs`, `auxiliary-wavelet-synthesis.mjs`,
  `auxiliary-wavelet-eq.mjs`, `auxiliary-waveform-shaping.mjs`.
- `dsp/auxiliary-source-selection.mjs`, `voice-initial-random.mjs`.
- `scripts/pianoteq_auxiliary_mid_producer.mjs` and
  `scripts/pianoteq_replay_release_continuous_chain.mjs`.
- `scripts/pianoteq_terminal_artifact.mjs` validates the explicit prediction boundary.

Do not replace the recovered arithmetic with textbook filters. AR prefix/body
paths differ in fused versus separately rounded arithmetic. Synthesis reflects
endpoints without duplication and its first extracted output remains in the fused
prefix. Leading window length uses ceil(float32(rate × .0005)); at 48kHz it is 25.
Separate recovered sinf/cosf are distinct from combined sincosf. Unsupported
nonempty scalar-EQ rendering and non-current bank branches fail explicitly.

## Evidence, reproducibility and private paths

Private analysis root:
`/Users/tianxing/.local/share/just-piano-analysis` (called P below). Read private
reports selectively; they contain commercial material and can be very large.

Authoritative final pass314 files:

- P/`pass314-final-v4-arguments.json`: exact source → spatial → stereo command arrays.
- P/`pass314-final-v4-source.json`, `pass314-final-v4-artifact/`.
- P/`pass314-final-v4-spatial.json`, `.bin`.
- P/`pass314-final-v4-stereo.json`, `.json.wav`.
- P/`pass314-final-v4-verification.json`: independent full-PCM audit.
- P/`pass314-final-v4-negative-boundary-audit.json`: both false boundary flags rejected.
- P/`pass314-current-wave-negative.json.auxiliary-failure.json`.
- P/`pass314-selection-negative.json.auxiliary-failure.json`.
- P/`pass314-terminal-legacy.json`: unchanged legacy calculation passes.

Expected positive results:

| Boundary | Result |
| --- | --- |
| Source | 14,292,040 checks, zero differences |
| Generated waveform bindings | 2,880,000 additional checks, zero differences |
| Spatial | 4,135,872 checks, zero differences |
| Stereo downstream | 7,015,168 checks, zero differences |
| Complete actual native PCM | 148,224 frames; stereo 24-bit/48kHz; 889,344 bytes identical |
| PCM SHA256 | `070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29` |

The source artifact binds 171 tracked JS closure files, all input digests and the
Python decode/FFmpeg dependencies. **A source closure change invalidates old
artifacts.** Regenerate into fresh private output paths before downstream tests.
Never relax that check or feed a historical prediction report into the engine.
The command arrays above are recipes, not prediction data; rename all output and
artifact paths when replaying. Source, spatial and global native captures are
separate observation runs; their exact supported boundaries do not prove an
input-only same-run engine. No comparison trimming, alignment, gain fitting or
tolerance relaxation was used or is allowed as a passing criterion.

One waveform comparison perturbation fails exactly once with unchanged calculated
audio. A pointer comparison target substitution fails 96,000 words with unchanged
owned selections and audio. These failures are intentional evidence; preserve
them. Failed auxiliary reports are saved before the main calculation rejects them.

Source input archives/observations needed by the recipes include:

- P/`pass265-excitation-current-inputs.json` (current model/preset/resource/MIDI bindings).
- P/`debug-pass110-tail-envelope-c/runtime.json`, `owned-resumes.jsonl`.
- P/`pass294-auxiliary-mid-source-v2/run-0`.
- P/`pass289-voice-spatial-alternating/run-0`.
- P/`pass284-global-excitation-passive/run-0` (complete native WAV reference).
- P/`pass274-generated-ir-pack-v2.json`, `pass279-static-drive-profile.json`.
- Other exact control/archive paths are retained in the command arrays.

## Remaining work — do not mistake local replay for completion

1. Recover late initialization controls from model/preset/MIDI: distribution,
   detune scale/control/counts and other branch conditions still have observed
   inputs. RNG state/draws are calculated, but the whole control source is not.
2. Recover auxiliary gains **including interpolation factors**, delays, filters,
   envelope/quiet profiles and raw dynamic gain controls. Current generated source
   identities are owned; captured gain pairs are still used for their amplitudes.
3. Remove remaining model registry/profile, source publication, voice selection,
   lifetime/scheduling and state dependencies. Finish the complete hammer-contact,
   string-feedback and damper-felt mechanics in continuous calculation.
4. Resolve native repeated-render variability. Prior half-damper experiments
   differ from the first onset; later scheduling differences alone do not explain
   that. Pass303/304 private evidence remains relevant; do not assert a cause.
5. Prove one MIDI/model/preset → full stereo path without native runtime controls,
   snapshots, intermediate audio, dispatch logs, pointer selection or saved
   prediction reports as calculation inputs. Baseline first, then all keys,
   velocities, repetitions, actual pedals, tails and factory presets.
6. Integrate that same verified engine into AudioWorklet. Verify audible parameter
   changes, save/reload, MIDI/keyboard behavior and measured realtime deadlines.
   The present live keyboard does not fulfil these research-engine requirements.
7. Complete the preserved migration differences, then full acceptance and only
   afterwards merge/release. Keep unrelated changes intact.

## Native/REA safety and process discipline

No Pedalboard. No protection bypass, native register/memory writes, injection,
debugger eval or stepping. The user previously authorized an isolated re-signed
debug copy, but it showed a cannot-run warning; do not repeat it or modify the
installed original to get around that. Do not resume unowned EXC_BREAKPOINT stops.
Before a new native run verify the previous target and wrapper are terminal and
the native PID is absent; a wrapper exit alone is insufficient. Current pass314
used read-only REA only; its session closed normally, no new native target ran.

Pinned thin binary P/`Pianoteq9-arm64` SHA256:
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
Pinned disassembly P/`pass3-arm64-disassembly.txt` remains available. REA helper
`scripts/rea-local.sh` pins rea-agents 6.5.0, Ghidra 12.1.4 and JDK21. The recovered
`scripts/rea-readonly-session.py` is currently untracked; preserve it and inspect
its provenance before any separate commit. Start with a PTY, send labelled JSONL
read-only queries, poll the same confirmed live handle during slow first imports,
then send `{"name":"stop"}` and verify terminal exit. Do not restart merely on an
observation timeout. Private sessions P/`pass311-rea-auxiliary-generated-bank`,
`pass312-rea-ar-filter`, `pass313-rea-wavelet-eq`, and
`pass314-rea-source-selection` retain the evidence. 8290f4 selects the bank;
918468 prepares auxiliary profiles; 715f98 loops over the rows; 655e40 generates
the waveform; 453114 adds the seed variant. Source EQ/window evidence is in pass313.

## Focused checks

```sh
node tests/auxiliary-source-selection.mjs
node tests/auxiliary-wavelet-noise.mjs
node tests/auxiliary-ar-filter.mjs
node tests/auxiliary-wavelet-bands.mjs
node tests/auxiliary-wavelet-synthesis.mjs
node tests/auxiliary-waveform-final-stages.mjs
python3 tests/local-preview-server.py
node tests/engine.cjs
git diff --check
```

The compile-reference tests require clang. FFmpeg is required for the current
release decode path. Use browser inspection to verify the visible preview and
actual playback; PCM structure or passing DSP tests alone do not prove the UI.
Report each turn's removed dependencies, real-audio result and remaining limits.
