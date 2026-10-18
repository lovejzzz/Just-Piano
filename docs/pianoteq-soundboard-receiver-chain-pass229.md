# Constructed receiver geometry in the response chain (pass229)

Date: 2026-10-17. Receiver construction from pass228 now drives the complete
response replay. Inputs are primary receiver coordinates, relative offsets,
parent assignments, mirror/displacement controls and soundboard configuration.
The spatial shape is independently solved with CG. Final image coordinates and
amplitudes from native memory are audited, not used to predict observations.

Six fresh native processes capture three source groups for the normal dry
configuration and three for the inside-microphone probe. Each uses six read-only
hardware sites and exits 0 without capture errors or pending work.

## Normal configuration: full existing chain passes

All final receiver coordinates and metadata, observation groups, matrices and
intermediate response arrays pass their same-run comparisons. All nine final
dispatcher responses additionally match the single-process pass219 native node
oracle: 70,464 float32 values, zero bit differences. The aggregate verifier now
requires own receiver construction whenever its input configuration is present.

The report records receiverGeometryComputed=true and
finalReceiverCoordinatesUsedForPrediction=false. Matrix snapshots, packed
observation snapshots, captured grid scalars and excitation samples likewise do
not drive this profile's predictions. Source groups are captured in separate
processes; the node oracle comes from one native process.

## Inside microphones: verified boundary and unresolved FFT branch

The full replay of the inside-microphone probe is rejected at the explicit
FFT16384-only guard. Its native leading responses require FFT32768 for every
channel in all three groups. No smaller transform, tolerance, truncation or
alignment is substituted to claim success.

Copies of those captures with downstream spectral/normalization/dispatch targets
omitted retain the native pre-spectral input targets. Independent replay passes
all calculations through that boundary, including nontrivial spatial attenuation
and parent inheritance from pass228:

| Group | Raw words checked | Leading-response words checked | Differences |
| --- | ---: | ---: | ---: |
| 0 | 68,904 | 28,008 | 0 |
| 1 | 68,904 | 27,132 | 0 |
| 2 | 68,904 | 25,371 | 0 |

These bounded replays explicitly report dispatchComputed=false. They do not
certify the inside probe's complete IR or final PCM. The complete original
captures, including all downstream native targets, remain available for the
FFT32768 implementation and verification.

## Dependency negative controls

Changing one final receiver coordinate target creates one receiver audit failure
and leaves all predicted downstream responses unchanged. Changing a primary x
input by 0.000125 changes 11,306 raw words in channel zero and 11,305 in its
displaced channel three; other raw channels remain exact. Both runs fail as
expected. A larger 0.125 primary displacement changes the global output length
and is rejected at the shape comparison; that failed run is retained too.

```sh
node tests/soundboard-receiver-geometry.mjs
node tests/soundboard-observation-groups.mjs
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_RECEIVER_NORMAL_0 PRIVATE_RECEIVER_NORMAL_1 PRIVATE_RECEIVER_NORMAL_2
```

Private evidence: `pass229-receiver-normal-group0-v1` through `group2-v1`,
`pass229-nine-receiver-normal.json`, `pass229-receiver-inside-group0-v1` through
`group2-v1`, their `prespectral` copies and `pass229-negative-controls`.

Next: implement and strictly verify the newly exercised FFT32768 branch, then
continue removing captured model/shaping configuration dependencies. Primary
microphone configuration is still captured, and model-to-IR independence remains
false. Complete coupled voice, final stereo PCM, all notes/presets and browser
AudioWorklet/persistence/performance acceptance remain open. No deployment or
merge is performed.
