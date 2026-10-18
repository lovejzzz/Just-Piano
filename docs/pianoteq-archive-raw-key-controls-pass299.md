# Archive-derived per-key damper and cap controls, pass299

The supported raw-key producer now obtains every initial damper flag and local
cap/soft control from the decoded model/preset archives. Native initial per-key
control values no longer enter prediction. Initial host controls, explicit key
count/note mapping and the wider engine's other native profiles/controls/order
remain dependencies. This is a raw-key control subsystem result, not complete
physical contact-force or capture-free MIDI-to-stereo acceptance.

## Producer and consumer evidence

Pinned ARM instructions `3d2600..3d26d4` compute three fields in each56-byte
packed key record. REA recovers the enclosing producer `3d23fc`:

```text
limit = float32(A1168)
if limit == -1: limit = float32(uint32(B3d18))
damperFlag       = uint8(limit >= float32(note))
localControl     = curve(A1170, note)
localSoftControl = curve(B3b88, note)
```

`B3d18` and `B3b88` are decoded under `mar_param(2f10)` at relative offsets
`e08` and `c78`. Curve evaluation requires the established ordinary scalar
archive version32771 and preserves float32/FMA interpolation. Invalid or
unsupported curve versions, missing/duplicate fields and invalid limits are
rejected. No threshold or soft-control table is copied from the native capture.

Consumer `730780` copies packed byte0 to runtime key+1c and packed floats+4/+8
to key+30/+34 at `730878..730884`. Its following four scalar copies include the
previously recovered release controls. Producer and consumer evidence IDs:

- `ev_97b08c915857448d1430f72a056669abd978e0eea4e91248c1fcd555ef65be0a`
- `ev_72fce5fb2e3c47acef57955356d1c9c6fdfaafc1c95fc0f571cf338dfb32afaa`

REA uses the immutable ARM64 binary SHA256
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
The read-only session closes normally. An exploratory interior-address query is
retained separately and is not substituted for the two enclosing entry points.
No native process or fresh recording is launched in this pass.

## Actual numerical and audio verification

For all105 internal keys of the current NY baseline, all315 initial damper,
local-control and local-soft-control values match the accepted pass284 native
capture bit for bit. The current preset explicitly selects limit91: note91 is
damped, note92 is not. The base fallback branch is confirmed statically and
synthetically; a new native fallback-preset audio comparison is not claimed.

The archive values now feed both the sensor-level and global-coefficient raw
key producers. Their own flags also determine cold node position and cleanup.
All **4,410,725** complete-run node/key/control/flag comparisons remain exact,
including the zero-time initializer and2,320 render blocks. Initial and dynamic
native node snapshots remain unused. A one-bit host-control target negative
fails exactly once while both calculated node and raw-key stream hashes remain
unchanged. Synthetic tests poison initial flags/local controls with NaN, test
the inclusive threshold boundary, override precedence, base fallback, curve
endpoints, source changes and strict input rejection. They do not expand native
sound coverage beyond the existing reference.

The current calculated terminal/spatial artifacts remain valid under their
unchanged transitive source closure. With the new raw-key producers, the full
148,224-frame stereo24/48 kHz WAV matches the actual reference PCM exactly:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

The compact-order sufficiency experiment also remains exact through the full
native extent, PCM SHA256:

`1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`

Its unobserved global state and export calls retain the earlier explicit
limitations. A one-bit PCM target negative yields one sample difference with
an unchanged calculated WAV. Python independently compares full WAV parameters
and all PCM bytes. There is no alignment, cropping, normalization or tolerance
change. This is validation against existing authentic recordings, not a new
native render or a browser listening acceptance.

## Remaining work

Only the raw-key initial host-control profile remains observed at this producer
boundary. Its host defaults/controller production still need independent
sources. Key count/note mapping remain explicit. Native model/waveform/spatial/
coefficient profiles, other runtime controls, voice ownership/retirement,
routing and scheduling still enter the larger predictor. The fixture assigns
CC64 to Rattle and does not establish Sustain behavior.

Full hammer/string/damper contact-force coverage, capture-free MIDI-to-stereo,
all88 keys/velocities/pedals/presets, AudioWorklet integration, audible parameter
persistence and real-time performance remain open. Private pass299 REA data,
reports and WAVs stay outside Git; no commercial resources, merge or deployment.
