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


def read_base_metadata_collection(reader, module):
    """FUN_1005c5ec0 -> versioned FUN_10032e5f0 lists of identity records."""
    count = reader.u32()
    if count > 1_000_000:
        raise ValueError('oversized base metadata collection')
    lists = []
    for _ in range(count):
        start, version = reader.pos, reader.u32()
        if version > 1:
            raise ValueError('unsupported base metadata identity-list version')
        record_count = reader.u32()
        if record_count > 1_000_000:
            raise ValueError('oversized base metadata identity list')
        records = []
        for _ in range(record_count):
            record_version = reader.u32()
            if record_version > 1:
                raise ValueError('unsupported base metadata identity-entry version')
            records.append({'version': record_version,
                            'strings': [reader.string() for _ in range(3)],
                            'scalar': module.read_float(reader)})
        lists.append({'version': version, 'offset': start, 'end_offset': reader.pos,
                      'records': records})
    return lists


def read_base_continuation(reader, module, base):
    """Observed v89 subreaders through B+1c58; fail closed on other versions."""
    m, r = module, reader
    # mar_param uses float-pointer indices, so each stored destination offset is 4*i.

    def check(condition):
        if not condition:
            raise ValueError('unsupported base continuation branch or shape')

    def control_2548(r):
        v = r.u32()
        check(v == 14)
        result = {'version': v, 'indexmap': m.read_vector(r, 'I')}
        check(len(result['indexmap']) == 128)
        result['curves'] = [m.read_curve(r) for _ in range(10)]
        result['scalar68'] = m.read_float(r)
        result['curves69'] = [m.read_curve(r) for _ in range(4)]
        result['vectors'] = [m.read_vector(r) for _ in range(4)]
        result['scalar9d'] = m.read_float(r)
        return result

    def curve_list(r):
        v = r.u32()
        check(v == 1)
        x = m.read_vector(r)
        n = r.u32()
        check(n <= 1000000)
        return {'version': v, 'coordinates': x, 'curves': [m.read_curve(r) for _ in range(n)]}

    def control_2a38(r):
        v = r.u32()
        check(v in (9, 10))
        result = {'version': v, 'scalars': [m.read_float(r), m.read_float(r)], 'curves': [m.read_curve(r) for _ in range(4)], 'scalar148': m.read_float(r), 'integer14c': r.u32(), 'scalar154': m.read_float(r), 'curve158': m.read_curve(r), 'curve1f8': m.read_curve(r)}
        result['curves248'] = [m.read_curve(r) for _ in range(3)]
        result['curve1a8'] = m.read_curve(r) if v >= 10 else None
        if v == 9:
            result['native_default_curve1a8'] = 0.0
        result['scalar150'] = m.read_float(r)
        result['curve_list478'] = curve_list(r)
        result['curves338'] = [m.read_curve(r) for _ in range(4)]
        result['vectors'] = [m.read_vector(r), m.read_vector(r)]
        return result

    def mar_param(r):
        start = r.pos
        v = r.u32()
        check(v in (34, 35))
        fields = []

        def F(i, k):
            begin = r.pos
            if k == 'u':
                value = r.u32()
            elif k == 'f':
                value = m.read_float(r)
            elif k == 'c':
                value = m.read_curve(r)
            elif k in ['vf', 'vi']:
                value = m.read_vector(r, 'I' if k == 'vi' else 'f')
            elif k == 'list':
                value = curve_list(r)
            elif k == 'grid':
                ver = r.u32()
                check(ver <= 1)
                n = r.u32()
                check(n <= 1000000)
                value = {'version': ver, 'rows': [{'coordinate': m.read_float(r), 'curve': m.read_curve(r)} for _ in range(n)]}
            fields.append({'object_offset': 4 * i, 'kind': k, 'offset': begin, 'end_offset': r.pos, 'value': value})
        F(898, 'u')
        for i in [900, 906, 912]:
            F(i, 'vf')
        F(0, 'f')
        F(2, 'vi')
        F(8, 'f')
        F(9, 'f')
        F(12, 'c')
        for i in [52, 94, 96]:
            F(i, 'f')
        F(98, 'c')
        F(118, 'f')
        F(95, 'f')
        F(32, 'c')
        for i in [54, 74, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460]:
            F(i, 'c')
        for i in [480, 486, 492]:
            F(i, 'vf')
        F(498, 'f')
        F(500, 'c')
        F(520, 'f')
        F(522, 'vf')
        F(528, 'vf')
        F(534, 'u')
        F(535, 'f')
        F(536, 'vf')
        F(542, 'vf')
        F(548, 'f')
        F(549, 'f')
        F(556, 'vf')
        F(562, 'vf')
        if v >= 35:
            F(550, 'vf')
        else:
            fields.append({'object_offset': 2200, 'kind': 'native_default',
                           'offset': r.pos, 'end_offset': r.pos, 'value': [9.0, 1.0]})
        check(len(fields[-3]['value']) == 2 and len(fields[-2]['value']) == 2 and (len(fields[-1]['value']) == 2))
        for i in [568, 588, 608]:
            F(i, 'c')
        F(628, 'vf')
        check(len(fields[-1]['value']) == 4)
        for i in [736, 756, 776, 634, 654]:
            F(i, 'c')
        for i in [674, 686]:
            F(i, 'list')
        F(698, 'grid')
        F(704, 'u')
        F(706, 'vf')
        F(714, 'c')
        F(734, 'f')
        F(712, 'f')
        for i in [10, 11, 796]:
            F(i, 'f')
        for i in [798, 818, 838, 858, 878]:
            F(i, 'c')
        return {'version': v, 'fields': fields, 'offset': start, 'end_offset': r.pos}

    def filter_child(r):
        v = r.u32()
        check(v == 5)
        z = {'version': v, 'scalar0': m.read_float(r), 'vector8': m.read_vector(r), 'scalars20': [m.read_float(r) for _ in range(13)], 'vector58': m.read_vector(r)}
        check(len(z['vector58']) == 3)
        z['scalars70'] = [m.read_float(r) for _ in range(4)]
        z['curve78'] = m.read_curve(r)
        z['scalarsd4'] = [m.read_float(r) for _ in range(3)]
        return z

    def filter_(r):
        v = r.u32()
        check(v == 9)
        z = {'version': v, 'curve': m.read_curve(r), 'vector80': m.read_vector(r), 'scalars': [m.read_float(r) for _ in range(6)], 'vector68': m.read_vector(r), 'mode': r.u32(), 'mode9c': r.u32()}
        check(z['mode'] < 2)
        z['curve1e8'] = m.read_curve(r)
        c = z['curve1e8']
        check(len(c['y']) // max(1, len(c['x'])) == 1)
        z['vectors'] = [m.read_vector(r) for _ in range(4)]
        z['curves'] = [m.read_curve(r) for _ in range(3)]
        z['vector328'] = m.read_vector(r, 'I')
        z['flag100'] = r.u32()
        check(z['flag100'] in [0, 1])
        if z['flag100']:
            z['child108'] = filter_child(r)
        return z

    def extend(b, r):

        def add(o, k, fun):
            p = r.pos
            v = fun()
            b['fields'].append({'object_offset': o, 'kind': k, 'offset': p, 'end_offset': r.pos, 'value': v})
            return v

        def f():
            return m.read_float(r)

        def c():
            return m.read_curve(r)

        def vf():
            return m.read_vector(r)

        def grid():
            v = r.u32()
            check(v <= 1)
            n = r.u32()
            check(n <= 1000000)
            return {'version': v, 'rows': [{'coordinate': f(), 'curve': c()} for _ in range(n)]}

        def param3e28():
            v = r.u32()
            check(v == 2)
            return {'version': v, 'vector': vf(), 'floats': [f() for _ in range(6)]}

        def p3f98():
            v = r.u32()
            check(v <= 1)
            return {'version': v, 'floats': [f() for _ in range(8)]}

        def p3fb8():
            v = r.u32()
            check(v == 2)
            return {'version': v, 'curves': [c() for _ in range(5)]}

        def p4148():
            v = r.u32()
            check(v <= 1)
            return {'version': v, 'integer': r.u32(), 'curves': [c() for _ in range(4)]}

        def p4290():
            v = r.u32()
            check(v == 3)
            z = {'version': v, 'scalar4': f(), 'curves8': [c() for _ in range(10)], 'grid330': grid(), 'vector348': vf(), 'curves360': [c() for _ in range(3)], 'scalars450': [f() for _ in range(4)], 'scalar0': f(), 'scalar32c': f()}
            check(len(z['vector348']) % 4 == 0)
            return z
        add(15744, 'f', f)
        add(15752, 'c', c)
        add(15832, 'c', c)
        add(15912, 'p3e28', param3e28)
        for o in [15960, 15984, 16008, 16032, 16056]:
            add(o, 'vf', vf)
        for o in [16084, 16080]:
            add(o, 'u', r.u32)
        v = add(16088, 'vf', vf)
        check(len(v) == 3)
        for o in [16112, 16192]:
            add(o, 'c', c)
        for o in [16272, 16276]:
            add(o, 'u', r.u32)
        add(16280, 'p3f98', p3f98)
        add(16312, 'p3fb8', p3fb8)
        add(16712, 'p4148', p4148)
        add(17040, 'p4290', p4290)
        add(7160, 'vi', lambda: m.read_vector(r, 'I'))
        add(7184, 'vf', vf)

        def matrix():
            n = r.u32()
            check(n <= 1000000)
            return [vf() for _ in range(n)]
        for o in [7208, 7232]:
            add(o, 'matrix', matrix)
        add(7256, 'vf', vf)
        b.update(next_offset=r.pos, unparsed_suffix_bytes=r.end - r.pos, next_reader='FUN_100121574(B+0x1c88)')
        return b
    for offset, kind, function in [(9512, 'control2528', lambda r: {'version': r.u32(), 'floats': [m.read_float(r) for _ in range(7)]}), (9544, 'control2548', control_2548), (10808, 'control2a38', control_2a38), (12048, 'mar_param', mar_param)]:
        start = r.pos
        value = function(r)
        if offset == 9512:
            check(value['version'] <= 1)
        base['fields'].append({'object_offset': offset, 'kind': kind, 'offset': start, 'end_offset': r.pos, 'value': value})
    start = r.pos
    check(r.u32() == 1)
    count = r.u32()
    check(count <= 1000000)
    value = {'version': 1, 'filters': [filter_(r) for _ in range(count)]}
    base['fields'].append({'object_offset': 15720, 'kind': 'filters', 'offset': start, 'end_offset': r.pos, 'value': value})
    return extend(base, r)


def read_base_suffix(reader, module, base):
    """Modern v89 tail from B+1c88 to the declared model record end."""
    m, r = (module, reader)

    def check(condition):
        if not condition:
            raise ValueError('unsupported base suffix branch or shape')

    def curve_list(r):
        version = r.u32()
        check(version == 1)
        coordinates = m.read_vector(r)
        count = r.u32()
        check(count <= 1000000)
        return {'version': version, 'coordinates': coordinates, 'curves': [m.read_curve(r) for _ in range(count)]}

    def after_modal(b, r):

        def F(o, k):
            start = r.pos
            if k == 'vf':
                v = m.read_vector(r)
            elif k == 'u':
                v = r.u32()
            elif k == 'f':
                v = m.read_float(r)
            elif k == 'c':
                v = m.read_curve(r)
            b['fields'].append({'object_offset': o, 'kind': k, 'offset': start, 'end_offset': r.pos, 'value': v})
        for o in [7304, 7328, 7352, 7376, 7400, 7424, 7448, 7472, 7496, 7520]:
            F(o, 'vf')
        F(7544, 'u')
        F(7552, 'vf')
        check(len(b['fields'][-1]['value']) == 2)
        F(7576, 'f')
        F(7580, 'f')
        F(7584, 'c')
        F(7664, 'c')
        F(7744, 'f')
        b.update(next_offset=r.pos, unparsed_suffix_bytes=r.end - r.pos, next_reader='FUN_1002d9a1c(B+0x1e48)')
        return b

    def remaining(b, r):

        def f():
            return m.read_float(r)

        def vf():
            return m.read_vector(r)

        def c():
            return m.read_curve(r)

        def seq(fun):
            n = r.u32()
            check(n <= 1000000)
            return [fun() for _ in range(n)]

        def element70():
            v = r.u32()
            check(v <= 1)
            z = {'version': v, 'vector0': vf(), 'curve18': c()}
            check(len(z['vector0']) == 2)
            check(len(z['curve18']['y']) // max(1, len(z['curve18']['x'])) == 3)
            return z

        def p1e98():
            v = r.u32()
            check(v == 2)
            z = {'version': v, 'curve0': c()}
            v = r.u32()
            check(v <= 1)
            z['sub50'] = {'version': v, 'integer': r.u32(), 'mode': r.u32()}
            check(z['sub50']['mode'] == 0)
            z['sub50']['floats'] = [f(), f()]
            z['curve60'] = c()
            return z

        def element7bf():
            v = r.u32()
            check(v <= 1)
            z = {'version': v, 'integer20': r.u32(), 'vector28': m.read_vector(r, 'I')}
            v = r.u32()
            check(v <= 2)
            z['sub0'] = {'version': v, 'records': seq(element4b4b)}
            if v >= 2:
                z['sub0']['integer18'] = r.u32()
            return z

        def element8ecc():
            v = r.u32()
            check(v <= 1)
            return {'version': v, 'scalar0': f(), 'vector8': vf(), 'vector20': vf(), 'scalar38': f()}

        def element4b4b():
            v = r.u32()
            check(v <= 1)
            z = {'version': v, 'integer0': r.u32(), 'floats4': [f(), f()], 'integerc': r.u32(), 'vector10': vf(), 'scalar28': f(), 'vector30': vf(), 'floats48': [f(), f()], 'records50': seq(element8ecc)}
            check(len(z['records50']) == len(z['vector10']))
            return z

        def p2100():
            v = r.u32()
            check(v == 3)
            return {'version': v, 'curves': [c() for _ in range(8)], 'curve_list280': curve_list(r), 'scalar2b0': f()}

        def F(o, k, fun):
            start = r.pos
            v = fun()
            b['fields'].append({'object_offset': o, 'kind': k, 'offset': start, 'end_offset': r.pos, 'value': v})
            return v
        F(7752, 'records70ac44', lambda: seq(element70))
        F(7800, 'f', f)
        F(7804, 'f', f)
        F(7808, 'records7bf110', lambda: seq(element7bf))
        for o in [7832, 8008, 8184]:
            F(o, 'p12a5e8', p1e98)
        F(7776, 'records70ac44', lambda: seq(element70))
        F(8448, 'p02efc4', p2100)
        F(9232, 'curve_list', lambda: curve_list(r))
        F(9152, 'vf', vf)
        for o in [9280, 9284, 9144]:
            F(o, 'f', f)
        F(9180, 'u', r.u32)
        F(9288, 'c', c)
        F(9184, 'curve_list', lambda: curve_list(r))
        F(9176, 'u', r.u32)
        F(4328, 'u', r.u32)
        F(5352, 'curve_list', lambda: curve_list(r))
        F(9368, 'f', f)
        F(9372, 'u', r.u32)
        F(9376, 'vf', vf)
        F(9400, 'f', f)
        F(9432, 'c', c)
        b.update(next_offset=r.pos, unparsed_suffix_bytes=r.end - r.pos, next_reader='end of FUN10059f2cc')
        return b
    after_modal(base, r)
    remaining(base, r)
    check(r.pos == r.end)
    return base


def read_base_prefix(data, start, end, module):
    """Version89 prefix; all 58 verified factory B records consume to their declared ends."""
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
    metadata_collection = read_base_metadata_collection(reader, module)
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
        elif kind == 'grid':
            value = grid(reader)
        elif kind == 'curve_list':
            require(reader.u32(), 1)
            coordinates = module.read_vector(reader)
            count = reader.u32()
            if count > 1_000_000:
                raise ValueError('oversized base curve list')
            value = {'version': 1, 'coordinates': coordinates,
                     'curves': [module.read_curve(reader) for _ in range(count)]}
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
    schema += [
        (0x1018, 'grid'), (0x1030, 'c'), (0x1080, 'c'), (0x10d0, 'vf'),
        (0x10f0, 'c'), (0x1140, 'c'), (0x1190, 'c'), (0x11e0, 'c'),
        (0x1230, 'c'), (0x1280, 'c'), (0x14e0, 'f'), (0x14b0, 'vf'),
        (0x12d0, 'c'), (0x1320, 'c'), (0x1370, 'c'), (0x13c0, 'c'),
        (0x1410, 'c'), (0x14c8, 'vf'), (0x1460, 'c'), (0x1518, 'f'),
        (0x1520, 'c'), (0x15c0, 'f'), (0x15c4, 'f'), (0x15c8, 'f'),
        (0x15cc, 'f'), (0x1570, 'c'), (0x15d0, 'f'), (0x15d8, 'c'),
        (0x1628, 'f'), (0x1630, 'c'), (0x1680, 'f'), (0x1684, 'f'),
        (0x1788, 'c'), (0x1688, 'c'), (0x17d8, 'c'), (0x1828, 'c'),
        (0x1878, 'c'), (0x18c8, 'u'), (0x18d0, 'c'), (0x1920, 'f'),
        (0x1928, 'c'), (0x1978, 'c'), (0x19c8, 'c'), (0x1a18, 'f'),
        (0x1a50, 'curve_list'), (0x1a80, 'c'), (0x1a1c, 'f'), (0x1a20, 'curve_list'),
        (0x1ad0, 'c'), (0x1b24, 'f'), (0x1b28, 'f'), (0x1b2c, 'f'),
        (0x1b30, 'f'), (0x1b40, 'c'), (0x1b34, 'f'), (0x1b38, 'f'),
        (0x1b3c, 'f'), (0x1b90, 'f'), (0x1b98, 'c'), (0x1be8, 'f'),
        (0x1bec, 'f'), (0x1bf0, 'f'), (0x1bf4, 'f'),
    ]
    for offset, kind in schema:
        field(offset, kind)
    base = {'version': 89, 'metadata_type': metadata_type, 'strings': strings,
            'metadata_integer': metadata_integer, 'metadata_vector': metadata_vector,
            'metadata_collection': metadata_collection,
            'fields': fields, 'next_offset': reader.pos, 'unparsed_suffix_bytes': end - reader.pos,
            'next_reader': 'FUN_10099d658(B+0x2528)'}
    # Explicitly verified factory identities; unknown model identities retain a partial prefix.
    complete_identities = {
        'alhambra',
        'ant.petrof',
        'bechsteindg',
        'besendorfer',
        'bluethner',
        'broadwood',
        'cbechstein',
        'celesta',
        'celticharp',
        'cl1',
        'd4',
        'dohnal',
        'electra',
        'frenzel',
        'giusti',
        'glocken',
        'grotrian',
        'hang',
        'hapi',
        'harp',
        'ipleyel',
        'k2',
        'kalimba',
        'kawaisk-ex',
        'marimba',
        'mist.petrof',
        'mkii',
        'modelb',
        'pianetn',
        'pianett',
        'pschmidt',
        'r2',
        'ruckers',
        'sawtooth',
        'serard',
        'space8',
        'steeldrum',
        'steingraeber',
        'steinwayny',
        'steinwayq',
        'streicher',
        'su118',
        'toypiano',
        'tripleharp',
        'v1',
        'v2',
        'vc280boesendorfer',
        'virginal',
        'w1',
        'weimes',
        'xylo',
        'yc5',
    }
    if strings[0] in complete_identities:
        read_base_continuation(reader, module, base)
        return read_base_suffix(reader, module, base)
    return base


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
                arrays = []
                for field in base['fields']:
                    if field['kind'] in ('vf', 'vi', 'matrix'):
                        value = field['value']
                        row = {key: field[key] for key in ('object_offset', 'kind', 'offset', 'end_offset')}
                        row['count'] = len(value)
                        if field['kind'] == 'matrix':
                            row['row_lengths'] = [len(item) for item in value]
                        arrays.append(row)
                models.append({'base_prefix': {**base_summary, 'array_inventory': arrays,
                                  'metadata_identity_list_count': len(base['metadata_collection']),
                                  'metadata_identity_record_count': sum(len(item['records']) for item in base['metadata_collection']),
                                  'metadata_identity_lists': [{'offset': item['offset'], 'end_offset': item['end_offset'], 'count': len(item['records'])} for item in base['metadata_collection']],
                                  'end_offset': base['next_offset'], 'unparsed_suffix_bytes': base['unparsed_suffix_bytes']}, 'offset': begin, 'bytes': length, 'identity': identity,
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
