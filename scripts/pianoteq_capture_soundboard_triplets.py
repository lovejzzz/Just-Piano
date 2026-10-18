"""Read all three completed IR dispatch triplets using one hardware hook."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base

records, errors = [], []
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(dispatchRecords=records, tripletErrors=errors)
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def completed(frame, breakpoint, _):
    try:
        if len(records) >= 3:
            raise ValueError('Only the three initial source groups are covered')
        config = frame.FindRegister('x19').GetValueAsUnsigned()
        header = base.memory(frame, config, 0x240)
        begin, end = struct.unpack_from('<2Q', header)
        if end - begin != 3 * 0x30 or begin < 0x1000:
            raise ValueError('Complete three-channel dispatch required')
        record = dict(number=len(records), outputRate=struct.unpack_from('<f', header, 0x44)[0],
                      outputs=[])
        for channel in range(3):
            output = base.memory(frame, begin + channel * 0x30, 0x30)
            pointer, length = struct.unpack_from('<2Q', output)
            if not 1 <= length <= 100000 or pointer < 0x1000:
                raise ValueError('Bounded dispatch output required')
            record['outputs'].append(dict(length=length,
                normalizationBits=struct.unpack_from('<I', output, 0x28)[0],
                data=base.dump(f'dispatch-{len(records)}-output-{channel}.bin',
                               base.memory(frame, pointer, length * 4))))
        records.append(record)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:
            hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists():
        raise ValueError('Fresh native output required')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x100057390 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.completed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
