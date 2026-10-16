"""One exact-build release-source setup, three read-only hardware points."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x10084141c,'decibels':0x10084150c,'oscillator':0x10084165c}
records,errors,hooks=[],[],[]
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        e=register(frame,'x0' if stage=='entry' else 'x19')
        g=register(frame,'x1' if stage=='entry' else 'x20')
        model=scalar(frame,g+0x1240,'Q')
        r={'stage':stage,'E':hex(e),'G':hex(g),'model':hex(model),
           'global':{hex(o):scalar(frame,g+o) for o in (0xfc4,0xfc8,0xe48,0x98,0x78)},
           'curveValue':scalar(frame,model+0x2d4),'curveMode':scalar(frame,model+0x2d8,'I'),
           'flags':{hex(o):scalar(frame,model+o,'B') for o in (0x18,0x1a,0x1d,0x1e)},
           'modelMode':scalar(frame,model+0x20,'I'),'adjustment':scalar(frame,model+0x634)}
        if stage=='decibels':r['decibels']=regfloat(frame,'s0','f')
        if stage=='oscillator':
            r['state']={hex(o):scalar(frame,e+o) for o in (0,4,8,12,0x38,0x3c,0x48)}
            r['cosine']=regfloat(frame,'s1','f');r['sine']=regfloat(frame,'s0','f')
            complete=True
            for hook in hooks:hook.SetEnabled(False)
        records.append(r);save();return False
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
