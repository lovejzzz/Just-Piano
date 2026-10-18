#!/usr/bin/env python3
"""Add immutable-binary microphone constants and FXP output state to a private archive export."""
import argparse
import hashlib
import importlib.util
import json
import os
import math
from pathlib import Path
import struct

EXPECTED = '8e375ff63fcb9056ae1eadd9770d28a0a61c7d79209f52a74f027c3bc13c2094'
# Read-only static tables referenced by FUN_100850c08. No runtime capture input.
# None ordinates mean the constructor's explicit 200-word zero curve.
# Identity 18 initializes its pair with movi.2s v0,#0x3f,lsl#24.
PLANS = {
    0: (None, 0x100b41680), 18: (None, 'half'), 1: (None, 0x100b41688),
    2: (0x100ad49e8, 'zero'), 3: (0x100b2eb30, 0x100b41690),
    4: (0x100b2667c, 0x100b41698), 5: (0x100acf95c, 0x100b416a0),
    6: (0x100a90bc4, 0x100b416a8), 7: (0x100a6c2cc, 0x100b416b0),
    8: (0x100ab75d8, 0x100b416b8), 9: (0x100b06c10, 0x100b416c0),
    10: (0x100a97700, 0x100b416c8), 11: (0x100a53ba4, 0x100b416c8),
    12: (None, 0x100b416c8), 13: (0x100a97a88, 0x100b416d0),
    14: (0x100a5d310, 0x100b416c0), 16: (0x100a57ce0, 0x100b416c0),
    17: (0x100aa43b4, 0x100b416c0), 19: (0x100a9af08, 'zero'),
    20: (0x100a694e0, 0x100b416d8), 21: (0x100b2f6c0, 0x100b41688),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('binary', 'preset', 'archive', 'output'):
        parser.add_argument(name, type=Path)
    parser.add_argument('--render-rate', type=float)
    parser.add_argument('--base-rate', type=int, default=44100)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Commercial inputs must remain outside the repository')
    if args.output.exists():
        parser.error('Fresh private output required')
    raw = args.binary.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Unverified binary version')
    if struct.unpack_from('<I', raw)[0] != 0xfeedfacf:
        raise ValueError('Thin Mach-O64 required')
    segments, cursor = [], 32
    for _ in range(struct.unpack_from('<I', raw, 16)[0]):
        command, size = struct.unpack_from('<II', raw, cursor)
        if size < 8 or cursor + size > len(raw):
            raise ValueError('Invalid load command')
        if command == 0x19:
            vm, _, offset, length = struct.unpack_from('<4Q', raw, cursor + 24)
            segments.append((vm, offset, length))
        cursor += size

    def floats(address, count):
        matches = [(offset + address - vm) for vm, offset, length in segments
                   if vm <= address and address + count * 4 <= vm + length]
        if len(matches) != 1:
            raise ValueError('Unique file-backed data mapping required')
        return list(struct.unpack_from('<' + 'f' * count, raw, matches[0]))

    spec = importlib.util.spec_from_file_location('microphone_fxp', Path(__file__).with_name('pianoteq-inspect-fxp.py'))
    fxp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fxp)
    preset = fxp.inspect(args.preset, True)
    archive = json.loads(args.archive.read_text())
    if archive['sources']['presetSha256'] != preset['sha256']:
        raise ValueError('Archive and microphone preset differ')
    output = [field['value'] for field in preset['decoded_tail']['fields'] if field['object_offset'] == 0x1760]
    if len(output) != 1 or output[0]['kind'] != 3:
        raise ValueError('Supported microphone output state required')
    registry = []
    for identity, (ordinates, controls) in PLANS.items():
        mix, amount = ((0.5, 0.5) if controls == 'half' else
                       (0.0, 0.0) if controls == 'zero' else floats(controls, 2))
        registry.append({'id': identity, 'mix': mix, 'amount': amount,
            'curve': {'x': floats(0x100a87150, 200), 'y': floats(ordinates, 200) if ordinates is not None else [0.0] * 200,
                      'dimensions': 1, 'mode': 0, 'logX': 0}})
    archive['microphones'] = {'schema': 1, 'output': output[0], 'registry': registry,
        'soloMicrophone': 0, 'soloMicrophoneSource': 'no-prefs-default',
        'binarySha256': EXPECTED, 'nativeRuntimeTablesUsedForExport': False}
    if args.render_rate is not None:
        if not math.isfinite(args.render_rate) or args.render_rate <= 0 or not 0 < args.base_rate <= 0xffffffff:
            raise ValueError('Finite positive explicit render context required')
        archive['runtimeRates'] = {'baseRate': args.base_rate, 'renderRate': args.render_rate,
                                  'source': 'explicit-render-configuration'}
    with open(args.output, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as stream:
        json.dump(archive, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'binarySha256': EXPECTED, 'presetSha256': preset['sha256'],
                     'registryIds': list(PLANS), 'outputSha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
