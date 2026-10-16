"""Read-only/hardware capture of the per-sample final output level."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1004f9904,'returned':0x1001bc114}
LIMIT=160
records,errors,hooks=[],[],[]
pending={}
ordinal=-1
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global complete,ordinal
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='entry':
            if frame.GetThread().GetFrameAtIndex(1).GetPCAddress().GetFileAddress()!=0x1001bc114:return False
            ordinal+=1
            if ordinal>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
                save();return False
            pending[thread]={'ordinal':ordinal,'matrix':register(frame,'x0'),'state':register(frame,'x1')}
        c=pending.get(thread)
        if c is None:return False
        records.append({'stage':stage,'ordinal':c['ordinal'],'matrix':matrix(frame,c['matrix']),
                        'stateAddress':hex(c['state']),'state':list(unpack(frame,c['state'],'ffff'))})
        if stage=='returned':pending.pop(thread);save()
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
