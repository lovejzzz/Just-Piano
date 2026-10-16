# Pianoteq 9 factory NKS preset findings

Read-only inspection of `/Library/Application Support/Modartt/Pianoteq 9/nks` on 2026-10-15 (user timezone). No application or preset files changed; no preset library copied into this repository. Container checks used Python's standard library. A small, bounds-checked MessagePack reader decoded the sample metadata without executing any preset content.

## What is actually stored

All 800 `.nksf` files are RIFF containers with form type `NIKS`. The RIFF declared length, chunk boundaries, and even-byte padding matched the actual files. Every file contains `NISI`, `NICA`, `PLID`, and `PCHK`.

| Chunk | Observed payload sizes | Distinct payloads | Meaning supported by inspection |
|---|---:|---:|---|
| NISI | 192–477 bytes | 800 | Browser metadata: author, name, vendor, comment, device type, UUID, type/category, bank chain, and mode |
| NICA | 1,533–1,596 bytes | 3 | Controller assignment metadata; the inspected sample contains pages of parameter IDs and display names, not current parameter values |
| PLID | 20 bytes | 1 | Plugin identity: the inspected MessagePack map is `{"VST.magic": 1349794161}`; integer hex `0x50743971` spells `Pt9q` |
| PCHK | 231–325 bytes | 800 | Compact plugin-specific state with explicit `LEAN-PRESET` marker, preset names, and instrument identity |

NISI, NICA and PLID start with little-endian `01 00 00 00`, followed by MessagePack. In `NY Steinway D Mix.nksf`, the reader consumed each of those three chunks exactly, with no trailing undecoded bytes. The comment is descriptive prose. NISI's `modes` is `["Physical Model"]`; this is a category label, not model data.

NICA's sample top-level `ni8` field contains six pages of eight slots each. The groups cover General, Pedals, Action, FX, Reverb and Mixer. Nonempty slots have `id`, `name`, `vflag` and `autoname`, with `section` on section starts. Examples include Volume, Condition, Dynamics, Diapason, Sustain, Dmp Noise, Reverb Mix, Duration and Mic 1–8. The integer IDs identify controls; treating them as physical coefficients or normalized knob values would be incorrect. Empty slots are empty maps. This detailed decoding was verified on one sample; uniqueness and size statistics cover all files.

## Sample offsets

File: `/Library/Application Support/Modartt/Pianoteq 9/nks/NY Steinway D Mix.nksf`, 2,174 bytes. Offsets below are hexadecimal and measured from the beginning of this exact file.

| Chunk | Header offset | Payload offset | Payload length |
|---|---:|---:|---:|
| NISI | 0x00c | 0x014 | 297 |
| NICA | 0x13e | 0x146 | 1,533 |
| PLID | 0x744 | 0x74c | 20 |
| PCHK | 0x760 | 0x768 | 278 |

PCHK has the same four-byte version prefix and then proprietary binary structure. Recognizable markers and fields:

| Bytes/field | PCHK-relative offset | File offset |
|---|---:|---:|
| `PrVK` | 0x20 | 0x788 |
| `XFTP` | 0x28 | 0x790 |
| `BuildPresets 9.2.5/20260909` | 0x42 | 0x7aa |
| `dlla` | 0x6d | 0x7d5 |
| `tdtM` | 0x75 | 0x7dd |
| `NY Steinway D Mix` (first occurrence) | 0x81 | 0x7e9 |
| `LEAN-PRESET` | 0xa5 | 0x80d |
| `NY Steinway D Mix` (second occurrence) | 0xbc | 0x824 |
| `PrsU` | 0xd5 | 0x83d |
| `steinwayny` | 0xe5 | 0x84d |
| `Grand Steinway D (New York)` | 0xf7 | 0x85f |

Several strings have immediately preceding little-endian lengths; some include a NUL terminator. Other small integers and an opaque 16-byte region are present. Their semantics have not been established: do not label them a checksum, encryption key, model coefficient, or parameter value without code evidence.

Two comparison samples confirm the same general structure: `Ant. Petrof 275.nksf` has a 264-byte PCHK, and `Ant. Petrof Cinematic.nksf` has a 276-byte PCHK. Both identify `ant.petrof` / `Grand Ant. Petrof` and contain their respective preset names. All 800 PCHK payloads contain the literal `LEAN-PRESET`.

## Conclusion and limits

The factory NKS files demonstrably hold browsing metadata, a controller map, plugin identity, and a very compact plugin-specific preset selection/state record. The marker `LEAN-PRESET`, repeated preset name, instrument identity, and small payload strongly support the interpretation that these factory files reference presets/models available inside Pianoteq rather than embedding the complete physical-model definition or an exhaustive per-key parameter table.

That reference interpretation is an evidence-based inference, not a verified trace through the loader. No hammer-hardness array, string-dispersion table, soundboard coefficients, or complete current parameter-value map was identified in these NKS chunks. This does not establish that every user-saved Pianoteq preset uses the same format. It also does not establish which soundbanks are licensed, where built-in parameter values reside, or how the DSP computes audio.

The next useful native-code target is the reader/writer for `LEAN-PRESET`, `PrsU`, and preset name lookup, followed by its resource/model lookup. Loading behavior must be traced before concluding that the opaque fields are understood. Parameter-to-DSP relationships require a separate code/data-flow investigation; NKS controller labels alone cannot establish those relationships.

## Native-code follow-up with Ghidra / REA

These additions use only the saved REA `result.structuredContent.normalized_result` decompilations in `~/.local/share/just-piano-analysis/`. Addresses refer to the analyzed ARM64 image; `FUN_...` names are Ghidra-generated labels, not recovered source identifiers. Several large functions have unreachable-block/type-propagation warnings, so the observations below are deliberately limited to clear stores, constants, calls and output strings.

1. **`LEAN-PRESET` is explicitly created by code, alongside a state flag.** `FUN_1005900d8` sets bit 0 of the object field at byte offset `0x470`, zeroes two eight-byte fields at `0x118` and `0x120`, calls `FUN_1005b6ad4(object + 0x128, 0, 0, 0)`, and assigns `LEAN-PRESET` to a string at `0xe8`. The types/meanings of the cleared fields and that helper remain unknown; this does not prove that all model parameters are cleared. Evidence: `lean-code.json`, `ev_7c486c419398203ecc65385fd27f2b91bb0daf96f9b5159e6a9401e619f4c8fb`.

2. **A preset-export routine invokes that lean-state operation.** `FUN_100573fd4` prints `Exporting presets to`, iterates preset-like entries, constructs an export object, calls `FUN_1005900d8` on it, and selects format-specific output paths. Visible branches include AU, LV2 and VST3-related strings. This establishes an export-side role for the lean marker; it does not establish the NKS export or loader call chain. Evidence: `lean-parent.json`, `ev_b25c0819c51b0d4a279816d342381c62988830ba806df15634de16eac84a9fc1`.

3. **A shared binary archive routine recognizes constants matching the observed PCHK interior.** `FUN_100333d8c` writes/reads and checks `0x4b567250` (little-endian bytes `PrVK`), handles format version `0x0200002a`, uses `0x50544658` (`XFTP`), and reads/writes a nested `0x616c6c64` (`dlla`) block. It has separate read/write branches and checks format compatibility. The write-side path delegates payload production to `FUN_1006373dc`; the read-side path delegates consumption to `FUN_100675f1c`. Neither helper is decoded in this evidence set, so the inner model/parameter schema is still unresolved. Evidence: `preset-core-save.json`, function `0x100333d8c`, `ev_e0354d0cdefb27a9601d19feaa635f25355479a35becce6b46a6a1bf3fb58ca6`.

4. **The lean flag affects archive processing, but its full meaning remains open.** That same routine reads `param_1[0x11c]`, which with its decompiled four-byte element type is byte offset `0x470`, matching the field set above. Bit 0 gates a call on the object at byte offset `0x160` before writing and a later validity/error check. It is not enough evidence to claim the flag simply means “omit every physical parameter,” or to claim the nested payload is fully understood.

5. **The archive contains a 16-byte consistency field with MD5-related evidence.** The shared routine has an `md5.hh` diagnostic, builds a 16-byte result through helper calls, compares it byte by byte against object offsets `0x38`–`0x47`, and emits `inconsistent settings` on the read-side mismatch. The write side emits a 16-byte result before the nested `dlla` block. This supports a digest/consistency interpretation much more strongly than the original bytes-only inspection; exact digest input boundaries and correspondence to the NKS sample's opaque bytes have not been independently recomputed.

6. **Two inspected wrappers are AU and LV2 exporters, not NKS code.** `FUN_100311f9c` writes an Apple plist with `jucePluginState`; `FUN_1004ac5f8` writes LV2 preset Turtle with `urn:juce:stateBinary` and `xsd:base64Binary`, calling `FUN_100333d8c` to produce its underlying binary archive. The exploratory filenames `preset-serialize.json` and `preset-binary-save.json` do not establish their format. Evidence: respectively `ev_3c8d5af15df72b3dc4a1bb6007fe5c8441d4dfe21c094c9b74980ef918ad724a` and `ev_47077bcc9e3d52996c51fca210c04c92fe9c770bb9d0fdf4b332defe1ec53188`.

The native evidence confirms intentional lean preset state and matching archive markers. It strengthens, but does not complete, the inference that the very small factory NKS records select built-in content. It does not yet prove the NKS loader path, full inner schema, preset-name lookup, exact physical parameter values, or parameter-to-audio equations. The most focused next steps are the two inner archive helpers and the actual NKS PCHK reader/caller; AU/LV2 wrapper behavior must not be presented as an observed NKS loading trace.

### Inner metadata schema confirmed against one file

Additional native evidence narrows the previous unknowns. `FUN_1006373dc` and `FUN_100675f1c` write/read a `tdtM` block, five successive strings, a version-dependent integer, another string, a type field, and a byte vector; they then enter `PrsU`. The read implementation stores the type at object byte offset `+4` and passes it into `FUN_10094f4d8`. These functions are archive serialization, not DSP computation.

Applying that sequence to the same `NY Steinway D Mix.nksf` consumes its entire 88-byte `tdtM` payload exactly:

| File offset (field start) | Observed decoded value | Code-backed destination/role |
|---|---|---|
| 0x7e5 | `NY Steinway D Mix` | First string, local metadata |
| 0x7fa | Empty string | Second string, local metadata |
| 0x7fe | `Modartt` | Third string, object `+0x48` |
| 0x809 | `LEAN-PRESET` | Fourth string, object `+0xe8` |
| 0x818 | Empty string | Fifth string, object `+0x100` |
| 0x81c | Integer 324 | Version-dependent field; writer obtains it from `FUN_100707a4c`, exact meaning unknown |
| 0x820 | `NY Steinway D Mix` | Sixth string, object `+0x140` |
| 0x835 | Integer 0 | Type selector, object `+4` |
| 0x839 | Integer 0 | Byte-vector element count; vector is empty |
| 0x83d | Next chunk starts | Exact end of `tdtM`; `PrsU` begins |

Each string here uses a four-byte little-endian length followed by that number of bytes. The zero-length vector interpretation is also supported by `FUN_10032caa0`, which reads a count, bounds it to at most 1,000,000, resizes a byte vector and reads one byte per element. Thus this particular lean file demonstrably contains no bytes in that extra-data vector. This still does not prove every possible model parameter would live in that vector.

`FUN_10094f4d8` dispatches on the type. For this sample's type 0 it directly calls `FUN_10055ec14(model_object, archive)`. The remaining 57-byte `PrsU` payload is small and contains an integer 79, `steinwayny`, an empty string, `Grand Steinway D (New York)`, and a final integer 1, in a layout consistent with length-prefixed strings. Without the type-0 reader, the meanings of the two integers and the full model-selection semantics remain unresolved. The NKS PCHK outer call chain still has not been traced.

Evidence IDs:

- `preset-inner-write.json`, `0x1006373dc`: `ev_6f4fd95717496805774540bfdeb165087a9c5accf5e6babedf6e7c49bc88cf59`.
- `preset-inner-read.json`, `0x100675f1c`: `ev_1c2b77a000295b15cd027abf63e64649ac6ec9e46ff3075dfc3212e8742c1dc2`.
- `preset-parameter-read.json`, `0x10094f4d8`: `ev_081216293b1590c9d04e900e41ab7f0a6008f005617c144af6e3bc59f6999e19`.
- `preset-extra-read.json`, `0x10032caa0`: `ev_a4cba3ee050b27426e00667eec367d00064a9deab574b36bd7fb765845495f50`.

### Type-0 `PrsU` sample follows an early-return path

`FUN_10055ec14` has now been inspected for the sample's path only. Its first integer is compared against supported maximum `0x4f` (79), with a version-upgrade error for newer values. For versions above 10, it reads three strings into model-object offsets `+8`, `+0x20`, `+0x38`. For versions at least `0x31` (49), it then reads a flags word into `+0x310` and rejects values greater than `0x3f`. Crucially, if bit 0 of those flags is set, it sets the in-memory flags to `0x3f` and jumps directly to the return epilogue `LAB_10056175c`.

The NY sample matches that path byte-for-byte:

| File offset | Field | Value |
|---|---|---|
| 0x845 | Format version | 79 |
| 0x849 | First string (length-prefixed) | `steinwayny` |
| 0x857 | Second string | Empty |
| 0x85b | Third string | `Grand Steinway D (New York)` |
| 0x87a | Flags word | 1 |
| 0x87e | End | Exact end of the 57-byte PrsU payload and the NKS file |

Thus, for this sample, this reader consumes identity strings and flags and **returns before the subsequent detailed model-state deserialization**. Later paths in the same function read additional chunks, collections, numeric fields and nested structures, but this sample does not take them. This is stronger evidence than small size alone: the inspected factory record does not embed those later state fields. Calling its final integer simply a generic “mode” was imprecise; the code uses it as a bitfield. The whole function was not decoded into named physical parameters, and no runtime call trace was recorded.

Evidence: `preset-model-tree-read.json`, `0x10055ec14`, `ev_a678ec369cdf80558ea57279f7d8c5d6268cbfa564cee915f04ab1785ace96a4`.

The remaining question is where the application resolves this compact record into its effective built-in preset/model state. That requires callers and subsequent resolution logic, not further parsing of this sample: all bytes of its inner `tdtM` and `PrsU` chunks are now accounted for structurally, while some metadata semantics and the outer NKS dispatch remain unverified.
