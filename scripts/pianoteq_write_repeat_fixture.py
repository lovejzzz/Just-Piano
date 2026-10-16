"""Write an original MIDI stimulus for repeated strikes; no model data."""
import argparse
from pathlib import Path


def vlq(number):
    result = [number & 127]
    number >>= 7
    while number:
        result.insert(0, (number & 127) | 128)
        number >>= 7
    return bytes(result)


def fixture(slow=False):
    if slow:
        events = [(0, [0xb0, 64, 0]), (96, [0x90, 69, 96]), (192, [0x80, 69, 0]),
                  (450, [0x90, 69, 96]), (500, [0x80, 69, 0]), (540, [0xb0, 64, 127]),
                  (900, [0x90, 69, 96]), (950, [0x80, 69, 0]),
                  (1350, [0x90, 69, 96]), (1400, [0x80, 69, 0]), (1450, [0xb0, 64, 0]),
                  (1800, [0x90, 69, 96]), (1900, [0x80, 69, 0]), (2400, [0xff, 0x2f, 0])]
    else:
        events = [(0, [0xb0, 64, 0]), (96, [0x90, 69, 96]), (192, [0x80, 69, 0]),
                  (210, [0x90, 69, 96]), (230, [0x80, 69, 0]), (240, [0xb0, 64, 127]),
                  (260, [0x90, 69, 96]), (280, [0x80, 69, 0]),
                  (300, [0x90, 69, 96]), (350, [0x80, 69, 0]), (400, [0xb0, 64, 0]),
                  (420, [0x90, 69, 96]), (480, [0x80, 69, 0]), (960, [0xff, 0x2f, 0])]
    track = bytearray()
    previous = 0
    for tick, message in events:
        track += vlq(tick - previous) + bytes(message)
        previous = tick
    return b'MThd' + (6).to_bytes(4, 'big') + bytes.fromhex('0000000101e0') + b'MTrk' + len(track).to_bytes(4, 'big') + track


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--slow', action='store_true')
    args = parser.parse_args()
    with args.output.open('xb') as output:
        output.write(fixture(args.slow))
