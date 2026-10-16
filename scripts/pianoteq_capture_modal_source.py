"""Observe modal-generator input/output at one fixed hardware point.

Uses only the authorized debug copy with an exact __text identity check.
0x1007a4784 is immediately after 1026dc returns, before amplitude normalization.
PIANOTEQ_CAPTURE_DIR must name a fresh private directory. No process writes.
PIANOTEQ_SOURCE_STAGE=normalized selects 7a48d4 after amplitude normalization.
"""
import json
import os
from pathlib import Path
import traceback

from pianoteq_damper_runtime_capture import verify_text, scalar, unpack

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_SOURCE_STAGE', 'generated')
POINT = {'generated': 0x1007a4784, 'normalized': 0x1007a48d4}[STAGE]
records, errors, notes = [], [], {}
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': hex(POINT), 'stage': STAGE, 'records': records, 'errors': errors,
        'notes_seen': notes, 'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def vector(frame, address):
    begin, end, capacity = unpack(frame, address, 'QQQ')
    assert begin <= end <= capacity and (end - begin) % 4 == 0
    count = (end - begin) // 4
    assert count <= 32768
    values = []
    for start in range(0, count, 1024):
        values.extend(unpack(frame, begin + 4 * start, 'f' * min(1024, count - start)))
    return values


def matrix(frame, address):
    begin, end, capacity, rows, cols = unpack(frame, address, 'QQQQQ')
    assert rows <= 8192 and cols <= 8192 and (end - begin) // 4 == rows * cols
    return {'rows': rows, 'cols': cols, 'values': vector(frame, address)}


def observed(frame, bp, _):
    try:
        cache = frame.FindRegister('x19').GetValueAsUnsigned()
        g = frame.FindRegister('x20').GetValueAsUnsigned()
        note = scalar(frame, g + 0x14)
        notes[str(note)] = notes.get(str(note), 0) + 1
        if note != 69 or len(records) >= 4:
            return False
        records.append({
            'note': note, 'note_index': scalar(frame, g + 8, 'I'),
            'mode': scalar(frame, cache + 0xe4, 'I'),
            'reference_index': scalar(frame, cache + 0xe0, 'I'),
            'cache_controls': {hex(o): scalar(frame, cache + o) for o in (
                0xf8, 0x110, 0x128, 0x140, 0x158, 0x170, 0x188,
                0x1a0, 0x1e0, 0x270)},
            'cache_vectors': {hex(o): vector(frame, cache + o) for o in (0x1b8, 0x1f8, 0x220, 0x248)},
            'matrices': {hex(o): matrix(frame, cache + o) for o in (0x10, 0x38, 0x60, 0x88)},
            'modal_coordinates': vector(frame, cache + 0xb0),
            'G_controls': {hex(o): scalar(frame, g + o) for o in (
                0x28, 0x78, 0x98, 0x148, 0x160, 0x400,
                0x418, 0x430, 0x448, 0x460, 0x478)},
            'component_count': scalar(frame, g + 0x108, 'I'),
            'G_vectors': {hex(o): vector(frame, g + o) for o in (0x40, 0x120, 0x6f0)},
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
