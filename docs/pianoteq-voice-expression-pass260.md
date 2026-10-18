# Voice expression coefficients, pass260

This pass recovers one nonzero controller-to-voice branch. It does not complete
the coupled voice, establish final audio equivalence, or integrate active
Celeste into the browser engine.

## Calculation and native evidence

At arm64 `35f2c4..35f320`, with `f` meaning float32 rounding, the initialized
voice receives:

```text
complement = f(f(1 - ec) - ec)
u = f(fma32(mix, complement, ec) * gain)
control30 = f0
lowerControl = (config16 == 1 && config17 == 1 && (config14 & 1))
             ? specialValue : f4
```

The new DSP module implements those rounding stages and configuration selection.
The single hardware observation at `35f324` reads inputs and completed outputs;
it never writes target registers, code, or data. The existing capture driver
verifies the authorized debug executable's text before installing the hook.
All six accepted native runs terminated with exit status zero and no collector
errors. No Pedalboard path is used.

U4 Small maps CC69 to Celeste Pedal, internal parameter 14 / event 10. For this
preset, `ec` is independently reconstructed from MIDI controller bytes using the
previously recovered scalar event normalization. CC69 alone is insufficient:
the NY preset maps it to Harmonic Pedal instead. The MIDI helper requires the
explicit parameter identity and rejects the harmonic identity or no identity.

In the observed U4 configuration, `mix=0`, `gain=0.5`, `f0=f4=specialValue=0`,
and configuration bytes are `[0,0,0]`. Thus the observed active axis is
`u = f(0.5 * ec)`, spanning 0 through 0.5. The profile values remain observed
configuration inputs, not independently decoded preset roots. Neither nonzero
`control30`, nonzero `lowerControl`, nonzero mixing, nor the alternate special
configuration branch has authentic runtime validation in this pass.

## Verification

`pianoteq_verify_voice_expression.mjs` checks chronological MIDI note-on events,
preset selection, isolated native arguments, terminal status, and error-free
read-only capture before comparing source-derived `ec` and the three outputs.
The captured `ec` and final targets are comparison-only. Getter denial guards
prevent the MIDI helper from reading them through its profile input.

| Native observation | Starts | Comparisons | Mismatches |
| --- | ---: | ---: | ---: |
| U4 Small, all 128 CC69 values | 128 | 512 | 0 |
| U4 Small, CC69 0/1/32/64/127 | 5 | 20 | 0 |
| NY, CC67 0/1/32/64/127 | 5 | 20 | 0 |
| U4 audio off A / off B / on | 15 | 60 | 0 |

The NY experiment verifies that these three axes remain zero in that scenario;
it does not imply that Soft Pedal has no acoustic effect. Changing one captured
`ec` and three final targets produces exactly four mismatches while all 128
independent predictions remain unchanged.

Private evidence lives under `~/.local/share/just-piano-analysis/`:
`pass260-expression-capture/`, `pass260-all128-expression-report.json`,
`pass260-expression-target-mutation-report.json`, and
`pass260-native-celeste-audio-report.json`. Native captures, factory resources,
presets, and WAVs are not checked in.

## Actual audio and remaining limits

Three actual native stereo renders use the same five A4 velocity-96 strikes,
48 kHz / 24 bit / dither off: CC69 off twice and CC69 fully on once. The two
off renders contain 210,688 frames each; on contains 210,944. On their shared
421,376-sample prefix, off-repeat difference RMS is `6.748922574449543e-6`
and off-versus-on RMS is `0.025880973011228554` (full scale normalized).
The much larger on/off difference is useful evidence, but the baseline is
not bit deterministic and the tails have unequal lengths. This is a descriptive
native audio comparison, not an isolated causal proof or independent-engine
audio match. No shorter comparison window is treated as a passing audio gate.

A separate legitimate Pinch Harmonic parameter API attempt did not become ready
while offline rendering. No parameter was successfully applied; that run is
preserved privately and excluded from active-control claims.

Next work remains: recover controller/profile roots for all three axes, validate
nonzero control30/lowerControl, replace every downstream expression alias in the
continuous producer together, and compare independently generated complete
stereo with controlled baseline behavior. The complete hammer/string/damper,
all-preset, save/reload, and browser performance gates remain open.
