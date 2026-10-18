# Archive cold raw-node initialization and held raw controls, pass298

The supported raw-key producer no longer seeds nodes from the native initial
node snapshot. Cold nodes use archive release curves, pinned binary ID/tag
constants and the still-observed damper flag. It also holds a cloned initial
control profile and accepts only an absolute block clock when advancing.
Per-block native raw-key snapshots no longer enter this producer, the sensor
level input or the raw-key inputs to global coefficient refresh. Other global
control paths still retain native inputs; this is not capture-free acceptance.

## Actual initialization formula

REA/Ghidra recovers `573a7c`, with ARM instructions `573bf4..573c28` confirming
that every empty cold key list obtains a fallback node with:

```text
velocity = float32(-1 / baseTime(note))
position = float32(key.flag1c XOR 1)
id/tag   = uint32(7), uint32(0)
mask     = 0
```

`baseTime` comes from the previously implemented decoded base-model release
curve at `mar_param(2f10)+d18`, with the explicit supported curve mode. The
producer uses the explicit internal-key note base9 and checks the A4 mapping.
Its intermediate position starts at owned cold zero; no live state migration
or arbitrary allocator-pool history is supported.

The ID/tag literal at virtual address `100b436c0` is read through the Mach-O
segment mapping and verified as the two integer words `(7,0)`. The immutable
binary SHA256 is
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
The decompiler's tiny float at the ID offset is a bit-field typing error, not
a numerical ID conversion. Initializer evidence:
`ev_927f98cb9fc91b4b27034c7dd0d16db9f82af778f54e2c5bd1e8ecd785af8133`.

All105 archive-derived velocities match native initial values exactly, including
the one value that differs from the common minus100. No minus100 profile is
hardcoded. `287840` additionally confirms that a cold reset clears the two
following key flags; evidence:
`ev_45ba638c9ce549984e3939816028e307c33fd77a83e247081f4697a2f5152b82`.
The first damper flag remains an explicit initial-profile input.

## Held control scope and comparison

The supported MIDI contract permits the existing A4 note-on/off sequence and
CC64 assigned to Rattle by the validated preset pedal vector. It does not
include host/key parameter edits or other controller assignments. Raw-key
controls therefore stay in owned state initialized once: host control/blend,
soft/pedal/extra-pedal/binary mode, bypass flags, per-key local controls and the
first key flag. Samples/rate come from explicit render configuration. The two
cold-reset flags are computed zeros. Native block snapshots are targets only.

The complete successful pass284 recording is reused; no new native process or
recording is launched in this pass. Across the zero-time initializer and2,320
render blocks, **4,410,725** comparisons pass exactly: ordered node counts and
ID/tag, velocities and both positions before/after each call, all raw-key
values, every host/key control and every bypass/key flag. Own node and raw-key
stream hashes remain equal to pass297. Birth/reuse/cleanup stay1/4/1.

The component one-ID target negative and a one-bit host-control target negative
each fail once without changing either calculated stream. Synthetic tests poison initial node IDs, positions and
velocities, mutate the caller's initial flags/control after construction, alter
the archive base-time curve and check explicit note mapping. The predictor
ignores poisoned initial node state, holds its own cloned controls, and responds
to the changed archive curve. These tests do not extend native branch coverage.

## Complete stereo and remaining dependencies

A fresh terminal artifact is calculated and its source closure rebound, followed
by calculated spatial endpoints. The new path matches the entire148,224-frame
stereo24/48 kHz reference PCM exactly:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

The legacy path remains exact. With the pass295 compact contribution order,
complete PCM remains:

`1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`

A one-bit PCM target negative reports one differing sample while the calculated
WAV stays identical. Python separately reads complete WAV parameters and every
PCM byte. There is no alignment, trimming, normalization or tolerance change.
The compact target's unobserved global state and export calls retain the prior
explicit limitations; no full-state paired-run premise is claimed.

The initial host/local-control/damper-flag profile still comes from native
observation, and key count/note mapping remain explicit. Native initial raw-node
numeric/layout data and per-block raw-key controls are removed only at the
supported producer boundary. Other model/waveform/spatial/coefficient profiles,
control paths, voice ownership/retirement, routing and scheduling remain inputs.
Full hammer/string/damper contact-force computation, independent MIDI-to-stereo,
all keys/velocities/pedals/presets, AudioWorklet, audible parameter persistence
and real-time performance remain open. CC64 here is Rattle, not Sustain.

Private pass298 reports, REA responses, WAVs and static literal audit remain
outside Git. Commercial data is not committed. No merge or deployment occurs.
