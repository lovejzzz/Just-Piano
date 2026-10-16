"""Read 194870's curve selection and 2ff628 argument production.

One fixed hardware point at 194ca8; exact debug __text checked before launch.
Never writes target memory. A fresh PIANOTEQ_CAPTURE_DIR is required.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_source_weights import curve

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
NOTE = float(os.environ.get('PIANOTEQ_CAPTURE_NOTE', '69'))
records, configurations, errors = [], {}, []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': '0x100194ca8', 'records': records,
        'configurations': configurations, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        g, sp, fp = reg('x25'), reg('sp'), reg('x29')
        if scalar(frame, g + 0x14) != NOTE or len(records) >= 128:
            return False
        cache = scalar(frame, sp + 0x78, 'Q')
        mode = scalar(frame, cache + 0xe4, 'I')
        selected = [scalar(frame, fp - 0xb8, 'Q'), scalar(frame, sp + 0xc0, 'Q')]
        key = f'{scalar(frame, g + 8, "I")}:{mode}'
        if key not in configurations:
            owner = scalar(frame, g + 0x1240, 'Q')
            grid = owner + 0x48
            begin, end, capacity = unpack(frame, grid + 0x18, 'QQQ')
            assert begin <= end <= capacity and (end - begin) % 0x50 == 0
            count = (end - begin) // 0x50
            assert 0 < count <= 256
            assert all(begin <= ptr < end and (ptr - begin) % 0x50 == 0 for ptr in selected)
            configurations[key] = {
                'note': scalar(frame, g + 0x14), 'note_index': scalar(frame, g + 8, 'I'), 'mode': mode,
                'pitch_coordinates': vector(frame, grid),
                'frequency_curves': [curve(frame, begin + 0x50 * j) for j in range(count)],
                'selected_indices': [(ptr - begin) // 0x50 for ptr in selected],
                'fraction': scalar(frame, sp + 0xbc),
                'base_extra_db': scalar(frame, sp + 0x4c),
                'G_controls': {hex(o): scalar(frame, g + o) for o in (0x28, 0x78, 0x98, 0x148)},
                'G_vectors': {hex(o): vector(frame, g + o) for o in (0x40, 0x120)},
                'cache_controls': {hex(o): scalar(frame, cache + o) for o in (0xf8, 0x1a0, 0x1e0, 0x270)},
                'cache_vectors': {hex(o): vector(frame, cache + o) for o in (0x1b8, 0x1f8)},
            }
        records.append({
            'key': key, 'modal_coordinate': regfloat(frame, 'd13', 'd'),
            'inputs': {f's{i}': regfloat(frame, f's{i}', 'f') for i in range(4)},
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
        'breakpoint set --hardware --address 0x100194ca8 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
