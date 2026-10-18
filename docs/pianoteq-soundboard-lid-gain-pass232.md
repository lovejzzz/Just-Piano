# Model curve and preset lid position to three gains (pass232)

Date: 2026-10-17. The direct-model branch of `0x1003ca83c` evaluates the model's
three-dimensional curve at the effective lid position. REA/Ghidra for
`0x10009edcc` and the immutable ARM64 listing confirm boundary mode 3 clamps
both endpoints. Interior interpolation rounds t*next before fusing
(1-t)*previous. The implementation uses the existing recovered vector curve
arithmetic, with explicit linear/non-log/direct-family guards.

Lid enable and position come from preset state, with an explicit root enable
flag required when the preset does not enable it. A disabled lid evaluates at
position 1 and zeros the second gain. Alternate model geometry and its optional
vertical-level factor remain unsupported here.

Four read-only hardware call-site hooks record preset state, model curve,
interpolation argument/output and final three gains for each of three model
components. Separate native processes test lid positions 1, float32(0.37) and 0.
The latter two are private FXP copies changing only the unlocked lid-position
field and ordinary archive integrity digest. All three processes exit 0 with
three complete records, no pending call and no capture errors.

All nine derived position arguments match the native helper arguments. The nine
interpolated triplets and nine final gain triplets compare 54 float32 values
with zero bit differences. At the partial position, the first component gains
are [0.4480000138282776, 0.621999979019165, 0.32999998331069946]. The curve knots
are [0, 0.5, 1], so this test exercises interior arithmetic, not just copying
an endpoint.

Changing one final gain audit target creates one mismatch without changing any
prediction hash. Changing one source-curve ordinate changes the affected
component's interpolation and final gain; other components remain exact. Both
negative runs correctly fail. Synthetic tests cover known vector interpolation,
endpoint clamping, disabled-lid policy and unsupported-family/log-mode guards;
the disabled-lid branch is not claimed native-verified by these three fixtures.

```sh
node tests/soundboard-lid-gain.mjs
node scripts/pianoteq_replay_soundboard_lid_gain.mjs PRIVATE_LID_GAIN_CAPTURE
```

Private evidence: `pass232-lid-open-v1`, `pass232-lid-partial-v1`,
`pass232-lid-closed-v1`, `pass232-lid-probe-inputs`, `pass232-negative-controls`
and `pass232-lid-gain-rea`. Presets, model curves and native audio remain private.

Integration remains required: the complete IR replay still takes its gain
vector and selected scalar configuration from the dispatcher capture. The
upstream scalar builder from pass231 and this curve builder need to drive that
chain together. Inspection also identifies normalization controls as model
R+0x1e4, internal rate R+0x154, and the mode-zero producer's constant impulse mix;
these agree with the three earlier normalization call captures and can free a
hardware site for upstream-source observation. Runtime-rate policy, archive
decoding, complete coupled voice, final PCM, presets and browser acceptance
remain open. No deployment or merge occurs.
