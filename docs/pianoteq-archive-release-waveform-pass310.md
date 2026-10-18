# Release waveform from the current resource archive, pass310

The NY baseline's release-cue primary waveform is now decoded directly from the
current commercial resource and resampled during every fresh source calculation.
Its native runtime waveform is a comparison target. This removes one waveform
dependency, not the remaining auxiliary table bank, gains, filters or scheduling.
Browser audio/UI are unchanged.

## Resource and algorithm evidence

The current builtin_presets_d4.dat bank contains percuSTEINWAYNY.dat6dc28790,
a KVR2 version1 record. The versioned native reader02affc follows absolute next
record offsets and stores kind/key, sample rate, a float descriptor, channel and
frame counts, codec, encoded extent and absolute payload offset. Codec2 payloads
in this bank have FLAC headers. Payload offsets are bounded by the entire bank;
they may lie outside the index's own extra-resource range. Marker searching was
used only for discovery; the accepted producer follows the index and exact
encoded extent.

Read-only REA evidence:

- Reader02affc: ev_adbca3eb1d38644f6d0892ddc49f6966564b0b202115288e685d4777d8ebe874.
- Auxiliary profile918468: ev_0ba11bbccabefabdf3e56d5394f1b9f6eb8410aa745a887da0c2c6bca347b54c.
- Table selector8290f4: ev_7eb8a3f19cd03e82194c08c219f70cca8aed64427b03b3dafda531e1f5e7ad0b.
- Resource view0f76ac: ev_0b2e1ba50bf28fcbb6760389414ca7f3c53c3121c07fedbc850bcc0dcae32cbd.

REA closes normally with terminal0; no native render, target writes, Pedalboard
or protection changes occur. The separate kind1 auxiliary bank selected by918468
is not replaced with the kind2 release waveform. Its source production remains
open. Two exploratory sample virtuals are empty/destructor methods, not decode
implementations; they are not claimed as the waveform decoder.

The accepted kind2/key0 release record is mono44100Hz, descriptor1,29,034
frames and6,977 encoded bytes at bank offset2,058,608. FLAC SHA256:
ea32a0f2840a2b14bd3d7867ee35747f7d48f72c604ad296581599952e9da8d9.
The ordinary local FFmpeg decoder produces29,034 float32 samples with exit0
and empty error output; SHA256:
d8d605dc7d1f8b6d7bd9962b79c3a46bbff7a46c23a002e937057e13f3e4eef5.

The existing independently implemented resampling plan, ratio48000/44100 and
quality10, computes31,601 logical frames and31,616 storage samples. Every
float32 word, including the final padded storage extent, equals the native
release-cue table. No offset search, fitted gain, cropping, normalization or
error tolerance is used. This validates that explicit resampling path for this
resource; it does not prove all native resource resampling branches or rates.

## Integrated complete audio

`--computed-release-waveform` decodes the bound current resource each run, then
uses the own JS resampler. It does not consume a prior decoded-wave prediction
report. Each cue uses a fixed local archive identity rather than selecting its
prediction table by a captured pointer. Native table identities select comparison
targets only. Other cue event/gain/filter configuration remains observed.
The source artifact binds the resource, bank identity, decoder/helper source
files and local FFmpeg executable as inputs, in addition to the JS source closure.
This is an offline resource preparation path; browser FLAC preparation is not
newly implemented.

All31,616 unique waveform samples match, with158,080 comparisons over the five
cue bindings. All212,096 complete release-cue audio samples and636,288 post-mid
auxiliary samples match, with zero state/audio differences. Calculated cue SHA256:
95b3c83cba084213a841bc69656a2b02ceb93cc1f0e126edee8865d2f8414e4d.
The complete source's14,292,040 checks still pass; waveform checks are reported
separately inside the auxiliary producer rather than inflating that count.

Fresh spatial/downstream calculations pass. Independent Python WAV parsing
verifies all889,344 PCM bytes of the complete148,224-frame stereo24/48k output
against the existing actual native baseline recording:
070f243a4dd0a31bd98cd12c8cafc354df5aae3226fb1e3287cd83e78ff8bd29.
The continuous and six-row terminal hashes remain unchanged from pass309.
Source/spatial/stereo observations remain from separate captures.

Perturbing one native waveform comparison target yields exactly one waveform
mismatch while calculated cue and post-mid audio hashes remain unchanged. The
legacy waveform path also passes with identical complete source audio. A changed
artifact prediction-boundary flag is rejected. Synthetic tests cover KVR version,
linked-index cycle/bounds, codec/type rejection and shared bank payload bounds;
existing resampling arithmetic/extent tests pass. Private exploratory FLAC
streams and all generated/comparison audio remain outside Git.

## Remaining scope

The kind1 primary/secondary auxiliary waveforms, their filter/gain/delay sources,
release-cue event production, nonzero extra damping, other model controls,
publication/voice scheduling, complete mechanical coupling, native repeatability,
capture-free full stereo, all88 keys/velocities/pedals/presets, AudioWorklet and
parameter save/reload/performance acceptance remain open.
