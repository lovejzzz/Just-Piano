#!/usr/bin/env python3
"""Read-only structural inspector for observed Pianoteq 9.2.5 type-0 FXP.

Outputs structure, lengths and hashes by default. --include-values is for local research only.
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
    if xs and len(ys) % len(xs) != 0:
        raise ValueError(f'curve X/Y mismatch at {start:#x}: X={len(xs)} Y={len(ys)}, end={reader.pos:#x}')
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


def read_release_config(reader):
    version = reader.u32()
    if version > 1:
        raise ValueError('unsupported release config version')
    return {'version': version, 'integers': [reader.u32(), reader.u32()],
            'floats': [read_float(reader), read_float(reader)]}


def read_midi_config(reader):
    version = reader.u32()
    if version != 4:
        raise ValueError('only MIDI config version4 decoded')
    value = {'version': version, 'float': read_float(reader),
             'notes': [reader.u32(), reader.u32()], 'flag': reader.take(1)[0],
             'range': [reader.u32(), reader.u32()], 'map': read_vector(reader, 'I'),
             'name': reader.string(), 'extra': [reader.u32(), reader.u32()]}
    return value


def read_tuning(reader):
    version, kind = reader.u32(), reader.u32()
    if version != 2 or kind in (999998, 999999):
        raise ValueError('unsupported tuning branch')
    return {'version': version, 'kind': kind, 'name': reader.string(),
            'values': read_vector(reader), 'controls': [reader.u32(), reader.u32()],
            'midi': read_midi_config(reader)}


def read_index_curve(reader):
    version = reader.u32()
    if version > 1:
        raise ValueError('unsupported index curve version')
    return {'version': version, 'index': reader.u32(), 'curve': read_curve(reader)}


def read_effect(reader):
    version = reader.u32()
    if version != 2:
        raise ValueError('only effect version2 decoded')
    enabled = reader.u32()
    pair_version = reader.u32()
    if pair_version > 1:
        raise ValueError('unsupported effect identity version')
    return {'version': version, 'enabled': enabled,
            'identity': [reader.string(), reader.string()],
            'controls': [read_float(reader) for _ in range(9)], 'name': reader.string()}


def read_control_470(reader):
    version = reader.u32()
    if version != 7:
        raise ValueError(f'only 470 control version7 decoded, got {version}')
    return {'version': version, 'a': read_float(reader), 'b': read_float(reader),
            'curves_ab': [read_curve(reader), read_curve(reader)],
            'c': read_float(reader), 'curve_c': read_curve(reader),
            'release': read_release_config(reader), 'd': read_float(reader)}


def read_control_588(reader):
    version = reader.u32()
    if version != 3:
        raise ValueError('only 588 control version3 decoded')
    return {'version': version, 'scalars': [read_float(reader) for _ in range(3)],
            'curves': [read_curve(reader) for _ in range(3)],
            'extra': [read_float(reader), read_float(reader)]}


def read_control_9a8(reader):
    version = reader.u32()
    if version != 10:
        raise ValueError('only 9a8 control version10 decoded')
    value = {'version': version, 'scalars': [read_float(reader) for _ in range(5)],
             'vector': read_vector(reader), 'curves': [read_curve(reader) for _ in range(4)]}
    grid_version, grid_count = reader.u32(), reader.u32()
    if grid_version > 1 or grid_count > 1_000_000:
        raise ValueError('unsupported grid version/size')
    value['grid'] = [{'scalar': read_float(reader), 'curve': read_curve(reader)}
                     for _ in range(grid_count)]
    value['d8'] = read_float(reader)
    value['curve_e0'] = read_curve(reader)
    value['releases'] = [read_release_config(reader) for _ in range(5)]
    value['s10'] = read_float(reader)
    value['curve170'] = read_curve(reader)
    value['s280'] = read_float(reader)
    value['curve288'] = read_curve(reader)
    return value


def read_1450(reader):
    version = reader.u32()
    if version > 1:
        raise ValueError('unsupported1450 version')
    return {'version': version, 'mode': reader.u32(), 'scalar': read_float(reader),
            'indices': [reader.u32(), reader.u32()],
            'floats': [read_float(reader) for _ in range(4)]}


def read_1470(reader):
    version = reader.u32()
    if version != 3:
        raise ValueError('only1470 version3 decoded')
    return {'version': version, 'a': read_float(reader), 'curve_a': read_curve(reader),
            'b': read_float(reader), 'curve_b': read_curve(reader)}


def read_1590(reader):
    version = reader.u32()
    if version > 1:
        raise ValueError('unsupported1590 version')
    return {'version': version, 'scalars': [read_float(reader), read_float(reader)]}


def read_15a8(reader):
    version = reader.u32()
    if version != 4:
        raise ValueError('only15a8 version4 decoded')
    return {'version': version, 'scalars': [read_float(reader) for _ in range(4)],
            'flag': reader.take(1)[0], 'scalar14': read_float(reader),
            'curve18': read_curve(reader), 'scalar68': read_float(reader),
            'curve70': read_curve(reader),
            'scalarsc0': [read_float(reader), read_float(reader)],
            'curvec8': read_curve(reader), 'scalar118': read_float(reader),
            'flags': list(reader.take(2)), 'scalar120': read_float(reader),
            'flag124': reader.take(1)[0]}


def read_effect_slot(reader):
    version = reader.u32()
    if version != 4:
        raise ValueError('only effect slot version4 decoded')
    return {'version': version, 'integers': [reader.u32() for _ in range(4)],
            'values': read_vector(reader)}


def read_174c(reader):
    version = reader.u32()
    if version > 1:
        raise ValueError('unsupported174c version')
    return {'version': version, 'mode': reader.u32(),
            'scalars': [read_float(reader) for _ in range(3)]}


def read_output(reader):
    version, kind, mode = reader.u32(), reader.u32(), reader.u32()
    if version != 3 or not 1 <= kind <= 4:
        raise ValueError('unsupported output branch')
    matrix_version = reader.u32()
    if matrix_version != 2:
        raise ValueError('only output matrix version2 decoded')
    count = reader.u32()
    if count > 64:
        raise ValueError('unexpected output record count')
    records = []
    for _ in range(count):
        record_version = reader.u32()
        if record_version != 5:
            raise ValueError('only output record version5 decoded')
        record = {'version': record_version, 'type': reader.u32(),
                  'position': read_vector(reader),
                  'angles': [read_float(reader), read_float(reader)], 'control': reader.u32()}
        sub_count = reader.u32()
        if not 1 <= sub_count <= 8:
            raise ValueError('unexpected output sub-record count')
        subrecords = []
        for _ in range(sub_count):
            sub_version = reader.u32()
            if sub_version > 1:
                raise ValueError('unsupported output sub-record version')
            subrecords.append({'version': sub_version,
                               'floats': [read_float(reader) for _ in range(4)],
                               'integers': [reader.u32() for _ in range(4)]})
        record['subrecords'] = subrecords
        record['flags'] = [reader.u32(), reader.u32()]
        records.append(record)
    value = {'version': version, 'kind': kind, 'mode': mode, 'matrix_version': matrix_version,
             'records': records, 'flags': [reader.u32(), reader.u32()]}
    pair_count = reader.u32()
    if pair_count > 64:
        raise ValueError('oversized output pairs')
    pairs = []
    for _ in range(pair_count):
        pair_version = reader.u32()
        if pair_version > 1:
            raise ValueError('unsupported output pair version')
        pairs.append({'version': pair_version, 'floats': [read_float(reader), read_float(reader)]})
    value['pairs'] = pairs
    position_version = reader.u32()
    if position_version > 1:
        raise ValueError('unsupported output position version')
    value['position'] = read_vector(reader)
    value['position_extra'] = [read_float(reader), read_float(reader)]
    value['extra'] = [read_float(reader), read_float(reader)]
    return value


def read_named_pairs(reader):
    version, count = reader.u32(), reader.u32()
    if version > 1 or count > 1_000_000:
        raise ValueError('unsupported named pairs')
    pairs = []
    for _ in range(count):
        pair_version = reader.u32()
        if pair_version > 1:
            raise ValueError('unsupported name pair version')
        pairs.append({'version': pair_version, 'strings': [reader.string(), reader.string()]})
    return {'version': version, 'pairs': pairs}


def read_known_tail(reader):
    """Straight-line version79 path in FUN_10055ec14; stops at unknown helper."""
    start = reader.pos
    fields = []
    def field(offset, kind):
        begin = reader.pos
        if kind == 'curve':
            value = read_curve(reader)
        elif kind == 'f32':
            value = read_float(reader)
        elif kind == 'u32':
            value = reader.u32()
        elif kind in ('vector_f', 'vector_I'):
            value = read_vector(reader, kind[-1])
        elif kind == 'release':
            value = read_release_config(reader)
        elif kind == 'tuning':
            value = read_tuning(reader)
        elif kind == 'index_curve':
            value = read_index_curve(reader)
        elif kind == 'effect':
            value = read_effect(reader)
        elif kind == 'control470':
            value = read_control_470(reader)
        elif kind == 'control588':
            value = read_control_588(reader)
        elif kind == 'control9a8':
            value = read_control_9a8(reader)
        elif kind in ('1450', '1470', '1590', '15a8', '174c'):
            value = globals()['read_' + kind](reader)
        elif kind == 'effect_slot':
            value = read_effect_slot(reader)
        elif kind == 'output':
            value = read_output(reader)
        elif kind == 'named_pairs':
            value = read_named_pairs(reader)
        elif kind == 'float13_int2':
            version = reader.u32()
            if version > 1: raise ValueError('unsupported final config')
            value = {'version': version, 'floats': [read_float(reader) for _ in range(13)],
                     'integers': [reader.u32(), reader.u32()]}
        else:
            raise ValueError(kind)
        fields.append({'object_offset': offset, 'kind': kind, 'offset': begin,
                       'end_offset': reader.pos, 'value': value})
    metadata = read_pair_metadata(reader)
    field(0x1028, 'f32')
    field(0x1030, 'curve')
    for offset, kind in [(0x1530, 'vector_I'), (0x1548, 'vector_f'),
                         (0x1560, 'vector_f'), (0x1578, 'vector_I'),
                         (0x1080, 'f32'), (0x1084, 'u32'), (0x10a8, 'u32'),
                         (0x10ac, 'f32'), (0x1110, 'f32'), (0x1118, 'curve'),
                         (0x1100, 'release'), (0x1168, 'f32'), (0x116c, 'f32'),
                         (0x1170, 'curve'), (0x11c0, 'u32'),
                         (0x1218, 'f32'), (0x121c, 'f32'), (0x1270, 'release'),
                         (0x1280, 'f32'), (0x1288, 'curve'), (0x12e0, 'curve'),
                         (0x1330, 'u32'), (0x1398, 'f32'), (0x139c, 'u32'),
                         (0x13a4, 'u32'), (0x13a8, 'f32'), (0x13b0, 'curve'),
                         (0x1400, 'curve'), (0x464, 'u32'), (0x13a0, 'f32'),
                         (0x1334, 'f32'), (0x10b0, 'curve'), (0x1220, 'curve'),
                         (0x1338, 'curve')]:
        field(offset, kind)
    field(0x1388, 'release')
    field(0x318, 'tuning')
    for offset, kind in [(0x3a8, 'u32'), (0x3b0, 'curve'), (0x3ac, 'u32'),
                         (0x45c, 'u32'), (0x46c, 'f32'), (0x468, 'u32'),
                         (0x460, 'u32'), (0x400, 'index_curve'),
                         (0x458, 'f32'), (0x690, 'f32'), (0x698, 'curve'),
                         (0x6e8, 'curve'), (0x788, 'curve'), (0x738, 'curve'),
                         (0x7d8, 'f32'), (0x7e0, 'curve'), (0x7dc, 'f32'),
                         (0x830, 'curve'), (0x880, 'release'), (0x890, 'release'),
                         (0x8a0, 'f32'), (0x8a8, 'curve'), (0x8f8, 'f32'),
                         (0x900, 'curve'), (0x950, 'f32'), (0x958, 'curve'),
                         (0xc80, 'f32'), (0xc88, 'curve'), (0xcd8, 'f32'),
                         (0xce0, 'curve'), (0xd30, 'curve'), (0xd80, 'u32'),
                         (0xd88, 'curve'), (0xdd8, 'curve'), (0xe28, 'curve'),
                         (0xe78, 'curve'), (0xec8, 'f32'), (0xed0, 'curve'),
                         (0xf34, 'u32'), (0xf38, 'f32'), (0xf3c, 'u32'),
                         (0xf20, 'f32'), (0xf24, 'f32'), (0xf2c, 'f32'),
                         (0xf28, 'f32'), (0xf30, 'u32'), (0xf40, 'f32'),
                         (0xf48, 'curve'), (0xf98, 'f32'), (0x11c4, 'f32'),
                         (0x11c8, 'curve')]:
        field(offset, kind)
    field(0xfa0, 'effect')
    for offset, kind in [(0x1748, 'f32'), (0x1018, 'f32'), (0x101c, 'f32'),
                         (0x1020, 'f32'), (0x1024, 'u32'),
                         (0x470, 'control470'), (0x588, 'control588')]:
        field(offset, kind)
    field(0x9a8, 'control9a8')
    for offset, kind in [(0x1450, '1450'), (0x1470, '1470'), (0x1518, 'vector_I'),
                         (0x1590, '1590'), (0x1598, 'u32'), (0x159c, 'u32'),
                         (0x15a0, 'u32'), (0x15a4, 'u32'), (0x15a8, '15a8'),
                         (0x16d0, 'effect_slot'), (0x16f8, 'effect_slot'),
                         (0x1720, 'effect_slot'), (0x174c, '174c')]:
        field(offset, kind)
    field(0x1760, 'output')
    field(0x17c8, 'named_pairs')
    field(0x183c, 'u32')
    if fields[-1]['value'] != 0:
        field(0x17fc, 'float13_int2')
    return {'offset': start, 'end_offset': reader.pos, 'metadata': metadata,
            'fields': fields, 'next_unknown_reader': None if reader.pos == reader.end else 'unexpected_suffix'}


def summarize_tail(tail):
    fields = []
    for field in tail['fields']:
        row = {key: value for key, value in field.items() if key != 'value'}
        value = field['value']
        if field['kind'] == 'curve':
            row.update(version=value['version'], x_count=len(value['x']),
                       y_count=len(value['y']), index_count=len(value['indices']))
        elif field['kind'].startswith('vector_'):
            row['count'] = len(value)
        fields.append(row)
    curves = []
    def inventory(value, path):
        if isinstance(value, dict):
            if {'x', 'y', 'indices', 'version', 'offset', 'end_offset'} <= value.keys():
                curves.append({'path': path, 'offset': value['offset'],
                               'end_offset': value['end_offset'], 'version': value['version'],
                               'x_count': len(value['x']), 'y_count': len(value['y']),
                               'index_count': len(value['indices'])})
            else:
                for key, child in value.items():
                    inventory(child, path + '/' + key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                inventory(child, path + '/' + str(index))
    for field in tail['fields']:
        inventory(field['value'], 'A+' + hex(field['object_offset']))
    return {**tail, 'fields': fields, 'curve_inventory': curves,
            'curve_count': len(curves), 'curve_y_values': sum(c['y_count'] for c in curves)}


def inspect(path, include_values=False):
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
    decoded_tail = None if lean else read_known_tail(Reader(data, detail_start, model.end))
    if decoded_tail and decoded_tail['end_offset'] != model.end:
        raise ValueError('unconsumed detailed PrsU suffix')
    return {
        'decoded_tail': (decoded_tail if include_values else summarize_tail(decoded_tail)) if decoded_tail else None,
        'path': str(path.resolve()), 'file_bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(), 'date': date, 'builder': builder,
        'metadata': {'preset': strings[0], 'author': strings[2],
                     'original_preset': original_preset, 'build_id': build_id,
                     'extra_bytes': extra_length},
        'model': {'version': version, 'identity': identity, 'flags': flags, 'lean': lean,
                  'detailed_tail_offset': detail_start,
                  'detailed_tail_bytes': model.end - detail_start,
                  'undecoded_suffix_offset': decoded_tail['end_offset'] if decoded_tail else detail_start,
                  'undecoded_suffix_bytes': model.end - (decoded_tail['end_offset'] if decoded_tail else detail_start)},
        'chunks': chunks, 'dlla_payload_md5_verified': True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--compare-first', action='store_true',
                        help='compare undecoded tails by relative byte offset; no values exported')
    parser.add_argument('--include-values', action='store_true',
                        help='include full decoded values; keep this output local, not in the repository')
    args = parser.parse_args()
    rows = [inspect(path, args.include_values) for path in args.files]
    if args.compare_first:
        first = rows[0]
        baseline = Path(first['path']).read_bytes()[first['model']['detailed_tail_offset']:]
        for row in rows:
            current = Path(row['path']).read_bytes()[row['model']['detailed_tail_offset']:]
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
