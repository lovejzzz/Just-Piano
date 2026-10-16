"""LLDB hardware-only capture for Pianoteq 9.2.5 ARM64.

Import with `command script import PATH` after selecting an independently
prepared, authorized debug copy. Set PIANOTEQ_CAPTURE_DIR to a fresh output
directory. Optional PIANOTEQ_CAPTURE_KIND selects release or position (default:
both). Requires the exact __text hash below; records physical-model fields
only. Never changes the original app, parameters, registers or preferences.
See docs/pianoteq-debug-copy-pass6.md for the tested setup and limitations.
"""
import hashlib
import json
import os
from pathlib import Path
import struct
import traceback

ROOT = Path(os.environ.get('PIANOTEQ_CAPTURE_DIR', '.')).resolve()
EXPECTED_TEXT_SHA256 = '96b393aad5aa064b9ed18bf4cce8b22b301cc1a811488f71dfe769b7864104fd'
records = []
errors = []
hooks = []
module = None
target = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'damper-runtime.json').write_text(json.dumps({
        'records': records, 'errors': errors,
        'breakpoints': [{'id': b.GetID(), 'hits': b.GetHitCount()} for b in hooks],
    }, indent=2))


def memory(frame, address, count):
    import lldb
    assert address > 4096 and 0 < count <= 16384
    error = lldb.SBError()
    data = frame.GetThread().GetProcess().ReadMemory(address, count, error)
    if error.Fail() or len(data) != count:
        raise RuntimeError(str(error))
    return data


def unpack(frame, address, fmt):
    return struct.unpack('<' + fmt, memory(frame, address, struct.calcsize('<' + fmt)))


def scalar(frame, address, fmt='f'):
    return unpack(frame, address, fmt)[0]


def base_record(frame, kind):
    v = frame.FindRegister('x19').GetValueAsUnsigned()
    fields = [0x8c4, 0x8cc, 0x8d4, 0x90c, 0x910, 0x914, 0x918,
              0x908, 0x91c, 0x920, 0x944, 0x94c, 0x950, 0x954, 0x958,
              0x7e4, 0x7b0, 0x8fc]
    record = {
        'kind': kind, 'V': hex(v),
        'thread': frame.GetThread().GetThreadID(),
        'sample_counter': scalar(frame, v + 0x10, 'I'),
        'previous_block_samples': scalar(frame, v + 0x904, 'I'),
        'fields': {hex(o): scalar(frame, v + o) for o in fields},
        'flags': {hex(o): scalar(frame, v + o, 'B') for o in (0x924, 0x925, 0x926)},
    }
    # Voice identity is optional: some callers may use a standalone container.
    try:
        g = scalar(frame, v - 0x168 + 0x2fb8, 'Q')
        record['note_field_G14'] = scalar(frame, g + 0x14)
    except (RuntimeError, AssertionError):
        record['note_field_G14'] = None
    return v, record


def observed(frame, location, _):
    try:
        address = frame.GetPCAddress().GetFileAddress()
        kind = 'release_coefficients' if address == 0x1006e5344 else 'position_weights'
        v, record = base_record(frame, kind)
        if kind == 'position_weights':
            o = scalar(frame, v, 'Q')
            groups = scalar(frame, o + 0xa8, 'Q')
            assert groups <= 3
            frequency = scalar(frame, v + 0x20, 'Q')
            index = scalar(frame, v + 0xc0, 'Q')
            weight = scalar(frame, v + 0x788, 'Q')
            record['mask_N'] = scalar(frame, v + 0x928, 'I')
            record['lanes'] = []
            for group in range(groups):
                start, padded, capacity, count = unpack(frame, o + 0xb0 + 16 * group, 'IIII')
                assert start + count <= 8192
                for lane in range(start, start + min(count, 24)):
                    record['lanes'].append({
                        'group': group, 'lane': lane,
                        'frequency': scalar(frame, frequency + 4 * lane),
                        'mask_index': scalar(frame, index + 4 * lane),
                        'weight': scalar(frame, weight + 4 * lane),
                    })
        records.append(record)
        if len(records) >= 160:
            for bp in hooks:
                bp.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def verify_text(path):
    data = path.read_bytes()
    assert data[:4] == bytes.fromhex('cafebabe'), 'Expected universal debug copy'
    for i in range(struct.unpack_from('>I', data, 4)[0]):
        cpu, _, base, _, _ = struct.unpack_from('>IIIII', data, 8 + 20 * i)
        if cpu != 0x0100000c:
            continue
        assert struct.unpack_from('<I', data, base)[0] == 0xfeedfacf
        pos = base + 32
        for _ in range(struct.unpack_from('<I', data, base + 16)[0]):
            command, size = struct.unpack_from('<II', data, pos)
            if command == 0x19:
                for j in range(struct.unpack_from('<I', data, pos + 64)[0]):
                    section = pos + 72 + 80 * j
                    name = data[section:section + 16].split(b'\0')[0]
                    if name == b'__text':
                        length = struct.unpack_from('<Q', data, section + 40)[0]
                        offset = struct.unpack_from('<I', data, section + 48)[0]
                        digest = hashlib.sha256(data[base + offset:base + offset + length]).hexdigest()
                        assert digest == EXPECTED_TEXT_SHA256, 'Unsupported code version'
                        return
            pos += size
    raise RuntimeError('ARM64 __text not found')


def __lldb_init_module(debugger, _):
    import lldb
    global module, target
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    module = target.GetModuleAtIndex(0)
    spec = module.GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (ROOT / 'damper-runtime.json').exists(), 'Use a fresh output directory'
    kind = os.environ.get('PIANOTEQ_CAPTURE_KIND', 'both')
    addresses = {'both': (0x1006e5344, 0x1002890f4),
                 'release': (0x1006e5344,), 'position': (0x1002890f4,)}
    for address in addresses[kind]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        bp = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        bp.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(bp)
    save()
