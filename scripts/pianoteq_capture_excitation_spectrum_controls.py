"""Observe configured and actively consumed spectrum controls without target writes."""
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

NOTES = {int(n) for n in os.environ.get('PIANOTEQ_SPECTRUM_NOTES', '69').split(',')}
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
    data.update(spectrumControlRecords=records, spectrumControlErrors=errors)
    file.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, bp, _):
    try:
        reg = lambda n: frame.FindRegister(n).GetValueAsUnsigned()
        active = frame.GetPCAddress().GetFileAddress() == 0x100695108
        g = reg('x25') if active else reg('x19')
        note = scalar(frame, g + 0x14)
        if note not in NOTES:
            return False
        row = dict(stage='active' if active else 'configured', note=note, source=hex(g),
                   scale=scalar(frame, g + 0xf0), referenceTable=vector(frame, g + 0x190),
                   lowerBase=scalar(frame, g + 0x1014), lowerScale=scalar(frame, g + 0xe7c))
        if len(row['referenceTable']) != 3:
            raise ValueError('Three reference frequencies required')
        if active:
            shared = scalar(frame, g + 0x1240, 'Q')
            row.update(slopeBlend=scalar(frame, shared + 0x274),
                       lowerUSupport=scalar(frame, shared + 0x4f8),
                       mode=scalar(frame, reg('x19') + 0xec, 'i'))
        if len(records) >= 128:
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
    for address in (0x1001c84a0, 0x100695108):
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
