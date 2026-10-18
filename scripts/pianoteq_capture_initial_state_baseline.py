"""One-site read-only initial modal states; disable observation after five starts."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack
from pianoteq_capture_coefficients import capture_record

rows, errors, voices = [], [], set()
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(initialStates=rows, initialStateErrors=errors,
                initialStateSite='0x100864d28', initialStateExpected=5,
                observationDisabledAfterStarts=bool(len(rows) == 5 and all(not h.IsEnabled() for h in base.hooks)))
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x100864d28 or \
                location.GetAddress().GetFileAddress() != 0x100864d28:
            raise ValueError('Owned initialization site required')
        modal = frame.FindRegister('x24').GetValueAsUnsigned() - 0x18
        if scalar(frame, modal + 0x18, 'B') != 1:
            return False
        voice = modal - 0x168
        if voice in voices or len(rows) >= 5:
            raise ValueError('Five unique chronological voice starts required')
        target = capture_record(frame)
        if target['sample_counter'] != 0 or len(target['groups']) != 3:
            raise ValueError('Supported initial three-group state required')
        # Reserved +7fc is not an arithmetic input. Preserve its raw word,
        # including non-finite float interpretations, rather than normalizing it.
        del target['controls']['0x7fc']
        target['uninterpretedWords'] = {'0x7fc': scalar(frame, modal + 0x7fc, 'I')}
        count = scalar(frame, voice + 0x3008, 'Q')
        history_count = scalar(frame, voice + 0x2ed8, 'Q')
        if count > 16 or history_count > 16:
            raise ValueError('Bounded source histories required')
        seed = scalar(frame, voice + 0x2fd0, 'Q')
        row = {'epoch': len(rows), 'voice': hex(voice), 'velocity': scalar(frame, voice + 0x78),
               'repeat': {'flag': scalar(frame, voice + 0x2ff0, 'B'),
                          'age': scalar(frame, voice + 0x2ffc),
                          'oldVelocity': scalar(frame, voice + 0x3000),
                          'attenuation': scalar(frame, voice + 0x2ff8),
                          'history': list(unpack(frame, voice + 0x3010, 'f' * count)) if count else []},
               'supportHistory': list(unpack(frame, voice + 0x2ee0, 'f' * history_count)) if history_count else [],
               'randomState': list(unpack(frame, seed, 'IIII')) if seed else None,
               'onset': {'remaining': scalar(frame, modal + 0x720, 'I'),
                         'settle': scalar(frame, modal + 0x724, 'I'),
                         'delay': scalar(frame, modal + 0x728, 'I'),
                         'square': scalar(frame, modal + 0x72c, 'B'),
                         'sine': scalar(frame, modal + 0x730, 'd'),
                         'cosine': scalar(frame, modal + 0x738, 'd'),
                         'step': list(unpack(frame, modal + 0x740, 'dd')),
                         'filtered': scalar(frame, modal + 0x750, 'B'),
                         'coefficients': list(unpack(frame, modal + 0x754, 'fff')),
                         'history': list(unpack(frame, modal + 0x760, 'ff'))},
               'target': target}
        rows.append(row)
        voices.add(voice)
        if len(rows) == 5:
            for hook in base.hooks:
                hook.SetEnabled(False)
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
        'breakpoint set --hardware --address 0x100864d28 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
