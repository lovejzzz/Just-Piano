"""One hardware site: bounded pending-to-current release handoff inputs."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar

rows, errors, voices = [], [], {}
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(handoffs=rows, handoffErrors=errors, handoffSite='0x10020df90')
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x10020df90 or \
                location.GetAddress().GetFileAddress() != 0x10020df90 or len(rows) >= 20000:
            raise ValueError('Owned bounded handoff site required')
        voice = frame.FindRegister('x0').GetValueAsUnsigned()
        samples = frame.FindRegister('w1').GetValueAsUnsigned()
        if samples != 64:
            raise ValueError('Supported 64-sample handoff required')
        if voice not in voices:
            if len(voices) >= 16:
                raise ValueError('Voice bound exceeded')
            voices[voice] = len(voices)
        row = {'ordinal': len(rows), 'voice': hex(voice), 'epoch': voices[voice],
               'counter': scalar(frame, voice + 0x6c, 'I'), 'samples': samples,
               'velocity': scalar(frame, voice + 0x78),
               'currentPosition': scalar(frame, voice + 0x2ec8),
               'currentRelease': scalar(frame, voice + 0x2ec5, 'B'),
               'currentDirection': scalar(frame, voice + 0x2ec6, 'B'),
               'pendingPosition': scalar(frame, voice + 0x2f9c),
               'pendingSamples': scalar(frame, voice + 0x2f94, 'I'),
               'pending': scalar(frame, voice + 0x2f98, 'B'),
               'pendingRelease': scalar(frame, voice + 0x2f99, 'B'),
               'pendingDirection': scalar(frame, voice + 0x2f9a, 'B'),
               'skipPending': scalar(frame, voice + 0x2fa7, 'B'),
               'override14c': scalar(frame, voice + 0x14c),
               'cap3084': scalar(frame, voice + 0x3084)}
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
        'breakpoint set --hardware --address 0x10020df90 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
