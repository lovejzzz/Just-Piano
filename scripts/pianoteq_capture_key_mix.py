"""Observe key-group consumption and its immediate mix, hardware/read-only."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import floats,register
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x10051fad4,'grouped':0x10051fb48,'distributed':0x10051fc9c,'returned':0x10085ee4c}
records,errors,hooks=[],[],[]
contexts={}
ordinals={}
LIMIT=96
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def matrix(frame,address):
    rows,stride,samples,row_stride=unpack(frame,address,'IIII')
    pointer=scalar(frame,address+16,'Q')
    assert rows<=16 and samples<=1024,(hex(address),rows,samples)
    assert rows*samples<=8192
    return {'rows':rows,'stride':stride,'samples':samples,'rowStride':row_stride,
            'pointer':hex(pointer),'values':[floats(frame,pointer+i*row_stride*4,samples) for i in range(rows)]}


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='entry':
            h=register(frame,'x3');ordinals[h]=ordinals.get(h,-1)+1
            contexts[thread]={'M':register(frame,'x0'),'slot':register(frame,'x1'),'B':register(frame,'x2'),'H':h,'ordinal':ordinals[h]}
        c=contexts[thread];h=c['H'];b=c['B'];ordinal=c['ordinal']
        if ordinal>=LIMIT:
            complete=True
            for hook in hooks:hook.SetEnabled(False)
            save();return False
        count=scalar(frame,b,'Q');assert 0<count<=8
        r={'stage':stage,'ordinal':ordinal,**{k:hex(v) for k,v in c.items() if k!='ordinal'},
           'workerCounter':scalar(frame,h+0x178,'I'),
           'groups':[matrix(frame,b+8+56*i) for i in range(count)],
           'matrices':{hex(o):matrix(frame,b+o) for o in (0xb0,0xe8,0x120,0x158,0x190,0x1c8,0x200,0x238)},
           'weights':floats(frame,h+0xb8,count),'mixLevels':floats(frame,h+0xf0,4)}
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
