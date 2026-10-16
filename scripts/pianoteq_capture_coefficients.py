"""Read-only LLDB capture after coefficient refresh in the exact pass6 build.

Set PIANOTEQ_CAPTURE_DIR to a fresh directory, import this module in LLDB after
selecting the authorized debug copy, and run headless. Fixed hardware point
0x100864d28 observes the active refresh before its initial flag is cleared.
"""
import json
import os
from pathlib import Path
import struct
import traceback

from pianoteq_damper_runtime_capture import verify_text, memory, scalar, unpack

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records = []
errors = []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        v = frame.FindRegister('x24').GetValueAsUnsigned() - 0x18
        stage = 'released' if scalar(frame, v + 0x7e4) > 0 else 'held'
        limit = 40 if stage == 'released' else 8
        if sum(r['stage'] == stage for r in records) >= limit:
            return False
        o = scalar(frame, v, 'Q')
        groups = scalar(frame, o + 0xa8, 'Q')
        assert 0 < groups <= 8
        pointers = {name: scalar(frame, v + offset, 'Q') for name, offset in {
            'frequency': 0x20, 'modal_decay': 0x48, 'K': 0xe8,
            'S': 0x110, 'sin_inverse': 0x138, 'R': 0x160,
            'energy': 0x188, 'position_weight': 0x788,
        }.items()}
        pointers['P'] = scalar(frame, o + 0x58, 'Q')
        pointers['Q'] = scalar(frame, o + 0x80, 'Q')
        # Verified stack slot used to restore x2 in the exp coefficient loop.
        fp = frame.FindRegister('x29').GetValueAsUnsigned()
        pointers['effective_decay'] = scalar(frame, fp - 0x210, 'Q')
        coefficients = scalar(frame, o + 8, 'Q')
        record = {
            'stage': stage,
            'thread': frame.GetThread().GetThreadID(), 'V': hex(v),
            'initial_flag': scalar(frame, v + 0x18, 'B'),
            'layout_flag': scalar(frame, o + 0xe0, 'B'),
            'input_mode': scalar(frame, o + 0xf0, 'I'),
            'block_length_V768': scalar(frame, v + 0x768, 'i'),
            'block_factor_V810': scalar(frame, v + 0x810, 'I'),
            'controls': {hex(offset): scalar(frame, v + offset) for offset in (
                0xc, 0x780, 0x784, 0x7b0, 0x7e0, 0x7e4, 0x7e8, 0x7ec, 0x7f0,
                0x7f4, 0x7f8, 0x7fc, 0x800, 0x804)},
            'groups': [], 'lanes': [],
        }
        for group in range(groups):
            start, padded, capacity, count = unpack(frame, o + 0xb0 + 16 * group, 'IIII')
            assert 0 <= start < 8192 and 0 <= count <= 8192 - start
            record['groups'].append([start, padded, capacity, count])
            for lane in range(start // 4 * 4, (start + count + 3) // 4 * 4):
                values = {name: scalar(frame, address + lane * 4) for name, address in pointers.items()}
                index = (lane // 4) * 8 + lane % 4
                values.update({'lane': lane, 'group': group, 'valid': start <= lane < start + count,
                               'A': scalar(frame, coefficients + index * 4),
                               'B': scalar(frame, coefficients + (index + 4) * 4)})
                record['lanes'].append(values)
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
        'breakpoint set --hardware --address 0x100864d28 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
