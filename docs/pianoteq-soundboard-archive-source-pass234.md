# Archive-derived soundboard source inputs (pass234)

Date: 2026-10-17. For the supported Steinway NY profile, the independent IR
replay now obtains its selected model and preset source fields from decoded
resource/FXP archives. Native model/preset snapshots remain audit targets;
they are no longer prediction inputs when `--archive-inputs` is supplied.

## Source mapping

The version-89 base archive field at object offset `0x3d68`, previously labeled
`filters` by the parser, contains the three soundboard component records.
Supported records have version 9 and child version 5. The sparse source builder
maps geometry, propagation controls, bridge and mode vectors, shaping scalars,
the ordinary global-curve dimension, and the lid-gain curve to the named inputs
used by the independent configuration builder. In particular, the serialized
four-value child control group maps to `0x178`, `0x1d0`, `0x1d4`, `0x1d8`,
rather than four contiguous native offsets. Preset fields `0xf98`, `0x1018`,
`0x1020`, `0x1024` supply height scaling, propagation speed and lid state.

These are numerical source views, with zero pointer slots, never passed into
the original program. They do not recreate complete native objects. Unsupported
versions/families and malformed, special or indexed curves are rejected.

The fresh private export verifies all 1,105 resource member MD5s, selects the
unique completely decoded model identity, and verifies the ordinary FXP
integrity through the existing parser. Resource SHA-256:
`d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`.
Bank `builtin_presets_d4.dat` MD5: `fc0f126cc039901f125fb57ccfbcf189`.
Commercial values, presets, captures and decoded exports remain private.

## Authentic native comparisons

Every source group checks 54 source words and two source bytes against its
bound native model/preset/vector/curve observations, with zero differences.
The complete replay then computes grid, excitation, matrices, receiver images,
observation groups, propagation and spectral/time processing. Its final hashes
match the independent single-process nine-node native oracle for both profiles.
The three source groups were captured in separate native processes.

| Profile | Final nine-response values | Bit differences |
| --- | ---: | ---: |
| Open lid | 70,464 | 0 |
| Partial lid, float32(0.37) | 76,032 | 0 |

Negative controls establish the prediction boundary:

- Changing the captured model source-position word and preset lid word produces
  exactly two source-word audit failures. The computed model configuration,
  raw responses, normalized outputs and final dispatch responses remain exact.
- Changing the actual decoded preset lid by `-2^-20` changes all six raw
  responses (10,930 / 11,034 / 11,052 / 10,976 / 10,973 / 11,074 words), and
  changes 8,110 / 8,142 / 8,300 final dispatch words. The old targets fail.
- Synthetic tests cover noncontiguous offset mapping, absent pointers, invalid
  versions, duplicate/missing preset fields, nonfinite values and invalid curves.

Both negative replays terminate with exit status 1 as required. Neither is
counted as a positive native-equivalence fixture.

```sh
python3 scripts/pianoteq_export_soundboard_archive_inputs.py \
  PRIVATE_RESOURCE builtin_presets_d4.dat steinwayny PRIVATE_FXP PRIVATE_NEW_JSON
node tests/soundboard-archive-source.mjs
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_GROUP_0 PRIVATE_GROUP_1 PRIVATE_GROUP_2 \
  --archive-inputs PRIVATE_NEW_JSON
```

Private evidence: `pass234-archive-inputs`, `pass234-nine-archive-open.json`,
`pass234-nine-archive-partial.json`, `pass234-negative-source-targets-result.json`
and `pass234-negative-archive-lid-result.json`. Positive runs reuse the terminal,
error-free pass233 native captures; no additional target process was needed.

## Remaining scope

This closes archive sourcing of the implemented scalar/lid subset for one
model profile. Later shaping curves, primary microphone configuration and
runtime output-rate/blend controls still include native captured inputs.
Other families and source policies need independent evidence. Reports retain
`fullDispatcherConfigurationComputed=false`, `fullModelToIrGenerationVerified=false`,
`completeVoiceVerified=false` and `finalStereoAudioVerified=false`.
These IR comparisons do not establish complete piano-audio equivalence.
Continuous coupled hammer/string/damper calculation, final stereo PCM,
all-note/preset coverage, browser AudioWorklet integration, save/reload and
performance acceptance remain open.
