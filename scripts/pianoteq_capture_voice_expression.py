"""Observe expression inputs and initialized voice outputs without target writes."""
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

NOTES = {int(n) for n in os.environ.get('PIANOTEQ_EXTRA_TABLE_NOTES', '69').split(',')}
if not NOTES or any(n < 0 or n > 127 for n in NOTES):
    raise ValueError('Explicit MIDI note set required')
records, errors = [], []
original_save = base.save


def vector(frame, address):
    begin, end, capacity = unpack(frame, address, 'QQQ')
    if not begin <= end <= capacity or (end - begin) % 4 or end - begin > 16384:
        raise ValueError('Bounded history curve required')
    return list(unpack(frame, begin, 'f' * ((end - begin) // 4))) if end > begin else []


def save():
    original_save()
    file = base.ROOT / 'runtime.json'
    data = json.loads(file.read_text())
    data.update(expressionRecords=records, expressionErrors=errors)
    file.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, bp, _):
    try:
        reg = lambda n: frame.FindRegister(n).GetValueAsUnsigned()
        g, h, manager, runtime = reg('x25'), reg('x22'), reg('x19'), reg('x12')
        note = scalar(frame, g + 0x14)
        if note not in NOTES:
            return False
        profile = scalar(frame, runtime + 0x50, 'Q')
        special = scalar(frame, manager + 0xe58, 'Q')
        config = scalar(frame, special + 0x58, 'Q')
        row = dict(note=note, voice=hex(h),
                   inputs=dict(ec=scalar(frame, runtime + 0xec), f0=scalar(frame, runtime + 0xf0),
                               f4=scalar(frame, runtime + 0xf4), mix=scalar(frame, profile + 0x1c),
                               gain=scalar(frame, profile + 0x24), specialValue=scalar(frame, special + 0x248),
                               flags=[scalar(frame, config + off, 'B') for off in (0x16, 0x17, 0x14)]),
                   targets=dict(u=scalar(frame, h + 0x2fe4), control30=scalar(frame, h + 0x2fe8),
                                lowerControl=scalar(frame, h + 0x2fec)),
                   runtimePedals={hex(off): scalar(frame, runtime + off) for off in (0x90,0x94,0x98,0x9c,0xa0,0xa4,0xe0,0xe4,0xe8)})
        if len(records) >= 256:
            raise ValueError('Spectrum observation bound exceeded')
        records.append(row)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:
            hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists():
        raise ValueError('Fresh native output required')
    for address in (0x10035f324,):
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail():
            raise RuntimeError(str(error))
        hook.SetAutoContinue(True)
        base.hooks.append(hook)
    save()
