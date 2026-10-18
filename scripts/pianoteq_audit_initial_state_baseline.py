#!/usr/bin/env python3
"""Audit complete initial-state snapshots and complete native stereo PCM separately."""
import argparse
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import wave


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact(value):
    # Preserve full precision for onset doubles and signed zero. Float32 values
    # are represented exactly in these doubles; no rounding hides a difference.
    if isinstance(value, dict):
        return tuple((key, exact(value[key])) for key in sorted(value))
    if isinstance(value, list):
        return tuple(map(exact, value))
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('Finite captured numeric state required')
        return struct.pack('<d', value).hex()
    return value


def canonical(row):
    target = {key: value for key, value in row['target'].items() if key not in ('thread', 'V', 'P_pointer')}
    return {**{key: value for key, value in row.items() if key not in ('voice', 'target')}, 'target': target}


def audit(directory):
    paths = sorted(directory.glob('run-*'), key=lambda p: int(p.name[4:]))
    if not 2 <= len(paths) <= 10 or [p.name for p in paths] != [f'run-{i}' for i in range(len(paths))]:
        raise ValueError('Bounded chronological native initialization runs required')
    collector = sha((directory / 'pianoteq_capture_initial_state_baseline.py').read_bytes())
    fixture, runs, states, audio = None, [], [], []
    for ordinal, path in enumerate(paths):
        launch_bytes = (path / 'launch.json').read_bytes()
        launch = json.loads(launch_bytes)
        if fixture is None:
            fixture = launch['fixture']
        if launch['fixture'] != fixture or fixture['selection']['kind'] != 'fxp' or \
                launch['collectorSha256'] != collector or launch['site'] != '0x100864d28':
            raise ValueError('Identical bound fixture and initial-state collector required')
        for file, digest in [(fixture['midiPath'], fixture['midiSha256']),
                             (fixture['resourcePath'], fixture['resourceSha256']),
                             (fixture['selection']['path'], fixture['selection']['sha256'])]:
            if sha(Path(file).read_bytes()) != digest:
                raise ValueError('Native fixture input changed')
        expected = [fixture['binaryPath'], '--headless', '--no-prefs', '--multicore', '0',
                    '--fxp', fixture['selection']['path'], '--midi', fixture['midiPath'],
                    '--wav', str(path / 'observed.wav'), '--rate', '48000',
                    '--bit-depth', '24', '--dither', 'OFF']
        if launch['arguments'] != expected:
            raise ValueError('Bound explicit native render arguments required')
        runtime_bytes = (path / 'runtime.json').read_bytes()
        data = json.loads(runtime_bytes)
        rows = data['initialStates']
        if data['runStatus']['terminal'] is not True or data['runStatus']['exitStatus'] != 0 or \
                data['errors'] or data['initialStateErrors'] or data['targetMutation'] is not False or \
                data['hardwareBreakpoints'] != 1 or data['initialStateSite'] != '0x100864d28' or \
                data['initialStateExpected'] != 5 or data['observationDisabledAfterStarts'] is not True or \
                len(rows) != 5 or len({row['voice'] for row in rows}) != 5:
            raise ValueError('Five completed read-only starts with observation disabled required')
        for epoch, row in enumerate(rows):
            target = row['target']
            if row['epoch'] != epoch or target['initial_flag'] != 1 or target['sample_counter'] != 0 or \
                    len(target['groups']) != 3 or len(row['repeat']['history']) > 16 or len(row['supportHistory']) > 16:
                raise ValueError('Complete chronological initial voice state required')
            expected_lanes = []
            for group, layout in enumerate(target['groups']):
                start, padded, capacity, count = layout
                if min(layout) < 0 or start >= 8192 or count > 8192 - start:
                    raise ValueError('Bounded initial group layout required')
                expected_lanes.extend((lane, group, start <= lane < start + count)
                                      for lane in range(start // 4 * 4, (start + count + 3) // 4 * 4))
            actual_lanes = [(lane['lane'], lane['group'], lane['valid']) for lane in target['lanes']]
            if actual_lanes != expected_lanes:
                raise ValueError('Complete active and padded initial lanes required')
            exact(canonical(row))
        states.append([canonical(row) for row in rows])
        wav_bytes = (path / 'observed.wav').read_bytes()
        with wave.open(str(path / 'observed.wav'), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('Full stereo24/48kHz PCM required')
            frames = reader.getnframes()
            pcm = reader.readframes(frames)
        if not frames or len(pcm) != frames * 6:
            raise ValueError('Complete native PCM extent required')
        values = [int.from_bytes(pcm[i:i + 3], 'little', signed=True) for i in range(0, len(pcm), 3)]
        audio.append((pcm, values))
        runs.append({'run': ordinal, 'frames': frames, 'pcmSha256': sha(pcm), 'wavSha256': sha(wav_bytes),
                     'runtimeSha256': sha(runtime_bytes), 'launchSha256': sha(launch_bytes),
                     'lanesPerVoice': [len(row['target']['lanes']) for row in rows]})
    pairs = []
    for i, j in itertools.combinations(range(len(runs)), 2):
        voices = []
        for epoch, (left, right) in enumerate(zip(states[i], states[j])):
            components = [field for field in left if field != 'target' and exact(left[field]) != exact(right[field])]
            components.extend('target.' + field for field in left['target']
                              if field != 'lanes' and exact(left['target'][field]) != exact(right['target'][field]))
            lane_counts = collections.Counter()
            if len(left['target']['lanes']) == len(right['target']['lanes']):
                for a, b in zip(left['target']['lanes'], right['target']['lanes']):
                    for field in a:
                        if exact(a[field]) != exact(b[field]):
                            lane_counts[field] += 1
            else:
                components.append('target.laneExtent')
            voices.append({'epoch': epoch, 'allCapturedValuesEqual': exact(left) == exact(right),
                           'differentComponents': components, 'differentLaneFields': dict(lane_counts)})
        differences = [a - b for a, b in zip(audio[i][1], audio[j][1])]
        pairs.append({'runs': [i, j], 'voices': voices,
                      'allCapturedInitializationValuesEqual': all(v['allCapturedValuesEqual'] for v in voices),
                      'strictFullPcmEqual': runs[i]['frames'] == runs[j]['frames'] and audio[i][0] == audio[j][0],
                      'unmatchedTailFrames': abs(runs[i]['frames'] - runs[j]['frames']),
                      'firstChangedAudioFrame': next((k // 2 for k, value in enumerate(differences) if value), None),
                      'commonExtentDifferenceRms': math.sqrt(sum(v * v for v in differences) / len(differences)) / 8388608})
    return {'schema': 'pianoteq-initial-state-baseline-audit-v1', 'runs': runs, 'pairs': pairs,
            'strictNativeRepeatabilityVerified': all(pair['strictFullPcmEqual'] for pair in pairs),
            'ignoredFields': ['voice identity', 'target.thread', 'target.V address', 'target.P_pointer address'],
            'reservedWordsCompared': True, 'paddedLanesCompared': True, 'alignmentApplied': False,
            'normalizationApplied': False, 'nativeVariationCauseIdentified': False,
            'independentEngineStereoVerified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Fresh private output required')
    result = audit(args.directory.absolute())
    with args.output.open('x') as output:
        json.dump(result, output, indent=2, allow_nan=False)
    args.output.chmod(0o600)
    print(json.dumps({'runs': len(result['runs']), 'pairs': result['pairs'],
                      'strictNativeRepeatabilityVerified': result['strictNativeRepeatabilityVerified']}))
    if not result['strictNativeRepeatabilityVerified']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
