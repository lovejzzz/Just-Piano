#!/usr/bin/env python3
"""Read-only structural inspector for observed Pianoteq 9.2.5 type-0 FXP.

Outputs structure, lengths and hashes; never exports coefficient payloads.
Unknown version/branch/schema is rejected instead of guessed.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path


class Reader:
    def __init__(self, data, start=0, end=None):
        self.data, self.pos, self.end = data, start, len(data) if end is None else end

    def take(self, count):
        if count < 0 or count > self.end - self.pos:
            raise ValueError(f'truncated field at {self.pos:#x}, length {count}')
        start = self.pos
        self.pos += count
        return self.data[start:self.pos]

    def u32(self):
        return struct.unpack('<I', self.take(4))[0]

    def string(self):
        return self.take(self.u32()).decode('utf-8')

    def chunk(self, marker):
        start = self.pos
        if self.take(4) != marker.encode('ascii'):
            raise ValueError(f'expected {marker} at {start:#x}')
        size = self.u32()
        self.take(size)
        return Reader(self.data, start + 8, start + 8 + size), {
            'tag': marker, 'header_offset': start, 'payload_offset': start + 8,
            'payload_bytes': size, 'end_offset': start + 8 + size,
        }


def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


def read_float(reader):
    return struct.unpack('<f', reader.take(4))[0]


def read_vector(reader, kind='f'):
    count = reader.u32()
    if count > 1_000_000:
        raise ValueError('oversized vector')
    return list(struct.unpack('<' + kind * count, reader.take(4 * count)))


def read_curve(reader):
    """FUN_1000b1090, modern compressed branch and explicit vector branches."""
    start = reader.pos
    version = reader.u32()
    if version >= 0x8004:
        raise ValueError(f'unsupported curve version {version:#x} at {start:#x}')
    base = version & ~0x8000
    compressed = bool(version & 0x8000) or version == 4
    if compressed:
        if base not in (3, 4):
            raise ValueError('unsupported compressed curve branch')
        flags = reader.take(1)[0]
        if flags & ~0x78:
            raise ValueError('invalid compressed X flags')
        if flags & 8:
            xs = []
        elif flags & 16:
            xs = [read_float(reader)]
        else:
            count = reader.u32()
            if count > 1_000_000:
                raise ValueError('oversized curve X')
            if flags & 32:
                first, step = read_float(reader), read_float(reader)
                xs = [first] if count else []
                for _ in range(1, count):
                    xs.append(f32(xs[-1] + step))
            else:
                xs = [read_float(reader) for _ in range(count)]
        indices = [] if flags & 64 else [reader.u32() for _ in xs]
        count = reader.u32()
        if count > 1_000_000:
            raise ValueError('oversized curve Y')
        ys = []
        while len(ys) < count:
            value = read_float(reader)
            ys.append(value)
            if len(ys) == count:
                break
            run = reader.take(1)[0]
            amount = run & 127
            if len(ys) + amount > count:
                raise ValueError('curve Y run exceeds size')
            if run & 128:
                ys.extend([value] * amount)
            else:
                ys.extend(read_float(reader) for _ in range(amount))
    else:
        if base >= 4:
            raise ValueError('unsupported plain curve branch')
        xs, ys = read_vector(reader), read_vector(reader)
        indices = read_vector(reader, 'I') if base >= 2 else []
    if len(xs) != len(ys):
        raise ValueError(f'curve X/Y mismatch at {start:#x}')
    return {'version': version, 'x': xs, 'y': ys, 'indices': indices,
            'offset': start, 'end_offset': reader.pos}


def read_pair_metadata(reader):
    start = reader.pos
    version = reader.u32()
    if version > 2:
        raise ValueError('unsupported pair metadata version')
    order = [0xf0, 0] + ([0x30] if version > 1 else [])
    order += [0x60, 0x90, 0xc0, 0x120, 0x150, 0x180, 0x1b0]
    pairs = []
    for offset in order:
        pair_version = reader.u32()
        if pair_version > 1:
            raise ValueError('unsupported string pair version')
        pairs.append({'object_offset': offset, 'version': pair_version,
                      'strings': [reader.string(), reader.string()]})
    return {'version': version, 'offset': start, 'end_offset': reader.pos, 'pairs': pairs}


def inspect(path):
    data = path.read_bytes()
    if len(data) < 68 or data[:4] != b'CcnK' or data[8:12] != b'FPCh':
        raise ValueError('only observed FPCh FXP supported')
    outer = Reader(data, 60)
    if outer.take(4) != b'PrVK' or outer.u32() != 0x0200002a:
        raise ValueError('unsupported Pianoteq outer archive')
    archive, xftp = outer.chunk('XFTP')
    if outer.pos != len(data):
        raise ValueError('trailing bytes outside XFTP')
    date, builder = archive.string(), archive.string()
    expected_digest = archive.take(16)
    inner, dlla = archive.chunk('dlla')
    if archive.pos != archive.end:
        raise ValueError('trailing bytes outside dlla')
    actual_digest = hashlib.md5(data[inner.pos:inner.end]).digest()
    if actual_digest != expected_digest:
        raise ValueError('dlla payload MD5 mismatch')
    metadata, tdtm = inner.chunk('tdtM')
    strings = [metadata.string() for _ in range(5)]
    build_id = metadata.u32()
    original_preset = metadata.string()
    kind = metadata.u32()
    extra_length = metadata.u32()
    metadata.take(extra_length)
    if metadata.pos != metadata.end or kind != 0:
        raise ValueError('unsupported metadata/type branch')
    model, prsu = inner.chunk('PrsU')
    if inner.pos != inner.end:
        raise ValueError('unexpected chunk after PrsU')
    version = model.u32()
    if version != 79:
        raise ValueError('only PrsU version 79 inspected')
    identity = [model.string() for _ in range(3)]
    flags = model.u32()
    if flags > 63:
        raise ValueError('invalid model flags')
    chunks = [xftp, dlla, tdtm, prsu]
    lean = bool(flags & 1)
    if lean:
        if model.pos != model.end:
            raise ValueError('unexpected bytes after lean identity')
        detail_start = model.pos
    else:
        branch = model.u32()  # FUN_10015fe58 width verified by following prom offset.
        if branch != 0:
            raise ValueError('alternate detailed-state branch not decoded')
        for tag in ['prom', 'ryal', 'olos']:
            _, detail = model.chunk(tag)
            chunks.append(detail)
        detail_start = model.pos
    return {
        'path': str(path.resolve()), 'file_bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(), 'date': date, 'builder': builder,
        'metadata': {'preset': strings[0], 'author': strings[2],
                     'original_preset': original_preset, 'build_id': build_id,
                     'extra_bytes': extra_length},
        'model': {'version': version, 'identity': identity, 'flags': flags, 'lean': lean,
                  'undecoded_tail_offset': detail_start,
                  'undecoded_tail_bytes': model.end - detail_start},
        'chunks': chunks, 'dlla_payload_md5_verified': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--compare-first', action='store_true',
                        help='compare undecoded tails by relative byte offset; no values exported')
    args = parser.parse_args()
    rows = [inspect(path) for path in args.files]
    if args.compare_first:
        first = rows[0]
        baseline = Path(first['path']).read_bytes()[first['model']['undecoded_tail_offset']:]
        for row in rows:
            current = Path(row['path']).read_bytes()[row['model']['undecoded_tail_offset']:]
            difference = [i for i, (a, b) in enumerate(zip(baseline, current)) if a != b]
            row['relative_tail_comparison'] = {
                'baseline_sha256': first['sha256'], 'same_length': len(baseline) == len(current),
                'different_bytes_in_common_extent': len(difference),
                'first_difference': min(difference) if difference else None,
                'last_difference': max(difference) if difference else None,
            }
    print(json.dumps(rows, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
