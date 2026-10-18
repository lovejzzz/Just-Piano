# Modal state does not identify cached audio's producer state, pass303

This pass adds numeric state/audio evidence for the nonzero A116c0.5 preset and
corrects the interpretation of pass302's main-thread-only first dispatch. It
removes no prediction dependency and does not change the browser engine.

## Accepted paired observations

Two complete native renders use the same hash-bound FXP, resource, MIDI and
48 kHz/24-bit/no-dither arguments as pass301. A single read-only hardware site,
460f1c, records the first two terminal blocks of each of five note69 voices:
all ten `(epoch, outer counter)` keys, not continuous voice coverage. Each record
includes three complete64-sample audio rows, all logical modal lanes as raw
words, modal counters/flags/controls, raw cache fields and thread frame addresses.
The hook disables after the tenth record; the entire native render continues.

Native PIDs56249 and56402 both exit0/state10. Their wrappers also exit0 and all
four PIDs are absent afterward. Each capture has643 site hits, ten retained onset
records and no collector errors. Only the normal initial SIGSTOP is resumed;
there are no writes, evaluation, stepping, injection, protection changes or
Pedalboard. Runtime SHA256:

- `285dc5d799be1aa845d1ce892f738b29ae1cf840b7ccc2d95d93033ff0b90c64`
- `78370ebb73fb6443581bad8421c900c2a411a275564bcecea0ef585a46c09eb0`

All1,920 terminal samples in the declared onset inventory are compared. There
are381 differing samples:127 in each main row, confined to the first voice's
two observed blocks. First mismatch is epoch0/counter0/row0/sample1,
words0xba0bb03e versus0xba0bb110. All eight observed onset blocks of the later
four voices have identical terminal audio. Nothing here verifies their complete
sustain, release or tails.

Both complete native WAVs contain143,360 stereo frames. Full PCM comparison has
189,757 differing interleaved samples, maximum8,462 integer24-bit units, first
at absolute frame4,808. No alignment, trimming, normalization, padding or relaxed
tolerance is used. PCM SHA256:

- `1b68140a25ab82ec2100dd2fb27bcdf987652a305dfb19839483b53403616a00`
- `01ac8178eaa5463d4447bcfb4b7903b21dfc01f790ad93d0857af42fb33a3743`

## Numerical timing evidence and its limit

At epoch0/outer counter0, both snapshots have a cleared initialization flag,
but internal modal counters are320 and64. Raw cache tuples at offsets
`(2f78,2f7c,2f80)` are `(1,4,4)` and `(0,0,0)`. At outer counter64, both modal
counters are576, while cache read coordinates differ. At epoch4/counter0,
modal counters576 and512 accompany *identical* terminal audio. Thus even a
cleared flag and a complete numeric modal snapshot at the consumer do not prove
that state produced the currently consumed audio. Different modal lead is also
not sufficient evidence of an audible difference. This agrees with pass266's
separate baseline experiment; the cache path itself is not a new discovery.

REA confirms the containing consumer is460110. Its nonempty cache path copies
stored matrices through690634; its direct path calls20b28c, which calls472f20.
The primary update4e285c initializes dirty coefficients through863008 and runs
modal state before returning to472f20's onset/time-envelope processing. Cache
consumption and coefficient production must therefore be bound separately. The
large consumer decompilation has a type-propagation warning; typed pseudocode
alone does not establish numerical semantics or a unique cause.

Read-only REA evidence IDs:

- Consumer: `ev_add0ed3ab7d189306f57e1cda59869b20b7763493306c7ef01b9372d49380a0b`
- Primary update/wrapper: `ev_dd61b973bccea5cf1babc15ea63c4ca29d366328a22f52ba337b051589bfa593`
- Direct caller: `ev_224637b42fd6a3faf7e90748f5ff4a05ad91fa28138a4ae8ce374a43e92496c2`

The REA session closes normally with exit0. Inferred cache field names are not
promoted to proof of the full producer/consumer semantics.

## Rejection and exploratory evidence

The auditor binds all five frozen helpers, current input bytes, exact arguments,
native and wrapper termination, all ten onset keys, all logical modal lanes,
every sidecar hash and complete WAV extents. A different native mode layout is
reported as a difference with no lane equivalence comparison; common lanes are
never cropped into a pass. Synthetic tests reject missing lanes, invalid raw
words, uncleared initialization flags and overlapping layouts, preserve signed
zero and keep unequal internal clocks visible. Separate private negatives reject
an incomplete native status despite wrapper0 and a one-bit audio modification. A separate Node integer/RIFF implementation independently reproduces all381 terminal differences and the full PCM count, maximum and first differing frame.

All earlier experiments remain private and distinct. A five-first-update probe
rendered normally but observed only one main-thread call, so it fails that
inventory. A terminal probe rejected its assumption that internal counter equals
outer counter+64; its errors and WAV remain intact. Fresh probes then recorded
both counters without asserting that unproven relationship. That is an observation
contract change, not a relaxed initialized-state or audio equivalence gate.
Two first-observed main-thread post-update snapshots match, but lack binding to
MIDI voice epochs and cannot fill missing cached-producer evidence. A separate
two-block/first-voice pair matches its local state/audio while complete PCM still
differs. An earlier five-voice pair has a different first-block mode layout;
the initial equal-layout comparison rejects it rather than discarding modes.
None is substituted for the accepted cache-metadata pair above.

## Remaining work

Observe coefficient/control production on the actual worker/cache path and bind
each produced block to the consumer, then derive those controls and scheduling
from independent state. Main-thread-only initialization hooks cannot establish
that linkage. This pass does not identify a unique native-repeatability cause,
recover the full mechanical contact law, accept capture-free MIDI-to-stereo,
extend full-instrument coverage, or close browser/persistence/performance gates.
All commercial state, audio and raw traces remain outside Git.
