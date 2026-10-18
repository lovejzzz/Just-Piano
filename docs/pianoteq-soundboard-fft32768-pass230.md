# FFT32768 and the complete inside-receiver response chain (pass230)

Date: 2026-10-17. The FFT32768 branch that rejected pass229's inside-microphone
probe is now independently implemented and validated. No transform size,
alignment, gain or comparison tolerance is changed to fit the targets.

## Native transform and setup evidence

Three read-only hardware sites capture three ordered forward and three ordered
inverse transforms at the shaping boundary. The process exits 0 without errors
or pending calls. Native setup confirms N=32768, four-lane scalar core 8192,
seven factors [2,4,4,4,4,4,4], real mode and the expected direction alternation.

The implementation reuses the recovered radix-2/radix-4 kernels, with the
appropriate forward/reverse stage order and twiddle offsets. It independently
generates setup coefficients, performs four-lane final combination/reordering,
and implements the unscaled inverse. Native coefficient snapshots are audit
targets only; allocation padding is excluded because the kernels never read it.

| Comparison | Per call | Calls | Bit differences |
| --- | ---: | ---: | ---: |
| Final-combination coefficients | 24,576 | 6 | 0 |
| Used scalar twiddles | 8,156 | 6 | 0 |
| Transform output | 32,768 | 6 | 0 |

Changing one captured coefficient target creates one audit failure without
changing any transform prediction. Changing the first forward input by 0.125
changes 16,385 output words; other captured calls remain exact. Both dependency
negative runs correctly fail. Impulse, unscaled inverse, bitwise reorder
bijection and scope-guard tests pass for FFT32768 and the existing FFT16384.
The old six-call native FFT16384 replay is also retained as a regression check.

## Full inside-receiver chain

The spectral prefix, inverse-spectrum processing and time reconstruction now
select the validated FFT16384 or FFT32768 implementation. Other sizes remain
explicitly unsupported. All three previously rejected full pass229 captures now
pass their complete same-run comparisons through final dispatch, with own grid,
excitation, spatial solution, matrices, receiver images and observation groups.

A fresh single-process native capture binds its three dispatcher calls to the
final nine model IR nodes. The aggregate reruns all independent source groups
and compares prediction hashes against those model nodes:

| Native model nodes | Values compared | Bit differences |
| --- | ---: | ---: |
| 0–2 | 30,528 | 0 |
| 3–5 | 29,568 | 0 |
| 6–8 | 27,648 | 0 |
| Total | 87,744 | 0 |

Source groups are separate native processes; the nine-node oracle is one
process. Both that distinction and the remaining captured configuration inputs
stay explicit in the aggregate report.

```sh
node tests/real-fft-32768.mjs
node scripts/pianoteq_replay_fft32768.mjs PRIVATE_FFT32768_CAPTURE
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_INSIDE_NODE_ORACLE PRIVATE_INSIDE_GROUP_0 PRIVATE_INSIDE_GROUP_1 PRIVATE_INSIDE_GROUP_2
```

Private evidence: `pass230-fft32768-v1/replay.json`,
`pass230-negative-controls`, `pass230-inside-dispatch-nodes-v1`,
`pass230-nine-inside-fft32768.json`, `pass230-fft16384-regression.json` and the
original pass229 inside-receiver full captures. Commercial inputs and raw audio
are not published.

## Remaining scope

This closes the specific FFT32768 failure and verifies another complete
configuration-to-IR arithmetic profile. Soundboard/model and primary microphone
configuration, shaping curves and later control metadata remain native inputs.
Full model-to-IR independence, other models/branches and preset-wide coverage
are not established. Complete coupled voice, final stereo PCM and independent
browser AudioWorklet/persistence/performance acceptance remain open. No merge
or deployment is performed.
