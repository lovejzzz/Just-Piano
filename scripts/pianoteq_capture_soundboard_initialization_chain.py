"""Selected full source-state chain with geometry configuration captured as input."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_selected_dispatch as selected
base = selected.base
initialization = None
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data['initializationInputs'] = initialization
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def source(frame, breakpoint, context):
    global initialization
    try:
        if selected.seen == selected.selected:
            if initialization is not None: raise RuntimeError('Initialization input repeated')
            wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
            if frame.FindRegister('x2').GetValueAsUnsigned() != wrapper + 0x60: raise RuntimeError('Source/config ABI differs')
            config = wrapper + 0x18
            start, end = struct.unpack('<2Q', base.memory(frame, config + 0x68, 16))
            if end - start != 16: raise RuntimeError('Expected four bridge coordinates')
            initialization = {'config': base.dump('source-geometry-config.bin', base.memory(frame, config, 0x130)),
                              'bridge': base.dump('source-bridge-config.bin', base.memory(frame, start, 16))}
        return selected.source(frame, breakpoint, context)
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def raw(frame, breakpoint, context): return selected.raw(frame, breakpoint, context)
def shape(frame, breakpoint, context): return selected.shape(frame, breakpoint, context)
def normalization(frame, breakpoint, context): return selected.normalization(frame, breakpoint, context)
def resampling(frame, breakpoint, context): return selected.resampling(frame, breakpoint, context)
def returned(frame, breakpoint, context): return selected.returned(frame, breakpoint, context)


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
