"""Read-only source-to-voice mapping at one hardware breakpoint; private output."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINT = 0x1009517d8
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def floats(frame, pointer, count):
    assert 0 < count <= 4096
    return list(unpack(frame, pointer, 'f' * count))


def observed(frame, bp, _):
    try:
        assert len(records) < 16, 'Unexpected number of voices'
        v = frame.FindRegister('x19').GetValueAsUnsigned()
        k = frame.FindRegister('x21').GetValueAsUnsigned()
        o = scalar(frame, v, 'Q')
        groups = scalar(frame, o + 0xa8, 'Q')
        assert 0 < groups <= 8
        layout = [list(unpack(frame, o + 0xb0 + 16*g, 'IIII')) for g in range(groups)]
        length = max(start + count for start, _, _, count in layout)
        header = list(unpack(frame, k, 'IIIIIIII'))
        size = scalar(frame, k + 0x28, 'Q')
        assert 0 < size <= 4096
        config = frame.FindRegister('x26').GetValueAsUnsigned()
        record = {'V': hex(v), 'K': hex(k), 'header': header, 'layout': layout,
                  'selection_controls': {
                      'sampleRate': scalar(frame, config),
                      'groupCount': scalar(frame, config + 8, 'I'),
                      'splitFrequency': scalar(frame, config + 12),
                      'alignment': scalar(frame, o + 0xe8, 'I'),
                      'bypassAmplitudeFilter': scalar(frame, v + 0x718, 'B') & 1,
                      'amplitudeThreshold': scalar(frame, v + 0x774),
                      'projectedThreshold': scalar(frame, v + 0x778)},
                  'source_size': size,
                  'source': {name: floats(frame, scalar(frame, k + off, 'Q'), size)
                             for name, off in {'frequency': 0x20, 'decay': 0x48,
                                               'amplitude': 0x70, 'phase': 0x98}.items()},
                  'voice': {name: floats(frame, scalar(frame, v + off, 'Q'), length)
                            for name, off in {'frequency': 0x20, 'decay': 0x48,
                                              'amplitude': 0x160, 'phase': 0x138,
                                              'J': 0x1b0, 'index': 0xc0}.items()},
                  'reference_decay': scalar(frame, v + 0x25c)}
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
