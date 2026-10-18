# Receiver and image geometry construction (pass228)

Date: 2026-10-17. Two read-only hardware sites record the entry and return of
`0x10049d778` in three native source groups. The implementation follows its
existing REA/Ghidra decompilation and immutable ARM64 listing, including the
geometry comparator at `0x1005ad9dc`. No target code or state is changed.

Independent construction now covers primary receivers, FMA-scaled relative
offsets, tilted-plane reflection, ground images, polygon/grid inclusion,
bilinear spatial-shape attenuation and inheritance of each primary receiver's
attenuation by its displaced variants. Sorting compares kind, whether serial
is nonzero, identity, then serial. The bounded integer encoding preserves that
lexicographic comparison and uses the native-order introsort from pass227.

The reflection angle is computed in double precision from float32 angle and
scale controls, then converted to float32 before platform-matched sincosf.
Shape interpolation preserves the native FMA and separate-product ordering.
The spatial shape comes from the own configuration/grid/CG/matrix construction;
the captured shape is only an audit target.

## Native evidence

The normal dry preset's three groups each match 18 final coordinate vectors,
all identity/channel/kind/serial/amplitude fields, the complete 1500-value shape
and all eight mapped native scalar arguments. Each group compares 1554 float32
words plus 90 metadata fields, with zero differences.

That configuration has no nontrivial attenuation. A separate private test FXP
copy therefore moves three unlocked microphone coordinates inside the soundboard
projection, with one below its plane. Only those serialized positions and the
ordinary archive integrity digest are updated; application binaries and the
normal saved preset remain unchanged. Structural parsing validates the copy,
and the native capture confirms the new coordinates were loaded.

All three groups of the new native render also pass every comparison, including
six nontrivial interpolation weights per group. Final image amplitudes include
0.14373457431793213, 0.3698264956474304 and 0.015724360942840576, each shared with
the appropriate displaced receiver. Both native capture processes exit 0 without
errors or pending calls. The rendered WAVs are retained privately; this pass
compares geometry and coefficients, not independent final PCM.

Negative controls change one coordinate audit target or one shape audit target:
each creates exactly one comparison failure without changing predictions.
Changing one primary-coordinate input changes its predicted geometry and
attenuation while leaving the other two source groups unchanged. All negative
runs correctly exit 1. Unit tests additionally check a known planar reflection,
bilinear weight, parent inheritance, mirror-off branch and invalid parent guard.

```sh
node tests/soundboard-receiver-geometry.mjs
node scripts/pianoteq_replay_soundboard_receiver_geometry.mjs PRIVATE_GEOMETRY_CAPTURE
```

Private evidence: `pass228-receiver-geometry-v1`,
`pass228-receiver-geometry-inside-v1`, `pass228-receiver-probe-inputs` and
`pass228-negative-controls`. No private preset or raw capture is published.

The new geometry constructor is not yet connected to the complete response
replay. Primary positions, relative offsets, parent assignments, mirror flag
and displacement scale remain captured configuration inputs. Full model-to-IR,
other instrument branches, coupled voice, final stereo PCM and browser/all-preset
acceptance remain open.
