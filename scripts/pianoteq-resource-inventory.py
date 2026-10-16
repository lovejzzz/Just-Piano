#!/usr/bin/env python3
"""Read-only Pianoteq RSRC0100 directory and integrity inspection.

No member payload is exported. XOR is the observed container byte encoding;
this tool does not modify application, license or integrity-check behavior.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def read_base_prefix(data, start, end, module):
    """Version89 FUN_10059f2cc path through B+0xfc8; preserves unknown suffix."""
    def require(value, expected):
        if value != expected:
            raise ValueError('unsupported base-model branch')

    def grid(reader):
        version, count = reader.u32(), reader.u32()
        if version > 1 or count > 1_000_000:
            raise ValueError('unsupported base grid')
        return {'version': version, 'rows': [
            {'coordinate': module.read_float(reader), 'curve': module.read_curve(reader)}
            for _ in range(count)]}

    reader = module.Reader(data, start, end)
    require(reader.u32(), 89)
    require(reader.u32(), 7)
    metadata_type = reader.u32()
    strings = [reader.string() for _ in range(11)]
    metadata_integer = reader.u32()
    metadata_vector = module.read_vector(reader, 'I')
    require(reader.u32(), 0)  # Only the observed empty nested metadata collection.
    fields = []

    def field(offset, kind):
        begin = reader.pos
        if kind == 'u':
            value = reader.u32()
        elif kind == 'f':
            value = module.read_float(reader)
        elif kind == 'c':
            value = module.read_curve(reader)
        elif kind in ('vi', 'vf'):
            value = module.read_vector(reader, 'I' if kind == 'vi' else 'f')
        elif kind == 'release':
            value = module.read_release_config(reader)
        elif kind in ('compound', 'vecpair'):
            version = reader.u32()
            if version > 1:
                raise ValueError('unsupported base compound version')
            if kind == 'compound':
                value = {'version': version,
                         'curves': [module.read_curve(reader) for _ in range(7)],
                         'grids': [grid(reader), grid(reader)]}
            else:
                value = {'version': version,
                         'vectors': [module.read_vector(reader), module.read_vector(reader)]}
        else:
            raise ValueError('unknown schema kind')
        fields.append({'object_offset': offset, 'kind': kind, 'offset': begin,
                       'end_offset': reader.pos, 'value': value})

    schema = [
        (0x158, 'u'), (0x15c, 'u'), (0x1c70, 'vi'), (0x160, 'f'),
        (0x164, 'f'), (0x688, 'c'), (0x168, 'f'), (0x6d8, 'c'),
        (0x728, 'c'), (0x16d8, 'c'), (0x1728, 'u'), (0x1730, 'c'),
        (0x1780, 'f'), (0x16c, 'f'), (0x170, 'f'), (0x178, 'c'),
        (0x1c8, 'compound'), (0x428, 'vecpair'), (0x458, 'c'), (0x4b0, 'vf'),
        (0x4c8, 'vf'), (0x4e0, 'c'), (0x530, 'c'), (0x580, 'c'),
        (0x4a8, 'f'), (0x5d0, 'release'), (0x5e0, 'c'), (0x630, 'f'),
        (0x634, 'f'), (0x20a8, 'f'), (0x20b0, 'c'), (0x1b20, 'f'),
        (0x638, 'c'), (0x778, 'c'), (0x818, 'vf'), (0x7c8, 'c'),
        (0x830, 'c'), (0x880, 'c'), (0x8d0, 'c'), (0x920, 'c'),
        (0x970, 'c'), (0x9c0, 'c'), (0xa10, 'c'), (0xab0, 'c'),
        (0xa60, 'c'), (0xb00, 'f'), (0xb04, 'f'), (0xb08, 'c'),
        (0xb58, 'c'), (0xba8, 'f'), (0xbb0, 'c'), (0xc00, 'c'),
        (0xc50, 'f'), (0xc58, 'c'), (0xca8, 'c'), (0xcf8, 'c'),
        (0xd48, 'c'), (0xd98, 'c'), (0xde8, 'c'), (0xe38, 'c'),
        (0xe88, 'c'), (0xed8, 'c'), (0xf28, 'c'), (0xf78, 'c'),
        (0xfc8, 'c'),
    ]
    for offset, kind in schema:
        field(offset, kind)
    return {'version': 89, 'metadata_type': metadata_type, 'strings': strings,
            'metadata_integer': metadata_integer, 'metadata_vector': metadata_vector,
            'fields': fields, 'next_offset': reader.pos, 'unparsed_suffix_bytes': end - reader.pos}


def inspect_bank(data):
    """Observed D4 bank structure; opaque model/preset contents remain private."""
    import importlib.util
    module_path = Path(__file__).with_name('pianoteq-inspect-fxp.py')
    spec = importlib.util.spec_from_file_location('fxp_inspector', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    reader = module.Reader(data)
    header = [reader.u32() for _ in range(3)]
    if header != [0x01020305, 67, 1]:
        raise ValueError('only observed version67 D4 bank decoded')
    expected = [0xf38cc100, 0xf38cb100, 0xa46e8f22, 0x19475024, 0x56710d03, 0x56710d02]
    chunks = []
    models, presets, extra_records = [], [], []
    for marker in expected:
        offset = reader.pos
        if reader.u32() != marker:
            raise ValueError('unexpected bank block')
        size = reader.u32()
        reader.take(size)
        payload = module.Reader(data, offset + 8, offset + 8 + size)
        chunks.append({'tag': hex(marker), 'offset': offset, 'bytes': size, 'end_offset': reader.pos})
        if marker == 0xf38cb100:
            count = payload.u32()
            if count > 1000:
                raise ValueError('oversized model count')
            for _ in range(count):
                begin = payload.pos
                if payload.u32() != 0x89238742:
                    raise ValueError('unexpected model block')
                length = payload.u32()
                body = module.Reader(data, payload.pos, payload.pos + length)
                payload.take(length)
                identity, source = body.string(), body.string()
                model_start = body.pos
                version = body.u32()
                base = read_base_prefix(data, model_start, payload.pos, module)
                base_summary = module.summarize_tail({'fields': base['fields']})
                for curve in base_summary['curve_inventory']:
                    curve['path'] = 'B+' + curve['path'].removeprefix('A+')
                models.append({'base_prefix': {**base_summary, 'end_offset': base['next_offset'], 'unparsed_suffix_bytes': base['unparsed_suffix_bytes']}, 'offset': begin, 'bytes': length, 'identity': identity,
                               'source': source, 'model_reader_offset': model_start,
                               'model_version': version, 'end_offset': payload.pos})
            if payload.pos != payload.end:
                raise ValueError('unconsumed model list bytes')
        elif marker == 0x19475024:
            count = payload.u32()
            if count > 10_000:
                raise ValueError('oversized preset count')
            for _ in range(count):
                begin = payload.pos
                if payload.u32() != 0x83f873a7:
                    raise ValueError('unexpected preset block')
                length = payload.u32()
                body = module.Reader(data, payload.pos, payload.pos + length)
                payload.take(length)
                name = body.string()
                kind, author, comment = body.u32(), body.string(), body.string()
                extra_bytes = body.u32()
                body.take(extra_bytes)
                model_version = body.u32()
                if kind != 0 or model_version != 79:
                    raise ValueError('unsupported factory preset model branch')
                identities = [body.string() for _ in range(3)]
                flags, branch = body.u32(), body.u32()
                if flags != 0 or branch != 0:
                    raise ValueError('unsupported factory preset flags')
                for tag in ['prom', 'ryal', 'olos']:
                    body.chunk(tag)
                details = module.read_known_tail(body)
                if body.pos != body.end:
                    raise ValueError('unconsumed factory preset suffix')
                summary = module.summarize_tail(details)
                presets.append({'model_identity': identities[0], 'model_version': model_version,
                                'type': kind, 'extra_bytes': extra_bytes,
                                'decoded_field_count': len(details['fields']),
                                'decoded_curve_count': summary['curve_count'],
                                'decoded_curve_y_values': summary['curve_y_values'],
                                'decoded_end_offset': body.pos, 'unparsed_suffix_bytes': 0,
                                'name': name, 'offset': begin, 'bytes': length,
                                'body_offset': begin + 8, 'end_offset': payload.pos})
            if payload.pos != payload.end:
                raise ValueError('unconsumed preset list bytes')
        elif marker == 0x56710d02:
            count = payload.u32()
            if count > 1000:
                raise ValueError('oversized extra-record count')
            for _ in range(count):
                name = payload.string()
                record_end = payload.u32()
                record_start = payload.pos
                if record_end < record_start or record_end > payload.end:
                    raise ValueError('invalid extra-record end offset')
                if payload.take(4) != b'KVR2':
                    raise ValueError('unexpected extra-record magic')
                version = payload.u32()
                extra_records.append({'name': name, 'offset': record_start,
                                      'end_offset': record_end, 'bytes': record_end - record_start,
                                      'version': version, 'unparsed_body_bytes': record_end - payload.pos})
                payload.take(record_end - payload.pos)
            if payload.pos != payload.end:
                raise ValueError('unconsumed extra-record list suffix')
    footer_size = reader.u32()
    reader.take(footer_size)
    if reader.pos != reader.end:
        raise ValueError('unconsumed bank trailer')
    return {'header_words': header, 'chunks': chunks, 'models': models, 'presets': presets,
            'extra_records': extra_records, 'footer_bytes': footer_size, 'unconsumed_bytes': reader.end - reader.pos}


def inspect(path, bank_name=None):
    raw = path.read_bytes()
    data = bytes(value ^ 0x55 for value in raw)
    if data[:16] != b'Modartt RSRC0100':
        raise ValueError('unsupported resource header')
    pos = 16
    def take(count):
        nonlocal pos
        if count < 0 or count > len(data) - pos:
            raise ValueError('resource directory exceeds file')
        value = data[pos:pos + count]
        pos += count
        return value
    def u32():
        return struct.unpack('<I', take(4))[0]
    count = u32()
    if count > 1_000_000:
        raise ValueError('oversized resource directory')
    rows = []
    for _ in range(count):
        offset, size = u32(), u32()
        digest = take(16).hex()
        name = take(u32()).decode('utf8')
        if offset > len(data) or size > len(data) - offset:
            raise ValueError('member extent exceeds file')
        actual = hashlib.md5(data[offset:offset + size]).hexdigest()
        if actual != digest:
            raise ValueError('member MD5 mismatch: ' + name)
        rows.append({'name': name, 'offset': offset, 'bytes': size,
                     'md5': digest, 'md5_verified': True})
    if not rows or pos > rows[0]['offset']:
        raise ValueError('directory overlaps members')
    if not all(a['offset'] + a['bytes'] == b['offset'] for a, b in zip(rows, rows[1:])):
        raise ValueError('members are not contiguous in directory order')
    bank = None
    if bank_name:
        matches = [row for row in rows if row['name'] == bank_name]
        if len(matches) != 1: raise ValueError('bank member must be unique')
        member = matches[0]
        bank = inspect_bank(data[member['offset']:member['offset'] + member['bytes']])
    return {'bank': bank, 'path': str(path.resolve()), 'file_bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'encoding': 'byte XOR 0x55',
            'header': 'Modartt RSRC0100', 'count': count, 'directory_end': pos,
            'gap_before_payload': rows[0]['offset'] - pos,
            'trailer_bytes': len(data) - rows[-1]['offset'] - rows[-1]['bytes'],
            'verified_member_md5_count': len(rows), 'members': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--bank', help='inspect exact member name; only observed D4 bank version67 supported')
    args = parser.parse_args()
    print(json.dumps(inspect(args.path, args.bank), indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
