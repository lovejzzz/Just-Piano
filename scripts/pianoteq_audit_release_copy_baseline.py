#!/usr/bin/env python3
"""Audit complete instrumented WAVs and release publication; no alignment or fitting."""
import argparse
import collections
import hashlib
import itertools
import json
from pathlib import Path
import wave


def sha(data):
    return hashlib.sha256(data).hexdigest()


def audit(directory):
    paths = sorted(directory.glob('run-*'), key=lambda p: int(p.name[4:]))
    if not 2 <= len(paths) <= 10 or [p.name for p in paths] != [f'run-{i}' for i in range(len(paths))]:
        raise ValueError('Bounded chronological run directories required')
    runs, samples, records = [], [], []
    fixture = None
    for index, path in enumerate(paths):
        launch_bytes = (path / 'launch.json').read_bytes()
        launch = json.loads(launch_bytes)
        current = launch['fixture']
        if fixture is None:
            fixture = current
        if current != fixture or current['selection']['kind'] != 'fxp' or \
                current.get('schema') != 'pianoteq-native-repeat-fixture-v1' or \
                current.get('sampleRate') != 48000 or current.get('midiSha256') != \
                'de01e1cbf1e332dd6df9c06702ab66d51ab5a7e05a4648107eeb26340cdc0252':
            raise ValueError('Identical supported two-strike FXP/MIDI fixture required')
        if sha(Path(current['midiPath']).read_bytes()) != current['midiSha256'] or \
                sha(Path(current['selection']['path']).read_bytes()) != current['selection']['sha256'] or \
                sha(Path(current['resourcePath']).read_bytes()) != current['resourceSha256']:
            raise ValueError('Fixture inputs changed')
        expected = [current['binaryPath'], '--headless', '--no-prefs', '--multicore', '0',
                    '--fxp', current['selection']['path'], '--midi', current['midiPath'],
                    '--wav', str(path / 'observed.wav'), '--rate', '48000',
                    '--bit-depth', '24', '--dither', 'OFF']
        if launch['arguments'] != expected or launch['site'] != '0x1004604d0' or \
                sha((directory / 'pianoteq_capture_release_copy_baseline.py').read_bytes()) != launch['collectorSha256']:
            raise ValueError('Bound collector and explicit render settings required')
        runtime_bytes = (path / 'runtime.json').read_bytes()
        data = json.loads(runtime_bytes)
        status = data['runStatus']
        rows = data['releaseCopies']
        if status['terminal'] is not True or status['exitStatus'] != 0 or data['errors'] or \
                data['releaseCopyErrors'] or data['targetMutation'] is not False or \
                data['releaseCopyTargetMutation'] is not False or data['hardwareBreakpoints'] != 1 or \
                data['releaseCopySite'] != '0x1004604d0' or not 1 <= len(rows) <= 20000:
            raise ValueError('Successful bounded read-only single-site capture required')
        last, canonical = {}, {}
        for ordinal, row in enumerate(rows):
            epoch, counter = row['epoch'], row['counter']
            previous = last.get(epoch)
            if row['ordinal'] != ordinal or epoch not in (0, 1) or counter % 64 or counter < 0 or \
                    row['nextRelease'] != row['modalPosition'] or \
                    (previous is None and (counter != 0 or row['previousRelease'] != 0)) or \
                    (previous and (counter != previous['counter'] + 64 or
                                   row['previousRelease'] != previous['nextRelease'])):
                raise ValueError('Complete chronological publication continuity required')
            last[epoch] = row
            canonical[(epoch, counter)] = {k: v for k, v in row.items() if k not in ('voice', 'thread', 'ordinal')}
        if set(last) != {0, 1}:
            raise ValueError('Both diagnostic voices required')
        wav_bytes = (path / 'observed.wav').read_bytes()
        with wave.open(str(path / 'observed.wav'), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('Complete 48kHz 24-bit stereo required')
            frames = reader.getnframes()
            pcm = reader.readframes(frames)
        if not frames or len(pcm) != frames * 6:
            raise ValueError('Complete native PCM extent required')
        samples.append(pcm)
        records.append(canonical)
        runs.append({'run': index, 'frames': frames, 'pcmSha256': sha(pcm), 'wavSha256': sha(wav_bytes),
                     'launchSha256': sha(launch_bytes), 'runtimeSha256': sha(runtime_bytes),
                     'copyRecords': len(rows), 'publicationContinuityVerified': True,
                     'beforeSecondStrike': canonical[(0, 5632)],
                     'workerLeadSamples': sorted({r['modalCounter'] - r['counter'] for r in rows})})
    comparisons = []
    for i, j in itertools.combinations(range(len(runs)), 2):
        left, right = records[i], records[j]
        common = sorted(left.keys() & right.keys())
        counts, first = collections.Counter(), {}
        for key in common:
            for field in left[key]:
                if left[key][field] != right[key][field]:
                    counts[field] += 1
                    first.setdefault(field, {'epoch': key[0], 'counter': key[1],
                                             'left': left[key][field], 'right': right[key][field]})
        comparisons.append({'runs': [i, j], 'strictFullPcmEqual': samples[i] == samples[j],
                            'unmatchedTailFrames': abs(runs[i]['frames'] - runs[j]['frames']),
                            'unmatchedCopyKeys': len(left.keys() ^ right.keys()),
                            'differentCopyFields': dict(counts), 'firstCopyDifferences': first})
    return {'schema': 'pianoteq-release-copy-baseline-audit-v1', 'runs': runs, 'comparisons': comparisons,
            'allInstrumentedPcmEqual': all(c['strictFullPcmEqual'] for c in comparisons),
            'alignmentApplied': False, 'normalizationApplied': False, 'tailIgnored': False,
            'unobservedNativeRepeatabilityProven': False, 'nativeVariationCauseIdentified': False,
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
    print(json.dumps({'runs': len(result['runs']), 'pairs': len(result['comparisons']),
                      'allInstrumentedPcmEqual': result['allInstrumentedPcmEqual'],
                      'independentEngineStereoVerified': False}))


if __name__ == '__main__':
    main()
