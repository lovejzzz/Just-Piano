"""One hardware site: read-only release-position publication across native blocks."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar

rows, errors, voices = [], [], {}
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
    data.update(releaseCopies=rows, releaseCopyErrors=errors,
                releaseCopySite='0x1004604d0', releaseCopyTargetMutation=False)
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x1004604d0 or \
                location.GetAddress().GetFileAddress() != 0x1004604d0 or len(rows) >= 20000:
            raise ValueError('Owned bounded release-copy site required')
        voice = frame.FindRegister('x19').GetValueAsUnsigned()
        if voice not in voices:
            if len(voices) >= 4:
                raise ValueError('Voice bound exceeded')
            voices[voice] = len(voices)
        row = {'ordinal': len(rows), 'voice': hex(voice), 'epoch': voices[voice],
               'thread': frame.GetThread().GetThreadID(),
               'counter': scalar(frame, voice + 0x6c, 'I'),
               'modalCounter': scalar(frame, voice + 0x178, 'I'),
               'previousRelease': scalar(frame, voice + 0x2f24),
               'nextRelease': regfloat(frame, 's0'),
               'modalPosition': scalar(frame, voice + 0xab0),
               'duration': scalar(frame, voice + 0x2f20),
               'velocity': scalar(frame, voice + 0x78),
               'sourcePosition': scalar(frame, voice + 0x2ec8),
               'cacheCounter2f78': scalar(frame, voice + 0x2f78, 'I'),
               'cacheCounter2f7c': scalar(frame, voice + 0x2f7c, 'I'),
               'cacheCounter2f80': scalar(frame, voice + 0x2f80, 'I')}
        if row['nextRelease'] != row['modalPosition']:
            raise ValueError('Publication register differs from modal source')
        rows.append(row)
        if len(rows) % 128 == 0:
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
        'breakpoint set --hardware --address 0x1004604d0 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
