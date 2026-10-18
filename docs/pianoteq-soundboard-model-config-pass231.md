# Model/preset to soundboard scalar configuration (pass231)

Date: 2026-10-17. This pass moves upstream of the previously observed soundboard
configuration. Existing REA decompilation of `0x1001ba68c` and new REA/Ghidra
queries for its geometry, rate and microphone helpers are checked against the
immutable ARM64 listing.

The own configuration builder takes the selected model component record,
preset state, bridge vector, propagation-mode vector and explicit source-position
policy flags. It calculates 30 selected 32-bit fields and five individual flag
bytes, and copies the bridge vector according to the native producer. It does
not synthesize native pointers or claim a complete configuration object.

The recovered mapping includes sample interval inputs, grid method, width,
height/string-length scaling, plane height, lid angle and enable policy, bridge
plane offset, excitation position, propagation/stability/contrast/damping
controls, sound speed, excitation width, propagation mode, shaping/filter
scalars, phase flag and default receiver separation/mirror policy. Linear and
two-position source policies are calculated with the native float32 order;
unsupported alternate model geometry families are explicitly rejected.

## Connected native verification

A complete six-site read-only capture records three producer calls, model and
preset inputs, the two source-position classifier returns, and output fields.
It exits 0 with no errors or pending calls. All 90 computed 32-bit words,
15 computed flag bytes and 12 bridge float32 words match the native outputs
exactly. The ordinary fixture exercises direct model geometry and source
positions; alternate height and source-position policies have synthetic tests,
not native coverage claims.

Changing one downstream source-position target produces exactly one mismatch
without changing prediction hashes. Changing the upstream model position changes
only the affected component's prediction. Both negative runs correctly exit 1.

A second capture attempted to include the runtime-rate getter. It stopped with
an unowned EXC_BREAKPOINT and was rejected as incomplete; the LLDB session and
target process are terminal. Its partial data is not used to certify any mapped
field. The committed capture script retains the first, complete six-site path.

```sh
node tests/soundboard-model-config.mjs
node scripts/pianoteq_replay_soundboard_model_config.mjs PRIVATE_PRODUCER_CAPTURE
```

Private evidence: `pass231-model-config-v1/replay.json`,
`pass231-model-config-rea`, `pass231-negative-controls`. The rejected diagnostic
run remains under `pass231-model-config-v2`. Model records and preset data remain
private.

## Remaining scope

The producer mapping is not yet connected to the complete nine-response replay.
Model records, preset state and classifier flags are still observed sources;
archive decoding and their full construction remain required. Runtime output
rate selection, lid-dependent gain curves, receiver configuration sources and
the rest of the configuration fields are not claimed computed. The buffer's
uncomputed bytes are placeholders and must never be used as native object data.
Full model-to-IR, coupled voice, final PCM, presets and browser acceptance remain
open; no UI, merge or deployment changes are made.
