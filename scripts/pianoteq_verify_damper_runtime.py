"""Independently verify pass7 captures; no debugger or Pianoteq required.

Usage: python3 SCRIPT capture.json [--observed WAV --official WAV]
Requires a C library providing fmaf (macOS libSystem or Linux libm).
The position test covers p>=0.125 only; small-p extra curves are excluded.
"""
import argparse
import ctypes
import ctypes.util
import hashlib
import json
import math
from pathlib import Path
import struct
import wave


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


lib = ctypes.CDLL(ctypes.util.find_library('m') or ctypes.util.find_library('System'))
fma = lib.fmaf
fma.argtypes = [ctypes.c_float] * 3
fma.restype = ctypes.c_float
K = struct.unpack('<d', struct.pack('<Q', 0x3fbd791c5f888823))[0]


def release(fields):
    v = lambda k: fields[hex(k)]
    h = f32(v(0x8c4) * f32(v(0x8c4) * v(0x8c4)))
    z = f32(h * v(0x91c))
    r = min(v(0x8cc), f32(1.0 - min(max(z, 0.0), 1.0)))
    r2 = f32(r * r)
    q = f32(r2 * r2)
    d = fma(q, fma(q, fma(q, fma(v(0x958), q, v(0x954)),
                                       v(0x950)), v(0x94c)), v(0x914))
    return {
        '0x944': d,
        '0x7e4': f32(v(0x910) * K / d),
        '0x7b0': max(f32(f32(1.0 - v(0x8cc)) * v(0x90c)),
                     f32(h * v(0x920))),
    }


def verify(data, required='both'):
    assert not data['errors'], data['errors']
    releases, weights, skipped = [], [], 0
    for record in data['records']:
        fields = record['fields']
        if record['kind'] == 'release_coefficients':
            predicted = release(fields)
            for field, value in predicted.items():
                actual = fields[field]
                releases.append({'sample_counter': record['sample_counter'],
                                 'field': field, 'actual': actual, 'predicted': value,
                                 'bit_equal': struct.pack('<f', actual) == struct.pack('<f', value)})
        elif fields['0x8d4'] >= 0.125:
            scale = f32(fields['0x8d4'] * (2 * math.pi) / fields['0x918'])
            envelope = f32(-1.0 / fields['0x908'])
            for lane in record['lanes']:
                frequency = lane['frequency']
                # Scalar libm is an independent approximation to native SIMD helpers.
                value = f32(-f32(math.cos(f32(frequency * scale))) *
                            f32(math.exp(f32(frequency * envelope))))
                if lane['mask_index'] > f32(record['mask_N'] - 1):
                    value = 0.0
                weights.append({'lane': lane['lane'], 'group': lane['group'],
                                'actual': lane['weight'], 'predicted': value,
                                'absolute_error': abs(value - lane['weight'])})
        else:
            skipped += 1
    assert data['records'], 'Empty capture'
    assert releases or required == 'position', 'Missing release captures'
    assert weights or required == 'release', 'Missing eligible position captures'
    result = {'release_components': len(releases),
              'release_bit_equal': sum(r['bit_equal'] for r in releases),
              'position_lanes': len(weights),
              'position_max_absolute_error': max((r['absolute_error'] for r in weights), default=None),
              'position_skipped_small_p_records': skipped,
              'release': releases, 'position': weights}
    result['numerical_passed'] = (all(r['bit_equal'] for r in releases) and
                                  all(r['absolute_error'] <= 2e-7 for r in weights))
    result['passed'] = result['numerical_passed']
    return result


def pcm(path):
    with wave.open(str(path), 'rb') as wav:
        params = tuple(wav.getparams()[:4])
        samples = wav.readframes(wav.getnframes())
    return params, samples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--observed', type=Path)
    parser.add_argument('--official', type=Path)
    parser.add_argument('--require-kinds', choices=['both', 'release', 'position'], default='both')
    args = parser.parse_args()
    result = verify(json.loads(args.capture.read_text()), args.require_kinds)
    if args.observed or args.official:
        assert args.observed and args.official, 'Supply both WAV paths'
        p1, a = pcm(args.observed)
        p2, b = pcm(args.official)
        equal = p1 == p2 and a == b
        result['audio'] = {'format_observed': p1, 'format_official': p2,
                           'pcm_equal': equal,
                           'observed_pcm_sha256': hashlib.sha256(a).hexdigest(),
                           'official_pcm_sha256': hashlib.sha256(b).hexdigest()}
        result['passed'] &= equal
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
