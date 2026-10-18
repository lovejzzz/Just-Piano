"""Select a later soundboard source call for the existing six-site full replay."""
import json
import os
import pianoteq_capture_soundboard_final_chain as final
base = final.base
selected = int(os.environ['PIANOTEQ_DISPATCH_INDEX'])
if selected not in (0, 1, 2): raise RuntimeError('Dispatcher index must be 0, 1 or 2')
seen = 0
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'selectedDispatch': selected, 'sourceEntriesSeen': seen})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def source(frame, breakpoint, context):
    global seen
    index = seen; seen += 1
    if index != selected: save(); return False
    return final.source(frame, breakpoint, context)
def raw(frame, breakpoint, context): return final.raw(frame, breakpoint, context)
def shape(frame, breakpoint, context): return final.shape(frame, breakpoint, context)
def normalization(frame, breakpoint, context): return final.normalization(frame, breakpoint, context)
def resampling(frame, breakpoint, context):
    if not final.shaping.tail['shaped']: return False
    return final.resampling(frame, breakpoint, context)
def returned(frame, breakpoint, context):
    if final.pending is None: return False
    return final.returned(frame, breakpoint, context)


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'), (0x10069c084, 'shape'),
                              (0x1006bc7ec, 'normalization'), (0x1008d78e0, 'resampling'), (0x100057390, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
