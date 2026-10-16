"""Verify captured complex coefficients, roots, ordering and float32 outputs.

Usage: python SCRIPT runtime.json [--output report.json]
Requires NumPy. Input comes from a hardware snapshot at 0x1006d3240 in the
specific Pianoteq 9.2.5 ARM64 build documented in pass8. No app is launched.
"""
import argparse
import ctypes
import ctypes.util
import json
import math
from pathlib import Path
import struct

import numpy as np


def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


lib = ctypes.CDLL(ctypes.util.find_library('m') or ctypes.util.find_library('System'))
fma = lib.fma
fma.argtypes = [ctypes.c_double] * 3
fma.restype = ctypes.c_double


def complex_values(values):
    assert len(values) % 2 == 0
    return np.array(values[::2]) + 1j * np.array(values[1::2])


def root_error(actual, predicted):
    remaining = list(predicted)
    errors = []
    for root in actual:
        index = min(range(len(remaining)), key=lambda i: abs(root - remaining[i]))
        errors.append(float(abs(root - remaining.pop(index))))
    return max(errors)


def verify(record):
    n = record['N']
    coefficients = complex_values(record['coefficients'])
    roots = complex_values(record['roots'])
    assert len(coefficients) == n + 1 and len(roots) == n
    assert np.all(np.isfinite(coefficients)) and np.all(np.isfinite(roots))
    predicted_roots = np.roots(coefficients)
    error = root_error(roots, predicted_roots)
    residual = max(float(abs(np.polyval(coefficients, z)) /
                         sum(abs(c) * abs(z) ** (n - i) for i, c in enumerate(coefficients)))
                   for z in roots)
    frequencies = [abs(((record['center'] + record['center']) * math.pi + z.real) /
                       (2 * math.pi)) for z in roots]
    keys = [fma(f, 1e-16, z.imag) for f, z in zip(frequencies, roots)]
    order = sorted(range(n), key=lambda i: keys[i], reverse=True)
    floor = roots[order[0]].imag / record['floor_ratio']
    predicted_f = [f32(frequencies[i]) for i in order]
    predicted_d = [f32(max(roots[i].imag, floor)) for i in order]
    same = lambda a, b: len(a) == len(b) and all(struct.pack('<d', x) == struct.pack('<d', y)
                                                for x, y in zip(a, b))
    result = {'N': n, 'root_max_absolute_error': error,
              'normalized_polynomial_residual': residual,
              'order_equal': order == record['sort_indices'],
              'frequency_double_bits_equal': same(predicted_f, record['frequency']),
              'decay_double_bits_equal': same(predicted_d, record['decay']),
              'negative_control_reversed_coefficients_error': root_error(roots, np.roots(coefficients[::-1]))}
    result['passed'] = (error <= 1e-10 * max(1.0, float(max(abs(roots)))) and
                        residual <= 1e-10 and result['order_equal'] and
                        result['frequency_double_bits_equal'] and result['decay_double_bits_equal'])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    data = json.loads(args.capture.read_text())
    assert data['records'] and not data['errors']
    checks = [verify(r) for r in data['records']]
    result = {'records': len(checks), 'components': sum(r['N'] for r in checks),
              'maximum_root_error': max(r['root_max_absolute_error'] for r in checks),
              'maximum_normalized_residual': max(r['normalized_polynomial_residual'] for r in checks),
              'passed': all(r['passed'] for r in checks), 'checks': checks}
    encoded = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(encoded)
    print(encoded)
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
