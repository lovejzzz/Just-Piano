"""Read-only single-point capture for the 2ff628 complex coupling producer.

PIANOTEQ_IMPEDANCE_STAGE selects before (194ca8), after (2ffa0c), or radius
(2ff89c). Each run uses one hardware point and a fresh private output directory.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_source_weights import curve

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_IMPEDANCE_STAGE', 'before')
POINT = {'before': 0x100194ca8, 'after': 0x1002ffa0c, 'radius': 0x1002ff89c}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': hex(POINT), 'stage': STAGE, 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        register = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        g = register('x25')
        if scalar(frame, g + 0x14) != 69 or len(records) >= 128:
            return False
        if STAGE == 'radius':
            record = {'radius': regfloat(frame, 's1', 'f')}
        else:
            sp = register('sp')
            caller_sp = sp + 0xa0 if STAGE == 'after' else sp
            cache = scalar(frame, caller_sp + 0x78, 'Q')
            mode = scalar(frame, cache + 0xe4, 'I')
            record = {'note_index': scalar(frame, g + 8, 'I'), 'cache_mode': mode,
                      'modal_coordinate': scalar(frame, sp + 0x30, 'd') if STAGE == 'after'
                          else regfloat(frame, 'd13', 'd')}
            if STAGE == 'before':
                obj = register('x0')
                assert obj == g + 0x488 + 0x128 * mode
                record.update(
                    inputs={f's{i}': regfloat(frame, f's{i}', 'f') for i in range(4)},
                    controls={hex(o): scalar(frame, obj + o) for o in (0x20, 0x38, 0x50, 0xc8)},
                    phase_curve=curve(frame, obj + 0x68),
                    band_frequencies=vector(frame, obj + 0xe0),
                    band_gains=vector(frame, obj + 0x108))
            else:
                record.update(p=regfloat(frame, 'd0', 'd'), q=regfloat(frame, 'd1', 'd'))
        records.append(record)
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
