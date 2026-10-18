# Constructed observation groups in the nine-response chain (pass227)

Date: 2026-10-17. Prediction now constructs delayed observation groups from
receiver geometry and configuration, alongside its own grid, excitation,
spatial solution and sparse matrices. Captured packed observation arrays are
comparison targets only for the new captures.

## Sorting and packing

REA/Ghidra and the immutable instruction listing identify the packing routine
`0x100349a14` and its record sorter `0x100778148`. Comparison is lexicographic
uint32 delayed index then grid index. Equal keys can carry different phase and
directional coefficients; stable JavaScript sorting would not preserve native
floating-point accumulation order. The independently recovered introsort uses
the native small/insertion, median/ninther, partition and incomplete-insertion
branch structure. This profile includes 30 same-key pairs with different
coefficients across its six channels.

Each channel merges the geometry contributions, sorts them and packs contiguous
delay groups with grid indices and three float32 coefficients per entry. All
channels use steps + global maximum(delay+1) + 64 samples. Here that is 11,587.

A synthetic 257-record C++ libc++ oracle, with duplicate keys and unique IDs,
independently verifies the tie-order digest. This supports the implementation;
the full native grouped arrays below provide the target-specific evidence.
The heap fallback is unit-checked but is not exercised by the native profile.

## Connected native verification

Three fresh six-site read-only captures record receiver coordinates, geometry
weights/kinds/channel assignments and the three referenced gains at the selected
source entry. They also retain the complete same-run raw-through-dispatch
targets and configuration. Every process exited 0 without capture errors or
pending resampling calls. The first capture attempt omitted the state-array
dump environment setting and was rejected by the source-provenance guard; only
the complete v2 captures are used for the result.

The replay constructs all observation records and uses them in propagation;
it checks native packed indices, coefficients and output lengths without using
them as prediction inputs. Across all three groups, 335,724 packed index and
coefficient words match bitwise. Every intermediate native response also passes.

| Final dispatcher nodes | Values | Bit differences |
| --- | ---: | ---: |
| 0–2 | 25,152 | 0 |
| 3–5 | 22,656 | 0 |
| 6–8 | 22,656 | 0 |
| Total | 70,464 | 0 |

Final prediction hashes additionally match pass219's single-process nine-node
oracle. Source groups come from separate native processes, explicitly reported.
The aggregate requires own matrix and observation construction whenever the
respective source inputs are present. Legacy captures still report snapshot use.

Changing one packed native coefficient produces one observation audit failure,
while every predicted downstream response stays unchanged. Changing the first
receiver's x coordinate changes 15,917 observation audit words and 11,223 raw
response words in channel zero; the other five raw channels stay exact. Both
negative runs correctly fail. The coordinate negative run is deliberately
limited to the raw-response boundary.

```sh
node tests/soundboard-observation-groups.mjs
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_GEOMETRY_GROUP_0 PRIVATE_GEOMETRY_GROUP_1 PRIVATE_GEOMETRY_GROUP_2
```

Private evidence: `pass227-observed-geometry-group0-v2` through `group2-v2`,
`pass227-nine-constructed-observations.json`, `pass227-negative-controls`,
`pass227-observation-sort-rea` and the synthetic C++ sort oracle. Commercial
coordinates, configuration and raw audio remain private.

## Remaining scope

Receiver/image coordinates, their geometry weights and the phase flag remain
captured inputs. The next source boundary is receiver/image geometry construction
from configuration, including boundary/shape attenuation. Later shaping and
normalization configuration also remains captured. This does not prove complete
model-to-IR generation, other model branches, coupled hammer/string/damper voice,
final stereo PCM, all notes/presets, or browser AudioWorklet equivalence. The
browser engine has not been replaced or deployed by this pass.
