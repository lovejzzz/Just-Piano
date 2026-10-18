# Archive-derived zero extra-damping envelope, pass309

The supported offline baseline no longer consumes native V7e0 extra-gain
snapshots as prediction inputs. It derives the disabled transient branch from
preset/model inputs before synthesis. This is a zero-envelope branch, not an
implementation of the nonzero transient or the complete felt/contact law.

## Source chain

846908 adds preset scalar A7d8 to the note-evaluated A7e0 curve, then clamps
float32 output to[0,6]. The per-note builder stores it at G+e44. 71625c..6284
passes that value through the shared+304 distribution and clamps again. The
shared configuration comes from preset A880, copied by714530. Its enable field
is zero in the accepted baseline; the distribution returns its input without
random draws. This conclusion does not depend on the interface's additional
random-enable override, because the stored enable is already zero.

The resulting voice H2f34 becomes43dcb0's configuration+24. The initializer
constructs a three-point velocity curve at x=[0,0.5,1], using the vector-valued
B38f8 evaluated at the model note. It evaluates the curve at the independently
computed voice velocity, multiplies by H2f34, and divides by the bounded positive
duration. With this archive-derived zero gain,43dcb0 takes its explicit zero
branch: initializes the source curve to zero and clears its tail quantities.
6e4f5c's curve/decay branches therefore preserve zero before6e51a8 publishes V7e0.
No zero is inferred merely from the historical target values.

Read-only source evidence is bound to the original arm64 executable SHA256
8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094.
The existing complete initializer and shared builder evidence is recorded in
passes306/307/308; pass309 also queries846908 and10b1bc through REA, both successful:
ev_46fc724a1f6b692e3409541144a33bacdc85d982f050e7fdb1078c093fb3c991. The session closes normally with terminal0. The raw
ARM listing resolves float argument/configuration offsets that Ghidra omits.
No fresh native rendering, Pedalboard, target writes or protection changes are
used for this change.

`archiveZeroExtraDamping` derives the source gain and validates the disabled
random configuration, ordinary curve modes and finite three-value velocity
profile. `initializeZeroExtraDamping` evaluates each owned voice velocity before
selecting the zero envelope. Nonzero gain, enabled randomization and unsupported
controls fail explicitly. This path does not fabricate nonzero output or reuse a
native envelope. External automation remains outside the fixed offline profile.

## Complete existing baseline audio

With `--computed-extra-gain`, all5 initial voices and2,054 later refreshes use
the independently selected zero envelope for damping and position/dispatch
conditions. Native V7e0 is retained only for the2,059 additional comparisons.
All14,292,040 complete source checks pass with zero differences.
Calculated six-row terminal SHA256 remains
 a1d720a27a38972b4100854f63e98c1707c510381230bd85378bb07d57560f81;
continuous SHA256 remains
 fde7102595dcc4114a3ef036b63c463afcfcf1f89fc09e6fee14231807a1eb23.

Fresh spatial and downstream calculations pass. An independent Python WAV read
compares all889,344 PCM bytes of the complete148,224-frame stereo24/48k output
with the existing actual native recording, exactly:
070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29.
No alignment, trimming, normalization or tolerance change occurs. Source,
spatial and stereo observations still come from separate captures.

The artifact binds the current source/input/report hashes and records
nativeExtraGainUsedForPrediction:false. Perturbing one native extra-gain
comparison target produces exactly one extra-gain:zero-envelope failure and
exit1, with calculated audio hashes unchanged. Legacy extra-gain input handling
passes14,289,981 checks with identical audio. A contradictory artifact boundary
flag is rejected. Component tests cover velocity interpolation/endpoints,
negative-source clamp and explicit nonzero/randomized rejection; affected
modal-damping and arithmetic checks pass. An initial syntax-check failure during
editing is corrected before any accepted verification run. A verification refresh
correctly rejects existing output paths; final spatial/stereo artifacts use fresh
private names and the final current source closure.

## Remaining requirements

Nonzero extra damping transients, auxiliary source waveforms, other model/control
profiles, publication and voice/cache scheduling, complete hammer/string/felt
coupling, native nonzero-damper variability, capture-free stereo, all88 keys/
velocities/pedals/presets, AudioWorklet integration, audible parameter edit/save/
reload and real-time performance remain open. Browser audio/UI are unchanged.
Commercial inputs, REA responses and all audio artifacts stay private.
