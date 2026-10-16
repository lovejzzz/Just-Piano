"""Original short A4 stimulus with a partial pedal then pedal-up."""
import argparse
from pathlib import Path
from pianoteq_write_repeat_fixture import vlq


def fixture(value):
    assert 0 <= value <= 127
    events = [(0, [0xb0, 64, value]), (19, [0x90, 69, 96]),
              (77, [0x80, 69, 0]), (90, [0xb0, 64, 0]), (192, [0xff, 0x2f, 0])]
    track, previous = bytearray(), 0
    for tick, message in events:
        track += vlq(tick - previous) + bytes(message)
        previous = tick
    return (b'MThd' + (6).to_bytes(4, 'big') + bytes.fromhex('0000000101e0') +
            b'MTrk' + len(track).to_bytes(4, 'big') + track)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--value', type=int, choices=range(128), default=64)
    args = parser.parse_args()
    with args.output.open('xb') as output:
        output.write(fixture(args.value))
