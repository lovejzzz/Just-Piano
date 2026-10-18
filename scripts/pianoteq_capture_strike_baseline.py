"""One-site read-only observation of repeated-strike inputs and old-voice choice."""
import json
import os
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

LIMIT = int(os.environ['PIANOTEQ_EXPECTED_STRIKES'])
if not 1 <= LIMIT <= 16:
    raise ValueError('Explicit bounded strike count required')
records, errors, voices = [], [], {}
original_save = base.save


def regfloat(frame, name):
    import lldb
    error = lldb.SBError()
    word = frame.FindRegister(name).GetData().GetUnsignedInt32(error, 0)
    if error.Fail():
        raise RuntimeError(str(error))
    return struct.unpack('<f', struct.pack('<I', word))[0]


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(strikeRecords=records, strikeErrors=errors, expectedStrikes=LIMIT)
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x10035ef10 or \
                location.GetAddress().GetFileAddress() != 0x10035ef10 or len(records) >= LIMIT:
            raise ValueError('Owned bounded strike-input site required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        manager, model, old, new = [reg(n) for n in ['x19', 'x25', 'x8', 'x22']]
        host = scalar(frame, manager + 0xc08, 'Q')
        runtime = scalar(frame, manager + 0xe00, 'Q')
        previous = None
        if old:
            if old not in voices:
                raise ValueError('Old voice must belong to this chronological run')
            count = scalar(frame, old + 0x2ed8, 'Q')
            if count > 16:
                raise ValueError('Bounded repeated-source history required')
            previous = {'epoch': voices[old], 'count': scalar(frame, old + 0x6c, 'I'),
                'duration': scalar(frame, old + 0x2f20), 'release': scalar(frame, old + 0x2f24),
                'velocity': scalar(frame, old + 0x78),
                'history': list(unpack(frame, old + 0x2ee0, 'f' * count)) if count else []}
        epoch = len(records)
        row = {'epoch': epoch, 'newVoice': hex(new), 'oldVoice': hex(old),
            'note': scalar(frame, model + 0x14), 'inputs': {'mode': reg('w27'),
                'newVelocity': regfloat(frame, 's9'), 'hostRate': scalar(frame, host + 0xc),
                'pedal': scalar(frame, runtime + 0x90), 'threshold': scalar(frame, runtime + 0x9c),
                'old': previous}}
        records.append(row)
        voices[new] = epoch
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
        raise ValueError('Fresh observation directory required')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x10035ef10 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
