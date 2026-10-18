"""Read-only pitch-control boundary, at update entry and common return."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
records=[]
pending=None
errors=[]
original_save=base.save


def save():
    original_save()
    p=base.ROOT/'runtime.json';d=json.loads(p.read_text())
    d.update(pitchRecords=records,pitchPending=pending,pitchErrors=errors)
    p.write_text(json.dumps(d,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def entry(frame,breakpoint,_):
    global pending
    try:
        if pending is not None:raise RuntimeError('Overlapping pitch update')
        v=reg(frame,'x0');i=len(records)
        records.append({'counter':int.from_bytes(base.memory(frame,v+0x10,4),'little'),
                        'control':base.dump(f'pitch-{i}-before.bin',base.memory(frame,v+0x780,0x1c4)),
                        'energy':base.dump(f'pitch-{i}-energy.bin',base.memory(frame,v+0x258,8))})
        pending={'index':i,'voice':v,'thread':frame.GetThread().GetThreadID()}
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,_):
    global pending
    if pending is None:return False
    try:
        if pending['voice']!=reg(frame,'x19') or pending['thread']!=frame.GetThread().GetThreadID():
            raise RuntimeError('Unowned pitch return')
        i=pending['index'];v=pending['voice']
        records[i]['refreshRequired']=bool(reg(frame,'w20')&1)
        records[i]['after']=base.dump(f'pitch-{i}-after.bin',base.memory(frame,v+0x780,0x1c4))
        pending=None
        if len(records)>=512:
            for hook in base.hooks:hook.SetEnabled(False)
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh directory required'
    for address,callback in [(0x1006e4f5c,'entry'),(0x1006e5158,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
