# Just Piano

A modeled acoustic piano that runs entirely in the browser, with Web MIDI keyboard support.

**Play it:** https://lovejzzz.github.io/Just-Piano/

## Features

- 88 keys (A0–C8), played with a MIDI keyboard, mouse or touch, or the computer keyboard
- Web MIDI: note on/off with velocity, sustain (CC64), una corda (CC67), volume (CC7), all notes off
- Simple controls: volume, brightness (hammer hardness), unison detune, touch (velocity curve), reverb, sustain and transpose
- Installable and works offline after the first visit

## How the sound is made

The sound is synthesized in real time in an `AudioWorklet` ([piano-worklet.js](piano-worklet.js)).
It does not use samples. Each note is a set of damped oscillators, one for every partial of the string:

- **Stiff strings:** partials are inharmonic (`f_k = k·f0·√(1 + B·k²)`), and the keyboard uses octave stretching.
- **Hammer:** the strike position gives a comb-shaped spectrum. A low-pass whose cutoff rises with velocity and hammer hardness sets how bright the note is. The hammer's contact time sets the attack, and a short noise burst adds the thump.
- **Unison strings:** each partial has two slightly detuned parts. One fades quickly (the prompt sound) and one fades slowly (the aftersound), which produces beating and a two-stage decay.
- **Dampers and pedals:** release damping depends on pitch, and the top treble has no dampers. The model also covers the sustain pedal, the una corda pedal and damper noise.
- **Room:** gentle body EQ, then a synthetic convolution reverb and a limiter.

The design was informed by inspecting a commercial physically-modeled piano with [REA](https://github.com/morluto/rea) (its feature set and architecture: a native CoreAudio/CoreMIDI engine driving a physical model). No code, data or assets from that product are included. This is an independent implementation.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Web MIDI needs `localhost` or HTTPS, and a Chromium-based browser, Firefox, or Safari 18+.

## License

MIT
