# All nine soundboard responses from observed source state (pass221)

Date: 2026-10-17. Target remains the immutable Pianoteq 9.2.5 ARM64 executable
identified in pass212. Commercial configuration and raw captures stay private.

The same independent arithmetic chain now computes all three dispatcher groups
for the observed dry fixture. It does not substitute the first group's output
for the later groups. A six-site selector skips earlier propagation calls,
captures the selected group's own source state and controls, and observes its
completed dispatcher outputs.

The three captured excitation indices are 620, 650 and 680. Each selected run
completed without errors or pending calls and exited 0. Each group's source JSON
and matrices bind to that process's observations. Propagation, response
processing, spectral shaping, reconstruction, normalization, own-coefficient
resampling and final dispatcher scaling are calculated independently.

| Group | Final nodes | Words per channel | Compared values | Bit mismatches |
| --- | --- | ---: | ---: | ---: |
| 0 | 0–2 | 8,384 | 25,152 | 0 |
| 1 | 3–5 | 7,552 | 22,656 | 0 |
| 2 | 6–8 | 7,552 | 22,656 | 0 |
| Total | 0–8 | | 70,464 | 0 |

The aggregate verifier reruns all three calculations. Each child strictly
compares its own predicted arrays with its same-run native dispatcher targets.
It then checks each prediction's byte digest and length against the corresponding
node from pass219's single-process nine-node capture. Group-selection metadata,
completed status and prediction-independent source provenance are required.
This distinguishes three separately observed source groups from a single
continuous nine-node generation capture; the report makes that distinction
explicitly.

The strict numerical comparison and existing input/target negative controls are
retained in each replay. The pass219 target mutation detects a one-word node
change; pass220 separately demonstrates final-target prediction independence
and propagation of a gain-input change. No tolerance, fitted gain or alignment
is used.

```sh
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NINE_NODE_CAPTURE PRIVATE_SOURCE_GROUP_0 PRIVATE_SOURCE_GROUP_1 PRIVATE_SOURCE_GROUP_2
```

Private sources: `pass220-final-chain-v1`, `pass221-dispatch1-v1`,
`pass221-dispatch2-v1` and `pass219-dispatch-nodes-v2`. Aggregate evidence is
`pass221-nine-groups-replay.json`. Capture scripts use at most six read-only
hardware sites and leave original application text unchanged.

## Remaining dependency

This closes nine response calculations from **observed source state** for this
fixture. Source matrices, boundary/observation geometry, excitation inputs and
configuration are still captured, so model-to-IR independence remains false.
REA has now identified the grid initialization, boundary classification,
excitation constructor and sparse construction routines for that next step.
Other models, special branches, full hammer/string/damper coupling, final stereo
PCM, all notes/presets, browser integration and persistence/performance acceptance
remain unverified. No merge or deployment gate has been passed by this work.
