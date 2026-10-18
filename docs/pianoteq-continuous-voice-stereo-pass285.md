# One continuous observed-voice stereo calculation, pass285

`ObservedVoiceStereo64` now joins the previously verified components in one
continuously advancing engine. Its inputs are observed voice endpoints and
numeric controls, a static drive profile and an independently generated IR pack.
It does not consume historical computation reports or global intermediate audio.
This is diagnostic infrastructure, not an independent MIDI piano engine.

The engine owns key modal histories, three global modal histories, nonlinear
drive history, shared routing caches, lattice/delay feedback, room comb/allpass/FIR
histories, cold convolution banks and stereo postprocessing. No native state is
restored into those histories between blocks. Raw key/sensor levels are freshly
computed by the loader and checked against the same capture.

## Full native comparison

The frozen private closure `pass285-runtime-v2` uses the same accepted pass284
capture, including its unmodified collector provenance and sidecar/stream hashes.
It retains committed versions of the other chat's modified DSP files.

All 2320 internal blocks are computed. The 579 actual four-block writer spans
produce all 148224 exported stereo frames. All 7008208 signal/state comparisons
pass, with zero PCM sample differences. Checks include each block's 105 key
history hashes, previous inputs and sleep flags; three global modal history
hashes, previous inputs and counters; and three lattice ring hashes and cursors.
Room ring-page checks remain covered by the prior component evidence, not by
additional per-page assertions in this runner.

Computed PCM SHA256 remains:
`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

A separate negative run flips one PCM target bit. It reports exactly one
differing sample and retains the identical computed PCM hash. The target never
feeds the engine. No alignment, normalization, target-fitting or tolerance
changes are used.

## Paired capture remains unavailable

Two new passive capture attempts stopped on unowned EXC_BREAKPOINT exceptions.
The first stopped after 456 global blocks at subcode 0x1006c2fd4; the second
after 57 blocks at subcode 0x0. Both wrapper processes exited zero, while native
runtime records stayed terminal:false. Both native PIDs were subsequently
confirmed absent. Neither attempt is valid audio evidence; private logs,
partial streams and a failed-capture audit are retained. No exception was
suppressed or resumed, and no target code/data/register write was introduced.
The cause has not been established.

The runner's optional order-exchange path requires complete captures, identical
normalized numeric profiles/controls, identical keyed mono/spatial voice
endpoints, identical per-block inventories and distinct order/PCM before
computing a counterfactual. No accepted paired experiment exists yet, so no
full-output order-causality claim is made.

## Remaining dependencies and scope

No additional native-input class is eliminated by this integration. Per-voice
mono/spatial audio, coefficients, controls, room/drive profiles, routing,
contribution order and writer scheduling still come from native observations.
Full hammer/string/damper coupling, initialization variability, capture-free NY
MIDI-to-stereo, all-key/velocity/pedal/preset coverage and browser integration
remain open. The browser engine is not switched or released by this change.
