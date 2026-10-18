# Calculated release cues and auxiliary source through complete stereo, pass294

The diagnostic stereo chain now calculates the remaining auxiliary per-block
audio, including the extra mono release source. It no longer consumes native
per-block auxiliary audio on this path. Native-generated source waveform tables,
initial profiles, cue configuration and remaining runtime controls/scheduling
are still inputs. This is not capture-free MIDI-to-stereo equivalence or complete
hammer/string/damper reconstruction.

## Release cue calculation

Instructions76170c render time-windowed events into an initially zero mono row.
Each event mixes a primary table and optional secondary table, applies its own
four-word scalar filter history, and adds its result in event order. The fixture
uses two events with non-block-aligned starts and a primary source table. The
76170c source and the optional5f6d30 faded source are separate objects; the latter
is observed inactive on all3,314 blocks and its active branch remains unsupported.

For event coefficients c0..c4 and history [x1,x2,y1,y2], with f=float32:

```text
y = f(c2*x1)
y = fma32(input,c4,y)
y = fma32(c0,x2,y)
y = fma32(c3,y1,y)
y = fma32(c1,y2,y)
history = [input,x1,y,y1]
output = f(y + output)
```

`VoiceReleaseCue64` owns zero-started histories, source age and quiet state.
MIDI note-off starts its counter at zero. Subsequent same-key note-ons cancel
events whose start is still ahead of the cue counter, leaving started events
running. This matches all actual gain changes and histories in this fixture;
it is not a general voice-selection or pedal policy proof. Event timing,
initial gain/filter values and waveform tables remain captured configuration.

The auxiliary component joins the existing table source, MIDI release envelope
and quiet retirement with the actual460b54 gain `f(voice9c*voice8c)`, followed by
the ordered mono addition into all three auxiliary rows. Voice8c is captured as
1 on every block, not inferred by dividing target audio. The auxiliary processor
flag is observed zero; active auxiliary processing is rejected.

## Complete same-capture component evidence

The two-site passive collector alternates301c8c and460c84 with one active site.
It captures all3,314 blocks over five voices, the three auxiliary target rows,
the actual extra mono row, source/configuration and before/after state. All6,628
phase transitions pass. Native PID30998 exits0 with no errors or pending pair;
its PID is absent before further work. Code, registers and target data are not
written, and no protection or unowned exception is bypassed.

All1,059,095 checks pass with zero differences, including all636,288 auxiliary
samples,212,096 extra mono samples and observed cue/filter/envelope/retirement
states. The complete calculated auxiliary artifact SHA256 is
`2fcbcc2d88be6394593a976113a3adea2f1abe9691ceddc5b1ddd786611028e5`;
the extra mono SHA256 is
`95b3c83cba084213a841bc69656a2b02ceb93cc1f0e126edee8865d2f8414e4d`.

Every calculated auxiliary block also matches the old continuous capture's
audioReturn boundary by voice/age, without using those samples as inputs.
An audio-target bit mutation fails once with unchanged calculated auxiliary
and mono hashes. Synthetic tests additionally cover unaligned windows, ordered
overlap, quiet-state freezing, pending cancellation and rejection of noncold
history. These are distinct from authentic native audio coverage.

## Continuous source, spatial and full stereo integration

`--auxiliary-source=<complete-private-mid-capture>` computes this component
inside the fresh continuous source run. Its calculated pre-mid rows feed the
consumer-cross computation; its calculated post-mid rows pass through the
Rattle boundary and terminal/time envelopes. Native auxiliary intermediate rows
are targets only. Missing or failed calculated sources are rejected.

All14,262,172 continuous comparisons pass, including the terminal auxiliary
samples that previously failed. The bound terminal artifact adds the auxiliary
capture, waveform tables, helpers and input hashes to its provenance and the
155-file current numerical source closure. It reports
`nativeAuxiliaryEntryStillObserved:false`, propagated through spatial and stereo
readers. Historical prediction reports are not calculation inputs.

The calculated terminal source passes4,135,872 spatial comparisons and feeds the
existing complete downstream stereo engine. All7,015,168 downstream signal/state
checks pass. Every24-bit sample in all148,224 exported stereo frames matches the
full reference, without alignment, trimming, normalization or tolerance changes.
Python independently reads both full WAVs and verifies their PCM bytes and
format. Complete PCM SHA256:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

Source/control/spatial/full-stereo evidence still comes from separate captures
of the same pinned fixture. This does not establish identical native render
chronology or resolve the remaining repeatability question. Native waveforms
are still a prediction dependency even though per-block native audio is removed.

## Preserved failures and acceptance boundary

The first collector reads an inactive source's unused pointer and is rejected
before recording audio; PID30920 subsequently exits0. That run is excluded and
its logs remain. The corrected collector follows the native early-return flag
and does not read inactive source internals. The first cue replay rejects an
incorrect fixed-event-gain assumption; MIDI pending-event cancellation resolves
it. Earlier pass293 integration failures and their patch remain private.

Corrupted terminal audio is rejected before producing requested spatial report
or audio. An initial corruption check instead rejects a stale producer closure;
the corrected check uses the current closure and reaches the binary integrity
guard. A one-bit PCM target negative fails with unchanged complete output WAV.
The legacy continuous source path is also rerun to check optional-path behavior.

Private evidence uses pass294 prefixes under `~/.local/share/just-piano-analysis/`:
captures, waveform tables, component reports/audio, fresh terminal artifacts,
spatial and stereo outputs, negative controls, failure logs and published audit.
Only code/tests/documentation are committed. Initial source/profile generation,
raw controls, lifetime/dispatch/routing, full physical coupling, repeatability,
independent final audio, all-key/velocity/pedal/preset coverage and browser/
persistence/performance acceptance remain open. No merge or deployment occurs.
