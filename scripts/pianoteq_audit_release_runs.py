"""Audit authentic release captures and retain every PCM disagreement.

Usage: --reference original.wav --output report.json capture-directory ...
Exit 1 means a numeric/handoff failure OR any differing audio. A successful
coefficient replay alone never changes an audio mismatch into a pass.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import wave
from pianoteq_verify_damper_runtime import verify


def bits(value):
    return struct.pack('<f', value)


def pcm(path):
    with wave.open(str(path), 'rb') as wav:
        assert wav.getsampwidth() == 3 and wav.getcomptype() == 'NONE'
        return tuple(wav.getparams()[:4]), wav.readframes(wav.getnframes())


def compare_audio(reference, observed):
    fmt, original = reference
    observed_fmt, current = observed
    result = {'format': observed_fmt, 'formatEqual': observed_fmt == fmt,
              'pcmSha256': hashlib.sha256(current).hexdigest(),
              'pcmEqual': observed_fmt == fmt and current == original}
    if observed_fmt != fmt:
        return result
    differing, maximum, squares, first = 0, 0, 0, None
    for offset in range(0, len(original), 3):
        a = int.from_bytes(original[offset:offset + 3], 'little', signed=True)
        b = int.from_bytes(current[offset:offset + 3], 'little', signed=True)
        delta = b - a
        if delta:
            differing += 1
            maximum = max(maximum, abs(delta))
            squares += delta * delta
            if first is None:
                first = offset // 3
    result.update(differingInterleavedSamples=differing,
                  maxIntegerDifference=maximum,
                  normalizedRmsDifference=math.sqrt(squares / (len(original) // 3)) / 8388608,
                  firstDifferentFrame=first // fmt[0] if first is not None else None)
    return result


def audit_handoff(data):
    assert not data['errors'] and data['records']
    comparisons, last_setter, last_refresh = [], {}, {}

    def check(record, field, actual, expected):
        comparisons.append({'counter': record['sample_counter'], 'field': field,
                            'actual': actual, 'expected': expected,
                            'bitEqual': bits(actual) == bits(expected)})

    for r in data['records']:
        key = r['V']
        if r['stage'] == 'setter':
            u = r['input']['position']
            release, direction = r['input']['release'], r['input']['direction']
            expected = 0.0 if release and u == 1.0 and r['flags']['0x931'] & 1 else u
            check(r, 'setter.position', r['fields']['0x8cc'], expected)
            check(r, 'setter.release', r['flags']['0x924'], release & 255)
            check(r, 'setter.direction', r['flags']['0x925'], direction & 255)
            if 'handoff' in r:
                check(r, 'parent.currentPosition', u, r['handoff']['current_position'])
            last_setter[key] = r
        elif r['stage'] == 'refresh':
            if data['stage'] == 'combined':
                assert key in last_setter, 'Refresh without observed setter'
                s = last_setter[key]
                assert s['sample_counter'] == r['sample_counter']
                check(r, 'refresh.current', r['fields']['0x8cc'], s['fields']['0x8cc'])
            if key in last_refresh:
                check(r, 'refresh.previousCache', r['fields']['0x8c8'],
                      last_refresh[key]['fields']['0x8cc'])
            last_refresh[key] = r
        elif r['stage'] == 'coefficients':
            assert key in last_refresh
            assert r['sample_counter'] == last_refresh[key]['sample_counter']
            check(r, 'coefficients.current', r['fields']['0x8cc'],
                  last_refresh[key]['fields']['0x8cc'])
    assert comparisons, 'No handoff comparisons'
    return {'passed': all(c['bitEqual'] for c in comparisons),
            'count': len(comparisons),
            'matched': sum(c['bitEqual'] for c in comparisons),
            'comparisons': comparisons}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('directories', type=Path, nargs='+')
    args = parser.parse_args()
    reference = pcm(args.reference)
    runs = []
    for directory in args.directories:
        source = directory / 'damper-runtime.json'
        is_coefficients = source.exists()
        if not is_coefficients:
            source = directory / 'runtime.json'
        data = json.loads(source.read_text())
        arithmetic = verify(data, 'release') if is_coefficients else audit_handoff(data)
        runs.append({'directory': str(directory), 'recordCount': len(data['records']),
                     'nativeExitZero': bool(re.search(r'Process \d+ exited with status = 0',
                                                      (directory / 'capture.log').read_text())),
                     'localVerification': arithmetic,
                     'audio': compare_audio(reference, pcm(directory / 'observed.wav'))})
    local = all(r['localVerification']['passed'] for r in runs)
    audio = all(r['audio']['pcmEqual'] for r in runs)
    native = all(r['nativeExitZero'] for r in runs)
    report = {'passed': local and audio and native, 'localArithmeticAndHandoffPassed': local,
              'allNativeExitedZero': native,
              'allAudioEqual': audio, 'completeVoiceVerified': False,
              'reference': str(args.reference),
              'referencePcmSha256': hashlib.sha256(reference[1]).hexdigest(), 'runs': runs}
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'localPassed': local,
                      'audioEqualRuns': sum(r['audio']['pcmEqual'] for r in runs),
                      'runCount': len(runs)}))
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
