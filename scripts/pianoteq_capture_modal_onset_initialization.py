"""Two read-only sites observe onset constructor inputs and completed state."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
records=[]
pending=None
errors=[]
original_save=base.save


def save():
    original_save()
    path=base.ROOT/'runtime.json';data=json.loads(path.read_text())
    data.update({'onsetRecords':records,'onsetPending':pending,'onsetErrors':errors})
    path.write_text(json.dumps(data,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def entry(frame,breakpoint,_):
    global pending
    try:
        if pending is not None or len(records)>=64:raise RuntimeError('Overlapping/excess onset initialization')
        import lldb
        error=lldb.SBError();sample_rate=frame.FindRegister('s8').GetData().GetFloat(error,0)
        if error.Fail():raise RuntimeError(str(error))
        record={'duration':reg(frame,'w20'),'sampleRate':sample_rate,'square':bool(reg(frame,'w21')&1)}
        records.append(record);pending={'record':len(records)-1,'state':reg(frame,'x19'),'thread':frame.GetThread().GetThreadID()}
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,_):
    global pending
    try:
        if pending is None or frame.GetThread().GetThreadID()!=pending['thread'] or reg(frame,'x19')!=pending['state']:
            raise RuntimeError('Unowned onset constructor result')
        index=pending['record'];records[index]['state']=base.dump(f'onset-{index}.bin',base.memory(frame,pending['state']+0x720,0x48))
        pending=None;save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh capture directory required'
    for address,callback in [(0x100951cb8,'entry'),(0x100951d54,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
