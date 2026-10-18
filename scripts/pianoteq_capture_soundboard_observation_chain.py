"""Six-site full source-to-dispatch chain with receiver geometry as source input."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_initialization_chain as initialized
base = initialized.base
construction = None
original_save = base.save


def save():
    original_save()
    p = base.ROOT / 'runtime.json'; data = json.loads(p.read_text())
    data['observationConstructionInputs'] = construction
    p.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def vector(frame, address, label):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end-begin) % 4 or end-begin > 1000000: raise RuntimeError('Invalid geometry vector')
    return base.dump(label, base.memory(frame, begin, end-begin))


def source(frame, breakpoint, context):
    global construction
    try:
        if initialized.selected.seen == initialized.selected.selected:
            if construction is not None: raise RuntimeError('Observation input repeated')
            state = frame.FindRegister('x0').GetValueAsUnsigned(); wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
            begin, end = struct.unpack('<2Q', base.memory(frame, state+0x110, 16))
            if end < begin or (end-begin) % 0x68 or not 0 < end-begin <= 64*0x68: raise RuntimeError('Invalid observation geometry count')
            geometry = []
            for i, address in enumerate(range(begin, end, 0x68)):
                data = base.memory(frame, address, 0x68)
                coordinates = vector(frame, address, f'observation-geometry-{i}.bin')
                if coordinates['bytes'] != 12: raise RuntimeError('Three receiver coordinates required')
                geometry.append({'coordinates': coordinates, 'amplitude': struct.unpack_from('<f', data, 0x18)[0],
                    'identity': struct.unpack_from('<Q', data, 0x20)[0], 'channel': struct.unpack_from('<Q', data, 0x28)[0],
                    'kind': struct.unpack_from('<I', data, 0x30)[0]})
            phase = frame.FindRegister('w3').GetValueAsUnsigned()
            if phase not in (0, 1): raise RuntimeError('Unsupported phase flag')
            construction = {'geometry': geometry, 'gains': vector(frame, wrapper+0x60, 'observation-gains.bin'),
                'phaseMode': phase, 'state': state, 'thread': frame.GetThread().GetThreadID()}
        return initialized.source(frame, breakpoint, context)
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def raw(frame, breakpoint, context): return initialized.raw(frame, breakpoint, context)
def shape(frame, breakpoint, context): return initialized.shape(frame, breakpoint, context)
def normalization(frame, breakpoint, context): return initialized.normalization(frame, breakpoint, context)
def resampling(frame, breakpoint, context): return initialized.resampling(frame, breakpoint, context)
def returned(frame, breakpoint, context): return initialized.returned(frame, breakpoint, context)


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
