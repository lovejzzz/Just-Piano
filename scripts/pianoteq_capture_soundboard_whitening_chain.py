"""Combine source/raw-state and spectral-whitening capture in one five-site run."""
import pianoteq_capture_soundboard_shaping as shaping
import pianoteq_capture_soundboard_whitening as whitening
base = shaping.base


def source(frame, breakpoint, context): return shaping.source_entry(frame, breakpoint, context)
def raw(frame, breakpoint, context): return shaping.raw_complete(frame, breakpoint, context)
def shape(frame, breakpoint, context): return shaping.input_shaping(frame, breakpoint, context)
def white(frame, breakpoint, context): return whitening.entry(frame, breakpoint, context)
def returned(frame, breakpoint, context): return whitening.returned(frame, breakpoint, context)


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'),
                              (0x10069c084, 'shape'), (0x100540f48, 'white'), (0x10069c3a0, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save()
