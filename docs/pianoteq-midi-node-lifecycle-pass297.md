# MIDI-owned raw-key node lifecycle through complete stereo, pass297

The complete baseline predictor now owns dynamic raw-key node identities,
birth, reuse, list order and cleanup. Both sensor-level and global-coefficient
input production use this optional path. Dynamic native node lists, pointers,
velocities and positions are comparison targets, not prediction inputs. Initial
numeric/node-layout profiles, flags, host/key controls and explicit key mapping
remain observed. This is raw-key control state, not physical string displacement
or the complete hammer/string/damper contact-force integrator.

## REA and pinned ARM evidence

Read-only REA/Ghidra queries use the immutable ARM64 binary with SHA256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
No native process is launched in this pass. The REA session closes normally.
The corresponding pinned disassembly is checked independently.

The event dispatcher `53f47c` routes note-on through `793674` and `35ed60`.
`0348b4` searches the key list by the voice's ID/tag. A matching node is reused
and moved to the head; otherwise a free-pool node is prepended, with its cold
position set from `key.flag1c XOR 1`. Its velocity and mask are published and
voice chains are linked. The independent implementation supplies local node
identities and handles the supported cold single-key birth/reuse sequence;
full pool exhaustion, arbitrary IDs/tags and voice-chain publication are not
implemented. The baseline's held velocity is the supported positive sentinel;
other attack-rate branches are not claimed.

`5e1d18` advances each node, applies caps and aggregates the maximum position.
After each node update it calls `90cab4`. Cleanup requires all of:

- the candidate is not the head and its velocity is negative;
- its position equals `flag1c XOR 1` and the head's position;
- the head's velocity is negative;
- no voice matches the candidate ID/tag, with `0xfffe` wildcard semantics.

The helper unlinks the node and places it on the free list. The implementation
owns active-list removal but does not reproduce native allocator addresses.
The decompiler labels ID words as floats; ARM `ldr w` and integer `cmp`
instructions establish their actual bit-field comparisons. Float-valued IDs
from pseudocode are not used as numerical identities.

REA evidence identities:

- Event dispatcher: `ev_0b01474e4e4652d548d1dfd19756da3806a1651b8d9f99eff9566e3cfc37e0f8`.
- Note-on preparation: `ev_5e54a91ad8fbe39fb2b2b4ac3708416b0200389c6bc82c41fc58e71af98af361`.
- Voice allocation call chain: `ev_48873a85c694fe2a4ff2ee3a9d87d8e419afc6d7291fc40dde4a2c561062144b`.
- Node birth/reuse: `ev_23549d79ecef2fc4f63a1e2ca992458703350aa2b05b7fd1584b083b1b9e7b97`.
- Node cleanup: `ev_9dc5ba42a618e2f0fa56d28ae51c905646a958d78e79841f2bc277b24b1c8139`.

## Actual complete-run verification

The accepted native pass284 reference has one zero-time warmup and 2,320 render
blocks. Own list state is checked before and after every call: node count,
ordered ID/tag, velocity, position and intermediate position, plus all raw-key
values. All **3,168,990** comparisons pass exactly. There is one node birth,
four reuses and one removal. Removal follows the block at absolute frame10,048;
the next input at frame10,112 contains only the head. Its timing is computed
from the integration/cleanup predicates, not selected from a captured clock.

The first attempt incorrectly demanded zero initial positions for every key;
the constructor rejected the fixture. Twenty-two keys have the no-damper flag
and force position1, including in the zero-time initializer. Initialization now
derives that position from the flag; it does not copy native position history.
The rejection log is retained, not counted as a passing numerical comparison.

A one-ID target negative fails exactly once while calculated node/raw-key stream
hashes remain unchanged. Synthetic tests poison the incoming dynamic node list
and check sequential clocks, birth/reuse, cleanup timing, nonnegative velocity,
head retention, owner matching, wildcard IDs and the undamped idle position.
These tests do not establish native coverage for the unobserved branches.

A freshly bound terminal artifact and calculated spatial endpoint stream feed
the full stereo chain. The `--midi-raw-lifecycle-source` path exactly matches all
148,224 reference stereo frames, PCM SHA256:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

Legacy raw inputs and the prior velocity-only option retain the same complete
PCM. The pass295 compact-order sufficiency experiment also remains exact with
owned node lists, complete PCM SHA256:

`1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`

A one-bit PCM target negative fails once without changing the calculated WAV.
Independent Python reads compare the full WAV parameters and all PCM bytes.
No alignment, cropping, normalization or tolerance change is used. The compact
experiment still reuses reference global controls and export spans; its
unobserved internal target states are not counted as verified.

## Remaining work

This supported producer retains the native initial numeric/node-layout profile,
flags/host/key controls and explicit MIDI69-to-internal-key60 mapping. It owns
only the current cold single-key lifecycle, not general voice ownership,
retirement, allocator reuse, attack-rate controls or arbitrary event IDs.
Native-generated waveform/model/spatial/coefficient profiles, other runtime
controls, contribution ordering and scheduling still enter the wider predictor.
The baseline uses CC64 as Rattle; Sustain is not covered by this fixture.

Capture-free MIDI-to-stereo, full physical contact-force coverage, all88 keys,
velocities/pedals/presets, AudioWorklet integration, parameter persistence and
real-time acceptance remain open. Private REA responses, captures, audio,
reports and rejection evidence stay outside Git. No merge/release is made.
