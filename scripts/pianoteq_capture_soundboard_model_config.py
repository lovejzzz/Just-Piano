"""Six read-only sites bind model/preset sources to soundboard configuration."""
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
    p=base.ROOT/'runtime.json';data=json.loads(p.read_text())
    data.update({'modelConfigRecords':records,'modelConfigPending':pending,'modelConfigErrors':errors})
    p.write_text(json.dumps(data,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def vector(frame,address,label):
    begin,end=struct.unpack('<2Q',base.memory(frame,address,16))
    if end<begin or (end-begin)%4 or end-begin>1000000:raise RuntimeError('Invalid model vector')
    return base.dump(label,base.memory(frame,begin,end-begin))


def current(frame):
    if pending is None or pending['thread']!=frame.GetThread().GetThreadID():raise RuntimeError('Model configuration ownership differs')
    return records[pending['index']]



def entry(frame,breakpoint,_):
    global pending
    try:
        if reg(frame,'x30')!=0x1003a8a98:return False
        if pending is not None or len(records)>=3:raise RuntimeError('Model configuration count/overlap differs')
        index=len(records);records.append({'index':index,'component':reg(frame,'w2'),'mode':reg(frame,'w3'),'sourcePositionFlags':{}})
        pending={'index':index,'config':reg(frame,'x0'),'interface':reg(frame,'x1'),'thread':frame.GetThread().GetThreadID()}
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def model(frame,breakpoint,_):
    try:
        if pending is None:return False
        r=current(frame);address=reg(frame,'x0');i=r['index']
        r['model']=base.dump(f'config-{i}-model.bin',base.memory(frame,address,0x1e8))
        r['bridge']=vector(frame,address+0x110,f'config-{i}-bridge.bin')
        r['propagationModes']=vector(frame,address+0x160,f'config-{i}-modes.bin')
        pending['model']=address;save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def preset(frame,breakpoint,_):
    try:
        if pending is None:return False
        r=current(frame);address=reg(frame,'x0')
        r['preset']=base.dump(f"config-{r['index']}-preset.bin",base.memory(frame,address,0x1840))
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def flag(frame,breakpoint,_):
    try:
        if pending is None:return False
        r=current(frame);name='linear' if frame.GetPC()==0x1001ba940 else 'twoPosition'
        r['sourcePositionFlags'][name]=reg(frame,'w0');save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,_):
    global pending
    try:
        r=current(frame);i=r['index'];address=pending['config']
        r['config']=base.dump(f'config-{i}-output.bin',base.memory(frame,address,0x220))
        r['outputBridge']=vector(frame,address+0x68,f'config-{i}-output-bridge.bin')
        r['gains']=vector(frame,address+0x48,f'config-{i}-gains.bin')
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
    for address,callback in [(0x1001ba68c,'entry'),(0x1001ba6e8,'model'),(0x1001ba8c0,'preset'),
                             (0x1001ba940,'flag'),(0x1001ba96c,'flag'),(0x1003a8a98,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
