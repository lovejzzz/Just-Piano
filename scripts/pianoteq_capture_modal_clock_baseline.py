"""One-site read-only modal/consumer clocks and release coefficients before rendering."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

rows, errors, voices = [], [], {}
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(modalClockRecords=rows, modalClockErrors=errors, modalClockSite='0x100472f50')
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x100472f50 or \
                location.GetAddress().GetFileAddress() != 0x100472f50 or len(rows) >= 20000:
            raise ValueError('Owned bounded pre-render modal site required')
        modal = frame.FindRegister('x19').GetValueAsUnsigned()
        voice = modal - 0x168
        if voice not in voices:
            if len(voices) >= 16:
                raise ValueError('Voice bound exceeded')
            voices[voice] = len(voices)
        rows.append({'ordinal': len(rows), 'voice': hex(voice), 'epoch': voices[voice],
                     'workerCounter': scalar(frame, modal + 0x10, 'I'),
                     'consumerCounter': scalar(frame, voice + 0x6c, 'I'),
                     'velocity': scalar(frame, voice + 0x78),
                     'publishedRelease': scalar(frame, voice + 0x2f24),
                     'modalRelease': scalar(frame, modal + 0x948),
                     'u': scalar(frame, modal + 0x8cc),
                     'releaseFlag': scalar(frame, modal + 0x924, 'B'),
                     'rattle': scalar(frame, modal + 0x8c4),
                     'actual': {'duration': scalar(frame, modal + 0x944),
                                'rate': scalar(frame, modal + 0x7e4),
                                'gain': scalar(frame, modal + 0x7b0)},
                     'inputs': {'polynomial': [scalar(frame, modal + 0x914),
                                               *unpack(frame, modal + 0x94c, 'ffff')],
                                'cubicScale': scalar(frame, modal + 0x91c),
                                'rateScale': scalar(frame, modal + 0x910),
                                'gainScale': scalar(frame, modal + 0x90c),
                                'cubicGainScale': scalar(frame, modal + 0x920)},
                     'currentPosition': scalar(frame, voice + 0x2ec8),
                     'pendingPosition': scalar(frame, voice + 0x2f9c),
                     'pending': scalar(frame, voice + 0x2f98, 'B'),
                     'skipPending': scalar(frame, voice + 0x2fa7, 'B'),
                     'dispatch': scalar(frame, modal + 0x80c, 'B')})
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
        'breakpoint set --hardware --address 0x100472f50 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
