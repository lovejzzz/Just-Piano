# Microphone spectral sources and primary positions (pass236)

Date: 2026-10-17. The supported ordinary microphone profile now drives channel
spectral curves, whitening amount/flag vectors, global-curve mixes and primary
receiver positions from immutable binary data plus decoded FXP state. Captured
versions of those inputs are audit targets only. Global spectral shaping and
model/lid inputs retain the archive construction from passes234–235.

## REA and static source evidence

REA/Ghidra read-only analysis of the pinned original ARM64 binary established:

- `0x1005763f4` constructs the active output index map. Nonzero record types are
  included, subject to microphone identity filtering. A runtime solo index can
  also include a disabled record. This implementation requires solo index zero,
  the explicit `--no-prefs` profile used by the native fixtures, and supports
  record types 0/1 and ordinary identities below 1000. Special identities and
  other activation types are rejected, not inferred.
- `0x10041eddc` obtains the microphone identity from the FXP output record at
  native offset `+0x28`; `0x100896e98` obtains the Boolean flag at `+0x48`.
- `0x1001ba68c` selects the identity's registry record (or identity-zero fallback),
  copies its spectral curve and mix, and selects whitening amount: model amount
  for identity zero; zero for nonzero identity with flag set; registry amount
  otherwise. Special binaural identities follow different branches.
- `0x100850c08` initializes the registry with static tables. The two microphone
  identities used by these fixtures are 4 and 5. Their 200 frequency knots are
  at `0x100a87150`, and their 200 ordinates at `0x100b2667c` / `0x100acf95c`.
  Mix/amount pairs are at `0x100b41698` / `0x100b416a0`. These addresses refer to
  file-backed Mach-O segments, not native runtime allocations.
- `0x1001300d0` initializes the curve index vector; `0x1000f02cc` derives curve
  dimension from the vector extents. The numerical source views need neither
  the index allocation nor pointers. The supported curves have dimension one,
  increasing knots, ordinary mode and log-X zero.
- `0x1005da3d0` copies each ordinary record's position vector. Its special
  binaural replacement branch is excluded by the identity guards above.

The exporter verifies SHA-256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`
before reading static tables, verifies FXP integrity, and binds its preset hash
to the existing archive export. Only address/layout code is published; measured
curves and presets stay private. REA session `pass236-channel-source-rea-v2`
closed with exit status zero. One rejected query used an incorrect argument
name; its corrected request succeeded. No target process was launched by REA.

## Native validation

Each group audits 1,209 microphone spectral/control values and nine primary
position values, with zero mismatches. The two complete nine-response native
oracle comparisons remain bitwise exact:

| Profile | Final values | Bit differences |
| --- | ---: | ---: |
| Open lid | 70,464 | 0 |
| Partial lid, float32(0.37) | 76,032 | 0 |

A fresh private FXP changes only the first active microphone's whitening flag
from 1 to 0, plus the ordinary archive MD5. An actual six-site read-only native
render exits zero, with no capture errors or pending resampling. Its observed
amount vector is `[float32(0.8),0,0]`, rather than the baseline zero vector.
The archive/binary-derived computation matches all three final responses:
25,152 values, zero bit differences. The first final response changes from the
baseline while the other two retain their original hashes. This is an authentic
nonzero-whitening test, not a replay-only perturbation.

The same native run writes a non-silent stereo WAV: 48 kHz, 24-bit, 113,152 frames,
peak 0.2955567 and RMS 0.0216252. WAV SHA-256:
`43ce300754fa39ded4406fe94fb0ce061afbe7602691e13a6de1fffc395dd31b`.
This establishes a successful native audio render; independent final stereo PCM
equivalence is **not** established. The initial capture attempt failed during
Python import because the dispatch-index environment variable was missing;
it launched no target and is excluded. The corrected fresh v2 run is the evidence.

## Dependency controls

- Altering native targets for one curve ordinate, amount, flag and mix gives four
  spectral source mismatches. Altering a native primary coordinate gives one
  position mismatch. All computed raw-through-final responses remain exact.
- Altering identity 4's actual private input ordinate changes final channels
  zero and one (8,113 / 8,142 words), leaving channel two and raw responses exact.
  The two curve audit mismatches reflect both channels using the same identity.
- Altering the first actual FXP-derived position by `-2^-20` changes its two raw
  responses (11,106 / 11,130 words) and final channel zero (8,111 words).
  Other channels remain exact.

All negative controls exit 1. Synthetic tests check whitening branches,
activation/order, primary coordinates, unsupported solo mode and invalid data.

```sh
python3 scripts/pianoteq_export_soundboard_microphone_inputs.py \
  PRIVATE_IMMUTABLE_BINARY PRIVATE_FXP PRIVATE_ARCHIVE_JSON PRIVATE_NEW_JSON
node tests/soundboard-microphone-source.mjs
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_GROUP_0 PRIVATE_GROUP_1 PRIVATE_GROUP_2 \
  --archive-inputs PRIVATE_NEW_JSON
```

Private evidence includes `pass236-nine-microphones-open-v2.json`,
`pass236-nine-microphones-partial-v2.json`, `pass236-negative-microphone-*-result.json`,
`pass236-whitening-model-chain-group0-v2`, and `pass236-whitening-replay.json`.

## Remaining scope

Relative microphone direction offsets and parent indices, runtime output-rate
and response-blend policy still include captured inputs. Only registry identities
4/5 have static exports and native end-to-end IR evidence in this pass; other
microphones, solo mode, special identities and activation types need further
implementation and evidence. The no-prefs solo-zero policy is explicit input,
not recovery of arbitrary runtime preferences. All full model-to-IR, continuous
hammer/string/damper voice, final stereo PCM, all-note/preset and browser
integration/persistence/performance completion gates remain open.
