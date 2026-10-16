"""Observe the immediate output matrix before/after the V+840 processor.

Two fixed hardware points on the render thread, no process state changes.
Only the authorized exact build and a fresh PIANOTEQ_CAPTURE_DIR are accepted.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_recurrence import floats, register

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS = {'before': 0x100472f64, 'after': 0x100472f70, 'spread': 0x10020b418}
START, END = 3264, 4224
records, errors, hooks = [], [], []
window_complete = False


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({'schema': 1,
        'counterWindow': [START, END], 'windowComplete': window_complete,
        'records': records, 'errors': errors,
        'hooks': [{'id': h.GetID(), 'hits': h.GetHitCount(), 'enabled': h.IsEnabled()} for h in hooks]}, indent=2))


def observed(frame, location, _):
    global window_complete
    try:
        if window_complete:
            return False
        stage = next(k for k, v in POINTS.items() if v == frame.GetPCAddress().GetFileAddress())
        if stage == 'spread':
            v, output = register(frame, 'x20') + 0x168, register(frame, 'x19')
        else:
            v, output = register(frame, 'x19'), register(frame, 'x20')
        counter = scalar(frame, v + 0x10, 'I')
        if not START <= counter <= END:
            if stage == 'spread' and counter > END and records:
                window_complete = True
                for hook in hooks:
                    hook.SetEnabled(False)
                save()
            return False
        count = scalar(frame, output, 'Q')
        assert 0 < count <= 8
        channels = []
        for i in range(count):
            descriptor = output + 8 + 56 * i
            rows, stride, samples, sample_stride = unpack(frame, descriptor, 'IIII')
            pointer = scalar(frame, descriptor + 16, 'Q')
            assert rows == 1 and samples == 64
            channels.append({'rows': rows, 'stride': stride, 'samples': samples,
                             'sampleStride': sample_stride, 'pointer': pointer,
                             'values': floats(frame, pointer, samples)})
        e = v + 0x840
        render_samples = scalar(frame, v + 0x768, 'I')
        delay_samples = scalar(frame, v + 0x76c, 'I')
        raw_modal = []
        if delay_samples:
            for group in range(count):
                pointer = scalar(frame, v + 0x1e0 + 40 * group, 'Q')
                raw_modal.append(floats(frame, pointer, render_samples))
        records.append({'stage': stage, 'V': hex(v), 'counter': counter,
            'thread': frame.GetThread().GetThreadID(), 'channels': channels,
            'renderSamples': render_samples, 'delaySamples': delay_samples,
            'rawModal': raw_modal, 'spread': scalar(frame, v - 0x168 + 0x128),
            'processor': {'channelCount': scalar(frame, e + 0x50, 'I'),
                          'smooth': {hex(o): scalar(frame, e + o) for o in (0x5c, 0x60, 0x64, 0x68)},
                          'enabled': scalar(frame, e + 0x6c, 'B'),
                          'stateWords': list(unpack(frame, e, 'Q' * 11))}})
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    for address in POINTS.values():
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(hook)
    save()
