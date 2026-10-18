"""Same-run source through final resampled soundboard buffers; six HW sites."""
import json
import traceback
import pianoteq_capture_soundboard_shaping as shaping
base = shaping.base
pending = None
resampled = []
headers = []
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'resampled': resampled, 'resampledHeaders': headers, 'resamplingPending': pending})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def source(frame, breakpoint, context): return shaping.source_entry(frame, breakpoint, context)
def raw(frame, breakpoint, context): return shaping.raw_complete(frame, breakpoint, context)
def shape(frame, breakpoint, context): return shaping.input_shaping(frame, breakpoint, context)
def normalization(frame, breakpoint, context): return shaping.input_normalization(frame, breakpoint, context)


def resampling(frame, breakpoint, _):
    global pending
    try:
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x100057298: return False
        if pending is not None or not shaping.tail['shaped']: raise RuntimeError('Resampling stage missing or repeated')
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != base.captured_source['state']: raise RuntimeError('Resampling source differs')
        shaping.tail['resampling'] = shaping.floats(frame, 2)
        shaping.tail['normalizedHeaders'] = shaping.channel_headers(frame, state)
        for i, channel in enumerate(shaping.tail['normalizedHeaders']):
            shaping.tail['normalized'].append(base.dump(f'normalized-{i}.bin',
                base.memory(frame, channel['pointer'], channel['length'] * 4)))
        pending = {'state': state, 'thread': frame.GetThread().GetThreadID()}
        save(); return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending, headers
    try:
        if pending is None or frame.GetThread().GetThreadID() != pending['thread']: raise RuntimeError('Resampling return differs')
        headers = shaping.channel_headers(frame, pending['state'])
        for i, channel in enumerate(headers):
            resampled.append(base.dump(f'resampled-{i}.bin', base.memory(frame, channel['pointer'], channel['length'] * 4)))
        pending = None
        for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'), (0x10069c084, 'shape'),
                              (0x1006bc7ec, 'normalization'), (0x1008d78e0, 'resampling'), (0x100057298, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
