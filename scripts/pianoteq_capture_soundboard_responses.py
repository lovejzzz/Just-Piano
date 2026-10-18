"""Read-only capture of first propagation's observation groups and raw responses.

Three hardware breakpoints: propagation inputs, output worker, completed-block
boundary before resizing its raw responses. No target writes or expressions.
"""
import hashlib
import json
import os
from pathlib import Path
import struct
import traceback

from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
hooks = []
records = []
errors = []
completed = False
captured_source = None


def memory(frame, address, size):
    import lldb
    if size < 0 or size > 8000000:
        raise RuntimeError('Read size out of bounds')
    error = lldb.SBError()
    data = frame.GetThread().GetProcess().ReadMemory(address, size, error)
    if error.Fail() or len(data) != size:
        raise RuntimeError(str(error))
    return data


def dump(name, data):
    with open(ROOT / name, 'xb') as stream:
        stream.write(data)
    os.chmod(ROOT / name, 0o600)
    return {'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def save():
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'records': records, 'errors': errors,
        'completed': completed, 'hardwareBreakpoints': len(hooks),
        'capturedSource': captured_source,
        'targetMutation': False,
    }, indent=2, allow_nan=False))
    os.chmod(ROOT / 'runtime.json', 0o600)


def source_entry(frame, breakpoint, _):
    global captured_source
    try:
        import lldb
        from pianoteq_capture_soundboard_state import dump_state_arrays
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        data = memory(frame, state, 0x200)
        arrays = dump_state_arrays(frame, data)
        rows = {record['label']: record['rowsPath'] for record in arrays if 'rowsPath' in record}
        if set(rows) != {'va0', 'vc0'}:
            raise RuntimeError('Both same-run sparse matrices required')
        scalars = []
        for index in range(4):
            error = lldb.SBError()
            value = frame.FindRegister(f's{index}').GetData().GetFloat(error, 0)
            if error.Fail():
                raise RuntimeError(str(error))
            scalars.append(value)
        begin, end = struct.unpack_from('<2Q', data, 0x70)
        if end - begin != 16:
            raise RuntimeError('Expected four excitation samples')
        h, tau = struct.unpack_from('<2f', data)
        config = {
            'matrixA': rows['va0'], 'matrixC': rows['vc0'],
            'controls': dict(zip(['T', 'p', 'q', 'r'], scalars), h=h, tau=tau),
            'excitation': list(struct.unpack('<4f', memory(frame, begin, 16))),
            'excitationIndex': struct.unpack_from('<I', data, 0x68)[0],
        }
        descriptor = dump('source.json', json.dumps(config, indent=2, allow_nan=False).encode())
        captured_source = {'state': state, 'config': descriptor, 'arrays': arrays}
        breakpoint.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def worker(frame, breakpoint, _):
    try:
        start = frame.FindRegister('x2').GetValueAsUnsigned() & 0xffffffff
        if start != 0:
            return False
        pointer = frame.FindRegister('x0').GetValueAsUnsigned()
        if any(record['pointer'] == pointer for record in records):
            return False
        if len(records) >= 64:
            raise RuntimeError('Too many observation records')
        words = struct.unpack('<15Q', memory(frame, pointer, 0x78))
        begin, end, coefficient_pointer = words[3], words[4], words[6]
        if end < begin or (end - begin) % 4 or end - begin > 1000000:
            raise RuntimeError('Invalid group vector')
        data = memory(frame, begin, end - begin)
        ints = struct.unpack('<' + 'I' * (len(data) // 4), data)
        cursor = 0
        entry_count = 0
        while cursor < len(ints):
            if cursor + 2 > len(ints):
                raise RuntimeError('Truncated group header')
            count = ints[cursor + 1]
            cursor += 2 + count
            if cursor > len(ints):
                raise RuntimeError('Truncated group entries')
            entry_count += count
        cache_ref = frame.FindRegister('x1').GetValueAsUnsigned()
        cache = struct.unpack('<Q', memory(frame, cache_ref, 8))[0]
        index = len(records)
        record = {
            'pointer': pointer, 'thread': frame.GetThread().GetThreadID(),
            'blockStart': start, 'output': words[9], 'length': words[10] & 0xffffffff,
            'groupData': dump(f'record-{index}-groups.bin', data),
            'coefficients': dump(f'record-{index}-coefficients.bin',
                                 memory(frame, coefficient_pointer, entry_count * 12)),
            'cache': dump(f'record-{index}-cache.bin', memory(frame, cache, 1500 * 65 * 4)),
        }
        records.append(record)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_propagation(frame, breakpoint, _):
    global completed
    try:
        if not records:
            return False
        state = frame.FindRegister('x19').GetValueAsUnsigned()
        if captured_source and state != captured_source['state']:
            raise RuntimeError('Completed state differs from captured source')
        frame_pointer = frame.FindRegister('x29').GetValueAsUnsigned()
        begin = struct.unpack('<Q', memory(frame, frame_pointer - 0xd8, 8))[0]
        count = struct.unpack('<Q', memory(frame, state + 0x130, 8))[0]
        if count < 1 or count > 64 or count != len(records):
            raise RuntimeError('Unexpected completed worker record count')
        outputs = {}
        for index in range(count):
            address = begin + index * 0x78
            pointer, length = struct.unpack('<2Q', memory(frame, address + 0x48, 16))
            outputs[address] = (pointer, length)
        for index, record in enumerate(records):
            if outputs.get(record['pointer']) != (record['output'], record['length']):
                raise RuntimeError('Worker output not owned by completed state')
            record['response'] = dump(f'record-{index}-response.bin',
                                     memory(frame, record['output'], record['length'] * 4))
        completed = True
        for hook in hooks:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    assert not (ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1005a8874, 'source_entry'),
                              (0x1005ab0e0, 'worker'), (0x1005a91c8, 'after_propagation')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        hook.SetAutoContinue(True)
        hooks.append(hook)
    save()
