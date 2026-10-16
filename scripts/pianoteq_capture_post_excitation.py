"""Observe post-excitation processing before/after in separate hardware-only runs."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_source_weights import curve

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_POST_STAGE', 'before')
POINT = {'before': 0x100716588, 'after': 0x10071658c}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'point': hex(POINT), 'stage': STAGE, 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        assert len(records) < 16
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        h, g, k = reg('x28'), reg('x25'), reg('x24')
        shared = scalar(frame, g + 0x1240, 'Q')
        header = list(unpack(frame, k, 'IIIIIIII'))
        size = scalar(frame, k + 0x28, 'Q')
        assert 0 < size <= 4096
        amplitude_quads = scalar(frame, k + 0x80, 'Q')
        assert size <= amplitude_quads * 4 <= size + 3
        start, end = unpack(frame, g + 0x7d0, 'QQ')
        assert start <= end and (end-start) % 4 == 0 and (end-start)//4 <= 8192
        rows = list(unpack(frame, start, 'I' * ((end-start)//4))) if end > start else []
        records.append({
            'note': scalar(frame, g + 0x14), 'noteIndex': scalar(frame, g + 8, 'I'),
            'header': header, 'size': size,
            'amplitudeStorage': list(unpack(frame, scalar(frame, k + 0x70, 'Q'), 'f' * (amplitude_quads * 4))),
            'source': {name: list(unpack(frame, scalar(frame, k + off, 'Q'), 'f' * size))
                       for name, off in {'frequency': 0x20, 'decay': 0x48, 'amplitude': 0x70, 'phase': 0x98}.items()},
            'combinationRows': rows,
            'curves': {hex(off): curve(frame, g + off) for off in (0x1028, 0x1078)},
            'host': {hex(off): scalar(frame, h + off) for off in (0x78, 0x2fe8, 0x29f8, 0x29fc)},
            'hostCount': scalar(frame, h + 0x68, 'I'),
            'G': {hex(off): scalar(frame, g + off) for off in (0x1e8, 0x10c8, 0x10cc)},
            'shared': {hex(off): scalar(frame, shared + off) for off in (0x88, 0x158, 0x15c, 0x160, 0x164)},
            'combinationCount': scalar(frame, shared + 0x168, 'I'),
            'combinationStart': scalar(frame, shared + 0x16c, 'I'),
            'spreadVariation': {'enabled': scalar(frame, shared + 0x1e8, 'I'),
                                'mode': scalar(frame, shared + 0x1ec, 'I'),
                                'low': scalar(frame, shared + 0x1f0),
                                'high': scalar(frame, shared + 0x1f4)},
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
