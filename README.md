# Just Piano

An independent, sample-free browser piano with an 88-key keyboard, Web MIDI input, six original voicings, and a dark, warm-lit interface.

**Continuing this project:** read [HANDOFF.md](HANDOFF.md) first. The local research
profile now connects model-derived coefficients, recovered modal recurrence and
generated attack waveforms to the playable keyboard through AudioWorklet. It is
an **experimental realtime adapter**, not the complete verified offline chain or
a native-equivalent instrument. Private model/preset data stays outside Git.

## Run

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 and click **Enable audio**. Play with a MIDI controller, pointer/touch, or computer keys A–'. Z/X changes octave; Space holds sustain. MIDI availability depends on browser support and permission. Audio requires localhost or HTTPS. The deployed HTTPS app caches its assets for offline use.

## Original voicings

- **Nocturne Grand:** warm and intimate.
- **Concert Grand:** balanced, brighter, and longer ringing.
- **Midnight Felt:** muted, soft, and close.
- **Studio Upright:** shorter decay, increased stiffness and detuning.
- **Glass & Ivory:** bright and delicate.
- **Slow Horizon:** long decay and a spacious room.

These are parameter voicings of one independent modal engine, not recordings or calibrated replicas of six physical instruments. The preset browser, reset button, six sound controls, volume, transpose, sustain, and original audition phrase work locally. Settings persist in browser storage. **All notes off** releases tracked inputs and stops the audition.

## Sound engine

`piano-worklet.js` is the standalone/public engine. When the loopback preview
server is started with `--model-archive`, `research-model-worker.mjs` prepares all
88 keys and `research-piano-worklet.mjs` runs the experimental research adapter.
Keyboard, pointer, demo and MIDI events synthesize audio directly; the optional
WAV comparison is separate and collapsed. Initial private-model preparation takes
about 15 seconds in Node and can take longer in the browser. It supports at most
24 voices and 2,048 modal lanes, with voice stealing to bound work. The six
voicings edit this single model; they are not factory presets. Hammer/velocity,
damping, scheduling and mix still contain independent research choices. Physical
MIDI and subjective acoustic equivalence have not been validated.

The standalone/public engine has:

- Up to 40 voices, each containing up to 30 stiff-string partials with two detuned components.
- Inharmonic partial frequencies, pitch-dependent octave stretching, strike-position spectral shaping, and a velocity-dependent hammer spectrum.
- Separate prompt and aftersound decays, with adjustable decay and preset-specific stiffness/strike position.
- Pitch-dependent dampers, sustain and una corda MIDI pedals, and synthesized mechanical noise.
- A 24-mode feed-forward resonant bank with longer decay when sustain lifts the dampers. This is an approximation of sympathetic response, not a fully coupled string/bridge simulation.
- Bounded output saturation before body EQ, synthetic stereo convolution reverb, and a compressor.

No recorded samples, proprietary DSP code, or third-party preset data are included. The engine is physically inspired modal synthesis, not an exact reproduction of Pianoteq. The vector grand-piano illustration is original.

## REA inspection

REA/Ghidra and read-only runtime captures are being used to investigate the user's installed Pianoteq 9.2.5. The [investigation status](docs/pianoteq-investigation-status.md) distinguishes static formulas, authentic runtime checks, audio controls, and unresolved work.

A reconstructed JavaScript modal kernel in `dsp/modal-kernel.mjs` reproduces 4,096 captured state values and 8,192 internal output samples bit for bit. Companion modules reconstruct captured control, excitation, pole and damper-coefficient arithmetic, including the observed native exp/log dependencies. The recovered source/kernel/wavelet modules now run in the local experimental AudioWorklet adapter. The full observed offline control and stereo chain is still separate; complete Pianoteq sound and presets have not been reproduced.

## Verify

Node 18+ is needed for the development checks. The app itself has no runtime npm dependencies.

```sh
npm ci
npm test
# With the local server running and Google Chrome installed:
npm run test:browser
```

The DSP checks cover finite stereo output across presets, bounded peaks under an 88-note stress input, sustain versus release, panic decay, voice limits, and invalid parameter input. Browser checks cover AudioWorklet startup, controls, input, preset persistence/reset, audition stop, desktop/mobile rendering, and JavaScript errors. Screenshots are written to `test-results/`.

These checks do not certify acoustic realism or latency on other devices. A physical MIDI controller and subjective listening comparison have not been validated in this change.

## License

MIT. See `LICENSE`.
