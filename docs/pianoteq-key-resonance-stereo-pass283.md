# Owned per-key recurrence through complete stereo, pass283

Existing mono B158 is now computed continuously from owned per-key modal
histories and the computed same-key mono slots from pass282. The complete
same-run stereo path no longer consumes native B158 audio. It still consumes
native per-voice audio and coefficient/control inputs; full mechanical coupling
and capture-free MIDI synthesis remain incomplete.

## Actual arithmetic and state lifetime

The key loop at89812c..898138 calls79d078, dispatching to5f1e58 for the inspected
variant. Each key owns modal links, interleaved two-sample histories, a previous
input and a sleep flag. This is a different kernel from the later global modal
recurrence. Its output subtracts four-mode sums into B158.

For each mode, coefficients at link+8/+c are float32-multiplied by key gain2c;
coefficients at+10/+14 are negated. With input present, each sample starts with
current-input multiplication, then FMA-adds previous input, latest modal output
and preceding modal output in that order. For absent input, the first sample
of each four-sample group starts with the older-history multiplication and
FMA-adds the latest history; the other three start with the latest-history
multiplication. These operation orders are preserved rather than replaced by
an algebraically equivalent float64 expression.

The four mode lanes sum as `(lane0+lane2)+(lane1+lane3)`, with float32 rounding
after each addition. That sum is subtracted from the existing output for each
successive four-mode batch. Partial batches and padded history storage remain
covered. Before each mode batch, tiny history pairs are cleared using the
actual double threshold0x3e45798ee2308c3a and rounded absolute-pair sum.

Without input, an already sleeping key returns unchanged. An awake key sleeps
when the maximum absolute stored history falls below float32 threshold
0x358637bd. With input present, a sleeping key clears its histories and wakes.
Zero gain and empty links return without advancing histories. Previous input
becomes the final input sample after active processing, or positive zero after
an actively processed absent-input block. Early-return branches preserve it.

Coefficient tables and key gains remain observed inputs. Initial sleep flags
also remain observed configuration; their source has not been independently
derived. Numeric history and previous-input snapshots are never loaded into
the predictor.

## Cold and complete native evidence

The full collector observes cold per-key records at the existing raw-update
point, then completed records at the existing global drive point. No new
hardware point is added: six IDs are registered before launch, with five active
and the unchanged raw/drive alternation. All105 internal key records contain
1176 modal links in total. Their complete padded cold histories are positive
zero, and previous inputs are zero; their byte hashes verify the owned zero
initialization. These105 records are not105 audible-note acceptance cases.

Accepted native child99106 exits0 with no collector errors or pending phase,
2320 global blocks and3314 voice records. It and LLDB are absent afterward.
There are no target code/data/register writes, protection changes, unowned-stop
continuations or Pedalboard calls. Commercial inputs and captures stay private.

The owned recurrence processes computed per-key slots in ascending key order.
MIDI and owned incremented voice ages supply contribution frames; native global
ordinals and ages are comparison targets. Every key's complete post-block
history hash, previous input and sleep flag are checked, together with all
148480 internal B158 samples. This passes1331348 comparisons with zero
differences, including one wake, one sleep and9982 history-pair cleanup actions.
The computed B158 contains112256 nonzero samples.

B158 SHA256:
`79a2973e4716935c3abf7f3c29a57d6fc5e76c90f1885ab0cb49ff1c693c775b`.
Capture runtime SHA256:
`0f14c7adc75c249aa7ebf403cd656abce754486c57562e51254fc6e12fc629f4`.

## Full same-run audio and negative controls

The global modal producer now receives computed B158 plus all three computed
modal inputs, computed drive levels and scratch. It validates that the per-key
and global stages bind the identical key-input report and binary. Their output
feeds owned lattice/delay feedback, shared routing, independent archive IR/cold
convolution banks and final stereo.

| Stage | Comparisons | Differences |
| --- | ---: | ---: |
| Ordered key mono inputs | 554,326 | 0 |
| Per-key histories, sleep state and B158 | 1,331,348 | 0 |
| Raw keys and sensor levels | 1,720,237 | 0 |
| Drive and first modal input | 524,320 | 0 |
| Global modal states and complete mono | 1,108,960 | 0 |
| Lattice/delay feedback | 1,623,456 | 0 |
| Shared routing/caches | 5,166,292 | 0 |
| Cabinet, postprocessing and complete writer PCM | 3,797,857 | 0 |

Both complete24-bit stereo/48kHz WAVs contain148224 exported frames and match
sample for sample. An independent Python WAV read confirms zero differences,
peak0.39563024044036865 and RMS0.04110141672326396. All148480 internal frames
are calculated; the actual writer does not submit the last256 internal frames.
There is no alignment, cropping, normalization or tolerance adjustment.
Computed/native PCM SHA256:
`4ef06522928947cc2ea54dea2f5ab1b4e43a863d1d2de36bbe0406ca7fc95f41`.

Changing one history target or one B158 target fails exactly one comparison
with unchanged computed B158. Poisoning the downstream consumer's B158 target
also fails exactly once with unchanged complete mono hash. A corrupted B158
binary and a mismatched key-input provenance digest are rejected before a new
mono report is written. Synthetic tests cover subtraction, four-lane grouping,
partial batches/padding, null-input tail, sleep/wake and zero-gain bypass; they
are not a substitute for the native full-render comparisons.

The accepted private numerical closure is `pass283-runtime-v2`, with62
hash-listed files and committed versions of the other chat's two modified DSP
modules. Artifacts use private prefix `pass283-`; none of the model, preset,
coefficient tables or raw audio is published.

## Remaining work

Final reports now state nativeExistingMonoStillObserved:false,
nativeModalInputAudioUsedForPrediction:false and computedBodyBeforeSource:true.
Per-key coefficient tables, gains and initial sleep flags remain observed,
as do global modal coefficient versions. Per-voice mono/spatial audio, mix
levels, key identities/order, raw-node/control lifecycle, static sensor/drive
material, drive gain, two-row global excitation and remaining routing/post/
writer configuration remain native prediction inputs.

Next derive per-key coefficient/control production and the two-row global
excitation, and continue the paired contribution-order causal experiment.
This recurrence is not a complete reconstruction of hammer contact force,
string feedback and damper felt. Native variability remains open. The verified
fixture is still five A4/v96 strikes with CC64 assigned to Rattle. All88 keys,
multiple velocities, sustain and other pedals, factory presets, AudioWorklet,
persistence, real-time performance and release remain required. Comparison
counts overlap and are not a completion percentage. No browser engine switch,
merge or deployment occurs.
