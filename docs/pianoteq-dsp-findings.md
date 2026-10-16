# Pianoteq 9: code-backed soundboard findings

Analysis date: 2026-10-15 (America/New_York). Read-only analysis of the installed application's extracted ARM64 slice, using REA with Ghidra 12.1.4. Target SHA-256: `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.

## Result and scope

There is executable evidence of a numerical soundboard impulse-response simulation, with configuration values entering coefficient preparation and repeated floating-point state updates. This goes beyond finding parameter names in strings. It does **not** establish the complete real-time piano synthesis algorithm, the exact interpretation of every coefficient, or the mapping from every GUI knob to those coefficients. No proprietary DSP implementation was inserted into Just Piano.

The strongest identity evidence is a compiler-generated RTTI name containing `mdrt::SoundboardIRCompute::propageSimd(bool, float, float, float, float, float, float, vector<float> const&, bool, bool)` and its lambda, together with `sbimpulse.cc` assertion references. These identify an IR-computation path; they must not be described as proof that the recovered loop is the application's live audio callback.

## Observed call path

| Address | Observed role | Evidence |
|---|---|---|
| `0x10037907c` | Search existing configuration entries; on miss build temporary state and call the computation dispatcher; store/reuse resulting data | `soundboard-task` |
| `0x100056f98` | Configure numerical state, select scalar/other branch versus SIMD branch, then process and copy resulting response buffers | `soundboard-dispatch`, `soundboard-dispatch-assembly` |
| `0x1005a8874` | SIMD propagation: coefficient preparation, repeated state updates in groups of 64 steps, output work scheduling and postprocessing | `soundboard-propagation` |
| `0x1005ab0e0` | Accumulate weighted contributions from simulated state into response/output buffers | `soundboard-kernel` |
| `0x1005c8420` | Scheduled functor wrapper calling `0x1005ab0e0` with one work-item record | `soundboard-invoke` |
| `0x1001cccd8` | Functor type-identification method containing the SoundboardIRCompute lambda RTTI name | `soundboard-rtti-code` |

The propagation query used interior address `0x1005a9020`; the decompiler resolved its enclosing function to `0x1005a8874`. Likewise, the RTTI query at `0x1001ccd18` resolves to `0x1001cccd8`. Do not mistake query locations for function entries.

Propagation either directly calls `0x1005ab0e0` per record or allocates functors with vtable pointer `0x100b93ff0`, submits them and waits for completion. The raw vtable bytes associate invoke address `0x1005c8420` and RTTI method `0x1001cccd8` with this table. This ties the type name to the computation more strongly than an isolated string match.

## Configuration values actually participate in calculation

The dispatch assembly at `0x100057058`–`0x10005708c` loads five configuration floats and one fixed float into ARM64 floating-point argument registers before calling propagation:

| Argument register | Configuration byte offset / source |
|---|---|
| `s0` | `+0xc4` |
| `s1` | `+0x9c` |
| `s2` | `+0xbc` |
| `s3` | `+0xc0` |
| `s4` | `+0xa0` |
| `s5` | constant bit pattern `0x3f9a362c` |

These offsets are relative to this dispatcher's configuration object (`x19`), **not** preset file offsets or GUI parameter IDs. The decompiled call to `0x1005a8874` omits these six floating-point arguments, although its callee prototype includes them. The assembly explicitly supplies them. Therefore a source-like decompiler listing alone would give an incorrect account of this call.

Inside propagation, the first float helps determine the simulation iteration count by division by an internal step value. The second participates in a squared ratio used to scale one coefficient array. The third participates in a shared denominator and a previous-state feedback factor. The fourth scales a second coefficient array, which is used conditionally when its scale is nonzero. The fifth enters an initial reciprocal scale and later output scaling; the sixth also enters output processing. These are arithmetic observations, not established physical units or UI meanings.

The update loops combine previous/current buffers, indexed coefficient arrays, and an excitation sequence added at a selected state index. Four floating-point lanes are processed together; groups of 64 simulated steps feed a scratch buffer. The output kernel uses index lists and three-float coefficient records, combines neighboring time entries, and adds contributions to response buffers with a destination offset and bounds check.

The buffer history and coefficient arithmetic are consistent with a discretized, damped physical propagation model and weighted observation of its response. That mathematical description is an inference. The evidence does not yet establish a particular plate equation, mesh geometry, physical-unit convention, or that an individual coefficient is the public Soundboard Impedance / Cutoff / Q control.

After the propagation branch, the dispatcher computes a tangent-based coefficient from a clamped configuration frequency-like value and a rate-like value, applies a recursive filter to response arrays, invokes additional processing routines and copies output buffers. This shows additional conditioning after simulation; the exact role of every downstream helper remains unverified.

## Reuse and computation timing

`0x10037907c` compares a requested configuration against entries in a linked structure, moves a hit toward the front, and obtains existing results. On a miss it releases a lock, builds the response, reacquires the lock, checks again, evicts an entry when capacity is reached, and stores the new configuration/result. This is strong evidence of a bounded cache with recency maintenance and duplicate-computation handling. The exact equality fields inside the comparison helper have not been independently decoded.

This cache and the explicit IR type name support the interpretation that soundboard responses are prepared/reused as configuration changes. They do not prove how the real-time renderer consumes them, whether a convolution method is used there, or when this path runs in every instrument/mode.

## Hammer-hardness evidence is less complete

The large `hardness-code` result contains construction/registration of labels including Hammer Hardness Piano Fine, Mezzo Fine and Forte Fine, with parameter metadata and `param_ref.cc` assertions. This is stronger than a flat string inventory but remains parameter-definition evidence. It does not show a traced hammer-force equation, nonlinear contact law, velocity interpolation, or a connection from those registered fields to this soundboard routine. Such a connection must not be asserted based on labels alone.

## Remaining dependencies

1. Trace named parameter setters/registration IDs into the configuration fields above, including conversion, normalization and per-note interpolation.
2. Decode the simulation-state construction and coefficient arrays to identify physical units and boundary assumptions.
3. Trace response-buffer consumers into the actual audio processing callback, and separately investigate hammer/string/damper coupling.
4. Compare controlled parameter changes and rendered audio to validate static interpretations. No such listening or dynamic perturbation experiment is claimed here.

See `pianoteq-preset-findings.md` for the separate factory NKS/preset-format investigation. The soundboard findings do not by themselves establish where factory model values are serialized.

## Evidence index

All files below are local REA response envelopes under `~/.local/share/just-piano-analysis/`. IDs are taken from `result.structuredContent.evidence_id`. Raw pseudocode remains outside the repository. These reports summarize observations rather than reproducing the implementation.

| File | Evidence ID |
|---|---|
| `soundboard-task.json` | `ev_5a534bdfbe4012c26b80f1a8ee7e36980e53792e7d7ffad9dd6045eaf43a52ca` |
| `soundboard-dispatch.json` | `ev_73c78f222bfec79ff0235d906a64ddc559b02df4222a503175432fa2c3d98dce` |
| `soundboard-dispatch-assembly.json` | `ev_80c5c7a205165fe9eba830cfa2f5ab479625770e40dde19ca50d5516ab549de5` |
| `soundboard-propagation.json` | `ev_3f06efc9f40f7b14dddda2dda6aa9dca1109757c77a30f35f4a5cf70531f2720` |
| `soundboard-kernel.json` | `ev_adac925bb4285dd53b15326afe5672b24efef9e86cf27277d25d63b1bf2096fd` |
| `soundboard-rtti-code.json` | `ev_34da267a1ccb36110674a421c4629382f72514acfc276d30c1ebc474beba00c5` |
| `soundboard-invoke.json` | `ev_4cfa379f7e981a42c88d2b8bcdc8def5eeac88c5b1703f1c858f03a35da0a097` |
| `soundboard-vtable.json` | `ev_5791de35bc8c58df305e5a09ab67263d86796dc7caf1655d8566fe6a0b5154fd` |
| `hardness-code.json` | `ev_7961fad306a869774e6fa8802e9ac68b98c14dbad3063771cf62cb3270ca165e` |

Ghidra pseudocode is reconstructed output, not original source. Recovered types, no-return flags, unreachable-block removal and function boundaries carry tool limitations; the missing float arguments above are a concrete example. Analysis is of this specific ARM64 build and must not be generalized to other versions without verification.
