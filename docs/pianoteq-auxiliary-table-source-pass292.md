# Auxiliary source tables and packed filters, pass292

The remaining auxiliary audio is not zero: the primary continuous capture has
633,300 nonzero auxiliary samples. Clearing that input would change the required
instrument. Static tracing identifies an additional source branch before the
already verified terminal envelopes and spatial processing.

At `46134c..461358`, voice age feeds `301c8c` at voice+B78. That dispatcher
renders three source objects of size1C8 through `0b76f0`. Each source reads two
absolute-time tables, mixes them with float32/FMA ordering, and carries two
packed four-sample filter histories in the observed fixture. This is a sampled
source branch; its physical identity is not established as hammer contact force.

## Actual calculation

`AuxiliaryTableSource64` owns age, delayed-start flags and initially zero filter
histories. It implements aligned initial silence, table-end zeroing, distinct
FMA operand order in the bulk and remainder mixing loops, and the native
four-sample recurrence. Each filter uses the captured fixed packed coefficient
vectors with independently carried histories. Small-history cleanup uses the
two exact native thresholds and produces positive zero.

The fixture's five voices have delays0,4,8,24,8 samples (as observed in their
actual source profiles). Delay, initial gains, source tables and filter
coefficients are still native configuration inputs. They have not been derived
from the resource archive or MIDI, and no general all-preset behavior is claimed.

## Successful complete real-audio observation

The new read-only collector alternates two pre-registered hardware sites:
source entry301c8c and return301d60. Only one is active at a time. Five voices
start at age zero and produce all3,314 consecutive blocks. Every one of the
6,628 phase transitions is checked. Native PID28552 terminates with exit0,
no collector errors and no pending interval; its PID is absent afterward.
Code, registers and target data are never written, and no protection is bypassed.

All735,708 checks pass:636,288 source audio samples,79,536 observed filter-history
words and19,884 source-state flags. Complete calculated and target audio SHA256:

`a96e1a13d7a6833bf4d33edfeacd365cfb953d0ca48207fb89a09d588a76cdc9`.

A one-bit audio-target negative fails exactly once, with unchanged calculated
audio hash. Collector/helper digests, complete table/stream hashes, pinned
MIDI/model/resource selection and explicit render arguments are verified.
The successful capture also writes a complete148,224-frame stereo WAV with
PCM SHA256 `ba4c67ec815ab49f5137027358a952d172bc4946391570feb76f04a17d27aabe`.
This WAV is evidence of complete native execution, not independently reproduced
final stereo audio in this pass.

## Preserved failure and unresolved connection

The first three-site attempt rejects an incorrect source-container end-pointer
assumption before collecting audio. It subsequently stops at an unowned
EXC_BREAKPOINT at460a4c. Its native terminal status remains false despite wrapper
exit0; it is excluded, its logs are retained, and PID28400 is confirmed absent
before the next attempt. The vector container has capacity beyond its three
active rows; the bounded two-site collector follows the actual active count.
Its success does not prove the earlier exception's cause or fix.

The new raw source is also compared diagnostically against the old continuous
capture's processed auxiliary rows. They differ in592,137 samples, first at
epoch0/age5184/row0/sample1. Those are different processing boundaries and
different native runs. The next investigation must observe the intervening
voice+C9C auxiliary gain/filter path and separate processing effects from
cross-run variation. The raw source is not silently substituted into the old
stereo predictor, and these mismatches are not relaxed or erased.

Native per-block audio is no longer needed to predict this isolated raw-source
component. The integrated stereo path still consumes its observed processed
auxiliary boundary until that connection is verified. Native tables/profile
production, auxiliary gain/filter controls, remaining source and dispatch
controls, full coupling, repeatability, capture-free MIDI-to-stereo, all88 keys/
velocities/pedals/presets, AudioWorklet and persistence/performance remain open.

Private inputs, native tables/audio, source profiles, positive/negative reports
and both capture attempts remain under `~/.local/share/just-piano-analysis/`
with `pass292-` prefixes. No commercial payload is committed, and no browser
switch, merge or deployment occurs.
