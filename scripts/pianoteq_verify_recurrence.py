"""Reconstruct native float32 FMA recurrence from real LLDB captures."""
import argparse
import ctypes
import json
from pathlib import Path
import struct


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


def bits(x):
    return struct.pack('<f', x)


def verify(data):
    lib = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
    fma = lib.fmaf
    fma.argtypes = [ctypes.c_float] * 3
    fma.restype = ctypes.c_float
    assert data['records'] and not data['errors']
    comparisons = mismatches = non_fma_mismatches = nonzero = 0
    examples = []
    for number, record in enumerate(data['records']):
        coef = record['coefficients_interleaved']
        steps = (record['samples'] + 3) // 4 * 4
        for i in range(16):
            group, lane = divmod(i, 4)
            a, b = coef[8*group+lane], coef[8*group+4+lane]
            p, q = record['P_before'][i], record['Q_before'][i]
            pn, qn = p, q
            nonzero += p != 0 or q != 0
            for step in range(steps):
                p, q = q, (fma(b, q, f32(a*p)) if step % 4 == 0 else fma(a, p, f32(b*q)))
                pn, qn = qn, f32(f32(b*qn) + f32(a*pn))
            for expected, actual, control in zip((p,q), (record['P_after'][i],record['Q_after'][i]), (pn,qn)):
                comparisons += 1
                mismatches += bits(expected) != bits(actual)
                non_fma_mismatches += bits(control) != bits(actual)
            if len(examples) < 4 and record['P_before'][i] != 0:
                examples.append({'record': number, 'lane': i, 'steps': steps,
                                 'A': a, 'B': b, 'P0': record['P_before'][i],
                                 'Q0': record['Q_before'][i], 'P': p, 'Q': q,
                                 'actual_P': record['P_after'][i], 'actual_Q': record['Q_after'][i]})
    return {'records': len(data['records']), 'compared_floats': comparisons,
            'nonzero_initial_lanes': nonzero, 'bit_mismatches': mismatches,
            'unfused_control_bit_mismatches': non_fma_mismatches, 'examples': examples,
            'passed': mismatches == 0 and nonzero > 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(json.loads(args.capture.read_text()))
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(text + '\n')
    print(text)
    raise SystemExit(0 if result['passed'] else 1)
