#!/usr/bin/env python3
"""Render a hash-bound NY fixture repeatedly without debugger or plug-in host."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import wave
from pianoteq_damper_runtime_capture import verify_text, EXPECTED_TEXT_SHA256


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--repetitions', type=int, default=3)
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Fresh private output directory required')
    if not 2 <= args.repetitions <= 10:
        parser.error('Two through ten explicitly bounded repetitions required')
    fixture_bytes = args.fixture.read_bytes()
    f = json.loads(fixture_bytes)
    if f.get('schema') != 'pianoteq-native-repeat-fixture-v1' or f.get('sampleRate') != 48000:
        raise ValueError('Explicit supported repeat fixture required')
    binary, resource, midi = [Path(f[k]) for k in ['binaryPath', 'resourcePath', 'midiPath']]
    if resource.resolve() != (binary.parent.parent / 'Resources/presources.dat').resolve() or \
            sha(resource) != f['resourceSha256'] or sha(midi) != f['midiSha256']:
        raise ValueError('Actual application resource and source MIDI binding required')
    verify_text(binary)
    selection = f['selection']
    if selection['kind'] == 'fxp':
        preset = Path(selection['path'])
        if sha(preset) != selection['sha256']:
            raise ValueError('Bound preset required')
    elif selection['kind'] != 'factory' or selection.get('name') != 'NY Steinway D Classical':
        raise ValueError('Explicit NY factory or bound FXP selection required')
    args.output.mkdir(mode=0o700)
    (args.output / 'fixture.json').write_bytes(fixture_bytes)
    shutil.copyfile(midi, args.output / 'input.mid')
    if selection['kind'] == 'fxp':
        shutil.copyfile(preset, args.output / 'input.fxp')
    manifest = {'schema': 'pianoteq-native-repeat-renders-v1', 'fixtureSha256': hashlib.sha256(fixture_bytes).hexdigest(),
        'textSha256': EXPECTED_TEXT_SHA256, 'binarySha256': sha(binary), 'resourceSha256': sha(resource),
        'midiSha256': sha(midi), 'selection': selection, 'runs': [], 'debuggerUsed': False,
        'pedalboardUsed': False, 'independentEngineAudioVerified': False}
    def save():
        (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for ordinal in range(args.repetitions):
        # Recheck immutable inputs before every process; no process is retried.
        verify_text(binary)
        if sha(resource) != manifest['resourceSha256'] or sha(args.output / 'input.mid') != f['midiSha256']:
            raise ValueError('Repeat inputs changed')
        selected = ['--preset', selection['name']] if selection['kind'] == 'factory' else ['--fxp', str(args.output / 'input.fxp')]
        if selection['kind'] == 'fxp' and sha(args.output / 'input.fxp') != selection['sha256']:
            raise ValueError('Frozen preset changed')
        wav = args.output / f'repeat-{ordinal}.wav'
        command = [str(binary), '--headless', '--no-prefs', '--multicore', '0', *selected,
            '--midi', str(args.output / 'input.mid'), '--wav', str(wav), '--rate', '48000',
            '--bit-depth', '24', '--dither', 'OFF']
        record = {'ordinal': ordinal, 'arguments': command, 'startedAt': datetime.now(timezone.utc).isoformat(), 'terminal': False}
        manifest['runs'].append(record)
        with (args.output / f'repeat-{ordinal}.log').open('x') as log:
            child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
            record['pid'] = child.pid
            save()
            record['exitStatus'] = child.wait()
        record.update(terminal=True, completedAt=datetime.now(timezone.utc).isoformat())
        save()
        if record['exitStatus'] != 0:
            raise RuntimeError('Native render failed; diagnostics retained and no retry launched')
        with wave.open(str(wav), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('Complete 48 kHz / 24-bit stereo reference required')
            record['frames'] = reader.getnframes()
            pcm = reader.readframes(reader.getnframes())
        if len(pcm) != record['frames'] * 6 or not any(pcm):
            raise ValueError('Complete non-silent reference required')
        record.update(wavFile=wav.name, wavSha256=sha(wav), pcmSha256=hashlib.sha256(pcm).hexdigest())
        save()
        print(json.dumps({'ordinal': ordinal, 'terminal': True, 'frames': record['frames'], 'pcmSha256': record['pcmSha256']}), flush=True)
    manifest['complete'] = True
    save()
    for file in args.output.iterdir():
        if file.is_file():
            os.chmod(file, 0o600)


if __name__ == '__main__':
    main()
