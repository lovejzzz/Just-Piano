# Upright soundboard archive-to-IR computation, pass263

The independent soundboard path now matches U4 Small and U4 Recording, including
their family-one coordinate transform and the latter's nonzero height input.
Each produces two groups × two microphone responses: 3,968 float32 values, four
normalization words, and four output rates, all bitwise exact. Neither native
intermediate geometry nor processing buffers are inputs to prediction.

## Source evidence and equations

Current source inspection is authoritative: the B decoder already supports
`su118`. The old pass14 inventory showing an incomplete prefix is stale. The
actual blocking guards were in the numerical soundboard generator's family-zero
path, followed by its unsupported short FFT size.

A new REA/Ghidra read-only session decompiles `0x10005db2c`, `0x100013eb4`,
`0x100297054`, and `0x1003ca83c` from the pinned original ARM64 binary. All four
queries succeed and the REA process terminates zero. The immutable instruction
listing resolves float-return ABI omissions in the plane-height decompilation.
For family one, ordinary mode zero:

```text
primary position: [x, y, z] -> [x, z, -y]
direction:        [x, y, z] -> [x, z, -y]
```

When the base root type at B+0x10 is one, the primary's transformed z receives
`f(height + z)`, using the preset's A+0x17c0 field. Direction receives no height
translation. The plane-height helper returns
`f(modelPlaneHeight + max(f(0.001), height))`; the minimum's exact word is
`0x3a83126f`. Family-one orientation metadata is also set explicitly.

The output state's final `extra` pair supplies A+0x17c0 / A+0x17c4. Its second
field is the level in dB: for nonzero level, the third lid/image gain is
multiplied by `expf(f(levelDb * f(ln(10)/20)))`. The root lid-enable fallback
comes from decoded B+0x18c8. The factory and FXP archive exporters now preserve
these root fields. Existing family-zero archives with enabled preset lids
retain their supported path without invented upright defaults.

`soundboard-family-policy.mjs` selects those fields and rejects unknown families,
mixed component families, missing upright root type, nonfinite height/level,
or malformed root-lid policy. Microphone, model-config, and gain construction
require matching explicit family policy for the upright branch. Numerical
processing remains in ordinary output mode; special/binaural paths are excluded.

## FFT2048 and authentic native validation

U4's short response requires FFT2048. The first independent attempt correctly
rejects that size before writing output. The new fixed transform uses four lanes,
scalar core `512 = 2 * 4^4`, independently generated coefficients, native-order
radix-2/radix-4 arithmetic, ordered packing, and inverse preprocessing. Spectral
shaping and time reconstruction use that plan for both U4 source groups.

Two normal native `--preset` runs use the authorized debug copy with `--no-prefs`,
multicore zero, and 48 kHz / 24-bit / dither-off audio export. Both exit zero
with no collector errors. Each uses one read-only hardware observation site at
the completed IR dispatcher. No target code/data modification or Pedalboard is
used. The independent generator reads only its decoded archive; the separate
verifier binds the factory state/resource and compares the complete responses.

| Factory preset | Height input | Responses | Float32 values | Bit differences |
| --- | ---: | ---: | ---: | ---: |
| U4 Small | 0 | 4 | 3,968 | 0 |
| U4 Recording | 1 | 4 | 3,968 | 0 |
| Total | | 8 | 7,936 | 0 |

The two factory configurations produce different IR payloads, each matching its
own native oracle. Both use root type one, zero level in dB, and enabled preset
lids. Nonzero level gain, disabled-lid fallback, other root types, and special
output branches are not claimed authentic-native-verified by this pass.

The native runs also produce actual non-silent stereo WAVs. Their format, full
PCM hash, peak, and RMS are recorded privately. This pass validates independently
generated IRs; it does not establish independent final stereo PCM equivalence.

## Regression and negative evidence

- NY Steinway D Classical is independently regenerated after the family-policy
  integration: all 121,344 response values, normalizations, and rates still match.
- Altering one native response word while updating its descriptor hash, one
  normalization word, and one group's output rate yields exactly one payload
  difference, one normalization failure, and two rate failures. Prediction files
  remain unchanged, and verification exits one.
- Increasing only the independent U4 Recording height input by 0.125 yields
  3,615 payload differences and four normalization failures against the actual
  factory oracle. This synthetic negative is a dependency check, not another
  successful native parameter experiment.
- FFT2048 analytic bins/sign, impulse, inverse, reorder, and scope tests pass,
  as do relevant model/source/microphone/lid/processing tests and previous FFT
  and reconstruction tests. The numerical input-boundary audit covers 67 DSP
  modules with no native/file/network input dependency.

The source and processing scope tests now reject family two rather than the
newly native-verified family one. Missing explicit upright policy is still
rejected. Error-message compatibility fixes preserve existing guard tests;
numerical comparison criteria and tolerances are unchanged.

Private evidence under `~/.local/share/just-piano-analysis/` includes
`pass263-upright-rea-v2/`, `pass263-upright/{small,recording}/report-final.json`,
`pass263-upright-report.json`, `pass263-ny-regression-report.json`, and the height
and native-target negative reports. Failed unsupported-size attempts and their
terminal evidence remain private. Final numerical sources are frozen in
`pass263-runtime-v3`. No commercial curves, presets, responses, or WAVs are public.

The original binary/resource SHA-256 pins remain those in pass262. Other models,
remaining factory presets, special geometry/output modes, capture-free complete
coupled voice, final stereo, all-note/velocity/pedal coverage, AudioWorklet,
save/reload, and performance acceptance remain open. The dark UI is retained;
no merge or deployment occurs.
