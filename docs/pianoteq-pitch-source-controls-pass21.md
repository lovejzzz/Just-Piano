# Dynamic pitch source controls (pass 21)

`dsp/pitch-source-controls.mjs` reconstructs the static producer of voice offsets `+938`, `+93c`, `+940`, `+934`, and initial `+930`. It does not implement the time-dependent pitch update, and host field `H+78` and the shared velocity controls remain explicit inputs. The lower-level source API accepts `H+80`; the integrated replay computes it with the velocity helper.

`archivePitchSourceControls({baseFields, note, host78, host80, runtimeCurveMode})` evaluates scalar base curves `B+3a90` and `B+3ae0` at the actual float coordinate `G+14`. The runtime curve mode must be independently established and is passed to the existing strict `linearModelCurve` evaluator. `pitchVoiceSource` also accepts the two already evaluated base controls directly. Its results map as follows:

| Result | Native voice field |
| --- | --- |
| `strength` | `V+938` float |
| `decay` | `V+93c` float |
| `velocityScale` | `V+940` float |
| `exponentialBranch` | `V+934` byte |
| `initialDisabled` | `V+930` byte, cleared at initialization; separate from note-off |

The curve producer is `1c5320`, instructions `1c5ef0..1c5f44`: virtual getter slot zero supplies B, calls to `019a34` use `s0=G+14` and `w1=3`, and the results are stored at `G+1008/+100c`. These curves are serialized inside `B+2f10` mar_param, at relative offsets `+b80/+bd0`; they are not top-level fields in the decoded archive. The module resolves this nested schema. This is a base-model source; no preset curve is inferred at these offsets.

`715f98`, at `7185fc..718664`, loads those two controls into a two-float vector. If `H+78 <= 1` they pass through unchanged. Otherwise define `r32` as float32 rounding:

```
x = r32(H78 + float32_word(0xbf99999a))
a = x < 0 ? 0 : r32(min(x, 1) / float32_word(0x3dcccccd))
c = r32(1 - a)
strength = fma32(baseStrength, c,
                r32(r32(baseStrength + float32_word(0x3c23d70a)) * a))
decay = fma32(baseDecay, c, r32(20 * a))
```

The upper clamp occurs before division; `a` can reach ten. The implementation preserves this ordering rather than substituting a conventional interpolation clamp. `718664` writes the vector to the parameter structure at `+2c/+30`. `7185dc..e0` writes `H+80` to the same structure at `+18`.

The configure callee `43dcb0` copies parameter floats `+2c/+30` to `V+938/+93c` at `43dfe4..e8`, and `+18` to `V+940` at `43dfec..ff0`. `43dfe0` independently clears `V+930`. `43dfd4..dc` copies shared-object bytes `+19..+1c` into `V+931..+934` (the destination is `x24+15`, with `x24=V+91c`). Shared-object producer `714530`, instructions `714658..714674`, defines `shared+1c` as `(B+158 == 0)`. Consequently `V+934` selects the exponential branch for base type zero; it must not be assumed false from a nearby initializer.

A read-only capture at `43dff4` can verify all outputs together. There `x19=V`, `x20=parameter structure`, `x23=G`, `x21=event/note object`, `x24=V+91c`, and `x8=shared=*(G+1240)`. The sole saved direct caller passes `V=H+168`, hence `H=V-168`. Capture `H+78/+80/+2f90/+2fd8/+2fe0`, `G+14/+a0/+c0/+1008/+100c`, the two B curves and their actual runtime modes, and V's five output fields. The parameter structure is the caller's `fp-e0`; its first two pointers are G and the event object.

The remaining dynamic source is explicit. `07a60c` copies `H+2fd8` to `H+78`. `57e4d8` sets `H+80=1` for mode `H+2f90==2`; otherwise it calls `51a700(G+a0,H+78)` and can multiply the result by native `expf(r32(r32(H+2fe0 * G+c0) * float32_word(0x3debc8e3)))`. The separate expf path requires both outer factors to be nonzero, and uses one if their rounded product is zero. `velocityScaleFromControls` implements the captured `shared+140 == 0` helper branch and the outer scaling. Its `logf` and `expf` callbacks are explicit dependencies; the replay injects the browser implementations `nativeScalarLogf` and `nativeScalarExp`, with no system oracle. The unobserved nonzero shared mode is rejected; host mode two has the explicit unit bypass.

Evidence is the saved ARM64 listing `pass3-arm64-disassembly.txt` at the instruction ranges above, plus saved pseudocode `pass17-reused-builder.txt` (`1c5320`), `pass3-contact-parent-c.txt` (`715f98`), `pass4-voice-configure.txt` (`07a60c`), and `pass4-velocity-coefficients.txt` (`57e4d8`). No new REA or native process was started for this audit. The newer REA producer batch is `pass21-pitch-source-producers.json` and the saved per-function `pass21-0x100*.txt`, evidence ID `ev_b6fbf0d8ea621be69f73b00aedcd1b36263e429ea99268110fda47da13d03fb8`. Existing dynamic voice capture values are not used to infer these source equations.

For shared mode zero, `51a700` computes the scalar curve at `r32(H78 * word(0x3f810204))`, then `z=r32(H78*shared8c)`. For `z>1e-8`, it evaluates:

```
l = logf(r32(z / r32(r32(shared8c*3)*0.25)))
m = r32(Ga0 * shared90)
e = fma32(curveValue, word(0x3debc8e3), r32(l*m))
helperScale = min(r32(expf(e) * word(0x3eb5a858)), 1)
```

Otherwise `helperScale=0`. This preserves the float multiplication of `Ga0*shared90` before multiplying the log result, and the native FMA operand order. The native log threshold compares the float z promoted to double against `1e-8`. The outer scaling described above follows the helper's unit clamp and has no additional clamp.

Runtime replay uses three independent curve records at `1c5f30` and one initialization record at `43dff4`, all at note 69. All **68 compared values match bit for bit**: 54 curve coordinates/values, three base types and three produced G strengths, plus H80, G1008/G100c, and V938/V93c/V940/V934/V930. Runtime curve flags are independently captured as log-X zero, special zero, dimension one, for both base curves and the shared velocity curve; the script requires this evidence and has no assume-linear switch. Report: private `debug-pass21-pitch-source/source-replay.json`.

The actual velocity path has host mode zero and shared mode zero, H78 `0.7512185573577881`, Ga0 `30`, shared8c `128`, shared90 `0.023728057742118835`. The browser result H80 `0.29713115096092224` is bit identical to the capture. The interpolated curve value is `-1.5507458448410034`, log input `1.0016247034072876`, exp input `-0.17738062143325806`, and exp result `0.837460994720459`. Here H2fe0 is zero, so the optional outer exponential path is not runtime validated. H78<=1 also means the strength/decay mix is bypassed in this capture. A deliberate one-ULP change to captured H80 produces exactly one mismatch and exit status one (`negative-source-replay.json`).

Reproduce with:

```sh
node scripts/pianoteq_replay_pitch_source.mjs \
  "$HOME/.local/share/just-piano-analysis/base-v9-private-values-pass14.json" \
  "$HOME/.local/share/just-piano-analysis/debug-pass21-pitch-source/runtime.json" \
  /tmp/pitch-source-report.json --base-index 11 \
  --curve-capture "$HOME/.local/share/just-piano-analysis/debug-pass21-pitch-curves/runtime.json"
```

Use the full modern base reader's `steinwayny;;factorySTEINWAYNY.txt` entry; index 11 refers to the captured private 58-model inventory, not a universal ordering. The script validates the supplied data, not model identity from an index alone. Shared velocity controls, its complete curve, note coordinate, host78, host mode and gain controls are still capture inputs. Archive-to-voice generation across all models, notes, velocities and the optional branches is not established by this one-note result.
