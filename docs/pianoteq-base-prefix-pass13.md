# Base model archive continuation (pass 13)

The resource inspector now consumes the version-89 `FUN_10059f2cc` path through the serialized field assigned to `B+0x1bf4`. This extends the previously published prefix ending at `B+0xfc8`; it is a schema traversal, not a search for plausible floating-point values. It preserves the unread suffix and does not export model values.

Run against the locally installed resource:

```sh
python3 scripts/pianoteq-resource-inventory.py "/Applications/Pianoteq 9/Pianoteq 9.app/Contents/Resources/presources.dat" --bank builtin_presets_d4.dat
```

The inspected resource SHA-256 remains `d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d`. All 1,105 member MD5 checks pass. The D4 bank still contains 50 completely consumed A archives. The additional B fields use the existing curve decoder, float/integer vectors, versioned grids (coordinate plus curve per row), and version-1 curve lists (coordinate vector, curve count, curves). The nested helper schemas follow `FUN_10049c9e8` / `FUN_10037ce2c` and `FUN_1009a1830` / `FUN_1003c47a8`. Unsupported versions and excessive lengths remain errors.

| Model | Next bank-relative byte | Unparsed suffix | Curves in parsed prefix | Decoded curve Y entries |
|---|---:|---:|---:|---:|
| NY | `0xa03f` | 175,831 bytes | 195 | 10,714 |
| HB / D4 | `0x3ebcb` | 166,044 bytes | 194 | 10,482 |

The first additional grid at `B+0x1018` contains 78 rows for NY and 81 for HB. The NY `B+0x1030` and `B+0x1080` curves each contain 10 X coordinates and 30 Y values; these are three-output curves. The parser consequently preserves output dimension rather than assuming one Y value per X. The curve lists at `B+0x1a50` / `B+0x1a20` contain 18 / 17 curves for NY and 18 / 13 for HB. The next required reader is `FUN_10099d658(B+0x2528)`.

B curve inventory paths now correctly begin with `B+`; A archive summaries retain `A+`. The current format coverage remains the previously reported 91 complete A presets across D4, K2, and Kawai. The other 22 version-66 banks and the distinct FX model branch remain unsupported, rather than being counted as recovered presets.

These serialized B curves are separate from each preset's detailed A curves. Consuming a larger prefix does not yet establish the full source of the four runtime modal arrays or reproduce their sound. No new audio-equivalence claim follows from these structural checks.

Private evidence is retained as `presources-inventory-pass13.json`, `base-model-prefix-values-pass13.json`, and the pass-12 REA evidence bundle. Full resource data and commercial preset/model values are not added to the repository.
