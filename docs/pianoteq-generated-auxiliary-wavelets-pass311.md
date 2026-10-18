# Generated auxiliary waveform origin and noise precursor, pass311

No new native prediction input is removed in this pass. The remaining NY kind1
auxiliary waveforms are traced to generated B1e80 descriptors. An experimental
module calculates the deterministic noise/envelope precursor for their detail
bands. AR filtering, multilevel reconstruction, equalization and final shaping
remain unimplemented; this precursor is not connected to stereo or the browser.

## Resource exclusion and actual producer

A complete private audit parses all58 KVR extra resources across the26 factory
banks without parser failures. Only the SAWTOOTH synth resource has serialized
kind1 records; the NY extra resource has no kind1 record. Therefore the release
FLAC path from pass310 cannot simply supply the NY attack waveforms. This does
not exclude compressed or generated material elsewhere; the runtime producer
chain establishes the relevant positive evidence.

52105c requests the model's sample providers through07e8dc/96e684 and453114.
For B1e80 generated descriptors,453114 copies the matching descriptor into a
provider with vtable beb990. Its first virtual method2c6d8c hashes configuration;
it is not a renderer. Its second virtual method5f58c0 calls655e40 on the copied
descriptor. Several initially inspected addresses prove to be UI sample-rate
choices or destructors and are excluded from algorithm claims.

The model's kind1 B1e80 group has25 selected note descriptors and9 detail
records per descriptor. 655e40 implements the numerical source: seeded noise,
two envelope phases around an AR filter, per-band normalization/gain, two fixed
wavelet synthesis filters, final parametric equalization, edge windows and peak
normalization. The actual table selection/filtering path918468 subsequently
consumes the generated bank. This is an additional source component, not proof
of the full mechanical hammer/string/felt law.

Read-only REA core evidence:
ev_797f8cedc8e75152c0a98bf1b3f42b143ff960d802d8411a9e052de21a3456f3.
Provider render-method evidence:
ev_ebb85c4a32c835f17bf34bad70f3c6e1a9a830f678c3d6a488b7315e88cdcd8f.
Provider descriptor/hash evidence:
ev_c2fc184722b19d762d42e70788a575380b6a1c2b5b1c186e23d81872400ed06a.
Filter helper evidence:
ev_a602dd704f0529f000ee5a0e04fb299b4343fc4ebd3e438d322d22ba66b4938b.
All operations are read-only against the pinned original arm64 image. The REA
session closes normally; no native target is launched or modified in this pass.

## Recovered precursor arithmetic

`auxiliaryWaveletNoise` uses the source's float32 rate/duration product to choose
its frame extent, with native minimum16. Each descending detail band computes
its reconstruction length by repeated integer ceil-halving; detail excitation
has floor(half that length). It initializes the four-word random state from
integerc with three uint32 LCG steps, then uses the already recovered xorshift
step. Every band resets this stream; it does not inherit the prior band's tail.
Uniform words are converted to float32, scaled by2^-32 and shifted by-0.5.
The first sample is replaced by floats4[1].

For band scalar d and envelope fraction a, native6556040..608c calculates
before=expf(-float32(d*a)) and
after=expf(-float32(d-float32(d*a))). The precursor applies the before envelope,
rounding each product and flushing the next envelope to positive zero below
absolute1e-15. The after coefficient is returned for the future post-AR stage.
The module explicitly supports nonnegative decay and fraction[0,1].

The private current-archive audit constructs225 bands across all25 descriptors,
records their extents and hashes and verifies finite decay coefficients. Tests
cover per-band stream reset, seed sensitivity, the fixed impulse override,
exact reconstruction/detail extents, envelope underflow and invalid inputs.
These are source-arithmetic/component checks, not a comparison against newly
captured native intermediate noise. No native waveform equality is claimed for
this incomplete generator.

## Audio boundary and next required work

The integrated renderer and its pass310 audio boundary are unchanged. No new
full audio replay is claimed, because this module is not imported by that path.
The existing full native comparison does not validate these new precursor
samples. Before replacing any kind1 waveform input, complete the AR recurrence
and symmetric-boundary wavelet filters, native arithmetic order, EQ and edge/
peak operations, then compare all generated waveform samples and complete cue/
auxiliary/final stereo audio against actual native observations.

Other model controls, release-cue events, source publication/voice scheduling,
full mechanical coupling, native variability, capture-free MIDI to stereo,
all88 keys/velocities/pedals/presets, AudioWorklet and parameter persistence/
performance remain open. Commercial descriptor values, private inventories,
REA responses and precursor sample hashes remain outside Git.
