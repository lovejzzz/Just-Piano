"""Two read-only hardware sites bind runtime rate inputs to producer rate output."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base

records=[]
pending=None
errors=[]
original_save=base.save


def save():
    original_save()
    p=base.ROOT/'runtime.json'
    data=json.loads(p.read_text())
    data.update({'ratePolicyRecords':records,'ratePolicyPending':pending,'ratePolicyErrors':errors})
    p.write_text(json.dumps(data,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def entry(frame,breakpoint,_):
    global pending
    try:
        stack=reg(frame,'sp')
        if struct.unpack('<Q',base.memory(frame,stack+0x18,8))[0]!=0x1001ba84c:return False
        if pending is not None or len(records)>=3:raise RuntimeError('Overlapping/excess producer rate call')
        address=reg(frame,'x0');index=len(records)
        records.append({'runtime':base.dump(f'rate-{index}-runtime.bin',base.memory(frame,address,0x20)),
            'ratioTable':base.dump(f'rate-{index}-ratios.bin',base.memory(frame,0x100c18788,72))})
        pending={'index':index,'runtime':address,'thread':frame.GetThread().GetThreadID()}
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,_):
    global pending
    try:
        if pending is None:return False
        if frame.GetThread().GetThreadID()!=pending['thread']:raise RuntimeError('Rate return thread differs')
        if reg(frame,'x0')!=pending['runtime']:raise RuntimeError('Rate runtime object differs')
        component=reg(frame,'w20')
        if component!=pending['index']:raise RuntimeError('Producer component order differs')
        import lldb
        error=lldb.SBError();value=frame.FindRegister('s0').GetData().GetFloat(error,0)
        if error.Fail():raise RuntimeError(str(error))
        records[pending['index']].update({'component':component,'outputRate':value})
        pending=None
        if len(records)==3:
            for hook in base.hooks:hook.SetEnabled(False)
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh capture directory required'
    for address,callback in [(0x1005fce80,'entry'),(0x1001ba850,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
