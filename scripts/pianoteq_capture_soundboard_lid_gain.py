"""Four read-only call-site hooks for model-curve to lid gain calculation."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records=[]
pending=None
presets={}
errors=[]
original_save=base.save


def save():
    original_save()
    p=base.ROOT/'runtime.json';data=json.loads(p.read_text())
    data.update({'lidGainRecords':records,'lidGainPending':pending,'lidGainErrors':errors})
    p.write_text(json.dumps(data,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def vector(frame,address,label):
    begin,end=struct.unpack('<2Q',base.memory(frame,address,16))
    if end<begin or (end-begin)%4 or end-begin>1000000:raise RuntimeError('Invalid curve vector')
    return base.dump(label,base.memory(frame,begin,end-begin))


def preset(frame,breakpoint,_):
    try:
        thread=frame.GetThread().GetThreadID()
        presets[thread]={'config':reg(frame,'x19'),'data':base.memory(frame,reg(frame,'x0'),0x1840)}
        return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def entry(frame,breakpoint,_):
    global pending
    try:
        import lldb
        thread=frame.GetThread().GetThreadID();preset=presets.get(thread)
        if not preset or reg(frame,'x1')!=preset['config']+0x48:return False
        if pending is not None or len(records)>=3:raise RuntimeError('Overlapping/excess lid gain calls')
        curve=reg(frame,'x0');index=len(records);header=base.memory(frame,curve,0x50)
        error=lldb.SBError();input=frame.FindRegister('s0').GetData().GetFloat(error,0)
        if error.Fail():raise RuntimeError(str(error))
        record={'index':index,'input':input,'boundaryMode':reg(frame,'w2'),
            'preset':base.dump(f'lid-{index}-preset.bin',preset['data']),
            'model':base.dump(f'lid-{index}-model.bin',base.memory(frame,curve-0x2d8,0x340)),
            'curve':{'x':vector(frame,curve+0x18,f'lid-{index}-x.bin'),
                     'y':vector(frame,curve+0x30,f'lid-{index}-y.bin'),
                     'dimensions':struct.unpack_from('<I',header,0x48)[0],
                     'logX':header[0x4c],'mode':header[0x4d]}}
        records.append(record);pending={'index':index,'thread':thread,'config':preset['config'],'output':reg(frame,'x1'),'stage':'interpolation'}
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def current(frame):
    if pending is None or pending['thread']!=frame.GetThread().GetThreadID():raise RuntimeError('Lid gain ownership differs')
    return records[pending['index']]


def interpolated(frame,breakpoint,_):
    try:
        if pending is None:return False
        r=current(frame)
        if pending['stage']!='interpolation':raise RuntimeError('Lid interpolation entry missing')
        r['interpolated']=vector(frame,pending['output'],f"lid-{r['index']}-interpolated.bin")
        pending['stage']='final';save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,_):
    global pending
    try:
        if pending is None:return False
        r=current(frame)
        if pending['stage']!='final' or reg(frame,'x19')!=pending['config']:raise RuntimeError('Lid gain return differs')
        r['output']=vector(frame,pending['output'],f"lid-{r['index']}-output.bin")
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
    for address,callback in [(0x1001ba8c0,'preset'),(0x1003ca8fc,'entry'),(0x1003ca900,'interpolated'),(0x1001ba908,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
