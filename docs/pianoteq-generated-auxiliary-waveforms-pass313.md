# Complete generated auxiliary waveforms, pass313

The independent candidate now generates the complete current NY kind1 source
bank from decoded B1e80 descriptors, including all five seed variants. All nine
observed source tables match exactly: 864,000 float32 words across nine complete
96,000-sample tables. This is actual native source-waveform comparison, without
cropping, alignment, gain fitting or tolerance. It is not complete piano audio
acceptance. The formal source/stereo renderer still uses its existing bank and
observed source selection; no production prediction dependency is removed yet.

## Reconstructed numerical path

The pass312 noise/AR detail bands feed the two fixed synthesis filters initialized
by 655e40. Each level interleaves the previous coarse samples into even positions
and the new detail samples into odd positions. Both branches use 444f2c's
endpoint-excluding reflection, causal filtering and extraction beginning at
filter-length minus one. The first extracted sample belongs to the all-fused
prefix; subsequent sums round complete groups of four coefficient products
separately, then fuse scalar remainders. The two branch outputs are added in
float32. Reconstruction proceeds from the coarsest descriptor band to full size.

The final EQ reads frequency/dB/Q/type quadruples, initializes zero histories and
uses the existing aligned paired-section vector filter. The implemented static
types 1..4 cover all current NY descriptors. Frequency is first capped at
float32(rate / double 2.001), then normalized by float32(rate * .5). Angle
formation multiplies the float32 normalized frequency by double pi before a
float32 conversion. Separate recovered sinf/cosf and expf implementations retain
the native coefficient arithmetic. Nonempty EQ with an unaligned sample extent
is explicitly unsupported; an empty EQ correctly bypasses processing at any
extent.

The final 0.5ms leading and 10ms trailing sine-squared windows use **ceil** of the
float32 rate/time product. In particular, the leading window at 48kHz has 25
samples because that float32 product is slightly greater than 24. The window
angle and sine-square/sample products use double arithmetic before storage as
float32. Leading shaping precedes trailing shaping, including overlap on short
inputs. The source descriptor's target peak is applied after these windows.
This peak operation is part of native generation, not an audio comparison fit.

453114 creates `sub0.integer18` variants and adds the zero-based variant index
to the descriptor's uint32 seed. The current bank has 25 selected descriptors and
five variants, yielding 125 independently generated waveforms. Source generation
at 44.1kHz feeds the already recovered quality-10 resampler at explicit 48kHz.
The bank uses local identities of kind/key/variant; no native pointer, waveform
hash or observed audio enters its generation.

REA evidence for EQ collection/design:
`ev_acb5a565ac7094e323848300aed4b9416144111d1931392b3d4aced0fe356d3f`.
Provider copy/variant evidence:
`ev_f536a91b1325ef61a1d8bba9e67271aedd21821230b78f4cb0029dd8f6f8fea8`.
The pinned original arm64 image remains unchanged, and the read-only REA session
exits normally with code 0. No native application is launched or modified.

## Verification

The comparison script calculates the entire 125-entry bank before opening native
observations. Native hashes are used only to identify exact comparison matches;
the script is an audit, not the production source selector. All nine 96,000-word
targets match one generated entry each, including boundary and padded storage
samples. Matched entries are keys 65, 69 and 72, variants 0..2. The other generated
entries have not been compared against corresponding native source captures.

A comparison-only one-bit perturbation fails exactly one table while all 125
generated hashes remain unchanged. Original observations remain intact. Private
reports bind the current archive and capture-runtime SHA and retain the complete
generated identity/hash inventory. Commercial descriptors, waveform samples,
captures and those private reports are not committed.

Component tests separately verify:

- 24,706 symmetric-filter words against a compiled direct-index reflection
  reference, plus analytic asymmetric edge handling and odd/even reconstruction.
- 480 EQ coefficient words against compiled sinf/cosf/expf arithmetic.
- 88,344 shaped samples against compiled double-sin window and peak operations,
  including overlapping windows and the ceil boundary.
- Variant independence, selected-descriptor lookup and explicit unsupported
  branches. Earlier noise, AR and detail-band tests remain passing.

## What remains

Replace the production bank through source identities selected from owned model
and MIDI calculations. Current captured profiles switch neighboring keys
independently across the three auxiliary rows and five note epochs; merely
matching captured table hashes must not become the prediction selector. Gains,
delays, EQ controls and some initial/dynamic source controls remain observed.
After selection is owned, exercise these generated tables through the complete
auxiliary and final stereo path and its negative controls.

No new complete stereo comparison is claimed in this pass; the prior pass310
result is unchanged and does not prove this new generator is integrated. The
capture-free continuous mechanical/model/control/scheduling path, native repeat
variability, 88-key/velocity/pedal/preset coverage, same-engine AudioWorklet,
parameter edit/save/reload and realtime performance gates remain open.
