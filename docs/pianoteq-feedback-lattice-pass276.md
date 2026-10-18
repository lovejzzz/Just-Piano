# Continuous scalar feedback lattice, pass276

The complete three-point run additionally verifies owned lattice output through
the external wrapper, constant-gain mapping, lazy-cleared delay rings and final
three-row feedback. All2320 blocks and1474976 checks pass with zero differences.
The feedback binary is exported from computed values, not native output rows.
Its SHA256 is
`5422eae5ea7c045123148d7f2a9bd78b6dc6873e8e21e33344fb1089949e1bac`.
The mono source and initial static configuration remain observed inputs.

The actual baseline feedback program calls the scalar lattice through an external
processor. The earlier direct fallback probe at `0x1006c2d28` receives no calls;
the active program instead reaches `0x10059ef70` through `0x1006ca950`.
This is a numerical implementation with continuous owned state, not evidence
that the complete hammer/string/damper or independent MIDI-to-stereo engine is
finished.

## Arithmetic and state

Each of three output rows has its own power-of-two float32 ring and ordered tap
list. For each input sample, first write it at the write cursor. For each tap,
load both old ring values before either store, then compute:

```text
ia = (write - start) & mask
ib = (write - end) & mask
a = ring[ia]; b = ring[ib]
ring[ia] = fma32(b, c, float32(a * g))
ring[ib] = fma32(-a, c, b)
```

Advance write, read the output at the independent read cursor, then advance read.
Both cursors have unsigned32 overflow. This preserves the native separate
multiply, fused updates, tap order and load-before-store behavior even when tap
indices alias. The no-tap case remains a delay. FMSUB's subtraction direction
was additionally checked with local compiler assembly, without evaluating code
in the target.

The supported program has four taps per row and ring lengths1024/1024/2048.
Geometry, coefficients and initial cursor offsets are observed static inputs;
their complete preset-to-constructor derivation is not claimed. Owned histories
start at zero and advance without loading subsequent native ring samples.
Every captured ring hash and both cursors are separate comparison targets.
The optional post-filter is disabled in this fixture; enabled programs are
unverified.

## Complete scalar observation

The accepted two-site run exits0, with no callback errors or pending calls.
All2320 blocks are replayed continuously from the observed mono body source.
There are500576 checks, zero differences and431040 nonzero output samples.
Computed three-row output SHA256:
`e8cb612e596aa7fb5825d3857948ef46d00a9126a2e7972e683c17c4ae2a8f04`.

Changing the first nonzero native output target produces exactly one mismatch,
exits1 and leaves this computed hash unchanged. Unit checks additionally cover
a known impulse, delayed copy, arbitrary block cuts, aliased taps and cursor
overflow. The frozen numerical closure contains only the runner, scalar lattice,
existing float32 arithmetic and routed-cache arithmetic.

The native WAV contains148224 stereo24 frames at48kHz. Its PCM SHA256 is
`d9a3371af5e5347ed19778a81e814ee873f9ed5ecabfd0dab767080bb66f6029`.
This differs from pass274's native PCM and is retained as another native-run
variation. This pass does not claim a newly independent complete stereo match.

## Feedback routing and actual audio

The accepted three-site collector observes the scalar call before execution,
the global feedback routing point at0x1006c2d64 and its return at0x1006c2d98.
At the middle point it checks the completed lattice rings and the wrapper's
three-row output. All wrapper samples match the owned lattice, establishing
identity behavior for this fixture rather than assuming a wrapper gain.

Routing uses the existing constant-tap cache arithmetic with gain1, the static
mapping and initial empty ring geometry. Every subsequent mapping, cache head,
flag word and actual feedback sample is a comparison target. No native delay
ring data or per-block cursor resets enter prediction. The route negative
control changes one output target, fails exactly one check and preserves both
computed lattice and final-feedback hashes.

This independent run's lattice output SHA256 is
`bec8edb6340dcbf7c6b918dece86ef11c14f79283df3837224fa346d328bcee1`.
Its native final stereo PCM SHA256 is
`d1acb3d55f560a23c0498aa475095f096b347c333e4afda01522bf4a738c7a3a`,
again148224 stereo24/48kHz frames. The earlier two-site run has a different
lattice output and native final PCM. Both runs are checked against their own
complete targets; no cross-run alignment or normalization is used. Native
variation is not thereby resolved. The native final WAV is genuine observation,
but no new complete stereo PCM is predicted by this standalone feedback runner.
Connecting these computed feedback samples to a complete same-run stereo capture
is still required; the pass274 stereo replay continues to use observed feedback.

## Collection boundaries and remaining work

The initial two-site attempt and two four-site route attempts stopped on
unowned EXC_BREAKPOINT events. Their logs are retained and the replayer rejects
their incomplete runtime records. Wrapper exit0 is not treated as successful
native completion. All affected processes were confirmed absent before retry.
No unowned exception is resumed and no target code, data or registers are
written. The route collector now uses three separated points rather than an
adjacent entry/return pair, and periodically persists partial evidence.

The mono body input still comes from the native engine. Remaining work includes
its independent production, all source and feedback controls, full coupling,
autonomous dispatch, stereo integration, repeatability, all keyboard/pedal/preset
coverage and the actual AudioWorklet. Commercial captures, static coefficients,
audio and numerical source archives stay private. Other-chat working files are
not part of this verification.

Run the narrow synthetic and authentic checks separately:

```sh
node tests/scalar-allpass.mjs
node tests/modal-arithmetic.mjs
node scripts/pianoteq_replay_feedback_allpass_continuous.mjs PRIVATE_RUNTIME NEW_REPORT --output-feedback=NEW_FEEDBACK
node scripts/pianoteq_replay_feedback_allpass_continuous.mjs PRIVATE_RUNTIME NEW_NEGATIVE_REPORT --poison-output-target
```
