"""Read-only pitch initialization inputs after V938/V93c/V940 stores."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_source_weights import curve

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_PITCH_SOURCE_STAGE', 'voice')
POINT = {'voice': 0x10043dff4, 'curves': 0x1001c5f30}[STAGE]
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
        if len(records) >= 32:
            raise RuntimeError('Pitch initialization capture limit exceeded')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if STAGE == 'curves':
            g, base = reg('x19'), reg('x0')
            if scalar(frame, g + 0x14) != 69:
                return False
            records.append({'note': scalar(frame, g + 0x14), 'base_type': scalar(frame, base + 0x158, 'i'),
                            'base_strength': scalar(frame, g + 0x1008),
                            'curves': {hex(o): curve(frame, base + o) for o in (0x3a90, 0x3ae0)}})
            save()
            return False
        v, params, g = reg('x19'), reg('x20'), reg('x23')
        h = v - 0x168
        assert scalar(frame, params, 'Q') == g
        shared = scalar(frame, g + 0x1240, 'Q')
        records.append({
            'V': hex(v), 'G': hex(g), 'note': scalar(frame, g + 0x14),
            'host': {hex(o): scalar(frame, h + o) for o in (0x78, 0x80, 0x2fd8, 0x2fe0)},
            'host_mode': scalar(frame, h + 0x2f90, 'I'),
            'G_controls': {hex(o): scalar(frame, g + o) for o in (0x78, 0xa0, 0xc0, 0x1008, 0x100c)},
            'params': {hex(o): scalar(frame, params + o) for o in (0x10, 0x14, 0x18, 0x1c, 0x20, 0x24, 0x28, 0x2c, 0x30)},
            'voice': {hex(o): scalar(frame, v + o) for o in (0x938, 0x93c, 0x940)},
            'flags': {hex(o): scalar(frame, v + o, 'B') for o in (0x930, 0x931, 0x932, 0x933, 0x934)},
            'shared': {hex(o): scalar(frame, shared + o) for o in (0x8c, 0x90)},
            'shared_mode': scalar(frame, shared + 0x140, 'I'),
            'shared_flags': list(unpack(frame, shared + 0x19, 'BBBB')),
            'velocity_curve': curve(frame, shared + 0x218),
        })
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
