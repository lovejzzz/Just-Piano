# MIDI/archive raw-node velocities through complete stereo, pass296

The supported A4 fixture now predicts dynamic raw-key node velocities from MIDI
and decoded archive curves. Neither the sensor-level producer nor the global
coefficient-input producer consumes dynamic native node velocities on the new
optional path. This removes one numerical runtime dependency, not the native
node lifecycle, profiles, controls or scheduling.

## Supported calculation and boundaries

`MidiRawNodeVelocities` uses the existing MIDI key-release timeline and archive
note-off velocity calculation. Note-on selects the positive held velocity;
note-off selects the archive-derived negative velocity; retrigger restores the
positive value. The initial 105 fallback-node velocities remain an explicit
native profile. The one dynamic node must first appear at a MIDI note-on frame,
in the explicitly supplied internal key, with the supported id/tag. Unsupported
births and identity rebinding are rejected. Node lists, opaque identities,
initial-node removal, flags, host/key controls and the MIDI-to-internal-key
mapping still come from observation. This is limited to channel 0, MIDI69,
48 kHz and 64-sample blocks; it is not an all-key/velocity/pedal producer.

`--midi-raw-velocity-source` binds current resource, preset and MIDI hashes to
the full render fixture. Both sensor levels and coefficient refresh inputs use
owned velocity maps. Legacy behavior remains available without the option.
Reports distinguish dynamic velocities from the remaining initial profile and
native topology. CC64 in this fixture is assigned to Rattle, not Sustain.

## Complete native comparison

The successful pass284 reference contains one zero-time warmup and 2,320 render
blocks. All 243,788 node-velocity and 243,705 raw-key comparisons pass exactly.
The standalone one-bit dynamic-velocity target negative fails exactly once;
calculated velocity and raw-key stream hashes remain unchanged. Synthetic tests
also poison dynamic input velocities and check held/released/retriggered states,
birth timing and initial identity guards. They do not extend native coverage.

The current terminal producer is freshly rerun because the key-release helper
changed, and its transitive source closure is bound again. Calculated terminal
and spatial outputs feed the full downstream chain. All 148,224 complete stereo
frames match the actual reference WAV, with no alignment, cropping,
normalization or relaxed tolerance. PCM SHA256:

`070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29`

The legacy path still passes all 7,015,168 downstream comparisons and complete
PCM. A one-bit PCM target negative produces exactly one sample difference while
leaving the calculated WAV identical. Python independently reads the complete
24-bit/48 kHz stereo WAVs and checks their entire PCM byte streams.

The pass295 compact-order sufficiency experiment also remains exact with owned
dynamic velocities: all 148,224 frames, PCM SHA256:

`1897101af2e6e82dc78dfc6f62af70c15fad32cfe4d8d1511a145e082308370e`

Its unobserved global controls/states/writer calls remain explicitly unverified;
reference controls are reused. This is not a full-state paired-run premise.

## Remaining independence and product work

Native-generated source waveform tables, initial model/cue/spatial/coefficient
profiles, remaining runtime controls, node topology, routing, contribution order
and retirement still enter prediction. Complete capture-free MIDI-to-stereo,
physical contact-force coverage, all 88 keys/velocities/pedals/presets, the
AudioWorklet integration, audible parameter persistence and real-time acceptance
remain open. The existing browser worklet is still a separate simpler engine.
Private captures, WAVs and reports remain under the local analysis directory;
commercial resources are not committed. No merge, release or full-replica claim.
