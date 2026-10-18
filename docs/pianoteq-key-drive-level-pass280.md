# Raw-key coordinates to drive pulses and component audio, pass280

The seven nonzero drive-level pulses in the primary fixture now come from owned
raw-key coordinates and per-key timer/reference states. Native coordinates,
sensor pairs and level outputs are comparison targets. One zero-time setup call
and all2320 render blocks pass1722558 checks with zero differences. The computed
pulses also drive the verified nonlinear generator to exact real component audio.

That audio comparison uses another native run with the same pinned fixture and
is explicitly marked crossRunComponentComparison:true. It is not a newly
accepted same-run raw-key-to-full-stereo capture. The pass279 full stereo path
still consumes native drive levels; integrating this new producer there remains
required. Raw-node velocities, flags/lists, host/key controls, static sensor
weights and initial reset configuration remain observed inputs.

## Actual level writer and numerical operation

A diagnostic hardware watchpoint on the owned drive object's0x84 field stops at
0x100195338, immediately after the actual store at0x100195334. The writer is
195200, tail-called by096558 from the render manager. No watchpoint stop is
resumed: the unchanged owned-resume driver rejects that stop category, the probe
records the exact owned watchpoint and terminates only its debug child91024.
Its exit9 is intentional diagnostic termination, not successful audio capture.
No target code/data/register writes or protection changes occur.

GlobalDriveLevel implements the actual105-coordinate profile for this fixture.
The coordinate count is runtime structure coverage, not105 accepted audible keys.
For each coordinate, first clamp it upward by the shared lower bound. With zero
timer, crossing0.25 in either direction starts a float32 0.025-second timer;
the previous coordinate remains frozen. While the timer is positive, decrement
it by float32(64/48000). On expiry, clamp the timer to positive zero, accumulate
weight×absolute coordinate change with FMA in original key order, then publish
the new reference. The level is negative absolute sum; an exactly zero sum
remains positive zero.

This produces the first main pulse19 blocks after its crossing, with the actual
float32 countdown rather than a fitted pulse timestamp. There are29 crossings
and29 expiries across setup and rendering, yielding seven nonzero levels.
Weights are still an observed static profile. The drive-enabled branch and
initial reset flag are checked against their actual configuration.

## Initialization is a computation, not a state seed

The first paired collector incorrectly assumed raw update and the later drive
call form a simple one-to-one scope; it records phase errors and is excluded.
A collector paired at the actual render-manager return completes but exposes a
missing setup call. The first numerical report fails924 state comparisons even
though the seven levels already match. That failure is retained, not accepted
on the strength of correct output values alone.

The complete collector records one preceding raw update from6b95e8. Pinned
instructions6b95dc..6b95e4 explicitly zero its time argument before calling096558.
GlobalRawKeys now accepts an explicit time step for this initialization; normal
calls retain the unchanged sample-count/sample-rate default. The sensor timer
step remains the configured64/48000 even during this zero-time raw update.

All owned node and sensor histories begin at zero. The raw initializer
unconditionally overwrites the initial coordinates of disabled/held nodes;
their previously stored values are never loaded. Initial intermediate values
are likewise written before use. Nonzero initial coordinates that would remain
live are rejected. The computed initializer establishes the actual references
and timers, including the22 initial coordinate crossings, before the first
64-frame render update. No observed timer snapshot is imported as initial state.

An initial complete-layout attempt is interrupted by an unowned EXC_BREAKPOINT
with768 saved blocks and is excluded. Its separate diagnostic report remains
passed:false despite matching prefix arithmetic. Retry native process93433
exits0 with one initialization record,2320 render records, no errors and no
pending phase. Earlier processes, including the diagnostic child, are absent.
The unowned exception policy is unchanged; Pedalboard is not used.

## Key coordinates and pulse verification

GlobalRawKeys advances coordinates from node velocities and current flags/caps,
carrying its own state. Its computed aggregate values feed GlobalDriveLevel
directly. Actual aggregate values, node positions/intermediates, before/after
timer/reference pairs, cap, time step, reset and final level are targets.
Render frame counters are checked against the explicit64-frame clock.

Computed2320-float level SHA256:
`5a1221cc10d57cb01072e6e17c271bb9916dc8ab8057e73118c5949af86bac4d`.
Accepted capture SHA256:
`e4be01c525a5c3b0e95433e0adb397b648a22d44240a3041f69554854717f629`.

Poisoning one active-key position target, one active weighted timer target or
one nonzero level target each produces exactly one mismatch and exit1. All three
retain the same computed level hash. A changed exported level binary is rejected
by its consumer before producing a drive report. Synthetic tests independently
cover crossing delay, the frozen reference, expiry on return motion and the
zero-time key update.

## Actual component audio and its scope

The computed levels are supplied to GlobalDriveCore64 using pass279's dedicated
drive capture as a target. The consumer binds the level report/input/binary
hashes and requires identical source MIDI, preset, resource and render-rate pins.
It uses computed levels for prediction and the old native levels only as
comparison targets. Native drive gain remains a supplied input; the optional
filter is verified inactive in the target run, as in pass279.

This comparison passes955840 checks with zero differences: all2320 calls,
88178 powf evaluations, states/controls,88177 nonzero output samples and the
modified caller input. An output-target negative control fails exactly one
check with unchanged computed audio. No native output or dynamic generator state
is loaded into the predictor.

All148480 mono float32 component frames match the recorded real drive scratch
bit for bit. Export to a float32 WAV and decode back through FFmpeg preserves
every sample; an independent Python comparison confirms the decoded bytes equal
both the computed binary and native component target. No amplitude scaling,
normalization, waveform alignment or cropping is applied.

Component audio SHA256:
`a9d847e9c319c61c6825e17d4d347f3adb325f182ec8918c3bd894e527661338`.
This is internal drive audio, not a full piano WAV. The consumer reports
sameNativeProcess:false and independentEngineStereoVerified:false. No new
full-stereo acceptance is inferred from this cross-run component test.

The private numerical closure contains55 files and uses committed versions of
the other chat's two modified DSP modules. Their working changes are preserved.
Raw weights, model material, captures and audio remain private.

## Next boundary

Capture raw initialization, key coordinates, level production, drive and final
stereo in the same accepted run, then replace native levels in the full path.
Next remove node velocity/flag/list and host/key-control observations using MIDI
and model data, and generate sensor weights/profile/waveform from resources.
Independent voice production, complete hammer/string/damper coupling, native
repeatability, all-note/velocity/pedal/preset coverage, AudioWorklet, persistence,
performance and release remain open. No merge/deployment or browser-engine
switch is performed.
