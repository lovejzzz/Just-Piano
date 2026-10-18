"""Read-only same-run response reconstruction: six hardware sites."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_shaping as shaping
base = shaping.base
records = []
errors = []
pending = None
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'reconstructionRecords': records, 'reconstructionErrors': errors, 'reconstructionPending': pending})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def source(frame, breakpoint, context): return shaping.source_entry(frame, breakpoint, context)
def raw(frame, breakpoint, context): return shaping.raw_complete(frame, breakpoint, context)
def shape(frame, breakpoint, context): return shaping.input_shaping(frame, breakpoint, context)


def buffer(frame, offset, label):
    pointer, length = struct.unpack('<2Q', base.memory(frame, frame.FindRegister('sp').GetValueAsUnsigned() + offset, 16))
    if not 1 <= length <= 100000: raise RuntimeError('Invalid reconstruction buffer shape')
    return base.dump(label + '.bin', base.memory(frame, pointer, length * 4))


def sums(frame, breakpoint, _):
    global pending
    try:
        import lldb
        if pending is not None: raise RuntimeError('Overlapping reconstruction channels')
        index = len(records)
        values = []
        for register in ('s13', 's14', 's12', 's11'):
            error = lldb.SBError(); values.append(frame.FindRegister(register).GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        records.append({'number': index, 'span': frame.FindRegister('w19').GetValueAsUnsigned(),
            'start': frame.FindRegister('w20').GetValueAsUnsigned(), 'end': frame.FindRegister('w24').GetValueAsUnsigned(),
            'headTailSums': values,
            'original': buffer(frame, 0x1a0, f'reconstruction-{index}-original'),
            'scaledInverse': buffer(frame, 0x1c8, f'reconstruction-{index}-scaled-inverse')})
        pending = {'index': index, 'thread': frame.GetThread().GetThreadID()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def guard(frame):
    if pending is None: raise RuntimeError('Reconstruction call missing')
    if pending['thread'] != frame.GetThread().GetThreadID(): raise RuntimeError('Reconstruction thread differs')
    return records[pending['index']]


def weights(frame, breakpoint, _):
    try:
        record = guard(frame)
        record['weights'] = buffer(frame, 0x128, f"reconstruction-{record['number']}-weights")
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def completed(frame, breakpoint, _):
    global pending
    try:
        record = guard(frame)
        record['output'] = buffer(frame, 0x1c8, f"reconstruction-{record['number']}-output")
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
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'), (0x10069c084, 'shape'),
                              (0x10069cb34, 'sums'), (0x10069cc8c, 'weights'), (0x10069d1b8, 'completed')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
