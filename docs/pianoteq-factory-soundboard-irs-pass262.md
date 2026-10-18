# Factory archive-to-IR verification across thirteen models, pass262

The independent soundboard generator now matches one unmodified factory preset
from each of thirteen base models. Across the thirteen native processes, all
146 complete dispatch responses match: 1,280,128 float32 payload words, 146
normalization words, and 146 output-rate comparisons, with zero differences.
This is factory soundboard coverage, not all presets or complete piano audio.

## Direct factory inputs

`pianoteq_export_factory_soundboard_inputs.py` selects the named bank and factory
preset directly from the pinned resource, verifies resource/member integrity,
and requires completely decoded, single-model A78/A79 state and B89 base model.
It exports the selected model's soundboard fields, the factory preset's scalar
and microphone state, immutable binary microphone registry, and explicit render
rates. It does not require an FXP saved through the parameter API or any native
capture. Layered, incomplete, and non-ordinary output states are rejected.

The exported provenance includes the original complete A-state byte range,
version, and SHA-256. The separate native verifier requires that state digest,
the same factory name in the launch arguments, and the pinned resource hash in
the debug application's actual Resources directory. Existing FXP-bound oracle
verification remains supported. The numerical generator receives one decoded
archive JSON file and no native oracle argument.

The binary is pinned to SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`,
and the resource to
`d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`.
The shared registry reader is refactored without changing any of the previous
21 exported registry records. Commercial inputs and all responses remain private.

## Authentic numerical comparisons

All runs use normal `--preset` selection, `--no-prefs`, multicore zero, and
48 kHz / 24-bit / dither-off native export. All terminate with exit status zero
and no collector errors. Each process's completed soundboard groups are read
through one hardware observation site at `0x100057390`, with no target code,
data, or expression evaluation. Pedalboard is not used.

| Unmodified factory preset | Groups × microphones | Response values | Bit differences |
| --- | ---: | ---: | ---: |
| C. Bechstein DG Warm | 3 × 4 | 121,088 | 0 |
| Blüthner Improv | 3 × 2 | 23,936 | 0 |
| Bösendorfer VC Warm | 3 × 4 | 121,088 | 0 |
| NY Steinway D Classical | 3 × 4 | 121,344 | 0 |
| HB Steinway D Classical | 3 × 4 | 75,008 | 0 |
| Grotrian Warm | 3 × 4 | 121,856 | 0 |
| K2 Warm | 3 × 4 | 78,336 | 0 |
| Shigeru Kawai SK-EX Warm | 2 × 4 | 52,480 | 0 |
| Steinway B Warm | 3 × 4 | 103,680 | 0 |
| Ant. Petrof Warm | 3 × 4 | 120,320 | 0 |
| Petrof Mistral Warm | 3 × 4 | 122,880 | 0 |
| Steingraeber Warm | 3 × 4 | 121,088 | 0 |
| YC5 Focus | 3 × 4 | 97,024 | 0 |

These models still use the supported direct geometry family and ordinary output
policy. Different base models do not establish support for other geometry
families or special/binaural outputs. The comparison boundary is completed IR
dispatch groups; model-node ownership is not newly audited here.

## Gaps found and fixed

Blüthner's short responses require an 8192-point transform. The original
generator rejected that size before creating output. The new fixed plan uses
four lanes and scalar core `2048 = 2 * 4^5`, the recovered radix-2/radix-4
arithmetic, independently calculated coefficients, ordered packing, and inverse
preprocessing. Spectral shaping and time reconstruction now accept that plan.
All six Blüthner responses use FFT8192 and match natively, including non-unity
power shaping and identity-4 microphone curves. The failed attempt and terminal
state are preserved; the corrected generator uses the same native oracle.

SK-EX has two soundboard components, so the previous fixed-three-group check
rejected a terminal, error-free capture. Counts now come from the decoded base
model and active factory microphones. The verifier requires every expected
group and channel and checks all payload extents; it does not accept a prefix
or subset. The original two-group native capture supplies all eight exact
outputs. Both original rejected batch records remain private.

## Relevant tests and negative controls

The new FFT8192 test covers impulse, analytic DC/Nyquist/cosine/sine frequency
placement and sign, unscaled inverse, bitwise reorder bijection, and invalid
inputs. Existing FFT16384/32768, inverse spectrum, and time reconstruction tests
pass. The numerical dependency audit traverses 64 DSP modules with no native,
file, or network input dependency. The new verifier is rerun against all thirteen
native captures with its final variable-group/channel rules.

Wrong factory names and complete-state digests are rejected before a report is
created. Removing a group or channel from the SK-EX capture is rejected, and a
nonexistent factory preset produces no partial input file. The earlier
three-channel FXP positive and payload/normalization/rate negative controls
retain their expected outcomes with the extended verifier.

All thirteen native runs also produce actual non-silent stereo WAVs, inspected
for format, full PCM digest, peak, and RMS. Those are native reference renders;
they do not establish independent final stereo audio equivalence.

```sh
python3 scripts/pianoteq_export_factory_soundboard_inputs.py \
  PRIVATE_RESOURCE builtin_presets_yc5.dat 'YC5 Focus' PRIVATE_BINARY \
  PRIVATE_NEW_ARCHIVE --render-rate 48000
node scripts/pianoteq_generate_soundboard_archive_irs.mjs \
  PRIVATE_NEW_ARCHIVE PRIVATE_NEW_GENERATED_DIRECTORY
node scripts/pianoteq_verify_generated_soundboard_triplets.mjs \
  PRIVATE_GENERATED_DIRECTORY PRIVATE_ARCHIVE PRIVATE_TERMINAL_NATIVE_CAPTURE PRIVATE_NEW_REPORT
node tests/real-fft-8192.mjs
```

Private evidence under `~/.local/share/just-piano-analysis/` includes
`pass262-factory-irs/*/report-final.json`, `pass262-factory-soundboards-report.json`,
`pass262-factory-native-audio-report.json`, factory binding/group negative
reports, and immutable runtime closures v1/v2/v3. No native oracle or numerical
capture is an input to independent IR generation.

## Remaining objective

Only one factory preset per tested model is established here. Remaining factory
presets, undecoded base models, other geometry families/output policies, and
arbitrary rate/preferences remain unverified. Capture-free continuous coupled
hammer/string/damper computation, independent final stereo, all note/velocity/
pedal combinations, AudioWorklet integration, persistence, and real-time
performance remain open. The dark cinematic UI is retained. Nothing is merged,
deployed, or claimed complete by this pass.
