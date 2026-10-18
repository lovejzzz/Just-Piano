# Computed global controls and dynamic coefficients, passes287–288

The continuous observed-voice stereo engine now computes dynamic global modal
coefficients. It no longer consumes per-block native coefficient version tables
or their selection labels. Raw global control is calculated from same-reference
raw pedal inputs and owned scalar histories; the control trajectory from another
native run is no longer a prediction input.

The initial global mode/coefficient/mapping profile and static scalar settings
are still observed in another successful capture of the identical pinned
preset/MIDI/resources. Voice mono/spatial audio, raw pedal inputs and other
controls remain observed. This is not capture-free synthesis.

## Scalar calculation and lifecycle

A one-site passive observation at73f328 identifies actual return address1bb878.
The manager calls3e1e88, which tail-calls73f328. The pinned ARM64 instructions
show the actual input construction:

- Choose the maximum of the main pedal and either the extra pedal or1, according
  to the low configuration bit. Preserve FCSEL tie behavior and float32 inputs.
- On a falling threshold crossing, set a counter to truncation of the stored
  float32 sample rate times binary64 0.3. Store the new above-threshold flag.
- While that counter is positive, select the main pedal and decrement by the
  smaller of the block size and remaining count.
- Store this effective value. If a second hold counter was nonzero, decrement
  it with unsigned saturation and take the maximum with the held value.
- Dispatch the mapped global control only when the inspected body/excitation
  flags enable it.

`GlobalPedalControl` owns both counters, the prior threshold flag and held value.
It initializes them to zero rather than copying native counter snapshots. The
zero-time raw initializer updates key mapping only; the first real render block
performs the global scalar/coefficient update. Live external hold-event
production and arbitrary preset initialization remain separate requirements.

The existing GlobalKeyMapping and GlobalControlProducer are reused. They own
mapped keys, dirty queues, weighted mode controls, threshold decisions, decay
rate limiting and coefficient writes. Native per-block queue/state/table values
are comparison targets, not restoration inputs. Queue addresses are replaced
with local labels in the stereo predictor profile.

## Complete authentic component capture

The coefficient collector registers the existing raw and drive addresses,
096558 and829d48, with only one active at a time. Child21745 exits0 normally with
2320 complete blocks, no errors or pending raw phase; its PID is subsequently
absent. The immutable executable text is verified before launch. There are no
code/data/register writes, injected calls, protection changes or exception
suppression. The normal native render produces a complete148224-frame WAV.

Runtime SHA256:
`60b7763d1d89c2b6a0611ae5ee9bceed1521ef87c540e6ddd51f40128180d232`.

The same-run component calculation compares raw keys, mapped controls, both
scalar states, dirty queues, mode-state hashes and all three coefficient-table
hashes through the complete2320-block duration. All1274096 checks pass. There
are3272 coefficient writes,2720 rate-limited updates,67 key changes and160
actual producer calls. Initial model fields/tables are still observed.

Computed coefficient-stream SHA256:
`1438afdcf047e873c8676405e4e6b215f251f5725bab18db0f23408d752e895c`.
Computed raw-global-control SHA256:
`61188447d78f993ff3d9ff57be537445c00a8509ef9a02e4d710f3bb653821f3`.

The native baseline has zero nonzero global-control outputs and no active rearm
or hold-counter blocks. Synthetic tests exercise falling edges, counter expiry,
forced selection and a partial-block hold, but those tests do not establish
native nonzero-pedal coverage. The preset's CC64 controls Rattle.

## Complete stereo with computed coefficients

The dedicated stereo entry point uses the unchanged successful pass284 run as
its full audio/state target. The initial coefficient/model/scalar profile comes
from the separate successful component capture above. Source helpers, terminal
status, exact render arguments, fixture hashes and modal geometry are bound.
The raw pedal inputs and calculated raw-key trajectories come from the full
reference run itself; no dynamic trajectory is borrowed from the profile run.

All6960 native per-block coefficient-table hashes are targets. Dynamic version
tables and version-selection labels are removed from the predictor profile.
The freshly computed coefficients drive owned modal states and the complete
feedback, room, convolution and stereo pipeline. All7015168 signal/state checks
pass, and every24-bit PCM sample in all148224 exported stereo frames matches.
Independent Python WAV decoding confirms48kHz/stereo24 and complete equality.
All2320 internal blocks are computed; only the actual579 writer spans are
exported. No alignment, normalization, clipping of extent or tolerance changes
are used.

PCM SHA256:
`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`.

The profile run's own native PCM differs from pass284. This pass does not explain
that repeated-render difference or claim one native run supplies every input.
The source boundary is explicitly coefficientSourceSameRun:false.

## Controls and regression

- A changed raw-global-control comparison target produces exactly one component
  mismatch, with unchanged computed control and coefficient hashes.
- A changed coefficient comparison target produces exactly one full-stereo
  mismatch, with unchanged computed control and complete PCM hashes.
- Changing one predictor pedal input at block160 produces4257252 differences,
  including115705 differing PCM samples and a changed computed control hash.
  This is a synthetic input control, not a native pedal causality experiment.
- The existing observed-coefficient entry point still passes all7008208 checks
  and the identical complete PCM after the engine integration.

The published source is verified from a frozen54-file numerical closure.
Commercial profiles, resources, presets, raw captures, reports and WAVs stay
private under pass287/pass288 prefixes in the analysis directory.

## Workspace and remaining work

The original Documents checkout develops a blocking open() on project files.
A sampled read process is waiting in __open_nocancel; metadata remains readable,
while the private analysis directory works. The cause is unestablished. The
pending original edit is not retried or overwritten. Verified source is prepared
in a separate temporary clone based on2338503, preserving the other chat's
uncommitted changes in the original checkout. No project migration is claimed.

The failed pass287 full capture remains excluded: wrapper exit0, native
terminal:false,3064 voice blocks and1593 global blocks, ending at an unowned
EXC_BREAKPOINT at51fad4. The native PID is confirmed absent. The successful
reduced capture does not establish the cause or fix for that failure.

Remaining prediction inputs include voice mono/spatial audio, initial global
mode/coefficient/association/curve profiles, per-key coefficients/gains, raw
pedals and node lifecycle/velocities, static room/drive profiles, routing/mix/post
configuration, contribution order and writer dispatch. Complete hammer/string/
damper coupling, native initialization variability, MIDI-only synthesis,
nonzero-pedal/full-key/velocity/preset coverage, AudioWorklet integration,
parameter persistence and real-time performance remain open. The browser engine
is not switched, merged or deployed by this change.
