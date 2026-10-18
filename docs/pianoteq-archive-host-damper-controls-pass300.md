# Archive host damper controls and fresh native parameter probe, pass300

The supported raw-key producer now calculates its two host damper-cap controls
from the model/preset archives. It no longer seeds these values from native
host+bc/+c0 snapshots. Initial soft/pedal/extra-pedal state, binary mode and two
bypass flags remain explicit native-profile dependencies. The wider engine's
other model/control/voice/scheduling dependencies are not closed.

## Exact source mapping and complete reference audio

Pinned ARM instructions `6d560c..6d5628` and REA entry `6d5308` confirm direct
float32 copies:

```text
hostBlend   = B3b80 = mar_param(2f10).field(c70)
hostControl = A116c
```

REA evidence:
`ev_83cacbe46eec9facc85af01699fa745427a0653de50076c9595f6f0877bbd55b`.
The existing raw-key computation then evaluates the capped control from
`(hostControl + localControl) * (1-hostBlend)` in the recovered float32 order.
The archive producer requires unique typed fields and finite float32 values.
Synthetic tests poison both native initial host values, change archive inputs
and verify that hostControl0.5/blend0.5 produces held key cap0.75 in actual
raw-node integration. This is not a native nonzero-control state comparison.

Both sensor-level and raw-key coefficient-input producers consume these owned
controls. Against the accepted pass284 capture, all4,410,725 node/key/control
comparisons still match. The complete148,224-frame stereo24/48 kHz reference
WAV remains exact, PCM SHA256:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

The pass295 compact-order experiment remains exact over its full native extent,
PCM SHA256:

`1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`

Control-target and PCM-target one-bit negatives each fail once while calculated
streams/WAV stay unchanged. Python independently checks complete WAV parameters
and every PCM byte. No alignment, cropping, normalization or tolerance change.
Current bound terminal/spatial artifacts retain their unchanged source closure.
These exact results concern the accepted capture, not every fresh native run.

## Four new ordinary native CLI renders

The installed application's ARM64 slice is verified against the immutable binary
SHA256 `8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
The application is unmodified and runs through its ordinary headless CLI, with
no debugger, injection, Pedalboard or protection changes. REA is read-only and
closes normally.

A disposable private FXP changes only A116c from0 to0.5 plus its normal payload
MD5. The ordinary parser verifies the single decoded-field difference and
checksum. The modified preset SHA256 is
`cf9f6852a2a8b3cb712fe091a8f3d015b74ce436f91bb280529fd1a2b0700776`.
Every render uses the same pinned MIDI, --no-prefs, --multicore0, 48 kHz,
24-bit and ditherOFF. All four native processes exit0, have no preset-load or
archive errors, and their PIDs are absent afterward.

| Native run | PID | Complete frames | PCM SHA256 |
| --- | ---: | ---: | --- |
| Original preset |47598|148224|29392d608d667da18bc4707f4679b28f79edc770ed80e624953c9589378d2f6b|
| A116c0.5 |47602|143360|bbf4290158bfff4463e545929b5e733b5c4d664b84a4d562882497e654d0d590|
| Same modified file reopened |47749|143360|eec993e612e1842c8c4bdc6ef9dd00888a3907d6893b2d0e0c5d756bb53472f8|
| Original preset restored |47753|148224|11d366e8af9a15d83d6ad5f77cce36b0eef61149b1e7edb0344a9c925fa79dd7|

The first probe wrapper wrongly required the modified preset to keep the
baseline frame count and exits1 after native PID47602 has already exited0.
That failed assertion, launch record, log and full WAV remain preserved. The
baseline gate still requires148224 frames. The separate parameter probe records
each actual complete export extent; unlike lengths are not padded or cropped
into a matching comparison.

The file edit/reopen observations show a consistent export-length change in
this four-run probe, but **modified-preset sound repeatability fails**: the two
143360-frame outputs differ in199968 interleaved samples, maximum12540 integer
24-bit units, first at frame4808 in the first strike. The original-preset pair
differs in98484 samples, maximum8 units, first at frame13036. Both paired
comparisons include their entire respective equal-length PCM streams.

The nonzero-control first-strike difference is retained as an unresolved native
initialization/coupling question. It is not attributed to contribution order
without further state evidence. No native runtime fields were captured in the
modified runs. They do not prove an independent nonzero-control render or
stable parameter persistence in Just Piano. The new original-preset PCM hashes
also differ from the accepted capture; general repeatability remains open.

## Remaining work

Next isolate the new modified-preset first-strike difference and recover initial
pedal/mode/bypass production, then the wider source profiles and voice scheduling.
Full mechanical contact-force coverage, capture-free MIDI-to-stereo, all88 keys,
velocities/pedals/factory presets, AudioWorklet, audible parameter persistence and
real-time acceptance remain open. This baseline MIDI assigns CC64 to Rattle;
Sustain is not covered. Private pass300 reports, full WAVs, FXP, REA responses
and failure evidence stay outside Git. No merge/deployment or full-replica claim.
