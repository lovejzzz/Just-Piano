# Generated bank and owned source selection in continuous audio, pass314

The supported NY baseline now uses the pass313 generated kind1 bank in continuous
source calculation. Native auxiliary waveform samples and native bank pointers
no longer supply prediction data or select primary/secondary source identities.
MIDI note pitch, calculated initialization detunes and row index choose generated
entries. The release cue continues using the independently decoded/resampled
kind2 source from pass310. Other initialization/control/profile/scheduling inputs
remain observed; this is not a capture-free instrument or browser acceptance.

## Selection and integration

918468 calls 8290f4 with note plus a twelve-uniform random pitch perturbation.
The continuous excitation calculation already carries its RNG through support,
merge and late initialization. This pass forwards its freshly calculated three
detunes to the auxiliary producer; it does not read them from a saved prediction
report. Note numbers come from the same bound MIDI clock used for source ages.

`selectAuxiliarySource` reproduces reflection around the bank's low/high keys,
adjacent-key search and float32 interpolation weights. An exact interior key
retains the preceding primary with zero weight and the matching secondary with
unit weight. A primary weight rounded to one clears the secondary. Endpoints
use a single source. The row index selects a dense variant modulo that key's
variant count. If the secondary waveform is longer, the two sources and weights
swap. Current NY source waveforms have equal extents, so no swap occurs there.

The producer generates all 125 bank entries afresh and constructs a map using
local kind/key/variant identities. Each of the five MIDI voices receives three
rows selected from this map. Captured primary/secondary pointers are consulted
only to compare complete native target tables, then are replaced in the
calculated row configuration. No hash matching chooses a prediction source.
All 30 primary/secondary bindings compare exactly: 2,880,000 sample checks.

The initializer's distribution configuration, detune scale/control/counts and
some other numerical initialization inputs still come from existing native
observations. The RNG state and random draws are calculated; this pass does not
claim that the full control source is independently produced. Auxiliary gains,
including their interpolation factors, delays, filter coefficients, initial
envelope/quiet profile and raw dynamic gain controls also remain observed.
Computed interpolation weights are not substituted for those captured gains.

Read-only caller evidence:
`ev_a07b6b931a989c49a7749fdb944896dab78742b08ab59d77b65fccc73597f773`.
715f98 row-initialization evidence:
`ev_ad05964d5bec54f27f27d4165f4069bcb23fdc6b880097d1e6065820bed08d9f`.
The REA session closes normally with exit 0; no native target is launched.

## Continuous numerical and real-audio verification

The new `--computed-auxiliary-waveforms` option requires current archive release
waveform calculation. With all existing computed-source options enabled:

- Source calculation: 14,292,040 checks, zero differences. Generated-bank binding
  checks are additional, rather than included in this existing count.
- All 636,288 auxiliary row audio samples and 212,096 cue audio samples remain
  exact against actual native observations. Auxiliary row SHA is
  `2fcbcc2d88be6394593a976113a3adea2f1abe9691ceddc5b1ddd786611028e5`.
- Spatial processing: 4,135,872 checks, zero differences.
- Downstream stereo processing: 7,015,168 checks, zero differences.
- Complete native WAV comparison: all 148,224 frames, stereo 24-bit at 48kHz,
  889,344 PCM bytes identical. PCM SHA is
  `070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

No cropping, alignment, gain fitting, normalization or tolerance is applied to
the comparison. The original source/spatial/global captures remain separate
observation runs; their exact supported boundary calculation does not establish
one capture-free same-run engine, broader native repeatability or browser sound.

## Negative controls and provenance

`--poison-generated-wave-target` changes one comparison value. Exactly one
generated-wave comparison fails while calculated auxiliary and cue audio hashes
remain unchanged. `--poison-generated-selection-target` substitutes one alternate
native table only as the comparison target. All 96,000 target samples fail while
owned selections and calculated audio remain unchanged. Neither test alters
original observations. Failed auxiliary reports are saved privately before the
top-level calculation rejects them; failed runs cannot produce passed artifacts.

Terminal artifacts record both nativeKind1WaveformsUsedForPrediction=false and
nativeKind1PointerSelectionUsedForPrediction=false. Reading requires agreement
with the bound source report and its explicit generated-source boundary. A
manifest that falsely marks pointer selection as a prediction input is rejected.
The legacy source mode also passes its original checks with unchanged audio.

Unit tests cover reflection, interior exact keys, endpoints, modulo variants,
longer-primary swapping and the unit-weight rounding edge. Generated wavelet,
EQ, shaping and earlier component tests remain passing. Commercial resources,
source tables, MIDI/preset/model contents, native audio and verification reports
remain private.

## Remaining work

Recover the remaining initialization controls and auxiliary gain/filter/delay
production from model/preset/MIDI sources. Then remove other runtime profile,
publication/voice scheduling and state dependencies, resolve native repeated
render variability, and prove the whole mechanical/excitation/feedback/damper/
soundboard path in one continuous input-only calculation. All 88-key, velocity,
pedal and factory-preset coverage, same-engine AudioWorklet integration,
parameter edit/save/reload, measured realtime performance and release gates stay
open. No merge or deployment is performed.
