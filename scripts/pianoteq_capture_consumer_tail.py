"""Exact-build hardware-only observations beyond the prior consumer window."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import floats,register
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'before':0x100460f1c,'nonlinear':0x1004610a8,'filtered':0x1004610c8,'expanded':0x100461120}
records,errors,hooks=[],[],[]
ordinals={}
LIMIT=96
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        h,b,aux=register(frame,'x19'),register(frame,'x23'),register(frame,'x21')
        if stage=='before':ordinals[h]=ordinals.get(h,-1)+1
        ordinal=ordinals[h]
        if ordinal>=LIMIT:
            complete=True
            for hook in hooks:hook.SetEnabled(False)
            save();return False
        count=scalar(frame,b,'Q');assert 0<count<=8
        r={'stage':stage,'ordinal':ordinal,'H':hex(h),'B':hex(b),'aux':matrix(frame,aux),
           'groups':[matrix(frame,b+8+56*i) for i in range(count)],
           'controls':{hex(o):scalar(frame,h+o) for o in (0x94,0x98,0x29f8,0x29fc)},
           'rowGains':floats(frame,h+0xd0,scalar(frame,h+0xc8,'Q')),
           'processorWords':list(unpack(frame,h+0x2a00,'Q'*32))}
        proc=h+0x2a00
        r['spatialFlags']={hex(o):scalar(frame,proc+o,'B') for o in (0x88,0xb0,0xbc,0xbd,0xfc)}
        begin,end=unpack(frame,proc+0x68,'QQ');assert end>=begin and (end-begin)%72==0
        row_count=min(3,(end-begin)//72)
        r['spatialRows']=[]
        for row in range(row_count):
            a=begin+row*72
            words=list(unpack(frame,a,'Q'*9))
            taps=(words[1]-words[0])//16;assert 0<=taps<=256
            n=words[5];assert n<=2048
            r['spatialRows'].append({'words':words,'tapWords':list(unpack(frame,words[0],'I'*(taps*4))),
                'ring':floats(frame,words[3],n*4) if ordinal in (0,LIMIT-1) else None})
        records.append(r)
        if stage=='expanded':save()
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
