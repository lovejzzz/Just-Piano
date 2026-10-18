"""Read-only whitening input/return capture at its shaping caller."""
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
    d.update({'whiteningRecords': records, 'whiteningErrors': errors, 'whiteningPending': pending})
    p.write_text(json.dumps(d, indent=2, allow_nan=False))


base.save = save


def entry(frame, breakpoint, _):
    global pending
    try:
        import lldb
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x10069c3a0: return False
        if pending is not None: raise RuntimeError('Overlapping whitening calls')
        descriptor = frame.FindRegister('x2').GetValueAsUnsigned()
        pointer, length = struct.unpack('<2Q', base.memory(frame, descriptor, 16))
        if not 1 <= length <= 100000: raise RuntimeError('Invalid spectrum length')
        scalars = []
        for i in range(3):
            error = lldb.SBError(); scalars.append(frame.FindRegister(f's{i}').GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        index = len(records)
        records.append({'number': index, 'length': length, 'parameters': scalars,
            'flags': frame.FindRegister('w1').GetValueAsUnsigned(),
            'input': base.dump(f'whitening-{index}-input.bin', base.memory(frame, pointer, length * 4))})
        pending = {'index': index, 'thread': frame.GetThread().GetThreadID(),
                   'descriptor': frame.FindRegister('x3').GetValueAsUnsigned()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if pending is None: return False
        if frame.GetThread().GetThreadID() != pending['thread']: raise RuntimeError('Whitening thread differs')
        r = records[pending['index']]
        pointer, length = struct.unpack('<2Q', base.memory(frame, pending['descriptor'], 16))
        if length != r['length']: raise RuntimeError('Whitening output shape differs')
        r['output'] = base.dump(f"whitening-{r['number']}-output.bin", base.memory(frame, pointer, length * 4))
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
    for address, callback in [(0x100540f48, 'entry'), (0x10069c3a0, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
