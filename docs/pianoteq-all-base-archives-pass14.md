# All 58 factory B archives consumed (pass 14)

The bounded B reader now consumes all **58 version-89 base-model archives** in the installed factory resource, totaling **9,325,404 serialized bytes**, to their exact declared record ends. There are 52 unique base identities across 25 instrument banks; the separate FX bank has no B records. Every B has 200 top-level fields and zero unparsed suffix. This supersedes the earlier 13-model coverage limit.

This is complete byte coverage of the B archive schema in this specific resource version. It does not mean complete physical-model semantics, runtime coefficient generation, rendering, preset effects, or audible equivalence have been established. Additional bank resources, such as the separate `KVR2` records, are not part of these B byte ranges.

The input remains the unmodified `presources.dat`, SHA-256 `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`. Every resource member still passes its stored MD5 check: 1,105 of 1,105.

## Two actual subordinate-version families

The previous modern reader already consumed 13 models with `B+0x2a38` version 10 and `B+0x2f10` version 35. The other 45 use versions 9 and 34. The additional branches come directly from the previously saved subordinate-reader code, rather than from guessed alignment:

| Reader branch | Serialized difference | Native default |
|---|---|---|
| `FUN_10095a28c` v9 | Does not read curve at relative `+0x1a8`; subsequent scalar `+0x150` is still read | Constant-zero curve via `FUN_10098fe1c` |
| `FUN_1003ddb14` v34 | Does not read vector at float-pointer index `0x226` (relative byte offset `0x898`) | Two values `[9.0, 1.0]` |

The parser represents the first absent curve as `None` with `native_default_curve1a8 = 0.0`. It represents the second as an explicitly named `native_default` field with equal start and end offsets. Thus the default vector does not pretend to consume bytes from the archive. Runtime curve construction remains a separate operation.

Five records also contain a nonempty collection at the end of their version-7 B metadata: Ruckers a/b/c each contain three identity lists, and Giusti a/b each contain two. The schema is `FUN_1004b682c` → `FUN_1005c5ec0`: collection count followed by `FUN_10032e5f0` versioned identity lists. Each list contains a record count, then `FUN_10072774c` records with version, three strings, and one float. Each observed list contains one identity record. This was cross-checked against the independently recovered `prom` identity-list reader. It is not the subsequent `prom` configuration object and does not read that unrelated structure.

The decoder still uses a deterministic explicit allowlist of the 52 verified identities. Unknown identities retain a partial-prefix result. Unsupported subordinate versions, record shapes, excessive lengths and final cursor mismatches are errors.

## Validation

The public `read_base_prefix(data, start, end, fxp_module)` implementation was called with the independently parsed bank/model boundaries for all 58 records. All end cursors exactly equal their declared ends. The decoded archives contain 16,825 serialized curves and 419,533 curve Y entries, excluding runtime-default curves. Complete raw coefficient values stay local.

Negative checks use the public implementation: six invalid subordinate versions, two truncations, and one oversized enclosing range for every model give 522 rejected cases. Invalid metadata list versions, entry versions and collection counts on the five nonempty metadata branches add 15, for **537 rejected cases**. Python compilation succeeds. The original D4 resource CLI also passes and continues to emit structure, offsets, curve counts, and vector/matrix shapes without exporting coefficient values:

```sh
python3 scripts/pianoteq-resource-inventory.py "/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat" --bank builtin_presets_d4.dat
```

Factory-bank parsing is maintained separately in `scripts/pianoteq_factory_banks.py`; its bounded model ranges can call the same B reader for bank versions 66 and 67. Completing B traversal does not relax the resource inspector CLI's separate factory A/preset-bank guards.

Private reproducibility files under `~/.local/share/just-piano-analysis/`:

- `base-v9-private-values-pass14.json`: all 58 locally decoded B values, including explicit defaults.
- `base-v9-schema-survey-pass14.json`: complete model boundary survey.
- `base-all-negative-validation-pass14.json`: 58 positive boundary checks and 537 rejected negative cases.
- `presources-inventory-all-b-pass14.json`: original D4 CLI metadata-only inspection.
- `pass14-base-evidence-bundle.json` and `pass14-base-snapshot.json`: 193 retained REA evidence records. The REA target was normally closed, the stdio session exited, and the 4 GB Ghidra JVM terminated.

No commercial B payload, complete coefficient table, preset resource, binary or license information is added to the repository. These recovered source inputs enable native-versus-browser numerical checks; they are not themselves an audio-quality result.
