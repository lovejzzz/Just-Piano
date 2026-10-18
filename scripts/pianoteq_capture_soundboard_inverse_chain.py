"""Same-run source/raw responses and inverse FFT oracle; five hardware sites."""
import pianoteq_capture_soundboard_shaping as shaping
import pianoteq_capture_soundboard_fft as fft
base = shaping.base


def source(frame, breakpoint, context): return shaping.source_entry(frame, breakpoint, context)
def raw(frame, breakpoint, context): return shaping.raw_complete(frame, breakpoint, context)
def shape(frame, breakpoint, context): return shaping.input_shaping(frame, breakpoint, context)
def entry(frame, breakpoint, context):
    if frame.FindRegister('x30').GetValueAsUnsigned() != 0x10069c834: return False
    return fft.entry(frame, breakpoint, context)
def returned(frame, breakpoint, context):
    stop = fft.returned(frame, breakpoint, context)
    if not stop and len(fft.records) >= 3 and fft.pending is None:
        for hook in base.hooks: hook.SetEnabled(False)
        base.save()
    return stop


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'),
                              (0x10069c084, 'shape'), (0x1003949ec, 'entry'), (0x10069c834, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save()
