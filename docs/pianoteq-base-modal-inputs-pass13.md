# Serialized base modal inputs (pass 13 continuation)

The local resource reader now reaches the actual modal input matrices in the NY and HB / D4 base models. The `B+0x1c28` and `B+0x1c40` fields are length-prefixed matrices of float vectors, not names or guessed runs of floating-point bytes. Both contain 113 rows. The implementation follows the version-89 `FUN_10059f2cc` reader and the subordinate readers listed below. It does not publish their complete coefficient values.

The previously documented prefix through `B+0x1bf4` remains available for other supported base identities. The deeper branch is deliberately restricted to the two verified model identities `steinwayny` and `d4`; it rejects unverified subordinate versions.

| Destination | Reader | Verified subordinate version / layout |
|---|---|---|
| `B+0x2528` | `FUN_10099d658` | v1, seven floats |
| `B+0x2548` | `FUN_10099af98` | v14, index map, curves, four float vectors, scalars |
| `B+0x2a38` | `FUN_10095a28c` | v10, curves, curve list, vectors, scalars |
| `B+0x2f10` | `FUN_1003ddb14` | v35, explicitly ordered scalar/vector/curve/grid/list fields |
| `B+0x3d68` | `FUN_1008d5f04` → `FUN_100632518` | v1, three `FUN_1006e9e00` filter records |
| Filter record | `FUN_1006e9e00` | v9, scalar-output branch; optional `FUN_1006dace0` v5 child |
| `B+0x3e28` | `FUN_1006755b0` | v2, vector and six floats |
| `B+0x3f98` | `FUN_100805b4c` | v1, eight floats in reader order |
| `B+0x3fb8` | `FUN_1007cdd14` | v2, five curves |
| `B+0x4148` | `FUN_1009235e0` | v1, integer and four curves |
| `B+0x4290` | `FUN_10072baa4` | v3, curves, grid, vector and scalars |
| `B+0x1c28`, `B+0x1c40` | `FUN_10051f684` | row count, then a float vector per row |

The first three of the four vectors inside `B+0x2548` correspond to absolute destinations `B+0x29d0`, `B+0x29e8`, and `B+0x2a00`. `FUN_1007a4014` copies these into its cache at `+0x1f8`, `+0x220`, and `+0x248`; the scalar at `B+0x2a30` feeds cache `+0x270`. In both tested base models these three vectors have three elements and the fourth vector is empty. The same builder obtains its modal lambda list from `B+0x1c40` and a scalar from `B+0x1c58`. These are now available through exact schema reads.

All following byte positions are relative to the decoded D4 bank, not to the resource file or object destination.

| Model | Field | Start | End | Count |
|---|---|---:|---:|---:|
| NY | `B+0x1bf8` uint vector | `0x102b1` | `0x10319` | 25 |
| NY | `B+0x1c10` float vector | `0x10319` | `0x104e1` | 113 |
| NY | `B+0x1c28` float matrix | `0x104e1` | `0x19fc5` | 113 rows |
| NY | `B+0x1c40` float matrix | `0x19fc5` | `0x23aa9` | 113 rows |
| NY | `B+0x1c58` float vector | `0x23aa9` | `0x23c71` | 113 |
| HB | `B+0x1bf8` uint vector | `0x423e7` | `0x4244f` | 25 |
| HB | `B+0x1c10` float vector | `0x4244f` | `0x42617` | 113 |
| HB | `B+0x1c28` float matrix | `0x42617` | `0x4c4af` | 113 rows |
| HB | `B+0x1c40` float matrix | `0x4c4af` | `0x56347` | 113 rows |
| HB | `B+0x1c58` float vector | `0x56347` | `0x5650f` | 113 |

NY now preserves a 70,309-byte unread suffix; HB preserves 69,464 bytes. The next field is read by `FUN_100121574(B+0x1c88)`. The parsed prefixes each contain 336 curves, with 15,047 Y entries for NY and 11,914 for HB. Default output includes field spans, array counts, matrix row lengths, and the unread suffix; it omits model values.

## Verification and limits

The command from the earlier prefix report was rerun against the original installed `presources.dat`, SHA-256 `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`. All 1,105 member MD5 checks still pass. D4, K2 and Kawai retain 50 + 23 + 18 completely parsed A presets. All 158 top-level parsed B fields per verified D4 model match the private incremental parser's values and exact byte spans. Five mutated subordinate versions and two truncations per model are rejected, for 14 rejected negative cases. Python compilation succeeds.

`B+0x1c58` undergoes zero-value propagation after reading in the native loader; the inspector preserves serialized values. Neither tested vector contains zeros. The 113 matrix rows include empty lower rows by design. For row 68 the lambda matrix contains 35 values in NY and 39 in HB. These lengths must not be generalized to every key or every model.

The recovered archive matrices are inputs to additional runtime computation. In particular, identifying the serialized `B+0x1c28` matrix does not establish that it equals the final excitation weights in `G+0x6f0`. Remaining arithmetic, physical coupling and audio equivalence require separate native/runtime checks. No new whole-engine or audible-equivalence claim is made here.

Private reproducibility artifacts: `base-model-modal-inputs-pass13.json` (full locally read values), `base-continuation-validation-pass13.json`, `base-continuation-negative-validation-pass13.json`, the saved `pass13-*` REA subreader evidence, and the final pass-13 evidence bundle/snapshot. No binary, full commercial preset, or base-model resource payload is committed.
