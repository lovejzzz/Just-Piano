# Runtime rate selection in the independent IR replay (pass238)

Date: 2026-10-17. The supported replay can now compute dispatcher output rate,
resampling rates and final dispatch padding from explicit render configuration.
The captured rate words remain audit targets. This extends archive/model and
microphone construction from passes234–237; response-blend configuration is
still a separate remaining input dependency.

## Recovered arithmetic and source boundary

The existing read-only REA evidence for `0x1005cb874` and `0x1005fce64`, checked
against the immutable ARM64 listing, shows nine numerator/denominator pairs:
`1/1, 3/2, 2/1, 3/1, 4/1, 5/1, 8/1, 12/1, 16/1`. These also occur in the
file-backed data at `0x100c18788`. The helper computes a float32 ratio of runtime
render rate to the unsigned base-rate word, chooses the nearest table ratio
with earlier entries winning exact ties, then computes:

```
outputRate = float32(float32(renderRate * denominator) / numerator)
```

The runtime base-rate word is distinct from the model component's soundboard
grid/filter rate. The private exports now accept explicit `--render-rate` and
`--base-rate` configuration. The native `--no-prefs` runs below confirm base rate
44,100 for these fixtures. Arbitrary preference-driven base-rate selection is
not recovered or claimed. Neither captured runtime bytes nor captured ratio
tables supply prediction inputs.

## Actual native validation

A two-site hardware capture observes the runtime getter result inside the rate
helper and the producer call site receiving its return value. The corrected
probe binds all three component calls, source descriptors and caller/thread
ownership, then disables its hooks. Each successful render exits zero without
capture errors or pending calls. Across four render configurations, all 12
observed output-rate results match and all 216 observed ratio-table words match
the independent table.

| Render rate | Selected ratio | Computed/native IR output rate |
| ---: | ---: | ---: |
| 48,000 | 1/1 | 48,000 |
| 96,000 | 2/1 | 48,000 |
| 88,200 | 2/1 | 44,100 |
| 64,000 | 3/2 | 42,666.66796875 |

The first v1 probe used an incorrect caller filter and encountered an unowned
debug stop. It captured no rate records, was rejected, and its target PID was
confirmed absent before retry. The v2 probe corrects the caller return address
and observes the result at the producer call site. No unowned stop is resumed;
no target registers, code or memory are modified.

The full archive-driven nine-response comparisons still pass with the new rate
policy enabled: open lid 70,464 final values, partial lid 76,032, zero bit
differences. The scalar configuration audit now includes the extra output-rate
word: 31 words and five bytes per group.

A separate fresh six-site full-chain render at 88,200 Hz checks the different
44,100 Hz IR output policy through actual normalized and final response targets.
The group-zero full replay passes, including all three final responses, with
zero bit differences. Native audio is non-silent 88,200 Hz, 24-bit stereo,
207,872 frames, peak 0.2899176, RMS 0.0211129; WAV SHA-256:
`48d6d6d03fee2e457012f953d041870891b07ed3c2a0627c1c6c79c1fc0bd457`.
This is authentic native reference audio, not proof of independently generated
final stereo PCM equivalence.

## Dependency checks and usage

Changing the captured configuration rate and captured resampling rate from
48,000 to 48,001 produces one configuration-word mismatch and one rate-argument
mismatch. All computed raw-through-final responses remain exact. Changing the
actual explicit render-rate input to 48,001 leaves all six raw responses exact
but changes 8,113 / 8,142 / 8,311 final dispatch words. Both negative replays exit
one. Unit tests cover all nine ratios, exact ties, invalid rates and optional
model-configuration rate construction.

```sh
node tests/soundboard-rate-policy.mjs
node tests/soundboard-model-config.mjs
node scripts/pianoteq_replay_soundboard_rate_policy.mjs PRIVATE_CAPTURE 96000
python3 scripts/pianoteq_export_soundboard_microphone_inputs.py \
  PRIVATE_BINARY PRIVATE_FXP PRIVATE_ARCHIVE_JSON PRIVATE_NEW_JSON --render-rate 48000
```

Private evidence: `pass238-rate-policy-48000-v2`,
`pass238-rate-policy-{96000,88200,64000}-v1`, `pass238-rate-policy-*-replay.json`,
`pass238-nine-rate-open.json`, `pass238-nine-rate-partial.json`,
`pass238-negative-rate-*-result.json`, `pass238-rate88200-model-chain-group0-v1`
and `pass238-rate88200-full-replay.json`. Commercial inputs, observations and
native WAVs remain private.

Full model-to-IR independence, other configurations/families, continuous coupled
voice, final stereo PCM, all-note/preset and browser acceptance remain open.
