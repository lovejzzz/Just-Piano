"""Six-site full response chain with primary/relative receiver configuration."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_observation_chain as observed
base = observed.base
receiver_inputs = None
original_save = base.save


def save():
    original_save()
    p = base.ROOT / 'runtime.json'; data = json.loads(p.read_text())
    data['receiverConstructionInputs'] = receiver_inputs
    p.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def vectors(frame, address, label):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end-begin) % 24 or not 0 < end-begin <= 64*24: raise RuntimeError('Invalid receiver configuration list')
    return [observed.vector(frame, p, f'{label}-{i}.bin') for i, p in enumerate(range(begin, end, 24))]


def source(frame, breakpoint, context):
    global receiver_inputs
    try:
        if observed.initialized.selected.seen == observed.initialized.selected.selected:
            if receiver_inputs is not None: raise RuntimeError('Receiver input repeated')
            wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
            receiver_inputs = {'state': frame.FindRegister('x0').GetValueAsUnsigned(),
                'primary': vectors(frame, wrapper+0x168, 'receiver-primary'),
                'offsets': vectors(frame, wrapper+0x180, 'receiver-offset'),
                'parents': observed.vector(frame, wrapper+0x198, 'receiver-parents.bin'),
                'offsetScale': struct.unpack('<f', base.memory(frame, wrapper+0x1e0, 4))[0],
                'mirror': base.memory(frame, wrapper+0x1e8, 1)[0]}
        return observed.source(frame, breakpoint, context)
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def raw(frame, breakpoint, context): return observed.raw(frame, breakpoint, context)
def shape(frame, breakpoint, context): return observed.shape(frame, breakpoint, context)
def normalization(frame, breakpoint, context): return observed.normalization(frame, breakpoint, context)
def resampling(frame, breakpoint, context): return observed.resampling(frame, breakpoint, context)
def returned(frame, breakpoint, context): return observed.returned(frame, breakpoint, context)


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh capture directory required'
    for address, callback in [(0x1005a8874, 'source'), (0x1005a91c8, 'raw'), (0x10069c084, 'shape'),
                              (0x1006bc7ec, 'normalization'), (0x1008d78e0, 'resampling'), (0x100057390, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error = hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
