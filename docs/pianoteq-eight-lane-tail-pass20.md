# Modal render tail: eight physical lanes (pass 20)

`dsp/modal-kernel.mjs` exports `renderEight(P, Q, A, B, output)` for the no-input tail in `0x1007c0bcc`. It requires eight entries in each state/coefficient array and an output length divisible by four. It updates `P` and `Q` in place and adds to the existing float32 output. `renderSixteen` is unchanged.

Despite a remainder of only one four-lane group, the original loop loads two complete four-lane vectors. The implementation therefore requires all eight actual lanes; it does not infer zero padding. At `0x1007c0e1c..e2c`, the memory layout is:

| Pointer | Values |
| --- | --- |
| `x23` | P lanes 0–7 |
| `x22` | Q lanes 0–7 |
| `x20` | A lanes 0–3, B lanes 0–3, A lanes 4–7, B lanes 4–7 |
| `x19` | existing output buffer |
| `w21` | output sample count |
| `w24` | remaining four-lane groups |

For each lane and four output samples, let `r32` denote separate float32 rounding and `fma32` denote a fused multiply-add with one float32 rounding:

```
u = fma32(B, Q, r32(A * P))
v = fma32(A, Q, r32(B * u))
nextP = fma32(A, u, r32(B * v))
nextQ = fma32(A, v, r32(B * nextP))
```

The four sample contributions are the reductions of `P`, `Q`, `u`, and `v`, respectively. Each reduction first forms `t[i] = r32(values[i] + values[i+4])`, then computes `r32(r32(t[0]+t[2]) + r32(t[1]+t[3]))`. Existing output is added with one further float32 rounding. The next iteration uses `nextP` and `nextQ`. Instructions `0x1007c0e30..e7c` establish the recurrence, `e80..ea8` establish this reduction order, and `eac..ec0` accumulate four output samples. `ec4..ee4` advance the coefficient pointer by 64 bytes and each state pointer by 32 bytes, subtract two four-lane groups, and repeat only on unsigned higher.

The best after-compute observation point is `0x1007c0ec4`, before state writeback: `x23`/`x22` still contain the before states, `v6` then `v4` hold final P, and `v7` then `v5` hold final Q. Coefficients remain at `x20`, and the completed output remains at `x19`. This permits validation of the entire block without inferring an input from an output.

Static evidence is the saved ARM64 listing `pass3-arm64-disassembly.txt`, `0x1007c0e14..0x1007c0ee4`, and REA record `pass20-free-kernel.json`, evidence ID `ev_4bb9816b5c87b861661f98a879f02cc4ce5990a45415ebc981eb73dd700aa688`. The native process and REA session are operated by the parent task; this implementation adds no process writes or native dependency.

The single-point capture `debug-pass20-modal-tail/runtime.json` completed with normal target exit, no capture errors, and PCM identical to the independent official render (the same `1907f854…` baseline). It contains 16 tails, comprising eight 64-sample blocks with two tails per block. Independent replay from their captured before states verifies all 256 final P/Q floats bit for bit (`tail-state-replay.json`). This state-only check does not compare the output, because the capture contains only output after accumulation.

The parent task's integrated `debug-pass20-modal-final/initial-tail-replay.json` additionally starts from amplitude, phase, frequency, and decay, computes initial P/Q, radius, and A/B, renders the eleven 16-lane groups and two eight-lane tails, and checks the three complete first-block group buffers: 192 sample values. Its 832 output comparisons include intermediate group accumulation states. All 6,226 compared float values match bit for bit, including initialization and recurrence checks. The actual four extra lanes in these two first-block tails have P/Q/A/B equal to zero, checked against the capture; this observation is not assumed by the API.

This module covers the finite float32 no-input eight-lane recurrence. The integrated report still uses captured amplitude, phase, frequency, and decay and explicitly does not establish whole-voice audio equivalence. Input-driven render branches, other block sizes, and other models are not covered by this capture.

The subsequent [continuous replay](pianoteq-modal-initial-pass20.md) also computes the seven intervening frequency projections, carries its own states across all eight blocks, and matches all 1,536 complete group-buffer samples. It does not reset its histories from the captured before states.
