"""Read-only input/output of the first component-amplitude mixing stage."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_final_excitation import table
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_MIX_STAGE', 'before')
POINT = {'before': 0x100692ffc, 'after': 0x1006930f0}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        assert len(records) < 32
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        params = reg('x0' if STAGE == 'before' else 'x26')
        k = reg('x1' if STAGE == 'before' else 'x21')
        mode = reg('w2') if STAGE == 'before' else scalar(frame, reg('x19') + 0xec, 'I')
        g = scalar(frame, params, 'Q')
        h = params - 0x2fb8
        record = {'note': scalar(frame, g + 0x14), 'mode': mode,
                  'source': table(frame, k),
                  'controls': {'velocity': scalar(frame, params + 0x20),
                               # Historical field label; CC67 attribution is unproven.
                               'soft': scalar(frame, params + 0x40),
                               'blendFloor': scalar(frame, params + 0x28),
                               'hostBlend': scalar(frame, h + 0x90)},
                  'coefficientA': vector(frame, g + 0x348),
                  'coefficientB': vector(frame, g + 0x360)}
        if STAGE == 'before':
            record['inputBlend'] = regfloat(frame, 's1', 'f')
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
