# Independent IR/bank initialization through complete same-run PCM, pass274

The supported NY baseline now has an exact complete stereo calculation from
route-entry voice audio through shared caches, feedback, independently generated
IR/convolution banks, postprocessing and actual CLI writer spans. The exported
148,224-frame PCM matches the native file byte for byte. Voice audio, feedback
sources and several control/scheduling boundaries remain observed, so this is
not capture-free MIDI-to-stereo or a completed browser engine.

## Complete accepted native observation

The primary FXP/MIDI and immutable executable/resource pins remain unchanged.
The accepted native process exits0 with no collector errors or pending calls:

| Boundary | Complete observations |
| --- | ---: |
|Route-entry voice contributions|3,314 blocks, all five voices|
|Shared/feedback global blocks|2,320|
|Feedback route, cabinet input, post-level stereo|2,320 each|
|Actual writer conversion inputs|579 spans of256 frames|
|Final native WAV|148,224 stereo24/48kHz frames|

The collector registers six main-thread hardware points, with five active at a
time. A pre-registered writer point starts disabled; after initial cabinet
configuration, the IR-copy point is disabled and the writer point enabled.
The normal owned-resume driver is unchanged and knows all six IDs before launch.
There are no target code/register/state writes, protection patches or Pedalboard.

To fit this registry, the shared snapshot is read at0x1006c2fd4 from a workspace
pointer obtained from the actual manager caller. This is **post-feedback**, not
the pre-feedback point of pass273. Runtime metadata and the replay explicitly
record the boundary. Own pre-feedback cache outputs plus the observed feedback
source are checked against this snapshot and the subsequent cabinet input.

The earlier six-point attempt stops after partial capture on an unowned
exception. A separate seven-registered-point attempt exits1 with the native
"cannot run / Please reinstall" warning before collecting any audio. The warning
cause is not established and no protection logic is changed. Both failures are
retained and excluded. All three native processes are now absent.

## Writer spans establish the exact export extent

All2,320 internal blocks,148,480 frames, are checked. The writer is actually
invoked579 times, after global block counts4,8,...,2,316; each invocation requests
256 stereo frames at source offset0. The final256 internally computed frames
are not submitted to the writer. This is read from native conversion calls,
not selected by matching or cropping an output waveform.

The pinned writer at0x10091baa4 selects the conversion span, and
0x10091bae8..0x10091bb34 converts it and dispatches exactly that sample count.
Every captured writer float matches the corresponding four independently
computed stereo blocks. Quantization uses the already recovered binary64 FMA
and signed32 high-three-byte rule. The concatenated579 spans must equal the
entire native data chunk's length; no offset search, normalization, tolerance
increase, prefix-only comparison or discarded target difference is allowed.
Writer dispatch and end-of-render policy are still observed inputs, not an
independent implementation of the CLI's termination rule.

## Independent archive IR reaches this full audio path

The existing source exporters decode this exact primary preset and pinned
resource/binary into one private numerical archive. The standalone generator
receives only that JSON, with explicit44.1kHz base and48kHz render settings.
It accepts no native capture argument. It generates three source groups and
nine responses containing70,464 float32 values.

The new generated-pack exporter verifies the input archive hash, all response
descriptor hashes/extents, ordered groups, rates and independent-generation
manifest. It uses the recovered model-node window layout to build144 head and
121 tail windows. All71,168 window values match this native run's time-copy
targets bit for bit; those targets are read only by the separate comparison.
Signed zero survives pack serialization. A source-boundary regression traverses
67 numerical modules without a native/file/network input dependency.

`buildCabinetBanksFromIrPack()` now constructs cold banks directly from that
pack and its generated node lengths. It supplies16 head slots per input and
15/15/15/13/13/13/13/13/13 tail slots, own empty input/output states and overlap
histories, local object identities, standard9-to-3 routes and generated156/135
command schedules. The existing plan compiler is reused. Native pointers,
ring snapshots, routes and compiled plans are comparison targets only. Unused
native kernel padding/readiness bytes are not treated as mathematical inputs.
Unsupported node profiles fail explicitly.

The native copied time IR and complex spectra are no longer prediction inputs
in the independent-pack/bank replay. All265 own FFT kernels are checked against
native spectra before the full audio calculation. The native postprocessing
profile remains supplied separately; it is not silently classified as generated.

## Authentic audio and controls

| Calculation | Checks | Differences |
| --- | ---: | ---: |
|MIDI clock/shared cache and post-feedback snapshot|4,720,852|0|
|Full downstream, captured IR initialization|3,654,304|0|
|Full downstream, independent IR and cold bank source|3,658,657|0|

Both full downstream variants produce PCM SHA-256:
`055b76aa27fc82477bea222c18f6d00d56ea40e9f6801811136159e6ad4f18e0`.
An independent Python RIFF/PCM check confirms all148,224 frames with no alignment
or normalization. Peak is0.39563024044036865; RMS is0.04110141753497154.
This compares PCM, not unrelated WAV container metadata.

Changing one native plan target before constructor selection causes one plan
mismatch. Changing one native complex IR target causes one spectrum mismatch.
Both retain exactly the original computed PCM. A cabinet-source comparison
target control similarly leaves generated PCM unchanged. Negative reports exit1;
zero PCM differences do not erase a failed internal target comparison.

Synthetic tests cover a cold-bank impulse and its1,024-frame tail response,
plan generation, short IR windows, missing payloads, archive/manifest binding,
signed zero and existing-output rejection. These are integrity/arithmetic tests,
not additional native instrument coverage.

Numerical runs use private frozen JS closures. The other chat's modified
`modal-poles.mjs` and `partitioned-convolution.mjs` are not overwritten or staged;
the verified closure uses their committed HEAD versions. Previously untracked
IR-pack, node-window and plan helpers and their focused tests are included as
the narrow dependencies actually verified by this new path. Results do not
claim validation of unrelated working-tree changes.

The numerical entry points can be run separately against private inputs:

```sh
node scripts/pianoteq_generate_soundboard_archive_irs.mjs PRIVATE_ARCHIVE NEW_GENERATED_DIR
node scripts/pianoteq_export_generated_ir_pack.mjs NEW_GENERATED_DIR PRIVATE_ARCHIVE NEW_PRIVATE_PACK
node scripts/pianoteq_replay_key_global_baseline.mjs PRIVATE_ACCEPTED_RUN NEW_SHARED_REPORT --global-output=NEW_SHARED_BINARY
node scripts/pianoteq_replay_key_stereo_baseline.mjs PRIVATE_ACCEPTED_RUN NEW_SHARED_REPORT NEW_STEREO_REPORT --ir-pack=NEW_PRIVATE_PACK --output-wav=NEW_PRIVATE_WAV
node tests/cabinet-bank-source.mjs
node tests/generated-ir-pack.mjs
```

Generator inputs, generated response files, packs, native captures and WAVs are
not repository fixtures and remain private. The stereo runner consumes only a
completed accepted capture with the expected writer handoff and exact source
bindings; a partial run is not a substitute.

## Remaining inputs and next work

The two-row global excitation and three-row feedback source are nonzero in this
fixture. Their measured peaks range from0.00527 to0.06975. They cannot be replaced
by zeros or inferred solely from their parameter names. Their numerical producer
must be connected to the independent engine, along with complete voice audio,
own contribution dispatch and voice-route initialization. Postprocessing
parameters and writer termination also remain observed.

The pass273 contribution-order effect is proven for shared caches. This pass
verifies one complete downstream native run; it does not yet swap the order
between two complete downstream runs to isolate their final PCM differences.
Other initialization variability remains separate. All-note/velocity/pedal and
factory-preset coverage, AudioWorklet integration, parameter save/reload,
real-time performance and final release remain open. The dark UI is retained;
there is no merge or deployment.
