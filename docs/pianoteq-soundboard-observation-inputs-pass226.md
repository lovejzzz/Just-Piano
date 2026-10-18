# Observation distances and delayed coefficients (pass226)

Date: 2026-10-17. Four read-only hardware sites capture three complete distance
builders and all 54 subsequent observation-preparation calls. The final native
capture exited 0 with no errors or pending calls. REA/Ghidra decompilation and
the immutable ARM64 instruction listing cover `0x1004bcde8`, `0x1005a8874` and
`0x10037e040`.

The independent distance builder visits every rectangular grid point, including
inactive boundaries. It uses FMA for coordinate displacement, separate float32
squared x/y products and sum, FMA for the squared z term, float32 square root,
and a minimum distance of float32 0.01. The second array is z displacement
divided by that distance. Grid geometry comes from the existing own initializer;
plane height comes from configuration. Receiver coordinates remain captured.

The preparation helper's historical `frequencies` API actually receives these
distances. Its inverse scale is 1/(speed*tau). Amplitude is the selected receiver
kind gain times its geometry weight. The three gains are a vector referenced
by configuration, not three inline values. All derived arguments are audited
against native call arguments.

For each distance d, let u=float32(inverseScale*d). Phase mode uses floor(u),
and phase weight cosf(float32(frac(u)*float32(pi/2))) squared. Non-phase mode
uses nearest integer, ties away from zero. The helper multiplies d by a double
4*pi before rounding to float32. The directional branch uses the recovered FMA
and separate multiply ordering for its two coefficients. Zero amplitude appends
no records. The existing platform-matched scalar cosf implementation is used.

The first capture read the wrong register for phase mode and was rejected as
evidence for that control; v2 corrected the register. V3 additionally captured
the referenced gain vector. All final validation uses v3. Neither rejected
input interpretation was used to claim a passing native match.

| Comparison per group | 32-bit words | Differences |
| --- | ---: | ---: |
| Full distances | 27,000 | 0 |
| Full direction cosines | 27,000 | 0 |
| Distance/direction slices at helper entry | 54,000 | 0 |
| 18 prepared records arrays, five words per entry | 135,000 | 0 |
| Three-group total, including repeated input audits | 729,000 | 0 |

Both integer fields and all three float fields are checked bitwise. Prepared
predictions consume own distance/direction arrays, not the captured arrays.
Changing one distance target fails exactly one comparison and leaves every
prepared prediction unchanged. Changing one receiver x coordinate changes
12,000 comparison words in the first group; the other two groups stay exact.
Both negative runs correctly exit 1.

```sh
node tests/soundboard-observation-output.mjs
node scripts/pianoteq_replay_soundboard_observation_inputs.mjs PRIVATE_OBSERVATION_CAPTURE
```

Private evidence: `pass226-observation-inputs-v3/replay-corrected.json`,
`pass226-negative-controls`, `pass226-observation-rea`. Raw data stays private.

Remaining work: receiver/image geometry construction, record sorting/group
packing, and connecting these calculations to the complete nine-response
pipeline. Phase mode and geometry coordinates/weights remain captured controls.
The pass225 complete response chain still consumes native observation groups.
These isolated exact comparisons do not establish final PCM or browser audio
equivalence, all presets, or the complete coupled voice.
