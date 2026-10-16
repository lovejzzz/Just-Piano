"""Observe the CLI float-to-signed32 conversion, without changing writer state."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'input':0x10091baa4,'converted':0x10091bb24}
LIMIT=6
records,errors,hooks=[],[],[]
pending={}
ordinal=-1
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global ordinal,complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='input':
            ordinal+=1;n=register(frame,'w24');channels=register(frame,'w22');offset=register(frame,'w27')
            assert 0<n<=4096 and 0<channels<=8
            source=register(frame,'x20');dest=scalar(frame,register(frame,'sp')+0x18,'Q')
            inputs=unpack(frame,source,'Q'*channels);outputs=unpack(frame,dest,'Q'*channels)
            pending[thread]={'ordinal':ordinal,'samples':n,'channels':channels,'outputs':outputs}
            records.append({'stage':stage,'ordinal':ordinal,'samples':n,'channels':channels,'offset':offset,
                            'input':[floats(frame,a+offset*4,n) for a in inputs]})
        else:
            c=pending.pop(thread);records.append({'stage':stage,'ordinal':c['ordinal'],
                 'signed32':[list(unpack(frame,a,'i'*c['samples'])) for a in c['outputs']]})
            if c['ordinal']+1>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
            save()
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
