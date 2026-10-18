#!/usr/bin/env python3
"""Compare complete native PCM and explicitly scoped modal-clock snapshots."""
import argparse
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import wave

DYNAMICS = ('velocity', 'u', 'releaseFlag', 'rattle', 'modalRelease', 'actual', 'inputs')
TIMING = ('consumerCounter', 'publishedRelease', 'currentPosition', 'pendingPosition',
          'pending', 'skipPending', 'dispatch')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact(value):
    if isinstance(value, dict):
        return tuple((key, exact(value[key])) for key in sorted(value))
    if isinstance(value, list):
        return tuple(map(exact, value))
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('Finite observed float required')
        return struct.pack('<f', value).hex()
    return value


def audit(directory):
    paths = sorted(directory.glob('run-*'), key=lambda p: int(p.name[4:]))
    if not 2 <= len(paths) <= 10 or [p.name for p in paths] != [f'run-{i}' for i in range(len(paths))]:
        raise ValueError('Bounded chronological native runs required')
    fixture, runs, records, audio = None, [], [], []
    collector = sha((directory / 'pianoteq_capture_modal_clock_baseline.py').read_bytes())
    for ordinal, path in enumerate(paths):
        launch_bytes = (path / 'launch.json').read_bytes()
        launch = json.loads(launch_bytes)
        if fixture is None:
            fixture = launch['fixture']
        if launch['fixture'] != fixture or fixture['selection']['kind'] != 'fxp' or \
                launch['collectorSha256'] != collector or launch['site'] != '0x100472f50':
            raise ValueError('Identical native fixture and bound single-site collector required')
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
            raise ValueError('Identical explicit native render settings required')
        runtime_bytes = (path / 'runtime.json').read_bytes()
        data = json.loads(runtime_bytes)
        status = data['runStatus']
        rows = data['modalClockRecords']
        if status['terminal'] is not True or status['exitStatus'] != 0 or data['errors'] or \
                data['modalClockErrors'] or data['hardwareBreakpoints'] != 1 or \
                data['targetMutation'] is not False or data['modalClockSite'] != '0x100472f50' or \
                not 1 <= len(rows) <= 20000:
            raise ValueError('Terminal successful bounded read-only modal capture required')
        by_key, last = {}, {}
        for i, row in enumerate(rows):
            epoch, counter = row['epoch'], row['workerCounter']
            previous = last.get(epoch)
            if row['ordinal'] != i or epoch not in range(5) or counter < 0 or counter % 64 or \
                    counter != (previous['workerCounter'] + 64 if previous else 0) or \
                    row['consumerCounter'] < 0 or row['consumerCounter'] % 64:
                raise ValueError('Complete contiguous per-voice modal chronology required')
            if row['releaseFlag'] not in (0, 1) or not 0 <= row['u'] <= 1 or not 0 <= row['rattle'] <= 1:
                raise ValueError('Supported finite modal control branch required')
            for field in DYNAMICS + TIMING:
                exact(row[field])
            key = (epoch, counter)
            if key in by_key:
                raise ValueError('Duplicate worker key must not be silently deduplicated')
            by_key[key] = row
            last[epoch] = row
        if set(last) != set(range(5)):
            raise ValueError('Five complete diagnostic voices required')
        records.append(by_key)
        wav_bytes = (path / 'observed.wav').read_bytes()
        with wave.open(str(path / 'observed.wav'), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('Complete 24-bit stereo/48kHz WAV required')
            frames = reader.getnframes()
            pcm = reader.readframes(frames)
        if not frames or len(pcm) != frames * 6:
            raise ValueError('Complete PCM extent required')
        values = [int.from_bytes(pcm[i:i + 3], 'little', signed=True) for i in range(0, len(pcm), 3)]
        audio.append((pcm, values))
        runs.append({'run': ordinal, 'records': len(rows), 'frames': frames, 'pcmSha256': sha(pcm),
                     'wavSha256': sha(wav_bytes), 'runtimeSha256': sha(runtime_bytes),
                     'launchSha256': sha(launch_bytes), 'collectorSha256': collector,
                     'lastWorkerCounters': {epoch: row['workerCounter'] for epoch, row in last.items()}})
    pairs = []
    for i, j in itertools.combinations(range(len(runs)), 2):
        left, right = records[i], records[j]
        common = sorted(left.keys() & right.keys())
        unmatched = sorted(left.keys() ^ right.keys())
        counts, first = collections.Counter(), {}
        for key in common:
            for field in DYNAMICS + TIMING:
                if exact(left[key][field]) != exact(right[key][field]):
                    counts[field] += 1
                    first.setdefault(field, {'epoch': key[0], 'workerCounter': key[1],
                                             'left': left[key][field], 'right': right[key][field]})
        differences = [a - b for a, b in zip(audio[i][1], audio[j][1])]
        dynamics_equal = not any(counts[field] for field in DYNAMICS)
        strict = runs[i]['frames'] == runs[j]['frames'] and audio[i][0] == audio[j][0]
        pairs.append({'runs': [i, j], 'commonWorkerKeys': len(common),
                      'unmatchedWorkerKeys': unmatched, 'differentFields': dict(counts), 'firstDifferences': first,
                      'dynamicParametersEqualOnCommonKeys': dynamics_equal,
                      'completeDynamicSequenceEqual': dynamics_equal and not unmatched,
                      'strictFullPcmEqual': strict, 'unmatchedTailFrames': abs(runs[i]['frames'] - runs[j]['frames']),
                      'firstChangedAudioFrame': next((k // 2 for k, value in enumerate(differences) if value), None),
                      'commonExtentDifferenceRms': math.sqrt(sum(v * v for v in differences) / len(differences)) / 8388608})
    return {'schema': 'pianoteq-modal-clock-baseline-audit-v1', 'runs': runs, 'pairs': pairs,
            'strictNativeRepeatabilityVerified': all(pair['strictFullPcmEqual'] for pair in pairs),
            'alignmentApplied': False, 'normalizationApplied': False, 'unmatchedWorkerKeysIgnored': False,
            'nativeVariationCauseIdentified': False, 'independentEngineStereoVerified': False}


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
    print(json.dumps({'runs': len(result['runs']), 'pairs': [{k: v for k, v in pair.items()
        if k not in ('firstDifferences', 'differentFields')} for pair in result['pairs']],
        'strictNativeRepeatabilityVerified': result['strictNativeRepeatabilityVerified']}))
    if not result['strictNativeRepeatabilityVerified']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
