"""Read-only hardware observations of the release-dependent primary injection.
Exact-build verification, fixed points, bounded memory reads, no evaluation.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_recurrence import floats, register
from pianoteq_capture_source_amplitude import regfloat

ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1000fbb44,'generated':0x1000fbd58,
        'filtered':0x1000fbdac,'mixed':0x1000fbe50}
records,errors,hooks=[],[],[]
ordinals={}
LIMIT=96
window_complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':window_complete,
        'ordinalLimit':LIMIT,'records':records,'errors':errors,
        'hooks':[{'id':h.GetID(),'hits':h.GetHitCount(),'enabled':h.IsEnabled()} for h in hooks]},indent=2))


def matrix(frame,address):
    rows,stride,samples,sample_stride=unpack(frame,address,'IIII')
    pointer=scalar(frame,address+16,'Q')
    assert rows==1 and samples==64,(rows,samples)
    return {'rows':rows,'stride':stride,'samples':samples,'sampleStride':sample_stride,
            'pointer':hex(pointer),'values':floats(frame,pointer,samples)}


def observed(frame,location,_):
    global window_complete
    try:
        if window_complete:return False
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        if stage=='entry':
            e=register(frame,'x0');output=register(frame,'x1');ordinals[e]=ordinals.get(e,-1)+1
        else:e=register(frame,'x19');output=register(frame,'x20')
        ordinal=ordinals[e]
        if ordinal>=LIMIT:
            window_complete=True
            for hook in hooks:hook.SetEnabled(False)
            save();return False
        r={'stage':stage,'E':hex(e),'ordinal':ordinal,'thread':frame.GetThread().GetThreadID(),
           'primary':matrix(frame,output),'state':{hex(o):scalar(frame,e+o) for o in (0,4,8,12,0x38,0x3c,0x40,0x44,0x48)},
           'filterWords':list(unpack(frame,e+0x10,'Q'*5))}
        channels=scalar(frame,e+0x14,'I');assert channels<=8
        pointer=scalar(frame,e+0x18,'Q')
        r['filterChannelWords']=[list(unpack(frame,pointer+0xb0*c,'Q'*22)) for c in range(channels)]
        r['filterChannels']=[]
        for c in range(channels):
            channel=pointer+0xb0*c
            begin,end=unpack(frame,channel+0x30,'QQ');assert end>=begin and (end-begin)%16==0
            sections=(end-begin)//16;assert sections<=32
            r['filterChannels'].append({'sections':sections,
                'updating':scalar(frame,channel+0x14,'B'),
                'coefficients':floats(frame,begin,sections*4),
                'table':floats(frame,scalar(frame,channel+0x88,'Q'),sections*32),
                'history':floats(frame,scalar(frame,channel+0x60,'Q'),sections*4),
                'controls':list(unpack(frame,scalar(frame,channel+0x48,'Q'),'I'*(sections*15))),
                'channelGainWords':list(unpack(frame,channel,'I'*6))})
        r['filterFast']=scalar(frame,e+0x10+0x24,'B')
        if stage=='entry':r['target']=regfloat(frame,'s0','f')
        else:r['scratch']=matrix(frame,register(frame,'x29')-0x70)
        records.append(r)
        if stage in ('entry','mixed'):save()
        return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    assert not (ROOT/'runtime.json').exists(),'fresh capture directory required'
    target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
    spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    for address in POINTS.values():
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        hook.SetScriptCallbackFunction(__name__+'.observed');hooks.append(hook)
    save()
