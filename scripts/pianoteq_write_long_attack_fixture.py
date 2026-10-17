"""Original five-note held chord for testing a one-second attack transition."""
import argparse
from pathlib import Path
from pianoteq_write_repeat_fixture import vlq


def fixture():
    events = [(0, [0xb0, 64, 0])]
    events += [(96 + i * 4, [0x90, 69 + i, 96]) for i in range(5)]
    events += [(1800 + i * 4, [0x80, 69 + i, 0]) for i in range(5)]
    events += [(2400, [0xff, 0x2f, 0])]
    track = bytearray()
    previous = 0
    for tick, message in events:
        track += vlq(tick - previous) + bytes(message)
        previous = tick
    return b'MThd' + (6).to_bytes(4, 'big') + bytes.fromhex('0000000101e0') + b'MTrk' + len(track).to_bytes(4, 'big') + track


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with args.output.open('xb') as output:
        output.write(fixture())
