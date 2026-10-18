"""Read-only curve interpolation and gain capture; five hardware sites."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records = []
errors = []
pending = None
original_save = base.save


def save():
    original_save()
    p = base.ROOT / 'runtime.json'; d = json.loads(p.read_text())
    d.update({'curveGainRecords': records, 'curveGainErrors': errors, 'curveGainPending': pending})
    p.write_text(json.dumps(d, indent=2, allow_nan=False))


base.save = save


def guard(frame):
    if pending is None: return False
    if pending['thread'] != frame.GetThread().GetThreadID(): raise RuntimeError('Curve thread differs')
    return True


def entry(frame, breakpoint, _):
    global pending
    try:
        import lldb
        lr = frame.FindRegister('x30').GetValueAsUnsigned()
        if lr not in (0x10069c764, 0x10069c7b0): return False
        if pending is not None: raise RuntimeError('Overlapping curve calls')
        number = len(records); curve = frame.FindRegister('x1').GetValueAsUnsigned()
        header = base.memory(frame, curve, 80)
        dimensions = struct.unpack_from('<I', header, 0x48)[0]
        length = frame.FindRegister('w2').GetValueAsUnsigned()
        if dimensions not in (1, 2) or not 1 <= length <= 100000: raise RuntimeError('Unsupported curve shape')
        scalars = []
        for i in range(3):
            error = lldb.SBError(); scalars.append(frame.FindRegister(f's{i}').GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        vectors = []
        for offset in (0, 24, 48):
            start, end, capacity = struct.unpack_from('<3Q', header, offset)
            if end < start or capacity < end or (end-start) % 4 or end-start > 1000000: raise RuntimeError('Invalid curve vector')
            vectors.append(base.dump(f'curve-{number}-vector-{offset}.bin', base.memory(frame, start, end-start)))
        records.append({'number': number, 'returnAddress': hex(lr), 'length': length,
            'dimensions': dimensions, 'parameters': scalars, 'vectors': vectors,
            'header': base.dump(f'curve-{number}-header.bin', header)})
        pending = {'index': number, 'thread': frame.GetThread().GetThreadID(), 'return': lr,
                   'output': frame.FindRegister('x3').GetValueAsUnsigned()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def interpolated(frame, breakpoint, _):
    try:
        if not guard(frame): return False
        start, end = struct.unpack('<2Q', base.memory(frame, frame.FindRegister('sp').GetValueAsUnsigned() + 0x80, 16))
        r = records[pending['index']]
        if end-start != r['length'] * r['dimensions'] * 4: raise RuntimeError('Interpolated shape differs')
        r['interpolated'] = base.dump(f"curve-{r['number']}-interpolated.bin", base.memory(frame, start, end-start))
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def output(frame, field):
    r = records[pending['index']]
    pointer, length = struct.unpack('<2Q', base.memory(frame, pending['output'], 16))
    if length != r['length']: raise RuntimeError('Curve gain shape differs')
    r[field] = base.dump(f"curve-{r['number']}-{field}.bin", base.memory(frame, pointer, length*4))


def presmoothed(frame, breakpoint, _):
    try:
        if guard(frame): output(frame, 'beforeSmoothing'); save()
        return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if not guard(frame): return False
        if frame.GetPC() != pending['return']: raise RuntimeError('Curve return differs')
        output(frame, 'output'); pending = None
        if len(records) >= 6:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x100986bf8, 'entry'), (0x100986de4, 'interpolated'),
                              (0x100986f84, 'presmoothed'), (0x10069c764, 'returned'), (0x10069c7b0, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
