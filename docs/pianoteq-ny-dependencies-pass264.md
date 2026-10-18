# NY complete-voice dependency and acceptance baseline, pass264

The active goal prioritizes a complete NY MIDI-to-stereo engine. The original
all-note/preset/browser objective remains intact. The current code does not yet
meet that goal. `ny-closed-loop-acceptance.json` records the concrete gates and
the permitted prediction-input boundary; it is an incomplete-work register,
not a success manifest.

## Freeze the baseline before comparing sound

The primary fixture is the NY FXP already used by the continuous-chain evidence,
SHA-256 `c9073553f6d62c716b874f15418902d15e58edc97a56f79b112ccb3e4a01e751`.
Its MIDI SHA-256 is
`efdde00ca65bcd7d04e8aa3906066ea4fe87fd8d94a70af76bcf7b89f40a6e67`:
five A4 velocity-96 strikes and CC64 changes. The unmodified factory
NY Steinway D Classical is a separate secondary reference. Their output setups,
effects, and final PCM cannot be treated as interchangeable.

`pianoteq_render_native_repeats.py` freezes MIDI/FXP inputs privately, verifies
the authorized executable's text and actual application resource, and launches
separate normal native CLI processes with identical explicit settings. It uses
no debugger or Pedalboard, changes no app code/preferences, records live PIDs
and terminal status, and never retries an uncertain process. Native WAV format,
full frame extent, complete PCM digest, and arguments are retained per run.

`pianoteq_compare_native_repeats.py` independently verifies those artifacts and
arguments. It requires complete PCM equality and equal lengths for a strict
repeatability pass. Common-extent and 50 ms window statistics are diagnostic
only; no alignment, trimming, normalization, fitted gain, or tolerance is used
to declare success. A measured difference causes exit status one even when
the measurement itself completed correctly.

## Remaining prediction dependencies in current code

| Boundary | What is independently computed | What still prevents a standalone closed loop |
| --- | --- | --- |
| Model/preset/MIDI inputs | Hash-bound archive decoding, velocity event mapping | Producer runtime context still explicitly contains extracted observed registry/curve configuration |
| Soundboard | Numerical archive-to-IR computation on tested NY configurations | Its output is not yet the sole source for the complete final convolution/routing path |
| Initial excitation | Coupled poles, primary/secondary source construction, several archive spectrum tables | `archive-excitation-producer.mjs` still restricts five A4/velocity-96 starts; expression and remaining spectrum controls are explicit/observed |
| Repeated strikes | Own release progress and carried histories; archive hardness/history calculations | Old-voice identity/selection and some branch/count inputs still come from the native chronology |
| Pedal and release | Event normalization/tables and many archive release coefficients | `sourceX`/`frozenX`, release flags and `u` still enter the replay from observed records |
| Scheduling | Some runtime routes and coefficient updates | `rattleDispatchRoute()` consumes observed flags/multi-voice gates; modal refresh uses observed `dispatch.required`; native record order drives execution |
| Modal state | Own P/Q initialization, state transport, damping, pruning calculations | Some selection/layout/threshold/adjustment and dispatch context remain explicit observed inputs |
| Complete consumer/tail | Verified computed worker/group WAV subsets and carried state | The report still marks `fullConsumerTailImplemented:false`; this is not an autonomous full render |
| Feedback and final mix | Separate implementations of substantial feedback/convolution/mix arithmetic | Feedback stereo code still marks pre-feedback groups, global route/sum, auxiliary samples and compiled plans observed |
| Browser | Existing keyboard/MIDI-capable synthesis UI/worklet | `piano-worklet.js` remains the simpler synthesizer, not the verified complete model chain |

These findings come from the current producer, continuous-chain replay,
`rattle-dispatch-control.mjs`, and the current feedback/fixed-shared stereo
sources. Other sessions' uncommitted stereo changes are inspected but preserved.
The pass259 continuous report has 14,252,134 checks and zero mismatches, while
also explicitly retaining observed controls and `finalStereoAudioVerified:false`.
That successful local replay cannot close the complete-voice gate.

## New native evidence and next investigation

The primary and secondary fixtures are rendered three times each without LLDB.
Three-repeat diagnostic arms preserve the same FXP and source timeline while
changing only the specified MIDI events: one strike, two strikes, three strikes,
or five strikes with sustain automation removed. Their source provenance and
`replacesPrimaryBaseline:false` are retained privately. They do not replace the
five-strike primary acceptance fixture.

The single-strike arm retains all original pedal events and yields three
identical complete 116,992-frame PCM payloads, SHA-256
`ab21fc8b0b1a739db6ed6062272158ac1c7c6f6aef0fd7a682cb5a10dd80b48e`.
The original five-strike primary has equal 148,224-frame lengths but different
PCM hashes. Its observed pairwise difference RMS spans about `8.32e-8..1.14e-7`
of full scale. Classical also has equal lengths across its three runs (151,552
frames), with larger pairwise differences. Removing sustain automation does
not eliminate variation; the two-strike arm also contains a divergent run.

| Three-repeat native arm | Frames per run | Complete strict repeatability |
| --- | ---: | --- |
| Original NY research fixture, five strikes | 148,224 | Failed |
| Factory NY Classical, same MIDI | 151,552 | Failed |
| One strike, original pedal events | 116,992 | Passed |
| Five strikes, sustain automation removed | 143,104 | Failed |
| Two strikes, original pedal events | 121,856 | Failed; one of three pairs is identical |
| Three strikes, original pedal events | 132,608 | Failed |

All eighteen native renders terminate zero. Within each arm the full frame
counts agree; different diagnostic arms are intentionally not compared as
equivalent inputs. The two-strike arm can diverge at frame 10,244, so a specific
three-voice reduction hypothesis would be premature. All final comparison
reports verify identical explicit arguments as well as frozen input hashes.

This narrows the next investigation to repeated-strike/overlapping-voice
initialization, scheduling, and subsequent processing. It does not establish
the cause. A particular summation order, randomness source, or effect cannot
yet be blamed. The single-strike pass is evidence for localization, not a
substitute for the required repeated-strike baseline.

A synthetic negative removes one final stereo frame while keeping every common
PCM byte identical and updating the artifact's extent/digests. The strict gate
still fails with one unmatched frame and zero common-extent differences. A
separate synthetic change to one run's dither argument is rejected before any
comparison report. These controls establish that the audit does not turn a
cropped-prefix match or differing render settings into a pass.

The next numerical work should trace the earliest per-strike divergence and
replace the corresponding observed event/state dependency with an independent
MIDI-driven producer. Native observations remain comparison or diagnostic data.
The independently generated final stereo must eventually cover complete attack,
sustain, release, retrigger and tail; there is no approved relaxed audio gate.

Private evidence: `pass264-*-fixture.json`, `pass264-*-repeats/`, and repeat
comparison reports under `~/.local/share/just-piano-analysis/`. All commercial
inputs and raw audio stay private. The original binary/resource pins remain
unchanged. This pass does not establish full engine equivalence, merge, or deploy.
