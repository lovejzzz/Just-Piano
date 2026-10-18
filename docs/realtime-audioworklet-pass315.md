# Experimental playable research adapter — pass315

The local keyboard now sends note/pedal/parameter messages to an AudioWorklet
which synthesizes stereo audio. It does not play rendered note WAV files.
This is a recovered-module integration with an explicit independent voice bridge;
it is not the complete pass314 offline pipeline or Pianoteq sound equivalence.

## Verification story

Enable audio → loopback model/preset projection → Worker computes all 88 modal
templates and 125 generated auxiliary waveforms → transferred buffers → Worklet
owns recurrence/state → key events → live stereo → existing EQ/room/master graph.

| Boundary | Evidence |
| --- | --- |
| Page → private model endpoint | HTTP 200; only baseFields/presetFields; no native snapshots/context/pointers |
| Model → worker preparation | 88 keys; 125 tables; private Node preparation 15.08 seconds |
| Worker → Worklet | UI reaches “NY 研究引擎 · 88 键实时合成 · 48 kHz” |
| Computer keys → audio output | 3 actual input events; nonzero output peak ~0.120; no nonfinite output |
| Sustain/demo/screen key → same engine | 22 starts including sustained notes, 18-note phrase, pointer C4; no nonfinite output |
| Parameter save/reload | Hammer changed to 70%, persisted across refresh; same settings sent on initialization |
| Private data boundary | Python tests reject other private routes/path traversal; model projection removes nativeState/contextPath; private endpoints no-store and excluded from service worker |

Short phrase run: coarse Date.now maximum quantum computation 2 ms and zero
recorded >2.667 ms computations. This is a coarse computation diagnostic, not
end-to-end latency or absence-of-dropout proof. Node 12-note chord rendering:
713.4 ms CPU / one second audio, so heavy polyphony optimization remains necessary.
No physical MIDI controller or subjective native timbre comparison was performed.

Private model sweep: 88 keys × velocities 30/80/127 = 264 starts, each with
nonzero finite synthesis; aggregate peak 0.6561 and zero nonfinite values.
Audit is private `live-browser-model-audit.json`; no model or generated tables are
committed. Synthetic tests cover velocity, soft pedal, hammer, decay, sustain,
release, panic, limits, repeatability, snapshot rejection and kernel scratch reuse.
`npm test` and `python3 tests/local-preview-server.py` pass.

Shared modal kernel scratch changed allocation only. Fresh source→spatial→stereo
regression: 14,292,040 source checks, zero mismatches; spatial/stereo zero
mismatches; resulting entire WAV identical to pass314. This is the existing
observed native fixture regression, not equivalence of the live adapter.

## Remaining boundaries

- Static per-note source initialization; source hardness/velocity coupling is not
  fully reconstructed for live events. Spectral hammer/gain bridge is experimental.
- Continuous contact force, string feedback and felt/damper coupling are incomplete.
- Explicit runtime defaults replace unresolved controls; no native control snapshots.
- Live release gate, voice scheduling, pan/body/EQ/room/mix differ from native chain.
- Maximum 24 voices and 2,048 modal lanes; quiet/released voice stealing bounds work.
- Six UI voicings edit one model; no factory preset acceptance.
- Plain static/public hosting retains the earlier engine without private model data.

The optional offline reference stays collapsed and preload=none. It has its own
play button, separate from the live keyboard and synthesized demonstration phrase.
