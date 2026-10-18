"""Observe configured history fields and the actually selected ordinary note branch."""
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

NOTES = {int(n) for n in os.environ.get('PIANOTEQ_HISTORY_NOTES', '69').split(',')}
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
    data.update(historyRecords=records, historyErrors=errors)
    file.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, bp, _):
    try:
        reg = lambda n: frame.FindRegister(n).GetValueAsUnsigned()
        ordinary = frame.GetPCAddress().GetFileAddress() == 0x10035f07c
        g = reg('x25') if ordinary else reg('x19')
        note = scalar(frame, g + 0x14)
        if note not in NOTES:
            return False
        row = dict(stage='ordinary' if ordinary else 'configured', note=note, source=hex(g),
                   frequency=scalar(frame, g + 0x78), positiveGain=scalar(frame, g + 0x23c),
                   negativeGain=scalar(frame, g + 0x240),
                   repeatedFields={hex(o): scalar(frame, g + o) for o in range(0x378, 0x398, 4)},
                   historyBlend=scalar(frame, g + 0x3e8), historyCurve=dict(
                       x=vector(frame, g + 0x3b0), y=vector(frame, g + 0x3c8),
                       dimension=scalar(frame, g + 0x3e0, 'I'), log_x=scalar(frame, g + 0x3e4, 'B'),
                       special_mode=scalar(frame, g + 0x3e5, 'B')))
        if ordinary:
            h = reg('x22')
            row.update(host=hex(h), direction=scalar(frame, h + 0x308c, 'i'), noteScale=scalar(frame, h + 0x3078))
        if len(records) >= 128:
            raise ValueError('History observation bound exceeded')
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
    for address in (0x1001c7b54, 0x10035f07c):
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
