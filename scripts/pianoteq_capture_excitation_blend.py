"""Three bounded read-only sites for archive/shared/voice blend boundaries."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

records, errors = [], []
original_save = base.save


def vector(frame, address):
    begin, end, capacity = unpack(frame, address, 'QQQ')
    if not begin <= end <= capacity or (end - begin) % 4 or end - begin > 4096:
        raise ValueError('Bounded complete blend curve required')
    return list(unpack(frame, begin, 'f' * ((end - begin) // 4))) if end > begin else []


def curve(frame, address):
    return dict(x=vector(frame, address + 0x18), y=vector(frame, address + 0x30),
                dimension=scalar(frame, address + 0x48, 'I'),
                log_x=scalar(frame, address + 0x4c, 'B'), special_mode=scalar(frame, address + 0x4d, 'B'))


def save():
    original_save()
    file = base.ROOT / 'runtime.json'
    data = json.loads(file.read_text())
    data.update(blendRecords=records, blendErrors=errors)
    file.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, bp, _):
    try:
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        point = frame.GetPCAddress().GetFileAddress()
        if point == 0x100714924:
            r, a = reg('x19'), reg('x0')
            row = dict(stage='shared-first', shared=hex(r), presetScalar=scalar(frame, a + 0x9bc),
                       actual=scalar(frame, r + 0xb8))
        elif point == 0x1007149b8:
            r, b = reg('x19'), reg('x22')
            row = dict(stage='curve-copy', shared=hex(r), baseCurve=curve(frame, b + 0x19c8),
                       sharedCurve=curve(frame, r + 0xf0), baseSecond=scalar(frame, b + 0x1a18),
                       coefficients=[scalar(frame, r + 0xb8), scalar(frame, r + 0xbc)])
        else:
            h, g = reg('x19'), reg('x20')
            if scalar(frame, g + 0x14) != 69:
                return False
            r = scalar(frame, g + 0x1240, 'Q')
            row = dict(stage='voice', note=69, host=hex(h), shared=hex(r),
                       velocity=scalar(frame, h + 0x78), inputBlend=scalar(frame, h + 0x90),
                       blendFloor=scalar(frame, h + 0x2fe0),
                       activeCurve=curve(frame, r + 0xf0),
                       coefficients=[scalar(frame, r + 0xb8), scalar(frame, r + 0xbc)])
        if len(records) >= 128:
            raise ValueError('Blend observation bound exceeded')
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
        raise ValueError('Fresh capture directory required')
    for address in (0x100714924, 0x1007149b8, 0x10057e5bc):
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
