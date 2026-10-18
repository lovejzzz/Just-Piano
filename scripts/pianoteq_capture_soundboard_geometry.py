"""Read-only grid, boundary and excitation construction at four hardware sites."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records = []
pending = None
errors = []
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'geometryRecords': records, 'geometryPending': pending, 'geometryErrors': errors})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def grid(frame, breakpoint, _):
    global pending
    try:
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x100056fd0: return False
        if pending is not None: raise RuntimeError('Overlapping geometry calls')
        state = frame.FindRegister('x0').GetValueAsUnsigned(); config = frame.FindRegister('x1').GetValueAsUnsigned()
        number = len(records)
        pointer, end = struct.unpack('<2Q', base.memory(frame, config + 0x68, 16))
        if end - pointer != 16: raise RuntimeError('Expected four bridge coordinates')
        records.append({'number': number, 'config': base.dump(f'geometry-{number}-config.bin', base.memory(frame, config, 0x130)),
                        'bridge': base.dump(f'geometry-{number}-bridge.bin', base.memory(frame, pointer, 16))})
        pending = {'index': number, 'state': state, 'thread': frame.GetThread().GetThreadID()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def current(frame):
    if pending is None or frame.GetThread().GetThreadID() != pending['thread']: raise RuntimeError('Geometry ownership differs')
    return records[pending['index']], pending['state']


def grid_return(frame, breakpoint, _):
    try:
        record, state = current(frame)
        record['header'] = base.dump(f"geometry-{record['number']}-header.bin", base.memory(frame, state, 0x70))
        for offset, label in [(0x18, 'active'), (0x30, 'inactive'), (0x48, 'bridgeIndices')]:
            start, end = struct.unpack('<2Q', base.memory(frame, state + offset, 16))
            if end < start or (end-start) % 4 or end-start > 1000000: raise RuntimeError('Invalid grid index vector')
            record[label] = base.dump(f"geometry-{record['number']}-{label}.bin", base.memory(frame, start, end-start))
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def excitation(frame, breakpoint, _):
    try:
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x100057000: return False
        import lldb
        record, state = current(frame)
        if frame.FindRegister('x0').GetValueAsUnsigned() != state: raise RuntimeError('Excitation state differs')
        values = []
        for index in range(2):
            error = lldb.SBError(); values.append(frame.FindRegister(f's{index}').GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        record['excitationParameters'] = values
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def excitation_return(frame, breakpoint, _):
    global pending
    try:
        record, state = current(frame)
        start, end = struct.unpack('<2Q', base.memory(frame, state + 0x70, 16))
        if end < start or (end-start) % 4 or end-start > 1000000: raise RuntimeError('Invalid excitation vector')
        record['excitation'] = base.dump(f"geometry-{record['number']}-excitation.bin", base.memory(frame, start, end-start))
        pending = None
        if len(records) >= 3:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x10090b000, 'grid'), (0x100056fd0, 'grid_return'),
                              (0x1002ac304, 'excitation'), (0x100057000, 'excitation_return')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
