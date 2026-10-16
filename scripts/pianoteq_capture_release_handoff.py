"""Observe release setter/refresh handoff in the authorized debug copy.

Hardware breakpoints and memory reads only. PIANOTEQ_CAPTURE_DIR must be fresh;
PIANOTEQ_RELEASE_STAGE selects setter, refresh, or combined. The bounded counter
window deliberately covers this project's short A4 release fixture, not every
voice or arbitrary MIDI. See the pass34 report for observer-effect limitations.
"""
import json
import os
from pathlib import Path
import traceback

from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_RELEASE_STAGE', 'setter')
POINTS = {'setter': 0x100533818, 'refresh': 0x1006e4f5c,
          'coefficients': 0x1006e5344}
records, errors, hooks = [], [], []
seen_window = False


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'stage': STAGE, 'counter_window': [3000, 4608],
        'records': records, 'errors': errors,
        'hooks': [{'id': b.GetID(), 'hits': b.GetHitCount(),
                   'enabled': b.IsEnabled()} for b in hooks],
    }, indent=2))


def observed(frame, location, _):
    global seen_window
    try:
        point = frame.GetPCAddress().GetFileAddress()
        stage = next(k for k, v in POINTS.items() if v == point)
        v = frame.FindRegister('x19' if stage == 'coefficients' else 'x0').GetValueAsUnsigned()
        counter = scalar(frame, v + 0x10, 'I')
        if not 3000 <= counter <= 4608:
            if seen_window and counter > 4608:
                for hook in hooks:
                    hook.SetEnabled(False)
                save()
            return False
        seen_window = True
        record = {
            'stage': stage, 'point': hex(point), 'V': hex(v),
            'thread': frame.GetThread().GetThreadID(),
            'caller': hex(frame.FindRegister('x30').GetValueAsUnsigned()),
            'sample_counter': counter,
            'previous_block_samples': scalar(frame, v + 0x904, 'I'),
            'fields': {hex(o): scalar(frame, v + o) for o in
                       (0x8c0, 0x8c4, 0x8c8, 0x8cc, 0x8d0, 0x8d4,
                        0x7b0, 0x7e4, 0x8fc, 0x944)},
            'flags': {hex(o): scalar(frame, v + o, 'B') for o in
                      (0x924, 0x925, 0x926, 0x931)},
        }
        if stage == 'setter':
            record['input'] = {
                'position': regfloat(frame, 's0', 'f'),
                'release': frame.FindRegister('w1').GetValueAsUnsigned(),
                'direction': frame.FindRegister('w2').GetValueAsUnsigned(),
            }
            # These two verified call sites pass V=H+0x168. Do not apply
            # this ownership relation to other callers or standalone objects.
            if record['caller'] in ('0x10046030c', '0x100460324'):
                h = v - 0x168
                record['handoff'] = {
                    'H': hex(h),
                    'current_position': scalar(frame, h + 0x2ec8),
                    'pending_position': scalar(frame, h + 0x2f9c),
                    'pending_samples': scalar(frame, h + 0x2f94, 'i'),
                    'pending': scalar(frame, h + 0x2f98, 'B'),
                    'pending_release': scalar(frame, h + 0x2f99, 'B'),
                    'pending_direction': scalar(frame, h + 0x2f9a, 'B'),
                }
        records.append(record)
        assert len(records) <= 512, 'Unexpected voice/call population'
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    assert STAGE in ('setter', 'refresh', 'combined')
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    stages = POINTS if STAGE == 'combined' else (STAGE,)
    for stage in stages:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {POINTS[stage]:#x} '
            '--shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(hook)
    save()
