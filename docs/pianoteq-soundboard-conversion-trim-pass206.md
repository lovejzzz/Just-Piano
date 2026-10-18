# Soundboard conversion and tail taper (pass206)

Date: 2026-10-17. Target: Pianoteq 9.2.5 ARM64, SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

Two new modules extend the independently computed raw responses:

- `soundboard-response-conversion.mjs` preserves the direct/finite-difference
  branch, scalar float32 order, logical response length and final zero store.
- `soundboard-response-trim.mjs` selects one shared tail length across channels
  using the native peak threshold, then applies the backwards sinusoidal taper
  with the recovered float32 FMA rotation order and native double sin/cos.

The conversion scale uses the squared spatial interval. ARM64 `0x1005a8bfc`
reassigns the saved scalar register to `h*h` before the conversion branches;
using `h` produces a systematic error. The direct-mode scale is the separately
rounded product of wave speed, twice density and that squared interval.

Logical length is computed from simulation steps plus maximum observation delay
plus one. It is not copied from the target output length. This removes the
64-sample scheduling padding present in the raw worker buffers. Worker capture
arrival order is not channel order: the probe now records each worker's explicit
array index and the verifier rejects incomplete or duplicate indices.

## Same-run native comparison

The successful capture uses five read-only hardware breakpoints on the
unchanged-text debug copy. Conversion outputs are captured inside propagation
at `0x1005a9578`; trimmed outputs are captured at the next wrapper-stage entry
`0x100817ab0`. Source state ownership is checked at each boundary. The process
exits with status 0 and the capture has no errors.

| Stage | Channels | Values per channel | Mismatches |
| --- | ---: | ---: | ---: |
| Independently advanced raw responses | 6 | 11,587 | 0 |
| Converted responses, actual mode 1 | 6 | 11,523 | 0 |
| Shared tail selection and taper | 6 | 7,651 | 0 |

In total, 184,566 float32 values match bit for bit. The native taper count is
independently reproduced as 132. No native state cache, converted output or
trimmed output is used as a prediction input.

Private evidence: `~/.local/share/just-piano-analysis/pass206-trim-v1/`.
Reproduce with the same response replay command as pass205, using this capture's
`source.json`. The final replay reports both `conversionNativeTargetVerified`
and `trimNativeTargetVerified`, separately from its raw-response comparison.

The earlier conversion-v1 attempt is retained as failed diagnostic evidence.
It lacked explicit worker indices and initially exposed the wrong scale and
logical-length assumptions. Those failures were corrected using ARM64 and a
new capture, without changing comparison tolerance or aligning output samples.

## Remaining work

The native positive case covers conversion mode 1. Mode 0 has a static
implementation and synthetic boundary tests, but no native runtime positive
case yet. The matrices and observation groups are still captured inputs, not
constructed from the instrument model. The six responses have not yet passed
the wrapper's subsequent filtering, shaping, normalization, leading-silence
processing and resampling into the final nine IR nodes. No whole-piano audio
or browser equivalence is claimed; all corresponding final gates remain false.

Affected local tests: `node tests/soundboard-response-conversion.mjs`,
`node tests/soundboard-response-trim.mjs`, `node tests/soundboard-response.mjs`
and `node tests/soundboard-observation-output.mjs`.
