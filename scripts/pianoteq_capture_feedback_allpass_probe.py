"""One bounded read-only observation of the global scalar allpass call."""
import hashlib
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack, memory

observations, errors = [], []


def save():
    data = {'schema': 1, 'runStatus': base.run_status, 'errors': errors, 'targetMutation': False,
            'hardwareBreakpoints': len(base.hooks), 'site': '0x1006ca950', 'observations': observations}
    (base.ROOT / 'runtime.json').write_text(json.dumps(data, indent=2, allow_nan=False))


def rows(frame, descriptor):
    height, capacity, width, pitch = unpack(frame, descriptor, 'IIII')
    if not 0 < height <= capacity <= 8 or width != 64 or not width <= pitch <= 8192:
        raise ValueError('Complete bounded filter matrix required')
    data = scalar(frame, descriptor + 16, 'Q')
    return [list(unpack(frame, data + i * pitch * 4, 'f' * 64)) for i in range(height)]


def filter_state(frame, address):
    begin, end = unpack(frame, address, 'QQ')
    if end < begin or (end - begin) % 16 or (end - begin) // 16 > 32:
        raise ValueError('Bounded allpass tap inventory required')
    count = scalar(frame, address + 0x20, 'I')
    if not 1 <= count <= 8192 or count & (count - 1): raise ValueError('Power-of-two scalar ring required')
    raw = memory(frame, scalar(frame, address + 0x18, 'Q'), count * 4)
    return {'taps': [dict(zip(('start', 'end', 'c', 'g'), unpack(frame, p, 'IIff'))) for p in range(begin, end, 16)],
            'length': count, 'write': scalar(frame, address + 0x40, 'I'), 'read': scalar(frame, address + 0x44, 'I'),
            'ring': list(unpack(frame, scalar(frame, address + 0x18, 'Q'), 'f' * count)), 'ringSha256': hashlib.sha256(raw).hexdigest()}


def observed(frame, location, _):
    try:
        if frame.GetThread().GetIndexID() != 1 or frame.GetPCAddress().GetFileAddress() != 0x1006ca950 or location.GetAddress().GetFileAddress() != 0x1006ca950:
            raise ValueError('Exact owned global allpass call required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        source, target, table = reg('x0'), reg('x1'), reg('x2')
        if scalar(frame, source, 'I') != 1 or scalar(frame, target, 'I') != 3:
            raise ValueError('Mono-to-three-row allpass branch required')
        observations.append({'postFilterEnabled': scalar(frame, reg('x21') + 0x18, 'B'), 'source': rows(frame, source), 'outputBefore': rows(frame, target),
                             'filters': [filter_state(frame, table + 72 * i) for i in range(3)]})
        for hook in base.hooks: hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks: hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh private probe directory required')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address 0x1006ca950 --shlib "Pianoteq 9"', result)
    if not result.Succeeded(): raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail(): raise RuntimeError(str(error))
    hook.SetAutoContinue(True); base.hooks.append(hook); base.save = save; save()
