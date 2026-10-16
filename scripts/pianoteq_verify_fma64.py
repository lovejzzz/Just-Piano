#!/usr/bin/env python3
"""Compare the browser fma64 export with independent platform libm.fma.

Requires Python 3 and Node.js. No Pianoteq binary, captures or packages required.
"""
import ctypes
import ctypes.util
import itertools
import json
import math
from pathlib import Path
import random
import struct
import subprocess
import sys

library = ctypes.CDLL('/usr/lib/libSystem.B.dylib' if sys.platform == 'darwin' else ctypes.util.find_library('m'))
fma = library.fma
fma.argtypes = [ctypes.c_double] * 3
fma.restype = ctypes.c_double

def hex64(value):
    return struct.pack('>d', value).hex()

cases = []
def add(category, a, b, c):
    cases.append({'category': category, 'inputs': [hex64(x) for x in (a, b, c)], 'expected': hex64(fma(a, b, c))})

smallest = math.ulp(0.)
minimum = float.fromhex('0x1p-1022')
maximum = float.fromhex('0x1.fffffffffffffp1023')
# Exhaustive signs for zero product and addend; exact cancellation signs.
for a, b, c in itertools.product([0., -0., 1., -1.], repeat=3):
    add('signed-zero', a, b, c)
# Values surrounding underflow ties, min-normal transitions and overflow ties.
underflow = [0., -0., smallest, -smallest, 2 * smallest, -2 * smallest,
             math.nextafter(minimum, 0.), minimum, math.nextafter(minimum, math.inf)]
for a, b, c in itertools.product(underflow, [.25, .5, math.nextafter(.5, 0.), math.nextafter(.5, 1.), 1., 2., -1., -2.], underflow):
    add('subnormal', a, b, c)
for a, b, c in itertools.product([maximum, -maximum, math.nextafter(maximum, 0.)],
                                [1., -1., 2., -2., math.nextafter(1., 0.), math.nextafter(1., math.inf)],
                                [0., -0., maximum, -maximum, 2.**970, -2.**970, 2.**971, -2.**971]):
    add('overflow', a, b, c)
# Includes finite overflowing product combined with opposite-sign infinite c.
for a, b, c in itertools.product([0., -0., 1., -1., maximum, -maximum, math.inf, -math.inf, math.nan], repeat=3):
    add('nonfinite', a, b, c)
for a, b, c in [(1 + 2**-27, 1 - 2**-27, -1.), (2**-1022, 2**-53, smallest), (1e308, 1e-308, -1.)]:
    add('cancellation', a, b, c)
rng = random.Random(9327)
for _ in range(2000):
    add('random', math.ldexp(rng.uniform(-1, 1), rng.randint(-500, 500)),
        math.ldexp(rng.uniform(-1, 1), rng.randint(-500, 500)),
        math.ldexp(rng.uniform(-1, 1), rng.randint(-1000, 1000)))
module = (Path(__file__).resolve().parents[1] / 'dsp/modal-poles.mjs').as_uri()
program = '''
import fs from 'node:fs';
const { fma64 } = await import(process.argv[1]);
const view = new DataView(new ArrayBuffer(8));
function decode(hex) { view.setBigUint64(0, BigInt('0x' + hex)); return view.getFloat64(0); }
function encode(value) { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); }
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const summary = {}, failures = [];
for (const item of cases) {
  const actual = fma64(...item.inputs.map(decode));
  const expected = decode(item.expected);
  const equal = Number.isNaN(expected) ? Number.isNaN(actual) : Object.is(actual, expected);
  const count = summary[item.category] ??= { count: 0, passed: 0 };
  count.count++; if (equal) count.passed++;
  else failures.push({ ...item, actual: encode(actual) });
}
console.log(JSON.stringify({ summary, total: cases.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
'''
run = subprocess.run(['node', '--input-type=module', '-e', program, module], input=json.dumps(cases), text=True, capture_output=True)
if run.stderr:
    print(run.stderr, file=sys.stderr)
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(run.stdout)
print(run.stdout, end='')
raise SystemExit(run.returncode)
