"""Four fixed read-only points isolate FX, room dry/wet mixing, and its result."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'preEffects':0x1001bbd60,'postEffects':0x1001bbdc8,'roomMix':0x10027147c,'returned':0x1001bbf84}
LIMIT=160
records,errors,hooks=[],[],[]
contexts,ordinals={},{}
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def vector(frame,address):
    begin,end=unpack(frame,address,'QQ');assert end>=begin and (end-begin)%4==0 and (end-begin)//4<=16
    return floats(frame,begin,(end-begin)//4) if end>begin else []


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='preEffects':
            m=register(frame,'x19');ordinals[m]=ordinals.get(m,-1)+1
            if ordinals[m]>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
                save();return False
            contexts[thread]={'ordinal':ordinals[m],'M':m,'output':register(frame,'x22')}
        c=contexts[thread];r={'stage':stage,'ordinal':c['ordinal'],'output':matrix(frame,c['output'])}
        if stage=='roomMix':
            state=register(frame,'x23');obj=register(frame,'x20');rows=r['output']['rows'];assert rows<=8
            r.update(wet=matrix(frame,register(frame,'x29')-0xd8),dryGains=vector(frame,state+0x28),wetGains=vector(frame,state+0x10),
                     rampActive=register(frame,'w8')&1,
                     dryRamps=[list(unpack(frame,scalar(frame,obj+0x70,'Q')+16*i,'fffI')) for i in range(rows)],
                     wetRamps=[list(unpack(frame,scalar(frame,obj+0x58,'Q')+16*i,'fffI')) for i in range(rows)],
                     hasConvolution=scalar(frame,state+0x78,'Q')!=0,hasExternal=scalar(frame,state+0x80,'Q')!=0,
                     spatialEnabled=scalar(frame,state+0xc0,'B'))
        records.append(r)
        if stage=='returned':save()
        return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    assert not (ROOT/'runtime.json').exists()
    target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
    spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    for address in POINTS.values():
        result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetScriptCallbackFunction(__name__+'.observed');hooks.append(hook)
    save()


def resume_known_stops(debugger):
    """Continue at most three unexpected hardware stops at our own fixed sites."""
    import lldb
    assert not debugger.GetAsync()
    observations=[]
    process=debugger.GetSelectedTarget().GetProcess()
    for attempt in range(3):
        if process.GetState()!=lldb.eStateStopped:break
        thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0)
        pc=frame.GetPCAddress().GetFileAddress()
        description=thread.GetStopDescription(1024)
        if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
        observations.append({'attempt':attempt,'pc':hex(pc),'reason':description,'recordsBeforeContinue':len(records)})
        (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
        error=process.Continue()
        if error.Fail():raise RuntimeError(str(error))
    save()
