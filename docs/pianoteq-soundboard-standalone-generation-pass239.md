# Standalone archive-to-IR generation for the supported profile (pass239)

Date: 2026-10-17. A new numerical entry point generates soundboard responses
from decoded model/preset archives, privately exported microphone data and
explicit render settings. It accepts no native capture directory, target
descriptor, intermediate response or native output buffer. For the supported
Steinway NY ordinary profile, the complete nine-response output now matches
native model nodes without using captured numerical inputs.

This closes the **supported profile's numerical archive-to-IR path**, not every
model/preset branch and not the complete piano voice. The browser AudioWorklet
has not been replaced by this research generator.

## Last processing inputs removed

The existing REA producer analysis and immutable ARM64 listing establish:

- The model feature at `B+0x3f90`, returned by `0x10044bc7c`, controls whether
  the leading-silence flag follows a preset override. Its freshly decoded NY
  archive value is zero, so the producer writes leading-silence mode one.
  The preset-override branch is explicitly rejected in this implementation.
- Mode zero follows the producer's empty-kernel branch at `0x1001bb45c`:
  its optional kernel is cleared. Family zero supplies blend flags zero.
- The response blend and global spectral curve use the same independently
  recovered microphone mix vector. Channel count follows the active ordinary
  microphone count.
- Propagation retains the kind-zero source descriptors after accumulating image
  contributions. Filter identities/kinds/flags are reconstructed from the own
  receiver geometry, including whether its serial index is nonzero. No native
  processing-channel metadata is used for prediction.

The audited replay checks 25 additional processing values per group: 18 channel
metadata fields, three mix values and four policy controls. All six source
groups across open and partial lid match. Reports now distinguish captured audit
data from prediction dependencies: native processing metadata, blend controls,
rate controls and shaping curve inputs are false for this complete input path.
Complete native pointer-based objects are still not synthesized.

## Independent generator boundary

`dsp/soundboard-archive-ir.mjs` composes the numerical modules directly:
archive fields → model configuration → grid/excitation/CG/matrices → receivers
and images → observation groups → propagation → conversion/trim/filter/blend →
spectral shaping and inverse transform → time reconstruction/normalization →
rate conversion and final dispatch scaling. Its component loop generates all
three source groups in one independent process.

The runner reads exactly one numerical input file, the private decoded archive,
then writes a new private output directory only after generation completes. It
does not receive a native oracle argument. The separate verifier reads generated
responses and a terminal, error-free native oracle afterward. It compares actual
float32 payload words, normalization bits and output rate, with descriptor digests
and model-node ownership binding. The generator is never called by the verifier.

A dependency-boundary test traverses 62 numerical modules and rejects host/native
imports, dynamic imports and file/network reader calls. This is an architecture
regression check; it is not a security sandbox. Existing-output and in-repository
output guards are tested, and unsupported profiles leave no partial output.
Measured microphone tables, model data, presets and all computed/native responses
remain private. Public code contains no exported commercial curves.

## Authentic native comparisons

| Input profile | Native comparison boundary | Final values | Bit differences |
| --- | --- | ---: | ---: |
| Open lid, render 48 kHz | All nine native model nodes | 70,464 | 0 |
| Partial lid float32(0.37), render 48 kHz | All nine native model nodes | 76,032 | 0 |
| Open lid, render 88.2 kHz | Native group-zero dispatch triplet | 22,953 | 0 |
| First microphone identity changed 4 → 5 | New native group-zero dispatch triplet | 25,152 | 0 |

All corresponding normalization bits and output-rate values also match.
The two nine-node oracles were each captured in one native process; their
earlier detailed source-group observations remain separate processes. The
standalone generator does not read either kind of native observation.

The microphone-switch fixture changes only the first ordinary FXP microphone
identity and ordinary integrity digest. A fresh six-site native render exits
zero with no errors or pending resampling. Its first mix coefficient becomes
float32(0.2), rather than float32(0.9). Both audited replay and standalone
generation match the resulting triplet. It also produces non-silent native
48 kHz, 24-bit stereo audio, 105,472 frames, peak 0.2936007, RMS 0.0223727;
WAV SHA-256:
`90dca50d82ff4aaf372b68489d6e731afd9ac095f2abb5203ffad1a1f688490b`.
Native reference audio is **not** independent final stereo PCM equivalence.

## Negative controls

Changing three captured channel metadata fields, one captured mix coefficient,
kernel length, channel count, blend flags and leading-silence mode gives exactly
eight audit mismatches. Every computed raw-through-final response stays exact.
The negative replay exits one, including when the altered target claims a
nonempty kernel: the predictor uses the actual archive-derived empty policy.

Changing one generated response word and one generated normalization value,
while updating the response descriptor digest, gives exactly one payload
mismatch and one normalization mismatch. The separate verifier exits one.
It does not accept matching manifest hashes as a substitute for native payload
and metadata comparison.

```sh
python3 scripts/pianoteq_export_soundboard_archive_inputs.py \
  PRIVATE_RESOURCE builtin_presets_d4.dat steinwayny PRIVATE_FXP PRIVATE_NEW_MODEL_JSON
python3 scripts/pianoteq_export_soundboard_microphone_inputs.py \
  PRIVATE_BINARY PRIVATE_FXP PRIVATE_NEW_MODEL_JSON PRIVATE_NEW_JSON --render-rate 48000
node scripts/pianoteq_generate_soundboard_archive_irs.mjs PRIVATE_NEW_JSON PRIVATE_NEW_OUTPUT_DIRECTORY
node scripts/pianoteq_verify_generated_soundboard_irs.mjs PRIVATE_GENERATED_DIRECTORY PRIVATE_NODE_ORACLE
# For a native capture containing just one source group's dispatch outputs:
node scripts/pianoteq_verify_generated_soundboard_irs.mjs PRIVATE_GENERATED_DIRECTORY PRIVATE_GROUP_CAPTURE 0
node tests/soundboard-processing-config.mjs
node tests/soundboard-archive-ir-input-boundary.mjs
```

Private evidence: `pass239-generated-{open,partial}-v1`,
`pass239-generated-{open,partial}-verified-v2.json`,
`pass239-nine-audited-{open,partial}.json`,
`pass239-negative-processing-targets-result.json`, `pass239-generated-negative-result.json`,
`pass239-generated-rate88200-verified.json`,
`pass239-microphone-switch-model-chain-group0-v1`,
`pass239-microphone-switch-replay.json` and
`pass239-generated-microphone-switch-verified.json`.

## Remaining goal requirements

Supported branches still require family zero, mode zero, ordinary archive
curves, microphone identities 4/5, solo-zero configuration, explicit base/render
rates, the literal model source-position policy and a disabled model
leading-silence override. Other microphone identities, model families, solo and
special output modes, preset overrides, alternate FFT/curve branches and
preference-driven rate configuration need implementation and native evidence.
The pipeline rejects unsupported branches instead of claiming general coverage.

Continuous coupled hammer/string/damper computation, independent final stereo
PCM, all target notes and factory presets, AudioWorklet integration,
save/reload/performance acceptance and final UI/deployment gates remain open.
The existing dark UI is retained, and nothing is merged or deployed by this pass.
