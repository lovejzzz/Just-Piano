# Ordinary microphone archive-to-IR coverage, pass261

The independent soundboard generator now has static source exports and authentic
end-to-end IR evidence for all 21 ordinary identities explicitly installed by
the pinned ARM64 microphone registry constructor. This extends the previous
identity-4/5 coverage. It does not establish all model families, special outputs,
complete voice computation, or final stereo equivalence.

## Source recovery

The existing REA/Ghidra decompilation of `FUN_100850c08`, checked against the
immutable instruction listing and file-backed binary, defines these identities:
`0..14`, `16..21`. Identity 15 is not an explicit constructor entry and is not
counted as covered. Special identities at or above 1000 remain rejected by the
ordinary numerical source path.

`pianoteq_export_soundboard_microphone_inputs.py` now reads each ordinary
identity's 200-knot curve and mix/whitening pair from the immutable Mach-O image.
Constructor-zeroed curves are generated as zeros. Identities 2/19 use the
constructor's zero control pair; identity 18 uses the immediate pair initialized
by `movi.2s v0,#0x3f,lsl#24`. Shared register pairs are traced to their original
file-backed constants rather than assigned by microphone names. A private audit
compares all 21 ordinate-source selections and 21 control pairs to the REA
initializer evidence: 42 checks, zero differences.

Binary SHA-256 remains
`8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094`.
REA initializer response SHA-256 is
`fd1fe06c3e3828008eaa0f6971a79d19a7a93239f5546fa9f59c78ee17f2093c`.
Only addresses and layout/selection rules are public. Measured curves, decoded
archives, modified presets, computed/native responses, and audio stay private.

## Authentic end-to-end comparison

Seven private FXPs retain the supported NY ordinary model, positions, directions,
and other parameters. Each selects three microphone identities; each selected
whitening flag is zero, exercising the actual registry amount (and the distinct
model-default amount for identity zero). Only those output words and ordinary
archive integrity MD5 change. The normal FXP parser validates every result.

| Selected identities | Completed native dispatch outputs | Float32 values | Bit differences |
| --- | ---: | ---: | ---: |
| 0, 1, 18 | 9 | 70,464 | 0 |
| 2, 3, 6 | 9 | 70,464 | 0 |
| 7, 8, 9 | 9 | 70,464 | 0 |
| 10, 11, 12 | 9 | 70,464 | 0 |
| 13, 14, 16 | 9 | 70,464 | 0 |
| 17, 19, 20 | 9 | 70,464 | 0 |
| 21, 4, 5 | 9 | 70,464 | 0 |
| Total | 63 | 493,248 | 0 |

All 63 normalization words and 63 output-rate comparisons also match. Each
native process terminates with exit status zero and no collector errors. The
collector uses one hardware hook at the completed dispatcher (`0x100057390`)
and reads its final three-channel output after each of the three source groups.
No target memory, registers, or code are written; Pedalboard is not used.
This boundary is the completed dispatcher, not a fresh verification of later
model-node ownership. The report states that distinction explicitly.

Generation still receives one private decoded archive file, with no oracle
argument. The source-boundary check traverses 62 numerical modules and finds no
native/file/network input dependency. The separate verifier binds the generated
manifest to the archive hash, and archive/native launch to the same preset hash
and explicit render configuration, then compares all payload words and metadata.
The ideal-identity case is regenerated with the final complete registry export;
it also matches exactly.

## Negative control and audio

A changed native response word (with an updated descriptor digest), one changed
native normalization word, and one changed group's output rate yield exactly
one payload difference, one normalization failure, and three rate failures.
The verifier exits one. The independent generated files are unchanged.

All seven native runs also render actual non-silent 48 kHz, 24-bit stereo WAVs.
For the ideal-identity case: 292,096 frames, peak `0.28489017486572266`, RMS
`0.03208258750239053`, PCM SHA-256
`da6e81246eec05ae5d918863a81ff25cb6d40222f15082b5038e9188544391f2`.
These are native reference renders. The new independent output being validated
is the IR; independent final stereo PCM equivalence remains false.

Private evidence under `~/.local/share/just-piano-analysis/` includes
`pass261-static-registry-plan-audit.json`, `pass261-ordinary-microphones-report.json`,
`pass261-registry-matrix/case-*/`, `pass261-ideal-complete-registry-report.json`,
`pass261-negative-triplets-report.json`, and native audio reports. The seven
native oracles are independent processes, with all nine outputs observed within
each process. Their numerical inputs are never read by the generator.

## Remaining goal requirements

The supported scope still requires family zero, ordinary mode zero, solo-zero
output, supported archive curves, explicit rates, and disabled model
leading-silence override. Special/binaural outputs, other families, solo/output
modes, arbitrary factory presets, and preference-driven policies remain open.
The complete continuous hammer/string/damper chain, capture-free final stereo,
all-note/velocity/pedal behavior, browser AudioWorklet, save/reload, real-time
performance, and final release gates remain unproven. The dark cinematic UI is
retained; this pass does not merge or deploy.
