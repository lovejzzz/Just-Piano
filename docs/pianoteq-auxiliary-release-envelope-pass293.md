# Auxiliary release envelope and quiet retirement, pass293

The auxiliary table source now continues through its release envelope to the
actual460a4c output. This verified component computes MIDI activation, carried
gain/step/target/cache state, silence count and the same-block retirement gate.
The complete stereo integration remains open: later auxiliary processing still
contains an additional mono source that the earlier group-only replay omitted.

## Calculations and input boundary

At4609f0..460a38 a nonzero numerator selects
`float32(numerator / max(denominator,floatword(38d1b717)))`. A changed scale or
nonzero slope sets slope0, stores the scale and clears the ready bit. The existing
416d3c/322148 implementation calculates the exponential ramp and commits its
gain once after processing the auxiliary rows. The three rows share the same
starting gain. No captured gain, step, target or ready value drives prediction.

Five note-off ages are derived from the pinned MIDI's absolute block clock:
4800,960,960,2496,3008. They reproduce every actual auxiliary enable transition;
the native enable flags are comparison targets only. This validates the fixture's
five note-off events, not general pedal/voice-lifetime policies.

The source is quiet only when every sample in every raw auxiliary row is
strictly below its threshold. Quiet blocks increment an owned counter by64;
nonquiet blocks reset it. Once the first source is beyond its first third and
the counter reaches the limit, the parent skip bit is set before the envelope
call. The last observed block therefore preserves gain instead of advancing
it. The alternate already-ready/below-target path also clears output, but is
not claimed as native dynamic coverage here.

`AuxiliarySourceEnvelope64` owns cold source/filter and envelope histories,
age, enable events, quiet counter and parent skip. Initial source tables/gains/
delays/filter coefficients, initial envelope scale and quiet profile remain
observed. The raw numerator/denominator and voice control production also remain
observed. The tables are native-generated waveform data; removing the per-block
auxiliary audio input does not remove that waveform dependency.

## Complete real-audio evidence

Three successful two-site captures alternate source entry301c8c and post-envelope
460a4c, one active hardware site at a time. Each captures all3,314 blocks from
five age-zero voices and all6,628 phase transitions. All three native processes
terminate with exit0 and no collector errors; each PID is absent before another
capture starts. No target code/data/register writes or unowned exception resumes
are used. The final capture, PID30105, includes the auxiliary mid gain and level
controls needed to investigate the next boundary.

The published producer passes801,988 comparisons with zero differences:
636,288 audio samples,79,536 filter-history words,19,884 source flags,53,024
envelope fields and13,256 quiet/parent-skip checks. Its complete calculated
auxiliary audio SHA256 is:

`5c2d279bce3a3dad1326860aec733454769ec20404816e1fc304a3d3225f257c`.

A one-bit target mutation fails exactly once while the complete computed hash
remains unchanged. Native render arguments, helper hashes, table/audio digests,
fixture identities and full148,224-frame native stereo extent are bound.
The final capture's complete native PCM SHA256 is
`20b8f4bc5e41b69fea6a458a9fab55ff74b0cb77b2f60d7e19f7007fb38b242a`;
this native WAV is not independently reproduced final stereo in this pass.

Focused synthetic tests cover MIDI activation, gain preservation on the exact
retirement block and strict threshold equality. They and the affected clock,
release timeline and terminal-envelope regressions pass; synthetic tests are
not counted as additional authentic audio coverage.

## Failed integrations retained

The first component calculation matches all636,288 audio samples but fails its
last gain-state check: it incorrectly advances the envelope after silence has
retired the source. That report and output are retained. The next capture adds
quiet inputs/targets and the corrected calculation passes every state check.

The first full-chain attempt omits auxiliary mid gain and fails1,266,600 tail
comparisons. Instructions460b54..460b64 multiply the auxiliary rows by
`float32(voice9c * voice8c)`, distinct from the group gain. A new complete capture
observes voice8c=1 on every block; no ratio is inferred from final audio.

Applying that gain reduces but does not eliminate the integration failure:
164,104 auxiliary samples differ at each of the gain/time targets, first at
epoch1/age2368. The consumer-cross comparison itself passes. The still-missing
path generates a separate mono source through76170c/5f6d30 and adds it to every
auxiliary row at460c64..460c80; additional auxiliary processor branches also
need their explicit runtime boundary checked. The mono source's actual effect
must be captured and calculated before claiming the residual is explained.

These failed full-chain attempts export no accepted terminal artifact. Their
reports/logs and the unverified integration patch are preserved privately.
The published main stereo predictor remains at the last verified boundary;
unverified integration edits are not committed as a passing implementation.

Private evidence is under `~/.local/share/just-piano-analysis/` with pass293
prefixes, including all successful captures, the failed component/integrations,
positive/negative reports and generated audio. No commercial data is committed.
Full source independence, original mechanical coupling, repeatability, final
MIDI-to-stereo, all-key/pedal/preset coverage, browser integration, persistence
and real-time acceptance remain open. No merge or deployment occurs.
