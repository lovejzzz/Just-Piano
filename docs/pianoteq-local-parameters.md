# Pianoteq 9 local parameter inspection

> Historical initial inspection. Ghidra is now installed and function-level analysis succeeded. See [setup](ghidra-setup.md), [DSP findings](pianoteq-dsp-findings.md), [preset decoding](pianoteq-preset-findings.md), and [runtime values](pianoteq-runtime-parameters.md). The unavailable-provider limitation below describes the earlier inspection only.

Read-only inspection of the installed app and its support directory. No application files changed; no presets imported into Just Piano.

## Findings

The main executable `/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9` contains readable parameter labels including:

- Hammer Hardness Piano / Mezzo / Forte; Hammer Noise; Hammer Noise Tone.
- String Length; Strike Point; Spectrum Profile 1–8.
- Unison Width; Unison Balance.
- Impedance; Impedance Cutoff; Impedance Slope.
- Sympathetic Resonance; Duplex Scale Resonance.
- Damper Position; Damper Noise; Damper Velocity Threshold.
- Direct Sound Duration; Blooming Energy; Blooming Inertia.

These are evidence of parameter names compiled into the app, not recovered equations, parameter ranges, or per-instrument numeric values. An internal type-name string contains `mdrt::SoundboardIRCompute` and `propageSimd`; this is a code-structure lead only, not proof of its algorithm.

The app resource directory contains `presources.dat` (reported by `file` as binary data). Its internal format was not established.

`/Library/Application Support/Modartt/Pianoteq 9` contains 800 `.nksf` files and 800 `.ogg` files. This is a file inventory, not a count of licensed instruments or proof that each file contains a complete model. Audio files were not auditioned.

One example, `nks/NY Steinway D Mix.nksf`, is a 2,174-byte RIFF/NIKS container with NISI (297 bytes), NICA (1,533), PLID (20), and PCHK (278) chunks. Payload semantics and completeness of the model state have not been decoded or verified.

## Tools and limitation

REA 6.5.0 `inspect` returned `provider_unavailable`: Ghidra is not configured, the expected Hopper executable is absent, and IDA is not configured. Thus no successful function decompilation occurred. Earlier REA `inspect-macho` succeeded at structural binary inspection; its condensed evidence is in `evidence/rea-pianoteq-inspection.json`.

Additional checks used local `strings` filtered to model-related labels and a read-only Python RIFF chunk-header parser. No personal preferences or MIDI recordings were read.

Official documentation independently describes physical parameters:

- https://www.modartt.com/user_manual?product=pianoteq
- https://www.modartt.com/pianoteq_pro?page=pianoteq_pro

## Conclusion

Yes: there is clear evidence of local physical-model controls and local preset containers. Neither the control labels nor the containers alone establish the complete model coefficients or DSP implementation. Moving such values to a different engine would not establish equivalent sound.
