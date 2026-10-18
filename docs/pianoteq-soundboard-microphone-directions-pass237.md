# Relative microphone directions and parent indices (pass237)

Date: 2026-10-17. The ordinary family-zero microphone path now constructs its
relative receiver direction vectors from decoded FXP angles. Each ordinary
microphone contributes one relative receiver, with its primary channel index as
parent. Captured direction vectors and parent indices are strict audit targets,
not numerical inputs to the supported independent replay.

## Calculation

The immutable ARM64 implementation at `0x1008d9424` computes:

```
elevation = float32(double(float32(angle1)) * pi / 180)
azimuth   = float32(double(float32(angle0)) * pi / 180 + pi/2)
direction = [float32(cos(elevation) * cos(azimuth)),
             float32(cos(elevation) * sin(azimuth)), sin(elevation)]
```

The sin/cos calls use the independently implemented platform-matched sincosf
fast branch. In particular, the azimuth addition occurs in double precision
before conversion to float32. Separate float32 products match the native
instructions. The producer `0x1001ba68c` appends the primary channel index for
each relative vector. Its coordinate transform `0x10005db2c` leaves family-zero
vectors unchanged; alternate family and binaural branches remain rejected.

## Authentic native evidence

Each group audits nine direction words and three parent-index words. The full
nine-response open-lid and float32(0.37)-lid comparisons both still pass:
70,464 and 76,032 final values, respectively, with zero bit differences.

A new private FXP changes the first three active microphone angle pairs to
`[-13.25,37.5]`, `[161.125,-28.25]`, `[24.375,63.5]`, updating only those words
and ordinary integrity MD5. The native six-site group-zero capture exits zero,
with six raw responses, no capture errors and no pending resampling. Its three
directions, parent assignments and complete final IRs match independently:
25,152 final values, zero bit differences. Primary positions and other controls
retain the baseline state. This is a new actual native render, not an alteration
of observed output targets.

That native run also produces a non-silent 48 kHz, 24-bit stereo WAV of 109,312
frames, peak 0.2500683 and RMS 0.0140549. WAV SHA-256:
`0000a18ba0e3e81e8b955cfc5476d6c4504531c5e6cd4980515eb2d3341ecc03`.
The WAV is authentic reference audio; independent final stereo PCM equivalence
is not established by these IR checks.

## Dependency checks

Changing one captured direction coordinate and one captured parent index yields
exactly two source audit mismatches. Computed raw-through-final responses remain
exact. Changing the first actual preset azimuth by `+0.125` changes two direction
coordinates, 11,279 words in its displaced raw response and 8,113 words in its
final channel. Other primary and displaced raw channels remain exact. Both
negative controls terminate with exit status one.

Synthetic tests cover known axial directions, parent order, nonfinite/incomplete
angles, unsupported argument-reduction range and alternate model family.

Private evidence: `pass237-nine-directions-open.json`,
`pass237-nine-directions-partial.json`, `pass237-direction-probe-inputs`,
`pass237-directions-model-chain-group0-v1`, `pass237-directions-replay.json`,
`pass237-negative-direction-targets-result.json` and
`pass237-negative-direction-input-result.json`. Commercial presets, measured
curves, raw observations and native WAVs remain private.

## Remaining scope

For the supported profile, receiver coordinates, relative directions, parent
assignments, displacement scale and image geometry are now computed independently
from archive/preset inputs and the established mode-zero separation policy.
Runtime output-rate selection and response-blend configuration still include
captured inputs. Other microphone identities/solo modes/model families need
implementation and native evidence. Full model-to-IR, continuous coupled voice,
final stereo PCM, all-note/preset and browser acceptance gates remain open.
