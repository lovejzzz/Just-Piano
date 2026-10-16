"""Read-only/hardware observation from global output through the final routing cache."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_key_routes import cache
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'global':0x1001bb9ac,'preFilter':0x1001bbd5c,'route':0x1007d583c,'returned':0x1001bbfd4}
LIMIT=160
records,errors,hooks=[],[],[]
contexts,ordinals={},{}
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='global':
            m=register(frame,'x19');ordinals[m]=ordinals.get(m,-1)+1
            if ordinals[m]>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
                save();return False
            contexts[thread]={'M':m,'output':register(frame,'x22'),'ordinal':ordinals[m]}
        c=contexts[thread]
        r={'stage':stage,'ordinal':c['ordinal'],'M':hex(c['M']),'output':matrix(frame,c['output'])}
        if stage=='route':
            root,mapping,source=register(frame,'x0'),register(frame,'x1'),register(frame,'x2')
            c['cache']=root
            begin,end=unpack(frame,mapping,'QQ');assert end>=begin and (end-begin)%96==0 and (end-begin)//96<=128
            entries=[]
            for a in range(begin,end,96):
                src,dst=unpack(frame,a,'II');n=scalar(frame,a+8,'Q');assert n<=3
                entries.append({'source':src,'destination':dst,'tapWords':list(unpack(frame,a+16,'I'*(n*6)))})
            r.update(cache=cache(frame,root),entries=entries,wrap=scalar(frame,mapping+24,'B'),
                     gain=regfloat(frame,'s0','f'),source=matrix(frame,source))
        if stage=='returned':
            r.update(cache=cache(frame,c['cache']),destination=matrix(frame,register(frame,'x23')))
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
