"""Read-only secondary excitation, append, or phase randomization snapshots."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_FINAL_STAGE', 'merged')
POINT = {'secondary': 0x10071677c, 'merged': 0x100717a8c, 'phased': 0x100717cb4}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def table(frame, k):
    header = list(unpack(frame, k, 'IIIIIIII'))
    size = scalar(frame, k + 0x28, 'Q')
    quads = scalar(frame, k + 0x80, 'Q')
    assert 0 < size <= 4096 and size <= quads * 4 <= size + 3
    return {'header': header, 'size': size,
            'source': {name: list(unpack(frame, scalar(frame, k + off, 'Q'), 'f' * size))
                       for name, off in {'frequency': 0x20, 'decay': 0x48, 'amplitude': 0x70, 'phase': 0x98}.items()},
            'amplitudeStorage': list(unpack(frame, scalar(frame, k + 0x70, 'Q'), 'f' * (quads * 4)))}


def observed(frame, bp, _):
    try:
        assert len(records) < 16
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        h, g, k = reg('x28'), reg('x25'), reg('x24')
        shared = scalar(frame, g + 0x1240, 'Q')
        scales = scalar(frame, g + 0xc00, 'Q')
        seed = scalar(frame, h + 0x2fd0, 'Q')
        record = {'note': scalar(frame, g + 0x14), 'noteIndex': scalar(frame, g + 8, 'I'),
                  **table(frame, k), 'randomState': list(unpack(frame, seed, 'IIII')),
                  'controls': {'mode': scalar(frame, g + 0xbf8, 'I'),
                               'primaryGain': scalar(frame, scales), 'secondaryGain': scalar(frame, scales + 4),
                               'amplitudeGain': scalar(frame, shared + 0x88),
                               'mergeControl': scalar(frame, shared + 0x5c0),
                               'frequencyJitter': scalar(frame, g + 0xc20), 'frequencyOffset': scalar(frame, g + 0xc24),
                               'phaseSpread': scalar(frame, g + 0xc2c), 'timeSpread': scalar(frame, g + 0xc30),
                               'phaseStartRow': scalar(frame, shared + 0x280, 'I')}}
        if STAGE == 'secondary':
            record['secondary'] = table(frame, reg('x26'))
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
