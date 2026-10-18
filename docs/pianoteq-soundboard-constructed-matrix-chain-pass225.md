# Configuration-derived matrices in the complete response chain (pass225)

Date: 2026-10-17. The pass224 matrix construction now drives all three
configuration-initialized response groups. Captured A/C matrices are checked as
targets; they no longer supply propagation coefficients when initialization
configuration is available. A construction failure does not fall back to them.
Legacy captures lacking initialization inputs still explicitly report matrix
snapshot use.

The aggregate verifier requires independent matrix construction for initialized
captures. It checks both matrix audits and every intervening response target,
then compares the final nine predictions against the pass219 single-process
native node oracle. The three source captures remain separate native processes.

| Response group | Final values compared | Bit differences |
| --- | ---: | ---: |
| Nodes 0–2 | 25,152 | 0 |
| Nodes 3–5 | 22,656 | 0 |
| Nodes 6–8 | 22,656 | 0 |
| Total | 70,464 | 0 |

All three groups additionally compare 13,948 A entries and 5,430 C entries with
zero structure or coefficient differences. The solver takes 105 updates per
group. No captured solution, spatial shape, matrix, grid scalar or excitation
sample replaces the independent calculation.

## Dependency checks

Changing one native A comparison coefficient produces exactly one matrix audit
failure. Every predicted raw, converted, trimmed, filtered, blended, spectral,
reconstructed, normalized, resampled and dispatched response stays unchanged.
The checker exits 1, as required.

Changing configuration contrast by 0.125 changes 13,948 A coefficients and 5,425 C
coefficients, and changes all six raw responses (11,307 / 11,327 / 11,335 words,
repeated for the second triplet). The complete downstream negative run rejects
the changed trim length; a second raw-stage run records the numerical changes
without requiring the old downstream shape. Neither is a passing equivalence
test or evidence of matching the native output at the changed configuration.

```sh
node tests/soundboard-grid.mjs
node scripts/pianoteq_verify_soundboard_nine_dispatches.mjs \
  PRIVATE_NODE_ORACLE PRIVATE_INITIALIZED_GROUP_0 PRIVATE_INITIALIZED_GROUP_1 PRIVATE_INITIALIZED_GROUP_2
```

Private evidence: `pass225-nine-constructed-matrices.json`,
`pass225-negative-controls`. No commercial input or audio data is published.

The remaining source dependency immediately upstream of raw responses is the
observation-group geometry and coefficients. Model configuration and later
shaping/normalization configuration are also captured inputs. Full model-to-IR,
coupled voice, final stereo PCM, all notes/presets and browser integration remain
unverified. These IR-array comparisons do not certify final audible equivalence.
