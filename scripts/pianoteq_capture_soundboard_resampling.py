"""Read-only rational resampling plan and per-channel oracle, four HW sites."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
plan = None
records = []
errors = []
pending = None
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'resamplingPlan': plan, 'resamplingRecords': records,
                 'resamplingErrors': errors, 'resamplingPending': pending})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def plan_entry(frame, breakpoint, _):
    global plan
    try:
        import lldb
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x1008d7924: return False
        if plan is not None: raise RuntimeError('Resampling plan repeated')
        error = lldb.SBError(); ratio = frame.FindRegister('s0').GetData().GetFloat(error, 0)
        if error.Fail(): raise RuntimeError(str(error))
        plan = {'ratio': ratio, 'quality': frame.FindRegister('w1').GetValueAsUnsigned(),
                'pointer': frame.FindRegister('x0').GetValueAsUnsigned(), 'thread': frame.GetThread().GetThreadID()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def plan_return(frame, breakpoint, _):
    try:
        if plan is None or frame.GetThread().GetThreadID() != plan['thread']: raise RuntimeError('Plan ownership differs')
        header = base.memory(frame, plan['pointer'], 0x34)
        pointer, length = struct.unpack_from('<2Q', header)
        if not 1 <= length <= 1000000: raise RuntimeError('Invalid coefficient count')
        plan['header'] = base.dump('resampling-plan.bin', header)
        plan['coefficients'] = base.dump('resampling-coefficients.bin', base.memory(frame, pointer, length * 4))
        plan['numerator'], plan['denominator'], plan['filterLength'] = struct.unpack_from('<3I', header, 0x28)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def entry(frame, breakpoint, _):
    global pending
    try:
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x1008d7954: return False
        if pending is not None or plan is None or 'coefficients' not in plan: raise RuntimeError('Resampling plan/call missing')
        if frame.FindRegister('x0').GetValueAsUnsigned() != plan['pointer']: raise RuntimeError('Resampling plan differs')
        descriptor = frame.FindRegister('x1').GetValueAsUnsigned()
        pointer, length = struct.unpack('<2Q', base.memory(frame, descriptor, 16))
        if not 1 <= length <= 100000: raise RuntimeError('Invalid input shape')
        number = len(records)
        records.append({'number': number, 'length': length, 'channels': frame.FindRegister('w3').GetValueAsUnsigned(),
                        'input': base.dump(f'resampling-{number}-input.bin', base.memory(frame, pointer, length * 4))})
        pending = {'index': number, 'thread': frame.GetThread().GetThreadID(),
                   'output': frame.FindRegister('x2').GetValueAsUnsigned()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if pending is None or frame.GetThread().GetThreadID() != pending['thread']: raise RuntimeError('Resampling return differs')
        pointer, length = struct.unpack('<2Q', base.memory(frame, pending['output'], 16))
        if not 1 <= length <= 100000: raise RuntimeError('Invalid output shape')
        record = records[pending['index']]; record['outputLength'] = length
        record['output'] = base.dump(f"resampling-{record['number']}-output.bin", base.memory(frame, pointer, length * 4))
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
    for address, callback in [(0x100915b34, 'plan_entry'), (0x1008d7924, 'plan_return'),
                              (0x100904d34, 'entry'), (0x1008d7954, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
