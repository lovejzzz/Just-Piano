"""Read source-generation registry results via one fixed hardware point.

0x100182edc follows the phase-constant lookup; x26 retains the integer scale.
PIANOTEQ_SOURCE_CONSTANT_KIND=weights instead reads the weight offset at 529384.
Requires the exact authorized debug build and a fresh private capture directory.
"""
import json
import os
from pathlib import Path
import struct
import traceback
from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
KIND = os.environ.get('PIANOTEQ_SOURCE_CONSTANT_KIND', 'phase')
POINT = {'phase': 0x100182edc, 'weights': 0x100529384}[KIND]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': hex(POINT), 'kind': KIND, 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    import lldb
    try:
        if len(records) >= 8:
            return False
        if KIND == 'weights':
            records.append({'weight_offset': frame.FindRegister('x0').GetValueAsUnsigned() & 0xffffffff})
            save()
            return False
        error = lldb.SBError()
        bits = frame.FindRegister('d0').GetData().GetUnsignedInt64(error, 0)
        if error.Fail():
            raise RuntimeError(str(error))
        records.append({'phase_constant_bits': f'{bits:016x}',
                        'phase_constant': struct.unpack('<d', struct.pack('<Q', bits))[0],
                        'integer_amplitude_scale': frame.FindRegister('x26').GetValueAsUnsigned() & 0xffffffff})
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    global hook
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        f'breakpoint set --hardware --address {POINT:#x} --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
