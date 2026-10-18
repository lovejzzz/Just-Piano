# Nonzero-damper repeat divergence already in terminal source, pass301

Two new complete passive captures localize the modified preset's first-strike
variation to the terminal source before spatial processing. This pass removes
no additional prediction input and does not solve the underlying native
initialization/control/feedback difference.

## Complete same-fixture pair

The private FXP is the ordinary checksum-verified A116c0.5 variant from pass300,
SHA256 `cf9f6852a2a8b3cb712fe091a8f3d015b74ce436f91bb280529fd1a2b0700776`.
Resource, MIDI, render arguments and frozen collector helpers are identical.
The already authorized debug copy retains the verified original __text. The
collector uses exactly the existing two fixed read-only hardware sites,
460f1c and85ede4, with one active at a time. There are no target writes,
expressions, register changes, injection, protection changes or Pedalboard.

Native PIDs49919 and50079 each exit0 with3,284 paired blocks over five voices,
no collector errors, no pending pair,6,568 exclusive phase transitions and a
complete143,360-frame stereo24/48 kHz WAV. Both PIDs are absent afterward.
Only the ordinary initial SIGSTOP is resumed. Wrapper exit0 is checked in
addition to, never in place of, the actual native terminal state.

Runtime SHA256 values are:

- `6b51ecf6e87d50021b2115204d5ee9d8d4e25a4dda78d728102d86f86d5a32d9`
- `0e0c4872f2474456c11868de3046191e39b976fcd3d42239396b064ebfbf7066`

## Full-inventory comparison

Every keyed `(voice epoch, sample counter)` exists in both captures; no block
is discarded. Initial spatial profiles are identical. Chronological terminal
processing order differs at15 positions, first at ordinal358. Final contribution
order and global controls/states are not captured by these two sites.

| Complete keyed signal | Samples compared | Different samples | Earliest difference |
| --- | ---: | ---: | --- |
| Six terminal rows |1,261,056|89,661|voice0/counter0/row0/sample1|
| Thirteen returned spatial/mono rows |2,732,288|273,129|voice0/counter0/row0/sample1|

Each of the first three terminal rows differs in29,887 samples. All three
auxiliary terminal rows are bit-identical throughout the complete captures.
The first differing terminal words are0xba0bb03e and0xba0bb110. Thus the first
observed source difference already exists in the first voice's first block,
before the spatial boundary and before the later chronological-order changes.
This does not establish which source initializer, runtime control, mode state
or upstream feedback input caused it. It cannot be explained solely by a
post-terminal spatial/mix-order substitution.

Both full WAVs have143,360 frames. All PCM samples are compared without
alignment, trimming, padding, normalization or enlarged tolerance. There are
177,042 differing interleaved samples, maximum12,540 in integer24-bit units,
first at absolute frame4,808. PCM SHA256 values:

- `6a6f9db1483a31acd8a7d39b977172a1ae13700c1f054a67d6bbcb2249df6474`
- `1e52fed31f357724cbba1061aed79962e646fd946aeb197926875ad283cd49a6`

## Audit and rejection evidence

`pianoteq_audit_spatial_native_pair.py` checks the pinned helper set, immutable
resource/MIDI/preset bindings, exact launch arguments, normal preset loading,
actual native and wrapper termination, all phase transitions, voice counters,
complete finite sidecars, every block hash and full WAV extents. It reports
missing inventories explicitly; common-block localization never becomes a
cropped equivalence pass. Synthetic tests cover signed zero, keyed reordering,
missing blocks and signed24-bit/unequal-length PCM handling. An incomplete
native status and a one-bit sidecar modification are each rejected before a
report is written.

A separate Node implementation reproduces all89,661 terminal differences and
the complete PCM count, maximum and first differing frame. Its initial one-off
attempt wrongly assumed a44-byte WAV header; these native WAVs have a JUNK
chunk and PCM starts at104. Structural RIFF parsing fixes the coordinate error;
the original failure is retained. The auditor's initial phase check also assumed
the return transition ordinal preceded output insertion; the pinned producer
records it afterward. The corrected exact phase convention and initial failure
log are retained. Neither correction changes a native capture or tolerances.

Private captures, all WAVs, row localization, independent audit and rejection
logs use pass301 paths outside Git. No DSP implementation or public browser
sound changes in this pass, and no previous baseline result is upgraded.
Next compare main-mode initialization and first-block release/feedback controls
at earlier boundaries. Full native repeatability, independent MIDI-to-stereo,
mechanical contact-force coverage, all keys/velocities/pedals/presets,
AudioWorklet/persistence/performance and final release remain open.
