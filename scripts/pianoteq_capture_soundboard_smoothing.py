"""Read-only smoothing input, designed coefficients and return snapshots."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base

records = []
pending = None
errors = []
original_save = base.save
RETURNS = (0x1005410b0, 0x100986f98, 0x10069c3a0)


def save():
    original_save()
    p = base.ROOT / 'runtime.json'
    data = json.loads(p.read_text())
    data.update({'smoothingRecords': records, 'smoothingPending': pending,
                 'smoothingErrors': errors, 'breakpointHits': [h.GetHitCount() for h in base.hooks]})
    p.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def entry(frame, breakpoint, _):
    global pending
    try:
        import lldb
        lr = frame.FindRegister('x30').GetValueAsUnsigned()
        if lr not in RETURNS: return False
        if pending is not None: raise RuntimeError('Overlapping smoothing calls')
        descriptor = frame.FindRegister('x1').GetValueAsUnsigned()
        pointer, length = struct.unpack('<2Q', base.memory(frame, descriptor, 16))
        if not 1 <= length <= 100000: raise RuntimeError('Invalid smoothing size')
        error = lldb.SBError()
        cutoff = frame.FindRegister('s0').GetData().GetFloat(error, 0)
        if error.Fail(): raise RuntimeError(str(error))
        index = len(records)
        records.append({'number': index, 'thread': frame.GetThread().GetThreadID(),
            'length': length, 'cutoff': cutoff, 'returnAddress': lr,
            'input': base.dump(f'smooth-{index}-input.bin', base.memory(frame, pointer, length * 4))})
        pending = {'index': index, 'pointer': pointer, 'thread': frame.GetThread().GetThreadID(), 'return': lr}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def coefficients(frame, breakpoint, _):
    try:
        if pending is None: return False
        if frame.GetThread().GetThreadID() != pending['thread']: raise RuntimeError('Coefficient thread differs')
        stack = frame.FindRegister('sp').GetValueAsUnsigned()
        index = pending['index']
        records[index]['coefficients'] = base.dump(f'smooth-{index}-coefficients.bin',
                                                  base.memory(frame, stack + 0x28, 20))
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if pending is None: return False
        if frame.GetPC() != pending['return'] or frame.GetThread().GetThreadID() != pending['thread']:
            raise RuntimeError('Smoothing return ownership differs')
        r = records[pending['index']]
        r['output'] = base.dump(f"smooth-{r['number']}-output.bin", base.memory(frame, pending['pointer'], r['length'] * 4))
        pending = None
        if len(records) >= 9:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    sites = [(0x10021b378, 'entry'), (0x10021b3b4, 'coefficients')]
    sites.extend((address, 'returned') for address in RETURNS)
    for address, callback in sites:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
