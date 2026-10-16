# Complete modern B archive traversal (pass 14)

The base-model parser now consumes 13 verified modern version-89 B archives to their exact declared record ends. Each contains 200 top-level serialized fields. This recovers the complete serialized coefficient inputs for these models, including both 113-row modal matrices, rather than stopping at parameter labels or a partial prefix. It does **not** establish that the native runtime calculation or sound has been reproduced.

The decoder uses an explicit model-identity allowlist and strict subordinate versions. It leaves other model families at the previous partial prefix or rejects an unsupported prefix branch. A survey of all 58 B records in the installed factory banks found 13 exact completions; 40 other records reach an unimplemented version-9 `B+0x2a38` reader branch, and five require a different early prefix branch. Those 45 are not counted as complete.

| Model identity | B archive bytes | Curves | Curve Y entries |
|---|---:|---:|---:|
| `bechsteindg` | 175,198 | 377 | 14,140 |
| `bluethner` | 163,782 | 352 | 10,395 |
| `vc280boesendorfer` | 253,732 | 408 | 16,224 |
| `steinwayny` | 216,678 | 394 | 15,396 |
| `d4` | 206,109 | 388 | 12,236 |
| `grotrian` | 182,225 | 383 | 15,476 |
| `k2` | 207,204 | 399 | 13,079 |
| `kawaisk-ex` | 167,880 | 375 | 13,756 |
| `modelb` | 183,442 | 379 | 14,955 |
| `ant.petrof` | 177,697 | 349 | 13,572 |
| `mist.petrof` | 172,466 | 383 | 13,972 |
| `steingraeber` | 179,226 | 350 | 13,282 |
| `yc5` | 147,240 | 370 | 10,501 |

The byte counts include the B archive's version and metadata, starting immediately after its enclosing model's two identity strings. The NY and HB records end at bank offsets `0x34f16` and `0x67467`, respectively, with zero unparsed suffix. These exact boundaries independently agree with the enclosing bank's declared model lengths.

## Tail schema

Following the previously decoded `B+0x1c58`, the loader reads the float vectors at `1c88`, `1ca0`, `1cb8`, `1cd0`, `1ce8`, `1d00`, `1d18`, `1d30`, `1d48`, and `1d60`; integer `1d78`; two-element vector `1d80`; scalars `1d98` / `1d9c`; curves `1da0` / `1df0`; and scalar `1e40`.

The remaining nested records are decoded through their actual subordinate readers:

- `B+0x1e48` and `B+0x1e60`: record count followed by `FUN_10070ac44` records, each with version, two-element vector, and three-output curve.
- `B+0x1e80`: `FUN_1006056e4` record vector → `FUN_1007bf110` → `FUN_10033b598` → `FUN_100137d70` record vector → `FUN_1004b4b50` → `FUN_10038f2a0` record vector → `FUN_1008ecc28`. The deepest record contains a scalar, two float vectors, and a scalar. No opaque payload is skipped in this traversal.
- `B+0x1e98`, `1f48`, and `1ff8`: `FUN_10012a5e8` v2, with a curve, `FUN_1002d2858` v1 configuration, and another curve. The observed configuration's mode must be zero and stores two floats.
- `B+0x2100`: `FUN_10002efc4` v3, eight curves, one version-1 curve list, and a scalar.

The final fields are the curve list at `2410`, vector at `23c0`, scalars at `2440` / `2444` / `23b8`, integer at `23dc`, curve at `2448`, curve list at `23e0`, integers at `23d8` / `10e8`, curve list at `14e8`, scalar at `2498`, integer at `249c`, vector at `24a0`, scalar at `24b8`, and curve at `24d8`. The cursor must then equal the model record end. Destination offsets are not in serialized order; all reported input byte spans are.

## Verification and use

`read_base_prefix(data, start, end, fxp_module)` in `scripts/pianoteq-resource-inventory.py` exposes the complete traversal for the 13 identities. It accepts a bounded decoded-bank byte range and returns field values for local callers. The resource inspector's normal JSON output strips those values, retaining schema, byte spans, curve counts and matrix row lengths. The existing D4 CLI remains usable:

```sh
python3 scripts/pianoteq-resource-inventory.py "/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat" --bank builtin_presets_d4.dat
```

This parser capability is separate from the inspector CLI's narrower bank-header/preset-version support. A caller that already understands version-66 factory bank boundaries can use the same bounded B reader for the other verified identities.

All 13 archives reach their exact declared ends, each with 200 adjacent top-level field spans and zero suffix. Six invalid subordinate-version mutations, two truncations and one oversized enclosing boundary per archive are rejected: **117 negative cases**. The complete NY/HB field values also agree with the private incremental parser; the earlier prefix batch checked all 158 fields through `1c58`. Python compilation and the installed D4 resource inspection pass, including all 1,105 member MD5 checks. No application files are modified.

Private evidence remains under `~/.local/share/just-piano-analysis/`: `base-full-modern-values-pass14.json`, `base-full-modern-validation-pass14.json`, `base-full-modern-negative-validation-pass14.json`, `base-all-schema-survey-pass14.json`, and the saved REA reader evidence. Resource SHA-256: `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`.

The archive contains inputs to the physical model. Runtime operations still transform them: zero propagation, curve construction, note indexing, weight generation, normalization, and modal frequency/decay computation must be checked against native execution. A zero archive suffix confirms byte coverage for the verified schema, not exact DSP behavior, full semantic interpretation, or audible equivalence. Commercial base-model values and preset resources remain local.
