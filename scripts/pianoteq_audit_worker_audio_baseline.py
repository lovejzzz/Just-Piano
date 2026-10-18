#!/usr/bin/env python3
"""Audit complete worker/terminal float32 streams and native stereo PCM without fitting."""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import subprocess
import wave


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stage(data, directory, name):
    prefix = name + 'Audio'
    expected_file = name + '-audio.bin'
    expected_site = {'worker': '0x100472fd0', 'consumer': '0x100460908', 'tail': '0x100460f1c'}[name]
    consumer_mode = 'consumerAudioRecords' in data
    errors = data['consumerTailErrors'] if consumer_mode else data[prefix + 'Errors']
    if data[prefix + 'File'] != expected_file or (not consumer_mode and data[prefix + 'Site'] != expected_site) or errors:
        raise ValueError('Bound error-free audio stage required')
    raw = (directory / expected_file).read_bytes()
    rows = data[prefix + 'Records']
    size = 1536 if name == 'tail' else 768
    if not 1 <= len(rows) <= 20000 or len(raw) != len(rows) * size or \
            len(raw) != data[prefix + 'Bytes'] or sha(raw) != data[prefix + 'Sha256']:
        raise ValueError('Complete stage extent and digest required')
    last, blocks = {}, {}
    for i, row in enumerate(rows):
        counter = row['workerEndCounter'] if name == 'worker' else row['consumerCounter']
        epoch = row['epoch']
        if row['ordinal'] != i or epoch not in range(5) or counter != last.get(epoch, 0 if name == 'worker' else -64) + 64 or \
                row['offset'] != i * size or row['bytes'] != size:
            raise ValueError('Complete contiguous stage chronology and byte coverage required')
        layouts = row['layouts']
        if len(layouts) != (4 if name == 'tail' else 3):
            raise ValueError('Complete matrix layout inventory required')
        for j, (height, capacity, width, pitch) in enumerate(layouts):
            expected_rows = 3 if name == 'tail' and j == 3 else 1
            if height != expected_rows or not height <= capacity <= 8 or width != 64 or not width <= pitch <= 8192:
                raise ValueError('Supported row-major matrix required')
        block = raw[i * size:(i + 1) * size]
        if sha(block) != row['sha256'] or not all(math.isfinite(x) for x in struct.unpack('<' + 'f' * (size // 4), block)):
            raise ValueError('Finite exact stage block and digest required')
        blocks[(epoch, counter)] = block
        last[epoch] = counter
    if set(last) != set(range(5)):
        raise ValueError('Five complete observed voices required')
    return blocks, {'records': len(rows), 'samples': len(raw) // 4, 'sha256': sha(raw), 'lastCounters': last}


def compare_stage(left, right, name, births):
    common, unmatched = sorted(left.keys() & right.keys()), sorted(left.keys() ^ right.keys())
    if not common:
        raise ValueError('Comparable native stage keys required')
    changed_blocks = changed_words = numeric_changes = 0
    squares = peak = 0.0
    first = None
    for key in common:
        a, b = left[key], right[key]
        if a == b:
            continue
        changed_blocks += 1
        av, bv = struct.unpack('<' + 'f' * (len(a) // 4), a), struct.unpack('<' + 'f' * (len(b) // 4), b)
        for word, (x, y) in enumerate(zip(av, bv)):
            if a[word * 4:word * 4 + 4] != b[word * 4:word * 4 + 4]:
                changed_words += 1
                midi_frame = births[key[0]] + key[1] - (64 if name == 'worker' else 0) + word % 64
                candidate = {'epoch': key[0], 'counter': key[1], 'row': word // 64, 'sample': word % 64,
                             'diagnosticMidiFrame': midi_frame, 'left': x, 'right': y}
                if first is None or midi_frame < first['diagnosticMidiFrame']:
                    first = candidate
            if x != y:
                numeric_changes += 1
                delta = x - y
                squares += delta * delta
                peak = max(peak, abs(delta))
    samples = sum(len(left[key]) // 4 for key in common)
    zero_extras = sum(all(x == 0 for x in struct.unpack('<' + 'f' * (len((left if key in left else right)[key]) // 4),
                         (left if key in left else right)[key])) for key in unmatched)
    chronology_equal = list(left) == list(right)
    chronology_first = next(({'ordinal': i, 'left': a, 'right': b}
                             for i, (a, b) in enumerate(zip(left, right)) if a != b), None)
    return {'commonBlocks': len(common), 'unmatchedBlocks': unmatched, 'unmatchedNumericallyZeroBlocks': zero_extras,
            'changedCommonBlocks': changed_blocks, 'bitDifferentSamples': changed_words,
            'numericallyDifferentSamples': numeric_changes, 'firstBitDifference': first,
            'commonFloatDifferenceRms': math.sqrt(squares / samples), 'commonFloatDifferencePeak': peak,
            'completeVoiceCounterAudioEqual': not unmatched and not changed_blocks,
            'chronologicalOrderEqual': chronology_equal,
            'firstChronologicalKeyDifference': chronology_first,
            'completeByteSequenceEqual': not unmatched and not changed_blocks and chronology_equal,
            'diagnosticMidiFramesAreNotFinalWavAlignment': True}


def compare_controls(left, right):
    """Compare captured controls separately from opaque identities and audio hashes."""
    fields = ('currentControl', 'publishedRelease', 'rattle', 'tail')
    a = {(r['epoch'], r['consumerCounter']): r for r in left}
    b = {(r['epoch'], r['consumerCounter']): r for r in right}
    changed = {field: 0 for field in fields}
    first = None
    for key in sorted(a.keys() & b.keys()):
        differences = {field: {'left': a[key][field], 'right': b[key][field]}
                       for field in fields if a[key][field] != b[key][field]}
        for field in differences: changed[field] += 1
        if differences and first is None:
            first = {'epoch': key[0], 'consumerCounter': key[1], 'fields': differences}
    return {'changedCommonRecordsByField': changed, 'firstChangedControlByVoiceCounter': first,
            'unmatchedRecords': sorted(a.keys() ^ b.keys()), 'causalExplanationProven': False}


def audit(directory):
    paths = sorted(directory.glob('run-*'), key=lambda p: int(p.name[4:]))
    if not 2 <= len(paths) <= 10 or [p.name for p in paths] != [f'run-{i}' for i in range(len(paths))]:
        raise ValueError('Bounded chronological native run directories required')
    paths = [p.resolve() for p in paths]
    if len(set(paths)) != len(paths):
        raise ValueError('Distinct authentic runs required; duplicate directory aliases are forbidden')
    runs, stages, audio, controls = [], [], [], []
    fixture = dual = births = consumer_mode = solo_tail = None
    for ordinal, path in enumerate(paths):
        closure = path.parent
        launch_bytes = (path / 'launch.json').read_bytes()
        launch = json.loads(launch_bytes)
        current_dual = 'sites' in launch
        current_consumer = '0x100460908' in launch.get('sites', [])
        current_solo_tail = launch.get('sites') == ['0x100460f1c'] and launch.get('tailOnly') is True
        if fixture is None:
            fixture, dual, consumer_mode = launch['fixture'], current_dual, current_consumer
            solo_tail = current_solo_tail
            module = (Path(__file__).resolve().parent.parent / 'dsp/midi-block-clock.mjs').as_uri()
            code = 'import fs from "node:fs";import {midiBlockClock} from ' + json.dumps(module) + ';' + \
                'console.log(JSON.stringify(midiBlockClock(fs.readFileSync(process.argv[1]),{sampleRate:48000}).noteOns.map(e=>e.frame)));'
            births = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code, fixture['midiPath']], text=True))
            if len(births) != 5:
                raise ValueError('Five source MIDI births required')
        if launch['fixture'] != fixture or current_dual != dual or current_consumer != consumer_mode or current_solo_tail != solo_tail or fixture['selection']['kind'] != 'fxp':
            raise ValueError('Identical fixture and observation mode required')
        expected_sites = ['0x10035ef10', '0x100472fd0', '0x100460f1c'] if dual else ['0x100472fd0']
        if consumer_mode: expected_sites = ['0x10035ef10', '0x100460908', '0x100460f1c']
        if solo_tail: expected_sites = ['0x100460f1c']
        sites = launch['sites'] if dual else [launch['site']]
        collector = 'pianoteq_capture_worker_tail_baseline.py' if dual else 'pianoteq_capture_worker_audio_baseline.py'
        if consumer_mode or solo_tail: collector = 'pianoteq_capture_consumer_tail_baseline.py'
        if sites != expected_sites or sha((closure / collector).read_bytes()) != launch['collectorSha256'] or \
                (dual and sha((closure / 'pianoteq_capture_worker_audio_baseline.py').read_bytes()) != launch['workerCollectorSha256']):
            raise ValueError('Frozen fixed-site collectors required')
        if (consumer_mode or solo_tail) and (set(launch['helperSha256']) != {p.name for p in closure.glob('*.py')} or
                any(sha((closure / name).read_bytes()) != digest for name, digest in launch['helperSha256'].items())):
            raise ValueError('Complete frozen consumer helper closure required')
        for file, digest in [(fixture['midiPath'], fixture['midiSha256']), (fixture['resourcePath'], fixture['resourceSha256']),
                             (fixture['selection']['path'], fixture['selection']['sha256'])]:
            if sha(Path(file).read_bytes()) != digest:
                raise ValueError('Native fixture input changed')
        expected = [fixture['binaryPath'], '--headless', '--no-prefs', '--multicore', '0', '--fxp', fixture['selection']['path'],
                    '--midi', fixture['midiPath'], '--wav', str(path / 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF']
        if launch['arguments'] != expected:
            raise ValueError('Identical explicit native render settings required')
        runtime_bytes = (path / 'runtime.json').read_bytes()
        data = json.loads(runtime_bytes)
        if data['runStatus']['terminal'] is not True or data['runStatus']['exitStatus'] != 0 or data['errors'] or \
                data['targetMutation'] is not False or data['hardwareBreakpoints'] != len(sites):
            raise ValueError('Successful terminal read-only native run required')
        if dual and not solo_tail and (len(data['birthRecords']) != 5 or [row['epoch'] for row in data['birthRecords']] != list(range(5)) or
                     len({row['voice'] for row in data['birthRecords']}) != 5 or any(row['note'] != 69 for row in data['birthRecords'])):
            raise ValueError('Five canonical source-strike identities required')
        if solo_tail and (data.get('tailOnly') is not True or data['consumerTailErrors'] or
                len(data['birthRecords']) != 5 or [r['epoch'] for r in data['birthRecords']] != list(range(5)) or
                len({r['voice'] for r in data['birthRecords']}) != 5 or
                any(r['identitySource'] != 'first-terminal-counter-zero' for r in data['birthRecords']) or data['consumerAudioRecords']):
            raise ValueError('Explicit five-voice terminal-only coverage required')
        if consumer_mode and (data['consumerInputIsRawWorkerOutput'] is not False or data['consumerTailErrors']):
            raise ValueError('Explicit error-free consumer stage identity required')
        names = ['consumer', 'tail'] if consumer_mode else ['worker', 'tail'] if dual else ['worker']
        if solo_tail: names = ['tail']
        by_stage, inventory = {}, {}
        for name in names:
            by_stage[name], inventory[name] = stage(data, path, name)
        if consumer_mode and list(by_stage['consumer']) != list(by_stage['tail']):
            raise ValueError('Complete same-call consumer and terminal pairs required')
        stages.append(by_stage)
        controls.append(data.get('tailAudioRecords') if solo_tail else data.get('consumerAudioRecords'))
        wav_bytes = (path / 'observed.wav').read_bytes()
        with wave.open(str(path / 'observed.wav'), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (2, 3, 48000):
                raise ValueError('Complete stereo24/48kHz WAV required')
            frames, pcm = reader.getnframes(), reader.readframes(reader.getnframes())
        if not frames or len(pcm) != frames * 6:
            raise ValueError('Complete final PCM extent required')
        values = [int.from_bytes(pcm[i:i + 3], 'little', signed=True) for i in range(0, len(pcm), 3)]
        audio.append((pcm, values))
        runs.append({'run': ordinal, 'frames': frames, 'pcmSha256': sha(pcm), 'wavSha256': sha(wav_bytes),
                     'runtimeSha256': sha(runtime_bytes), 'launchSha256': sha(launch_bytes), 'stages': inventory,
                     'resolvedRunDirectory': str(path), 'collectorSha256': launch['collectorSha256'],
                     'nonSourceTerminalCalls': data.get('unownedTailCalls', [])})
    pairs = []
    for i, j in itertools.combinations(range(len(runs)), 2):
        differences = [x - y for x, y in zip(audio[i][1], audio[j][1])]
        pairs.append({'runs': [i, j], 'stages': {name: compare_stage(stages[i][name], stages[j][name], name, births) for name in names},
                      'strictFullPcmEqual': runs[i]['frames'] == runs[j]['frames'] and audio[i][0] == audio[j][0],
                      'unmatchedTailFrames': abs(runs[i]['frames'] - runs[j]['frames']),
                      'firstChangedAudioFrame': next((k // 2 for k, value in enumerate(differences) if value), None),
                      'commonPcmDifferenceRms': math.sqrt(sum(v * v for v in differences) / len(differences)) / 8388608})
        if consumer_mode:
            pairs[-1]['consumerControls'] = compare_controls(controls[i], controls[j])
        if solo_tail:
            pairs[-1]['terminalControls'] = compare_controls(controls[i], controls[j])
    return {'schema': 'pianoteq-worker-audio-baseline-audit-v1', 'runs': runs, 'pairs': pairs,
            'workerAndTailSameRun': dual and not consumer_mode and not solo_tail,
            'consumerAndTailSameRun': consumer_mode, 'terminalOnly': solo_tail,
            'identicalCollectorVersions': len({r['collectorSha256'] for r in runs}) == 1,
            'strictNativeRepeatabilityVerified': all(pair['strictFullPcmEqual'] for pair in pairs),
            'alignmentApplied': False, 'normalizationApplied': False, 'unmatchedBlocksIgnored': False,
            'unmatchedTailIgnored': False, 'nativeVariationCauseIdentified': False, 'independentEngineStereoVerified': False}


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
    print(json.dumps({'runs': len(result['runs']), 'pairs': result['pairs'], 'strictNativeRepeatabilityVerified': result['strictNativeRepeatabilityVerified']}))
    if not result['strictNativeRepeatabilityVerified']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
