#!/usr/bin/env python3
"""Audit complete native repeat WAVs; never align, crop, normalize, or fit a pass."""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import wave


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Fresh private output file required')
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    if manifest.get('schema') != 'pianoteq-native-repeat-renders-v1' or manifest.get('complete') is not True or \
            not 2 <= len(manifest.get('runs', [])) <= 10:
        raise ValueError('Completed bounded native repeat set required')
    fixture_bytes = (args.directory / 'fixture.json').read_bytes()
    fixture = json.loads(fixture_bytes)
    if sha(fixture_bytes) != manifest['fixtureSha256'] or \
            sha((args.directory / 'input.mid').read_bytes()) != manifest['midiSha256']:
        raise ValueError('Original repeat fixture and MIDI binding required')
    if fixture['selection']['kind'] == 'fxp' and sha((args.directory / 'input.fxp').read_bytes()) != fixture['selection']['sha256']:
        raise ValueError('Frozen source preset changed')
    audio = []
    for index, record in enumerate(manifest['runs']):
        if record.get('ordinal') != index or record.get('terminal') is not True or record.get('exitStatus') != 0 or \
                Path(record['wavFile']).name != record['wavFile']:
            raise ValueError('Chronological terminal native renders required')
        file = args.directory / record['wavFile']
        selected = ['--preset', fixture['selection']['name']] if fixture['selection']['kind'] == 'factory' else \
            ['--fxp', str(args.directory / 'input.fxp')]
        expected_arguments = [fixture['binaryPath'], '--headless', '--no-prefs', '--multicore', '0', *selected,
            '--midi', str(args.directory / 'input.mid'), '--wav', str(file), '--rate', '48000',
            '--bit-depth', '24', '--dither', 'OFF']
        if record.get('arguments') != expected_arguments:
            raise ValueError('Identical explicit render settings required across repetitions')
        if sha(file.read_bytes()) != record['wavSha256']:
            raise ValueError('WAV changed after native render')
        with wave.open(str(file), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('48 kHz / 24-bit stereo PCM required')
            frames = reader.getnframes()
            pcm = reader.readframes(frames)
        if len(pcm) != frames * 6 or frames != record['frames'] or sha(pcm) != record['pcmSha256']:
            raise ValueError('Full PCM extent and native digest required')
        values = [int.from_bytes(pcm[i:i + 3], 'little', signed=True) for i in range(0, len(pcm), 3)]
        audio.append({'frames': frames, 'pcm': pcm, 'values': values})
    comparisons = []
    for i, j in itertools.combinations(range(len(audio)), 2):
        a, b = audio[i], audio[j]
        common_frames = min(a['frames'], b['frames'])
        differences = [x - y for x, y in zip(a['values'], b['values'])]
        changed_samples = sum(v != 0 for v in differences)
        changed_frames = [frame for frame in range(common_frames) if differences[frame * 2] or differences[frame * 2 + 1]]
        windows = []
        # Diagnostic time windows only. The strict gate below always includes
        # complete lengths and bytes, including any unmatched tail.
        for start in range(0, common_frames, 2400):
            stop = min(start + 2400, common_frames)
            d = differences[start * 2:stop * 2]
            reference = a['values'][start * 2:stop * 2]
            windows.append({'startFrame': start, 'endFrame': stop,
                'changedSamples': sum(v != 0 for v in d),
                'differenceRms': math.sqrt(sum(v * v for v in d) / len(d)) / 8388608,
                'referenceRms': math.sqrt(sum(v * v for v in reference) / len(reference)) / 8388608})
        strict = a['frames'] == b['frames'] and a['pcm'] == b['pcm']
        comparisons.append({'runs': [i, j], 'strictFullPcmEqual': strict,
            'frameCounts': [a['frames'], b['frames']], 'unmatchedTailFrames': abs(a['frames'] - b['frames']),
            'diagnosticCommonFrames': common_frames, 'changedSamplesInCommonExtent': changed_samples,
            'changedFramesInCommonExtent': len(changed_frames),
            'firstChangedFrame': changed_frames[0] if changed_frames else None,
            'lastChangedFrame': changed_frames[-1] if changed_frames else None,
            'differenceRmsInCommonExtent': math.sqrt(sum(v * v for v in differences) / len(differences)) / 8388608,
            'differencePeakInCommonExtent': max(map(abs, differences), default=0) / 8388608,
            'windows': windows})
    result = {'schema': 'pianoteq-native-repeat-comparison-v1', 'comparisonCompleted': True,
        'strictRepeatabilityVerified': all(c['strictFullPcmEqual'] for c in comparisons),
        'fixtureSha256': manifest['fixtureSha256'], 'selection': manifest['selection'],
        'renderFrames': [a['frames'] for a in audio], 'comparisons': comparisons,
        'alignmentApplied': False, 'normalizationApplied': False, 'lengthMismatchIgnored': False,
        'nativeVariationCauseIdentified': False, 'independentEngineAudioVerified': False}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    args.output.chmod(0o600)
    print(json.dumps({**result, 'comparisons': [{k: v for k, v in c.items() if k != 'windows'} for c in comparisons]}))
    # A successful measurement is not a successful repeatability gate.
    if not result['strictRepeatabilityVerified']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
